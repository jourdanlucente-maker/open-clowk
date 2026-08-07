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
  const timers = [];
  let clock = 1000;
  let tick;
  let nextTimerId = 1;
  const monitor = await runMonitor({
    env,
    now: () => clock,
    processLister: processLister || (async () => [watchedProcesses[0]]),
    browserOpener: browserOpener || (async (url) => { opened.push(url); }),
    setIntervalFn: setIntervalFn || ((fn) => { tick = fn; return null; }),
    clearIntervalFn: () => {},
    setTimeoutFn: (fn, delay) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.push({ id, fn, delay });
      return id;
    },
    clearTimeoutFn: (id) => {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index !== -1) timers.splice(index, 1);
    },
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
    timers,
    port: monitor.server.address().port,
    advance: async (milliseconds) => { clock += milliseconds; await tick(); },
    tick: () => tick(),
    pendingDelays: () => timers.map((timer) => timer.delay),
    fireRelaunch: async () => {
      const timer = timers.shift();
      if (!timer) throw new Error('no relaunch is scheduled');
      await timer.fn();
      return timer.delay;
    },
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

test('an authenticated request slides the session and reissues the cookie', async (context) => {
  const clowk = await harness(context);
  const { cookie, redirect } = await sessionFor(clowk);
  assert.match(redirect.headers['set-cookie'][0], /Max-Age=1800/);

  await clowk.advance(1700000);
  const reload = await fetchLocal(clowk.port, '/', { headers: { Cookie: cookie } });
  assert.equal(reload.status, 200);
  assert.match(reload.headers['set-cookie'][0], /^open_clowk_session=/);
  assert.match(reload.headers['set-cookie'][0], /Max-Age=1800/);
  assert.match(reload.headers['set-cookie'][0], /HttpOnly/);
  assert.match(reload.headers['set-cookie'][0], /SameSite=Strict/);

  await clowk.advance(1700000);
  assert.equal((await fetchLocal(clowk.port, '/', { headers: { Cookie: cookie } })).status, 200);
});

test('the open-page heartbeat keeps a live intervention reachable and exposes nothing', async (context) => {
  const clowk = await harness(context);
  const { cookie } = await sessionFor(clowk);
  const beat = { Cookie: cookie, 'Sec-Fetch-Site': 'same-origin' };

  for (let elapsed = 0; elapsed < 3600000; elapsed += 300000) {
    await clowk.advance(300000);
    const pulse = await fetchLocal(clowk.port, '/session/heartbeat', { method: 'POST', headers: beat });
    assert.equal(pulse.status, 204);
    assert.equal(pulse.body, '');
    assert.match(pulse.headers['set-cookie'][0], /Max-Age=1800/);
  }
  assert.equal(clowk.runtime().tracker.mode, 'prompted');
  assert.equal((await fetchLocal(clowk.port, '/', { headers: { Cookie: cookie } })).status, 200);
});

