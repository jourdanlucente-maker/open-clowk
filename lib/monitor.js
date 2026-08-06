'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function authorized(request, token) {
  return request.headers['x-open-clowk-token'] === token;
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

function runtimeSnapshot({ token, port, startedAt, tracker, activeMatches, lastError }) {
  return {
    version: 1,
    pid: process.pid,
    token,
    port,
    startedAt,
    activeMatches: activeMatches.slice(0, 64),
    lastError: lastError || null,
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
} = {}) {
  const token = env.OPEN_CLOWK_MONITOR_TOKEN;
  if (!/^[a-f0-9]{32,128}$/.test(token || '')) throw new Error('Missing or invalid monitor control token.');
  if (readMonitorLock({ env }) !== token) throw new Error('Monitor does not own the per-user start lock.');
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
  let interval;
  let shuttingDown = false;
  let port;

  const persist = () => writeRuntime(runtimeSnapshot({
    token, port, startedAt, tracker, activeMatches, lastError,
  }), { env });

  const page = () => fs.readFileSync(UI_FILE, 'utf8')
    .replaceAll('{{THRESHOLD_MINUTES}}', String(config.thresholdMinutes))
    .replaceAll('{{SNOOZE_MINUTES}}', String(config.snoozeMinutes))
    .replaceAll('{{WATCHED_PROCESSES}}', escapeHtml(config.watchedProcesses.join(', ')));

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/') {
      if (url.searchParams.get('token') !== token) {
        sendJson(response, 403, { error: 'Forbidden' });
        return;
      }
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      });
      response.end(page());
      return;
    }
    if (request.method === 'GET' && ASSETS[url.pathname]) {
      response.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' });
      fs.createReadStream(ASSETS[url.pathname]).pipe(response);
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
        tracker: tracker.snapshot(),
        startedAt,
      });
      return;
    }
    if (request.method === 'POST' && url.pathname.startsWith('/action/')) {
      try {
        const action = url.pathname.slice('/action/'.length);
        const result = tracker.act(action, now());
        persist();
        sendJson(response, 200, { result });
      } catch (error) {
        sendJson(response, 409, { error: error.message });
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/control/stop') {
      sendJson(response, 200, { stopping: true });
      setImmediate(() => shutdown());
      return;
    }
    sendJson(response, 404, { error: 'Not found' });
  });

  const sample = () => {
    try {
      const names = processLister({ env }).map(normalizeProcessName);
      activeMatches = [...new Set(names.filter((name) => watched.has(name)))].slice(0, 64);
      lastError = null;
      const event = tracker.sample({ now: now(), active: activeMatches.length > 0 });
      if (event === 'prompt') {
        browserOpener(`http://127.0.0.1:${port}/?token=${token}`, { env });
      }
    } catch (error) {
      lastError = error.message;
    }
    persist();
  };

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (interval) clearIntervalFn(interval);
    removeRuntime(token, { env });
    removeMonitorLock(token, { env });
    server.close(() => process.exit(0));
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
  persist();
  sample();
  interval = setIntervalFn(sample, sampleMs);
  return { server, tracker, shutdown };
}

module.exports = { ASSETS, UI_FILE, runMonitor };
