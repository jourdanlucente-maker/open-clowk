'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  browserCommand,
  listProcesses,
  parseWindowsTasklist,
  processCommand,
} = require('../lib/platform');

test('process-list commands are narrow and portable', () => {
  assert.deepEqual(processCommand('darwin'), { command: 'ps', args: ['-axo', 'comm='] });
  assert.deepEqual(processCommand('linux'), { command: 'ps', args: ['-eo', 'comm='] });
  assert.deepEqual(processCommand('win32'), { command: 'tasklist.exe', args: ['/fo', 'csv', '/nh'] });
  assert.throws(() => processCommand('freebsd'), /not supported/);
});

test('macOS and Linux parsing returns process names without command arguments', () => {
  const names = listProcesses({
    platform: 'darwin',
    env: {},
    execFileSyncFn: () => '/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal\n/usr/local/bin/codex\n',
  });
  assert.deepEqual(names, [
    '/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal',
    '/usr/local/bin/codex',
  ]);
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

test('test-only process snapshots do not execute an operating-system command', () => {
  const names = listProcesses({
    env: { OPEN_CLOWK_TEST_MODE: '1', OPEN_CLOWK_TEST_PROCESSES: 'codex,Terminal' },
    execFileSyncFn: () => { throw new Error('must not execute'); },
  });
  assert.deepEqual(names, ['codex', 'Terminal']);
});
