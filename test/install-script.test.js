'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.join(__dirname, '..', 'install.sh');
const roots = [];

function executable(file, body) {
  fs.writeFileSync(file, `#!/bin/sh\nset -eu\n${body}\n`, { mode: 0o755 });
}

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-clowk-install-test-'));
  roots.push(root);
  const bin = path.join(root, 'bin');
  const home = path.join(root, 'home');
  const destination = path.join(root, 'source');
  const log = path.join(root, 'commands.log');
  fs.mkdirSync(bin);
  fs.mkdirSync(home);
  for (const command of ['dirname', 'mkdir', 'mktemp', 'mv', 'rm', 'cp', 'chmod']) {
    const system = fs.existsSync(path.join('/bin', command)) ? path.join('/bin', command) : path.join('/usr/bin', command);
    fs.symlinkSync(system, path.join(bin, command));
  }
  executable(path.join(bin, 'uname'), 'echo "${FAKE_UNAME:-Darwin}"');
  executable(path.join(bin, 'npm'), `echo "npm $*" >> "$FAKE_LOG"\ncase "\${1:-}" in --version) echo 10.0.0;; ci) exit "\${FAKE_NPM_CI_EXIT:-0}";; start) exit "\${FAKE_NPM_START_EXIT:-0}";; esac`);
  if (options.node !== false) {
    executable(path.join(bin, 'node'), `case "\${1:-}" in -p) echo "${options.node || 22}";; --version) echo "v${options.node || 22}.0.0";; esac`);
  }
  if (options.git !== false) {
    executable(path.join(bin, 'git'), `echo "git $*" >> "$FAKE_LOG"\nif [ "\${1:-}" = clone ]; then mkdir -p "$6/.git"; exit 0; fi\nif [ "\${1:-}" = -C ]; then\n  case "\${3:-}" in remote) echo "https://github.com/jourdanlucente-maker/open-clowk.git";; status) [ "\${FAKE_DIRTY:-0}" = 1 ] && echo dirty;; esac\nfi`);
  }
  if (options.curl) {
    executable(path.join(bin, 'curl'), `echo "curl $*" >> "$FAKE_LOG"\n: > "$4"`);
    executable(path.join(bin, 'tar'), `echo "tar $*" >> "$FAKE_LOG"\nmkdir -p "$4/open-clowk-main"`);
  }
  if (options.brew) {
    executable(path.join(bin, 'brew'), `echo "brew $*" >> "$FAKE_LOG"\nif [ "\${1:-}" = install ]; then cp "$FAKE_NODE_AFTER_BREW" "$FAKE_BIN/node"; chmod +x "$FAKE_BIN/node"; fi`);
  }
  const env = {
    PATH: bin, HOME: home, OPEN_CLOWK_SOURCE_DIR: destination,
    FAKE_LOG: log, FAKE_BIN: bin, ...options.env,
  };
  return { root, bin, destination, log, env };
}

function run(f, extra = {}) {
  return spawnSync('/bin/bash', [script], { env: { ...f.env, ...extra }, encoding: 'utf8' });
}

function commands(f) {
  return fs.existsSync(f.log) ? fs.readFileSync(f.log, 'utf8') : '';
}

try {
  {
    const f = fixture();
    const result = run(f);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(commands(f), /git clone --branch main --single-branch .*\/source/);
    assert.match(commands(f), /npm ci\nnpm start/);
    assert.match(result.stdout, /Source destination:/);
  }
  {
    const f = fixture();
    const result = spawnSync('/bin/bash', [], {
      env: f.env,
      input: fs.readFileSync(script),
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(commands(f), /git clone/);
    assert.match(commands(f), /npm ci\nnpm start/);
  }
  {
    const f = fixture({ node: 17 });
    const result = run(f);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /Install Node\.js 18\+/);
    assert.doesNotMatch(commands(f), /npm ci|git clone/);
  }
  {
    const f = fixture({ node: false });
    const result = run(f);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stdout, /Node\.js was not found/);
  }
  {
    const f = fixture({ git: false, curl: true });
    const result = run(f);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(commands(f), /curl -fL https:\/\/github\.com\/.*main\.tar\.gz/);
    assert.match(commands(f), /tar -xzf/);
  }
  {
    const f = fixture();
    fs.mkdirSync(f.destination);
    fs.writeFileSync(path.join(f.destination, 'mine'), 'keep');
    const result = run(f);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /not a Git checkout/);
    assert.strictEqual(fs.readFileSync(path.join(f.destination, 'mine'), 'utf8'), 'keep');
  }
  {
    const f = fixture({ env: { FAKE_DIRTY: '1' } });
    fs.mkdirSync(path.join(f.destination, '.git'), { recursive: true });
    const result = run(f);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /local changes/);
    assert.doesNotMatch(commands(f), /fetch|merge|npm ci/);
  }
  {
    const f = fixture();
    fs.mkdirSync(path.join(f.destination, '.git'), { recursive: true });
    const result = run(f);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(commands(f), /git -C .* fetch origin main/);
    assert.match(commands(f), /git -C .* merge --ff-only origin\/main/);
  }
  {
    const f = fixture({ node: false, brew: true });
    const result = run(f, { OPEN_CLOWK_TTY_PATH: path.join(f.root, 'missing-tty') });
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /No system packages were changed/);
    assert.doesNotMatch(commands(f), /brew install/);
  }
  {
    const f = fixture({ node: false, brew: true });
    const tty = path.join(f.root, 'tty');
    fs.writeFileSync(tty, 'n\n');
    const result = run(f, { OPEN_CLOWK_TTY_PATH: tty, OPEN_CLOWK_TESTING: '1', OPEN_CLOWK_TEST_CONFIRM: 'n' });
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /declined/);
    assert.doesNotMatch(commands(f), /brew install/);
  }
  {
    const f = fixture({ node: false, brew: true });
    const tty = path.join(f.root, 'tty');
    fs.writeFileSync(tty, 'y\n');
    const after = path.join(f.root, 'node-after-brew');
    executable(after, 'case "${1:-}" in -p) echo 22;; --version) echo v22.0.0;; esac');
    const result = run(f, { OPEN_CLOWK_TTY_PATH: tty, OPEN_CLOWK_TESTING: '1', OPEN_CLOWK_TEST_CONFIRM: 'y', FAKE_NODE_AFTER_BREW: after });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(commands(f), /brew install node/);
  }
  {
    const f = fixture({ env: { FAKE_NPM_CI_EXIT: '7' } });
    const result = run(f);
    assert.notStrictEqual(result.status, 0);
    assert.doesNotMatch(commands(f), /npm start/);
  }
  {
    const f = fixture({ env: { FAKE_NPM_START_EXIT: '9' } });
    const result = run(f);
    assert.strictEqual(result.status, 9);
    assert.match(commands(f), /npm ci\nnpm start/);
  }
  {
    const f = fixture({ env: { FAKE_UNAME: 'Linux', XDG_SESSION_TYPE: 'wayland' } });
    const result = run(f);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /Wayland is unsupported/);
  }
} finally {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
}

console.log('install-script: deterministic source-install scenarios passed');