test('an expired session never claims the live intervention is over', async (context) => {
  const clowk = await harness(context);
  const { cookie } = await sessionFor(clowk);
  await clowk.advance(1800001);

  const idle = await fetchLocal(clowk.port, '/', { headers: { Cookie: cookie } });
  assert.equal(idle.status, 403);
  assert.equal(clowk.runtime().tracker.mode, 'prompted');
  assert.match(idle.headers['content-type'], /text\/html/);
  assert.doesNotMatch(idle.body, /no active intervention/);
  assert.match(idle.body, /This page&#39;s session expired, but <strong>Open Clowk<\/strong> is still waiting for your choice/);
  assert.match(idle.body, /Close the watched app or restart Open Clowk to reset/);
  assert.match(idle.body, /open-clowk status/);

  assert.equal(idle.headers['set-cookie'], undefined);
  assert.doesNotMatch(idle.body, /data-action=/);
  assert.doesNotMatch(idle.body, /bootstrap/);
  assert.doesNotMatch(idle.body, /<script/);
  assert.equal((await fetchLocal(clowk.port, '/session/heartbeat', {
    method: 'POST', headers: { Cookie: cookie, 'Sec-Fetch-Site': 'same-origin' },
  })).status, 403);
  assert.equal((await fetchLocal(clowk.port, '/action/keep-going', {
    method: 'POST', headers: { Cookie: cookie, 'Sec-Fetch-Site': 'same-origin' },
  })).status, 403);
  assert.equal(clowk.runtime().tracker.mode, 'prompted');
});

test('thirty idle minutes expire the session, and resolving expires it at once', async (context) => {
  const clowk = await harness(context);
  const { cookie } = await sessionFor(clowk);
  await clowk.advance(1800001);
  assert.equal((await fetchLocal(clowk.port, '/', { headers: { Cookie: cookie } })).status, 403);
  assert.equal((await fetchLocal(clowk.port, '/session/heartbeat', {
    method: 'POST', headers: { Cookie: cookie, 'Sec-Fetch-Site': 'same-origin' },
  })).status, 403);

  const revived = await harness(context);
  const fresh = await sessionFor(revived);
  const acted = await fetchLocal(revived.port, '/action/keep-going', {
    method: 'POST', headers: { Cookie: fresh.cookie, 'Sec-Fetch-Site': 'same-origin' },
  });
  assert.equal(acted.status, 200);
  assert.equal((await fetchLocal(revived.port, '/session/heartbeat', {
    method: 'POST', headers: { Cookie: fresh.cookie, 'Sec-Fetch-Site': 'same-origin' },
  })).status, 403);
});

test('a heartbeat from another loopback origin is refused', async (context) => {
  const clowk = await harness(context);
  const { cookie } = await sessionFor(clowk);
  const crossSite = await fetchLocal(clowk.port, '/session/heartbeat', {
    method: 'POST',
    headers: { Cookie: cookie, 'Sec-Fetch-Site': 'same-site', Origin: 'http://127.0.0.1:5173' },
  });
  assert.equal(crossSite.status, 403);
});

test('an action that cannot be persisted is still reported as applied', async (context) => {
  const clowk = await harness(context);
  const { cookie } = await sessionFor(clowk);
  const runtimeFile = path.join(clowk.root, 'runtime.json');
  fs.rmSync(runtimeFile);
  fs.mkdirSync(runtimeFile);

  const acted = await fetchLocal(clowk.port, '/action/keep-going', {
    method: 'POST', headers: { Cookie: cookie, 'Sec-Fetch-Site': 'same-origin' },
  });
  assert.equal(acted.status, 200);
  assert.equal(JSON.parse(acted.body).result, 'reset');

  const health = await fetchLocal(clowk.port, '/health', { headers: { 'X-Open-Clowk-Token': TOKEN } });
  const reported = JSON.parse(health.body);
  assert.equal(reported.tracker.mode, 'tracking');
  assert.match(reported.lastError, /runtime\.json/);
  fs.rmSync(runtimeFile, { recursive: true });
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

test('a page that connects counts as launched even when the launcher exits non-zero', async (context) => {
  const opened = [];
  const clowk = await harness(context, {
    browserOpener: async (url) => {
      opened.push(url);
      throw new Error('xdg-open exited with code 3 without opening the break page.');
    },
  });
  await clowk.advance(5000);
  assert.equal(opened.length, 1);
  assert.match(clowk.runtime().lastBrowserError, /exited with code 3/);
  assert.deepEqual(clowk.pendingDelays(), [5000]);

  const bootstrap = new URL(opened[0]).searchParams.get('bootstrap');
  const redirect = await fetchLocal(clowk.port, `/?bootstrap=${bootstrap}`);
  assert.equal(redirect.status, 302);

  assert.deepEqual(clowk.pendingDelays(), []);
  await clowk.advance(5000);
  assert.equal(opened.length, 1);
  const health = await fetchLocal(clowk.port, '/health', { headers: { 'X-Open-Clowk-Token': TOKEN } });
  assert.equal(JSON.parse(health.body).lastBrowserError, null);
});

test('a page that never connects is relaunched exactly three times at 5s, 15s and 30s', async (context) => {
  const opened = [];
  const clowk = await harness(context, { browserOpener: async (url) => { opened.push(url); } });
  await clowk.advance(5000);
  assert.equal(opened.length, 1);

  assert.equal(await clowk.fireRelaunch(), 5000);
  assert.equal(opened.length, 2);
  assert.equal(await clowk.fireRelaunch(), 15000);
  assert.equal(opened.length, 3);
  assert.equal(await clowk.fireRelaunch(), 30000);
  assert.equal(opened.length, 4);

  assert.deepEqual(clowk.pendingDelays(), []);
  assert.match(clowk.runtime().lastBrowserError, /did not open after 4 attempts/);
  assert.match(clowk.runtime().lastBrowserError, /still running/);
  assert.equal(clowk.runtime().tracker.mode, 'prompted');

  await clowk.advance(5000);
  await clowk.advance(5000);
  assert.equal(opened.length, 4);
  assert.deepEqual(clowk.pendingDelays(), []);
  assert.equal(new Set(opened.map((url) => new URL(url).searchParams.get('bootstrap'))).size, 4);
});

test('a slow first tab still authenticates after later relaunches were issued', async (context) => {
  const opened = [];
  const clowk = await harness(context, { browserOpener: async (url) => { opened.push(url); } });
  await clowk.advance(5000);
  const first = new URL(opened[0]).searchParams.get('bootstrap');
  await clowk.fireRelaunch();
  await clowk.fireRelaunch();
  assert.equal(opened.length, 3);

  const redirect = await fetchLocal(clowk.port, `/?bootstrap=${first}`);
  assert.equal(redirect.status, 302);
  const cookie = redirect.headers['set-cookie'][0].split(';')[0];
  const page = await fetchLocal(clowk.port, '/', { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);
  assert.match(page.body, /Take a break/);

  assert.deepEqual(clowk.pendingDelays(), []);
  await clowk.advance(5000);
  assert.equal(opened.length, 3);

  const replay = await fetchLocal(clowk.port, `/?bootstrap=${first}`);
  assert.equal(replay.status, 403);
});

test('every tab opened for one cycle keeps its own working session', async (context) => {
  const opened = [];
  const clowk = await harness(context, { browserOpener: async (url) => { opened.push(url); } });
  await clowk.advance(5000);
  await clowk.fireRelaunch();
  assert.equal(opened.length, 2);

  const cookies = [];
  for (const url of opened) {
    const redirect = await fetchLocal(clowk.port, `/?bootstrap=${new URL(url).searchParams.get('bootstrap')}`);
    assert.equal(redirect.status, 302);
    cookies.push(redirect.headers['set-cookie'][0].split(';')[0]);
  }
  assert.equal(new Set(cookies).size, 2);
  for (const cookie of cookies) {
    assert.equal((await fetchLocal(clowk.port, '/', { headers: { Cookie: cookie } })).status, 200);
  }

  const acted = await fetchLocal(clowk.port, '/action/keep-going', {
    method: 'POST',
    headers: { Cookie: cookies[0], 'Sec-Fetch-Site': 'same-origin' },
  });
  assert.equal(acted.status, 200);
  for (const cookie of cookies) {
    assert.equal((await fetchLocal(clowk.port, '/', { headers: { Cookie: cookie } })).status, 403);
  }
});

test('closing the watched processes resets an exhausted launch cycle', async (context) => {
  const opened = [];
  let active = true;
  const clowk = await harness(context, {
    processLister: async () => (active ? ['codex'] : ['unrelated']),
    browserOpener: async (url) => { opened.push(url); },
  });
  await clowk.advance(5000);
  await clowk.fireRelaunch();
  await clowk.fireRelaunch();
  await clowk.fireRelaunch();
  assert.equal(opened.length, 4);
  assert.match(clowk.runtime().lastBrowserError, /did not open after 4 attempts/);

  active = false;
  await clowk.advance(5000);
  assert.equal(clowk.runtime().tracker.mode, 'tracking');

  active = true;
  await clowk.advance(5000);
  await clowk.advance(5000);
  assert.equal(opened.length, 5);
  assert.deepEqual(clowk.pendingDelays(), [5000]);
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
