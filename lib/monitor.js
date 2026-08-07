'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {
  claimMonitorLock,
  normalizeProcessName,
  readConfig,
  readMonitorLock,
  removeMonitorLock,
  removeRuntime,
  writeRuntime,
} = require('./config');
const { listProcesses, openBrowser } = require('./platform');
const { BreakTracker } = require('./tracker');

const ROOT = path.resolve(__dirname, '..');
const UI_FILE = path.join(ROOT, 'ui', 'break.html');
const ASSETS = {
  '/assets/robot-crowbar.webp': path.join(ROOT, 'assets', 'robot-crowbar.webp'),
  '/assets/watch-open.webp': path.join(ROOT, 'assets', 'watch-open.webp'),
};
const SESSION_COOKIE = 'open_clowk_session';
const SESSION_MS = 1800000;
const RESOLVED_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Open Clowk — no active intervention</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#12100e;color:#fff5e6;font:16px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-align:center}p{max-width:34rem;padding:0 24px;color:#cdbba4}strong{color:#ef6129}</style>
</head><body><main><p><strong>Open Clowk</strong> has no active intervention right now.</p>
<p>This local page opens itself when your threshold is reached. Nothing was closed, killed, or blocked.</p></main></body></html>
`;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

function sameSecret(candidate, expected) {
  const left = Buffer.from(String(candidate ?? ''), 'utf8');
  const right = Buffer.from(String(expected ?? ''), 'utf8');
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function authorized(request, token) {
  return sameSecret(request.headers['x-open-clowk-token'], token);
}

function sendJson(response, status, value) {
  if (response.headersSent) {
    response.end();
    return;
  }
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

function sendHtml(response, status, body, extraHeaders = {}) {
  if (response.headersSent) {
    response.end();
    return;
  }
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  response.end(body);
}

function runtimeSnapshot({
  token, port, startedAt, tracker, activeMatches, lastError, lastBrowserError,
}) {
  return {
    version: 1,
    pid: process.pid,
    token,
    port,
    startedAt,
    activeMatches: activeMatches.slice(0, 64),
    lastError: lastError || null,
    lastBrowserError: lastBrowserError || null,
    tracker: tracker.snapshot(),
  };
}

async function runMonitor({
  env = process.env,
  now = Date.now,
  processLister = listProcesses,
  browserOpener = openBrowser,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  exitFn = process.exit,
} = {}) {
  const token = env.OPEN_CLOWK_MONITOR_TOKEN;
  if (!/^[a-f0-9]{32,128}$/.test(token || '')) throw new Error('Missing or invalid monitor control token.');
  if (readMonitorLock({ env }) !== token) throw new Error('Monitor does not own the per-user start lock.');
  claimMonitorLock(token, { env });
  const config = readConfig({ env });
  if (!config) throw new Error('Open Clowk is not configured. Run open-clowk setup first.');

  const testMode = env.OPEN_CLOWK_TEST_MODE === '1';
  const thresholdMs = testMode && Number(env.OPEN_CLOWK_TEST_THRESHOLD_MS) > 0
    ? Number(env.OPEN_CLOWK_TEST_THRESHOLD_MS)
    : config.thresholdMinutes * 60000;
  const sampleMs = testMode && Number(env.OPEN_CLOWK_TEST_SAMPLE_MS) >= 20
    ? Number(env.OPEN_CLOWK_TEST_SAMPLE_MS)
    : 5000;
  const tracker = new BreakTracker({ thresholdMs, snoozeMs: config.snoozeMinutes * 60000 });
  const watched = new Set(config.watchedProcesses.map(normalizeProcessName));
  const startedAt = now();
  let activeMatches = [];
  let lastError = null;
  let lastBrowserError = null;
  let interval;
  let sampling = false;
  let shuttingDown = false;
  let port;
  let bootstrap = null;
  let session = null;

  const persist = () => writeRuntime(runtimeSnapshot({
    token, port, startedAt, tracker, activeMatches, lastError, lastBrowserError,
  }), { env });

  const page = () => fs.readFileSync(UI_FILE, 'utf8')
    .replaceAll('{{THRESHOLD_MINUTES}}', () => String(config.thresholdMinutes))
    .replaceAll('{{SNOOZE_MINUTES}}', () => String(config.snoozeMinutes))
    .replaceAll('{{WATCHED_PROCESSES}}', () => escapeHtml(config.watchedProcesses.join(', ')));

  const endBrowserSession = () => {
    bootstrap = null;
    session = null;
  };

  const interventionActive = () => tracker.mode === 'prompted';

  const consumeBootstrap = (candidate) => {
    if (!interventionActive() || !bootstrap || bootstrap.expiresAt <= now()) return false;
    if (!sameSecret(candidate, bootstrap.value)) return false;
    bootstrap = null;
    return true;
  };

  const hasSession = (request) => {
    if (!interventionActive() || !session || session.expiresAt <= now()) return false;
    return sameSecret(readCookie(request.headers.cookie, SESSION_COOKIE), session.id);
  };

  const sameOrigin = (request) => {
    const site = request.headers['sec-fetch-site'];
    if (site !== undefined) return site === 'same-origin';
    return request.headers.origin === `http://127.0.0.1:${port}`;
  };

  const openSession = (response) => {
    const id = crypto.randomBytes(24).toString('hex');
    session = { id, expiresAt: now() + SESSION_MS };
    response.writeHead(302, {
      Location: '/',
      'Set-Cookie': `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}`,
      'Cache-Control': 'no-store',
    });
    response.end();
  };

  const sendAsset = (response, file) => {
    const stream = fs.createReadStream(file);
    let failed = false;
    stream.once('error', (error) => {
      failed = true;
      lastError = `Cannot serve packaged asset: ${error.message}`;
      if (response.headersSent) response.destroy();
      else sendJson(response, 500, { error: 'Open Clowk could not read a packaged asset.' });
    });
    stream.once('open', () => {
      if (failed) return;
      response.writeHead(200, {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      stream.pipe(response);
    });
    response.once('close', () => stream.destroy());
  };

  const handle = (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/') {
      const provided = url.searchParams.get('bootstrap');
      if (provided !== null && consumeBootstrap(provided)) {
        openSession(response);
        return;
      }
      if (!hasSession(request)) {
        sendHtml(response, 403, RESOLVED_PAGE, {
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        });
        return;
      }
      sendHtml(response, 200, page(), {
        'Content-Security-Policy': "default-src 'self'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      });
      return;
    }
    if (request.method === 'GET' && ASSETS[url.pathname]) {
      sendAsset(response, ASSETS[url.pathname]);
      return;
    }
    if (request.method === 'POST' && url.pathname.startsWith('/action/')) {
      const bySession = hasSession(request) && sameOrigin(request);
      if (!bySession && !authorized(request, token)) {
        sendJson(response, 403, { error: 'Forbidden' });
        return;
      }
      try {
        const action = url.pathname.slice('/action/'.length);
        const result = tracker.act(action, now());
        endBrowserSession();
        persist();
        sendJson(response, 200, { result });
      } catch (error) {
        sendJson(response, 409, { error: error.message });
      }
      return;
    }
    if (!authorized(request, token)) {
      sendJson(response, 403, { error: 'Forbidden' });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, {
        status: 'running',
        config,
        activeMatches,
        lastError,
        lastBrowserError,
        tracker: tracker.snapshot(),
        startedAt,
      });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/control/stop') {
      sendJson(response, 200, { stopping: true });
      setImmediate(() => shutdown());
      return;
    }
    sendJson(response, 404, { error: 'Not found' });
  };

  const server = http.createServer((request, response) => {
    try {
      handle(request, response);
    } catch (error) {
      lastError = error.message;
      if (response.headersSent) response.destroy();
      else sendJson(response, 500, { error: 'Open Clowk could not serve this request.' });
    }
  });

  const prompt = async () => {
    const value = crypto.randomBytes(24).toString('hex');
    bootstrap = { value, expiresAt: now() + SESSION_MS };
    session = null;
    try {
      await browserOpener(`http://127.0.0.1:${port}/?bootstrap=${value}`, { env });
      lastBrowserError = null;
    } catch (error) {
      endBrowserSession();
      lastBrowserError = error.message;
      tracker.releasePrompt();
    }
  };

  const sample = async () => {
    if (sampling || shuttingDown) return;
    sampling = true;
    try {
      const names = (await processLister({ env })).map(normalizeProcessName);
      activeMatches = [...new Set(names.filter((name) => watched.has(name)))].slice(0, 64);
      lastError = null;
      const event = tracker.sample({ now: now(), active: activeMatches.length > 0 });
      if (event === 'prompt') await prompt();
      if (!interventionActive()) endBrowserSession();
    } catch (error) {
      lastError = error.message;
    } finally {
      sampling = false;
      if (!shuttingDown) {
        try {
          persist();
        } catch (error) {
          lastError = error.message;
        }
      }
    }
  };

  const releaseState = () => {
    endBrowserSession();
    if (interval) clearIntervalFn(interval);
    try {
      removeRuntime(token, { env });
      removeMonitorLock(token, { env });
    } catch {}
  };

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    releaseState();
    server.close(() => exitFn(0));
  };

  const abort = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    releaseState();
    server.closeAllConnections?.();
    server.close();
  };

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  try {
    persist();
    await sample();
    interval = setIntervalFn(sample, sampleMs);
  } catch (error) {
    abort();
    throw error;
  }
  return { server, tracker, shutdown };
}

module.exports = { ASSETS, SESSION_COOKIE, UI_FILE, runMonitor };
