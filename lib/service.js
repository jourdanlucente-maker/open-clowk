'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { monitorStatus, stopMonitorRequest } = require('./control');
const {
  acquireMonitorLock,
  readConfig,
  readMonitorLockRecord,
  reclaimAbandonedState,
  removeMonitorLock,
} = require('./config');

const ENTRY = path.join(__dirname, 'daemon-entry.js');
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function startMonitor({ env = process.env, spawnFn = spawn, waitFn = wait } = {}) {
  if (!readConfig({ env })) throw new Error('Open Clowk is not configured. Run open-clowk setup first.');
  const current = await monitorStatus({ env });
  if (current.running) return { started: false, status: current };
  reclaimAbandonedState({ env });

  const token = crypto.randomBytes(24).toString('hex');
  if (!acquireMonitorLock(token, { env })) {
    let acquired = false;
    for (let attempt = 0; attempt < 50 && !acquired; attempt += 1) {
      await waitFn(100);
      const racing = await monitorStatus({ env });
      if (racing.running) return { started: false, status: racing };
      reclaimAbandonedState({ env });
      acquired = acquireMonitorLock(token, { env });
    }
    if (!acquired) {
      throw new Error('A live Open Clowk monitor already owns the per-user start lock. Run open-clowk stop first.');
    }
  }
  const child = spawnFn(process.execPath, [ENTRY], {
    detached: true,
    env: { ...env, OPEN_CLOWK_MONITOR_TOKEN: token },
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  for (let attempt = 0; attempt < 50; attempt += 1) {
    await waitFn(100);
    const status = await monitorStatus({ env });
    if (status.running) return { started: true, status };
    if (child.exitCode !== null) break;
  }
  const lock = readMonitorLockRecord({ env });
  if (lock?.token === token && lock.pid === process.pid) removeMonitorLock(token, { env });
  reclaimAbandonedState({ env });
  throw new Error('The monitor did not become ready. Check the local last-error.txt file.');
}

async function stopMonitor({ env = process.env, waitFn = wait } = {}) {
  const current = await monitorStatus({ env });
  if (!current.running) {
    reclaimAbandonedState({ env });
    return false;
  }
  await stopMonitorRequest({ env });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await waitFn(100);
    if (!(await monitorStatus({ env })).running) return true;
  }
  throw new Error('The monitor did not stop cleanly.');
}

module.exports = { ENTRY, startMonitor, stopMonitor };
