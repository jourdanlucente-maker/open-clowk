'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  acquireMonitorLock,
  readMonitorLock,
  readRuntime,
  writeConfig,
  writeRuntime,
} = require('../lib/config');
const { portRefused } = require('../lib/control');
const { stopMonitor } = require('../lib/service');

function isolated(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-clowk-service-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { OPEN_CLOWK_STATE_DIR: root };
  writeConfig({
    version: 1, thresholdMinutes: 5, snoozeMinutes: 5, watchedProcesses: ['codex'],
  }, { env });
  return env;
}

function unhealthyServer(context) {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      response.writeHead(503);
      response.end();
    });
    context.after(() => {
      server.closeAllConnections?.();
      server.close();
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function freePort(context) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

test('a refused loopback port reads as refused and a listening one does not', async (context) => {
  assert.equal(await portRefused(await freePort(context)), true);
  assert.equal(await portRefused(await unhealthyServer(context)), false);
  assert.equal(await portRefused(0), false);
});

test('stop does not erase the state of a monitor that is still holding its port', async (context) => {
  const env = isolated(context);
  const port = await unhealthyServer(context);
  acquireMonitorLock('slow', { env });
  writeRuntime({ version: 1, pid: process.pid, token: 'slow', port }, { env });

  const stopped = await stopMonitor({ env, waitFn: async () => {} });
  assert.equal(stopped, false);
  assert.equal(readMonitorLock({ env }), 'slow');
  assert.equal(readRuntime({ env }).port, port);
});

test('stop clears the state of a monitor whose recorded port refuses connections', async (context) => {
  const env = isolated(context);
  const port = await freePort(context);
  acquireMonitorLock('dead', { env });
  writeRuntime({ version: 1, pid: process.pid, token: 'dead', port }, { env });

  const stopped = await stopMonitor({ env, waitFn: async () => {} });
  assert.equal(stopped, false);
  assert.equal(readMonitorLock({ env }), null);
  assert.equal(readRuntime({ env }), null);
});

test('stop racing an in-flight start leaves the starting owner its lock', async (context) => {
  const env = isolated(context);
  acquireMonitorLock('starting', { env });

  const stopped = await stopMonitor({ env, waitFn: async () => {} });
  assert.equal(stopped, false);
  assert.equal(readMonitorLock({ env }), 'starting');
});

test('stop retries the health probe before deciding a monitor is gone', async (context) => {
  const env = isolated(context);
  const port = await freePort(context);
  acquireMonitorLock('slow', { env });
  writeRuntime({ version: 1, pid: process.pid, token: 'slow', port }, { env });

  const probes = [];
  const stopped = await stopMonitor({
    env,
    waitFn: async () => {},
    probeFn: async (probed) => {
      probes.push(probed);
      return false;
    },
  });
  assert.equal(stopped, false);
  assert.deepEqual(probes, [port]);
  assert.equal(readMonitorLock({ env }), 'slow');
});
