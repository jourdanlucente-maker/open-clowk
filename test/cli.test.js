'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const CLI = path.resolve(__dirname, '..', 'bin', 'open-clowk.js');

function isolated(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-clowk-cli-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    ...process.env,
    HOME: path.join(root, 'home'),
    USERPROFILE: path.join(root, 'home'),
    APPDATA: path.join(root, 'appdata'),
    LOCALAPPDATA: path.join(root, 'localappdata'),
    XDG_STATE_HOME: path.join(root, 'xdg-state'),
    OPEN_CLOWK_STATE_DIR: path.join(root, 'state'),
    OPEN_CLOWK_TEST_MODE: '1',
    OPEN_CLOWK_TEST_PROCESSES: 'codex,Terminal,Finder',
  };
}

function run(args, env) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env, timeout: 20000 });
}

test('help and version describe the replacement product truthfully', (context) => {
  const env = isolated(context);
  const help = run(['--help'], env);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /setup.*detect.*start.*stop.*status/s);
  assert.match(help.stdout, /Never commands, terminal content/);
  assert.equal(run(['--version'], env).stdout.trim(), 'open-clowk 0.1.0');
});

test('setup stores minute semantics and presets only in isolated state', (context) => {
  const env = isolated(context);
  const result = run(['setup', '--minutes', '5', '--watch', 'codex,terminal,custom-cli', '--snooze', '5'], env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Intervention: 5 minute/);
  const config = JSON.parse(fs.readFileSync(path.join(env.OPEN_CLOWK_STATE_DIR, 'config.json'), 'utf8'));
  assert.equal(config.thresholdMinutes, 5);
  assert.ok(config.watchedProcesses.includes('custom-cli'));
  assert.ok(config.watchedProcesses.includes('Terminal'));
});

test('detect lists injected names and makes the privacy boundary explicit', (context) => {
  const result = run(['detect'], isolated(context));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Visible process names \(names only; no commands or content\)/);
  assert.match(result.stdout, /codex/);
  assert.match(result.stdout, /terminal/);
});

test('status and stop are truthful and idempotent while stopped', (context) => {
  const env = isolated(context);
  run(['setup', '--minutes', '5', '--watch', 'codex'], env);
  assert.match(run(['status'], env).stdout, /Monitor: stopped/);
  assert.match(run(['stop'], env).stdout, /already stopped/);
});

test('invalid public thresholds and unknown commands fail clearly', (context) => {
  const env = isolated(context);
  const invalid = run(['setup', '--minutes', '0', '--watch', 'codex'], env);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /whole number from 1/);
  const unknown = run(['obliterate'], env);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown command/);
});
