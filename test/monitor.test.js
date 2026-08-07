'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { acquireMonitorLock, writeConfig } = require('../lib/config');
const { runMonitor } = require('../lib/monitor');

const TOKEN = 'a'.repeat(48);

function fetchLocal(port, pathname, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1', port, path: pathname, method, headers, timeout: 2000, agent: false,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({
        status: response.statusCode, headers: response.headers, body,
      }));
    });
    request.on('timeout', () => request.destroy(new Error('timed out')));
    request.on('error', reject);
    request.end();
  });
}

function stateFor(context, watchedProcesses) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-clowk-monitor-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = {
    OPEN_CLOWK_STATE_DIR: root,
    OPEN_CLOWK_MONITOR_TOKEN: TOKEN,
    OPEN_CLOWK_TEST_MODE: '1',
    OPEN_CLOWK_TEST_THRESHOLD_MS: '1',
  };
  writeConfig({
    version: 1, thresholdMinutes: 25, snoozeMinutes: 5, watchedProcesses,
  }, { env });
  acquireMonitorLock(TOKEN, { env });
  return { env, root };
}

async function harness(context, {
  watchedProcesses = ['codex'],
  browserOpener,
  processLister,
  setIntervalFn,
} = {}) {
  const { env, root } = stateFor(context, watchedProcesses);
  const opened = [];
  const exits = [];
  let clock = 1000;
  let tick;
  const monitor = await runMonitor({
    env,
    now: () => clock,
    processLister: processLister || (async () => [watchedProcesses[0]]),
    browserOpener: browserOpener || (async (url) => { opened.push(url); }),
    setIntervalFn: setIntervalFn || ((fn) => { tick = fn; return null; }),
    clearIntervalFn: () => {},
    exitFn: (code) => exits.push(code),
  });
  context.after(() => {
    monitor.server.closeAllConnections?.();
    monitor.server.close();
  });
  return {
    env,
    exits,
    monitor,
    opened,
    root,
    port: monitor.server.address().port,
    advance: async (milliseconds) => { clock += milliseconds; await tick(); },
    tick: () => tick(),
    runtime: () => JSON.parse(fs.readFileSync(path.join(root, 'runtime.json'), 'utf8')),
  };
}

async function sessionFor(clowk) {
  await clowk.advance(5000);
  const bootstrap = new URL(clowk.opened.at(-1)).searchParams.get('bootstrap');
  const redirect = await fetchLocal(clowk.port, `/?bootstrap=${bootstrap}`);
  return { bootstrap, cookie: redirect.headers['set-cookie'][0].split(';')[0], redirect };
}

test('the launcher URL carries a single-use bootstrap exchanged for a loopback session', async (context) => {
  const clowk = await harness(context);
  await clowk.advance(5000);
  assert.equal(clowk.opened.length, 1);
  const url = new URL(clowk.opened[0]);
  const bootstrap = url.searchParams.get('bootstrap');
  assert.match(bootstrap, /^[a-f0-9]{48}$/);
  assert.equal(url.searchParams.get('token'), null);
  assert.ok(!clowk.opened[0].includes(TOKEN));

  const redirect = await fetchLocal(clowk.port, `/?bootstrap=${bootstrap}`);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.location, '/');
  const cookie = redirect.headers['set-cookie'][0];
  assert.match(cookie, /^open_clowk_session=[a-f0-9]{48};/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);

  const replay = await fetchLocal(clowk.port, `/?bootstrap=${bootstrap}`);
  assert.equal(replay.status, 403);
  assert.doesNotMatch(replay.body, /Take a break/);

  const session = { cookie: cookie.split(';')[0] };
  const page = await fetchLocal(clowk.port, '/', { headers: { Cookie: session.cookie } });
  assert.equal(page.status, 200);
  assert.match(page.body, /Take a break/);
  const reload = await fetchLocal(clowk.port, '/', { headers: { Cookie: session.cookie } });
  assert.equal(reload.status, 200);
  assert.match(reload.body, /Take a break/);
});

test('the browser session cannot read configuration or stop the monitor', async (context) => {
  const clowk = await harness(context);
  await clowk.advance(5000);
  const bootstrap = new URL(clowk.opened[0]).searchParams.get('bootstrap');
  const redirect = await fetchLocal(clowk.port, `/?bootstrap=${bootstrap}`);
  const cookie = redirect.headers['set-cookie'][0].split(';')[0];

  assert.equal((await fetchLocal(clowk.port, '/health', { headers: { Cookie: cookie } })).status, 403);
  assert.equal((await fetchLocal(clowk.port, '/control/stop', { method: 'POST', headers: { Cookie: cookie } })).status, 403);
  const health = await fetchLocal(clowk.port, '/health', { headers: { 'X-Open-Clowk-Token': TOKEN } });
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).tracker.mode, 'prompted');
});

