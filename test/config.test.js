'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  acquireMonitorLock,
  createConfig,
  expandWatchedProcesses,
  readConfig,
  readMonitorLock,
  removeMonitorLock,
  stateDirectory,
  writeConfig,
} = require('../lib/config');

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-clowk-lock-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { OPEN_CLOWK_STATE_DIR: root };
  assert.equal(acquireMonitorLock('owner-a', { env }), true);
  assert.equal(acquireMonitorLock('owner-b', { env }), false);
  assert.equal(readMonitorLock({ env }), 'owner-a');
  assert.equal(removeMonitorLock('owner-b', { env }), false);
  assert.equal(removeMonitorLock('owner-a', { env }), true);
});
