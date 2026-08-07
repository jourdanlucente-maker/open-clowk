'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  acquireMonitorLock,
  claimMonitorLock,
  createConfig,
  expandWatchedProcesses,
  readConfig,
  readMonitorLock,
  readMonitorLockRecord,
  readRuntime,
  reclaimAbandonedState,
  releaseMonitorState,
  removeMonitorLock,
  runtimePath,
  stateDirectory,
  writeConfig,
  writeRuntime,
} = require('../lib/config');

function isolatedState(context, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { OPEN_CLOWK_STATE_DIR: root };
}

test('public configuration accepts only whole minutes with minimum one', () => {
  assert.equal(createConfig({ thresholdMinutes: 1, watchedProcesses: ['codex'] }).thresholdMinutes, 1);
  assert.throws(() => createConfig({ thresholdMinutes: 0, watchedProcesses: ['codex'] }), /whole number/);
  assert.throws(() => createConfig({ thresholdMinutes: 1.5, watchedProcesses: ['codex'] }), /whole number/);
});

test('presets and arbitrary custom process names expand without duplicates', () => {
  const names = expandWatchedProcesses(['claude', 'terminal', 'My Special CLI', 'CLAUDE']);
  assert.ok(names.includes('claude'));
  assert.ok(names.includes('Terminal'));
  assert.ok(names.includes('My Special CLI'));
  assert.equal(names.filter((value) => value.toLowerCase() === 'claude').length, 1);
});

test('configuration is isolated and round-trips only bounded fields', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-clowk-config-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { OPEN_CLOWK_STATE_DIR: root };
  const config = createConfig({ thresholdMinutes: 5, snoozeMinutes: 5, watchedProcesses: ['codex'] });
  writeConfig(config, { env });
  assert.deepEqual(readConfig({ env }), config);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'config.json')))).sort(), [
    'snoozeMinutes', 'thresholdMinutes', 'version', 'watchedProcesses',
  ]);
});

test('state locations are platform-specific and overrideable', () => {
  assert.equal(stateDirectory({ env: {}, platform: 'darwin', home: '/u' }), path.join('/u', 'Library', 'Application Support', 'open-clowk'));
  assert.equal(stateDirectory({ env: { XDG_STATE_HOME: '/state' }, platform: 'linux', home: '/u' }), path.join('/state', 'open-clowk'));
  assert.equal(stateDirectory({ env: { LOCALAPPDATA: 'C:\\Data' }, platform: 'win32', home: 'C:\\U' }), path.join('C:\\Data', 'open-clowk'));
  assert.equal(stateDirectory({ env: { OPEN_CLOWK_STATE_DIR: './test-state' } }), path.resolve('./test-state'));
});

test('the per-user monitor lock is exclusive and token-owned', (context) => {
  const env = isolatedState(context, 'open-clowk-lock-');
  assert.equal(acquireMonitorLock('owner-a', { env }), true);
  assert.equal(acquireMonitorLock('owner-b', { env }), false);
  assert.equal(readMonitorLock({ env }), 'owner-a');
  assert.equal(removeMonitorLock('owner-b', { env }), false);
  assert.equal(removeMonitorLock('owner-a', { env }), true);
});

test('the monitor lock records its owning process and can be reclaimed by it', (context) => {
  const env = isolatedState(context, 'open-clowk-lock-pid-');
  acquireMonitorLock('owner-a', { env, pid: 4321, nowFn: () => 7000 });
  assert.deepEqual(readMonitorLockRecord({ env }), { token: 'owner-a', pid: 4321, startedAt: 7000 });
  assert.equal(claimMonitorLock('owner-b', { env, pid: 9999 }), false);
  assert.equal(claimMonitorLock('owner-a', { env, pid: 9999, nowFn: () => 8000 }), true);
  assert.deepEqual(readMonitorLockRecord({ env }), { token: 'owner-a', pid: 9999, startedAt: 8000 });
});

test('abandoned lock and runtime state are reclaimed by owner liveness, never blindly', (context) => {
  const env = isolatedState(context, 'open-clowk-reclaim-');
  const dead = () => { const error = new Error('ESRCH'); error.code = 'ESRCH'; throw error; };
  acquireMonitorLock('gone', { env, pid: 4321 });
  writeRuntime({ version: 1, pid: 4321, token: 'gone', port: 1 }, { env });

  assert.equal(reclaimAbandonedState({ env, killFn: () => true }), false);
  assert.equal(readMonitorLock({ env }), 'gone');
  assert.ok(readRuntime({ env }));

  assert.equal(reclaimAbandonedState({ env, killFn: dead }), true);
  assert.equal(readMonitorLock({ env }), null);
  assert.equal(readRuntime({ env }), null);
});

test('a lock left before the last boot is reclaimed even when its pid was reused', (context) => {
  const env = isolatedState(context, 'open-clowk-boot-');
  acquireMonitorLock('gone', { env, pid: 4321, nowFn: () => 1000 });
  const reused = { env, killFn: () => true, uptimeFn: () => 60, nowFn: () => 10000000 };
  assert.equal(reclaimAbandonedState(reused), true);
  assert.equal(readMonitorLock({ env }), null);
});

test('a lock taken after the last boot by a live owner is never stolen', (context) => {
  const env = isolatedState(context, 'open-clowk-live-');
  acquireMonitorLock('serving', { env, pid: 4321, nowFn: () => 9990000 });
  const live = { env, killFn: () => true, uptimeFn: () => 60, nowFn: () => 10000000 };
  assert.equal(reclaimAbandonedState(live), false);
  assert.equal(readMonitorLock({ env }), 'serving');
});

test('stop clears a lock whose owner is not serving the control channel', (context) => {
  const env = isolatedState(context, 'open-clowk-release-');
  acquireMonitorLock('wedged', { env, pid: process.pid });
  writeRuntime({ version: 1, pid: process.pid, token: 'wedged', port: 1 }, { env });
  assert.equal(reclaimAbandonedState({ env }), false);
  assert.equal(releaseMonitorState({ env }), true);
  assert.equal(readMonitorLock({ env }), null);
  assert.equal(readRuntime({ env }), null);
});

test('removing an already-removed lock reports false instead of throwing', (context) => {
  const env = isolatedState(context, 'open-clowk-enoent-');
  acquireMonitorLock('owner', { env });
  assert.equal(removeMonitorLock('owner', { env }), true);
  assert.equal(removeMonitorLock('owner', { env }), false);
  assert.equal(releaseMonitorState({ env }), false);
});

test('a torn or corrupt runtime file reads as stopped instead of throwing', (context) => {
  const env = isolatedState(context, 'open-clowk-runtime-');
  writeRuntime({ version: 1, pid: process.pid, token: 'live', port: 1 }, { env });
  assert.equal(readRuntime({ env }).token, 'live');
  fs.writeFileSync(runtimePath({ env }), '{"version": 1, "tok');
  assert.equal(readRuntime({ env }), null);
});

test('runtime state is published atomically so a concurrent reader never sees a partial file', (context) => {
  const env = isolatedState(context, 'open-clowk-atomic-');
  const file = runtimePath({ env });
  writeRuntime({ version: 1, pid: process.pid, token: 'a'.repeat(48), port: 1 }, { env });
  const before = fs.statSync(file).ino;
  writeRuntime({ version: 1, pid: process.pid, token: 'b'.repeat(48), port: 2 }, { env });
  if (before) assert.notEqual(fs.statSync(file).ino, before);
  assert.equal(readRuntime({ env }).port, 2);
  assert.deepEqual(fs.readdirSync(path.dirname(file)).filter((name) => name.endsWith('.tmp')), []);
});