test('another loopback origin cannot spend the session cookie on an action', async (context) => {
  const clowk = await harness(context);
  const { cookie } = await sessionFor(clowk);

  const crossSite = await fetchLocal(clowk.port, '/action/keep-going', {
    method: 'POST',
    headers: { Cookie: cookie, 'Sec-Fetch-Site': 'same-site', Origin: 'http://127.0.0.1:5173' },
  });
  assert.equal(crossSite.status, 403);
  const crossOriginOnly = await fetchLocal(clowk.port, '/action/keep-going', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: 'http://127.0.0.1:5173' },
  });
  assert.equal(crossOriginOnly.status, 403);
  const health = await fetchLocal(clowk.port, '/health', { headers: { 'X-Open-Clowk-Token': TOKEN } });
  assert.equal(JSON.parse(health.body).tracker.mode, 'prompted');

  const sameOrigin = await fetchLocal(clowk.port, '/action/snooze', {
    method: 'POST',
    headers: { Cookie: cookie, 'Sec-Fetch-Site': 'same-origin', Origin: `http://127.0.0.1:${clowk.port}` },
  });
  assert.equal(sameOrigin.status, 200);
  assert.equal(JSON.parse(sameOrigin.body).result, 'snoozed');
});

test('a sample finishing after shutdown does not recreate runtime state', async (context) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let first = true;
  const clowk = await harness(context, {
    processLister: async () => {
      if (first) {
        first = false;
        return ['codex'];
      }
      return gate;
    },
  });
  const runtimeFile = path.join(clowk.root, 'runtime.json');
  assert.equal(fs.existsSync(runtimeFile), true);

  const pending = clowk.tick();
  clowk.monitor.shutdown();
  assert.equal(fs.existsSync(runtimeFile), false);
  release(['codex']);
  await pending;
  assert.equal(fs.existsSync(runtimeFile), false);
  assert.equal(fs.existsSync(path.join(clowk.root, 'monitor.lock')), false);
});

test('a failed post-listen bootstrap releases the lock instead of holding it forever', async (context) => {
  const { env, root } = stateFor(context, ['codex']);
  await assert.rejects(runMonitor({
    env,
    now: () => 1000,
    processLister: async () => ['codex'],
    browserOpener: async () => {},
    setIntervalFn: () => { throw new Error('state directory is read-only'); },
    clearIntervalFn: () => {},
    exitFn: () => {},
  }), /read-only/);
  assert.equal(fs.existsSync(path.join(root, 'monitor.lock')), false);
  assert.equal(fs.existsSync(path.join(root, 'runtime.json')), false);
});

test('the session ends when the intervention resolves, without a raw JSON 403', async (context) => {
  const clowk = await harness(context);
  const { cookie } = await sessionFor(clowk);

  const acted = await fetchLocal(clowk.port, '/action/keep-going', {
    method: 'POST',
    headers: { Cookie: cookie, 'Sec-Fetch-Site': 'same-origin' },
  });
  assert.equal(acted.status, 200);
  assert.equal(JSON.parse(acted.body).result, 'reset');

  const after = await fetchLocal(clowk.port, '/', { headers: { Cookie: cookie } });
  assert.equal(after.status, 403);
  assert.match(after.headers['content-type'], /text\/html/);
  assert.match(after.body, /no active intervention/);
  assert.doesNotMatch(after.body, /^\{"error"/);
});

test('a failed break page launch is reported and retried instead of being lost', async (context) => {
  let attempts = 0;
  const clowk = await harness(context, {
    browserOpener: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('Could not launch xdg-open: spawn xdg-open ENOENT');
    },
  });
  await clowk.advance(5000);
  assert.equal(attempts, 1);
  assert.equal(clowk.runtime().tracker.mode, 'tracking');
  assert.match(clowk.runtime().lastBrowserError, /xdg-open/);

  await clowk.advance(5000);
  assert.equal(attempts, 2);
  await clowk.advance(5000);
  assert.equal(attempts, 3);
  assert.equal(clowk.runtime().tracker.mode, 'prompted');
  assert.equal(clowk.runtime().lastBrowserError, null);
});

test('watched names containing replacement patterns render literally', async (context) => {
  const clowk = await harness(context, { watchedProcesses: ['weird$&name', "quote'cli"] });
  await clowk.advance(5000);
  const bootstrap = new URL(clowk.opened[0]).searchParams.get('bootstrap');
  const redirect = await fetchLocal(clowk.port, `/?bootstrap=${bootstrap}`);
  const page = await fetchLocal(clowk.port, '/', {
    headers: { Cookie: redirect.headers['set-cookie'][0].split(';')[0] },
  });
  assert.equal(page.status, 200);
  assert.match(page.body, /weird\$&amp;name, quote&#39;cli/);
  assert.doesNotMatch(page.body, /\{\{WATCHED_PROCESSES\}\}/);
});

test('unreadable packaged assets answer 500 and never terminate the monitor', async (context) => {
  const clowk = await harness(context);
  const { ASSETS } = require('../lib/monitor');
  const asset = '/assets/robot-crowbar.webp';
  const real = ASSETS[asset];
  ASSETS[asset] = path.join(os.tmpdir(), 'open-clowk-missing-asset.webp');
  try {
    const response = await fetchLocal(clowk.port, asset);
    assert.equal(response.status, 500);
  } finally {
    ASSETS[asset] = real;
  }
  const health = await fetchLocal(clowk.port, '/health', { headers: { 'X-Open-Clowk-Token': TOKEN } });
  assert.equal(health.status, 200);
  assert.equal((await fetchLocal(clowk.port, asset)).status, 200);
});
