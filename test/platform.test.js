'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const {
  browserCommand,
  listProcesses,
  openBrowser,
  parseWindowsTasklist,
  processCommand,
} = require('../lib/platform');

test('process-list commands are narrow and portable', () => {
  assert.deepEqual(processCommand('darwin'), { command: 'ps', args: ['-axo', 'comm='] });
  assert.deepEqual(processCommand('linux'), { command: 'ps', args: ['-eo', 'comm='] });
  assert.deepEqual(processCommand('win32'), { command: 'tasklist.exe', args: ['/fo', 'csv', '/nh'] });
  assert.throws(() => processCommand('freebsd'), /not supported/);
});

test('macOS and Linux parsing returns process names without command arguments', async () => {
  const names = await listProcesses({
    platform: 'darwin',
    env: {},
    execFileFn: async () => '/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal\n/usr/local/bin/codex\n',
  });
  assert.deepEqual(names, [
    '/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal',
    '/usr/local/bin/codex',
  ]);
});

test('process sampling never blocks the monitor event loop', async () => {
  let released;
  const gate = new Promise((resolve) => { released = resolve; });
  const pending = listProcesses({ platform: 'linux', env: {}, execFileFn: () => gate });
  let ticked = false;
  setImmediate(() => { ticked = true; released('codex\n'); });
  assert.equal(ticked, false);
  assert.deepEqual(await pending, ['codex']);
  assert.equal(ticked, true);
});

test('Windows tasklist CSV parsing extracts image names only', () => {
  const output = '"WindowsTerminal.exe","123","Console","1","10,000 K"\r\n"codex.exe","456","Console","1","20,000 K"\r\n';
  assert.deepEqual(parseWindowsTasklist(output), ['WindowsTerminal.exe', 'codex.exe']);
});

test('default browser commands use no shell and only accept loopback URLs', () => {
  const url = 'http://127.0.0.1:43123/#abc';
  assert.deepEqual(browserCommand('darwin', url), { command: 'open', args: [url] });
  assert.deepEqual(browserCommand('linux', url), { command: 'xdg-open', args: [url] });
  assert.deepEqual(browserCommand('win32', url), { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] });
  assert.throws(() => browserCommand('darwin', 'https://example.com'), /loopback/);
});

test('test-only process snapshots do not execute an operating-system command', async () => {
  const names = await listProcesses({
    env: { OPEN_CLOWK_TEST_MODE: '1', OPEN_CLOWK_TEST_PROCESSES: 'codex,Terminal' },
    execFileFn: () => { throw new Error('must not execute'); },
  });
  assert.deepEqual(names, ['codex', 'Terminal']);
});

function fakeLauncher(emit) {
  return () => {
    const child = new EventEmitter();
    child.unref = () => {};
    setImmediate(() => emit(child));
    return child;
  };
}

test('a failed browser launch rejects instead of silently losing the intervention', async () => {
  await assert.rejects(openBrowser('http://127.0.0.1:1/?bootstrap=abc', {
    platform: 'linux',
    env: {},
    spawnFn: fakeLauncher((child) => child.emit('error', new Error('spawn xdg-open ENOENT'))),
  }), /Could not launch xdg-open/);
});

test('a launcher that spawns but exits non-zero counts as a failed launch', async () => {
  await assert.rejects(openBrowser('http://127.0.0.1:1/?bootstrap=abc', {
    platform: 'linux',
    env: {},
    exitGraceMs: 500,
    spawnFn: fakeLauncher((child) => {
      child.emit('spawn');
      child.emit('exit', 3, null);
    }),
  }), /xdg-open exited with code 3 without opening the break page/);
});

test('a launcher that exits cleanly or stays alive counts as opened', async () => {
  const options = { platform: 'linux', env: {}, exitGraceMs: 50 };
  await openBrowser('http://127.0.0.1:1/?bootstrap=abc', {
    ...options,
    spawnFn: fakeLauncher((child) => {
      child.emit('spawn');
      child.emit('exit', 0, null);
    }),
  });
  await openBrowser('http://127.0.0.1:1/?bootstrap=abc', {
    ...options,
    spawnFn: fakeLauncher((child) => child.emit('spawn')),
  });
});
