#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const EXPECTED = [
  'package/ASSET-PROVENANCE.md', 'package/CHANGELOG.md', 'package/LICENSE', 'package/MIGRATION.md', 'package/README.md',
  'package/assets/robot-crowbar.webp', 'package/assets/watch-open.webp', 'package/bin/open-clowk.js',
  'package/lib/config.js', 'package/lib/control.js', 'package/lib/daemon-entry.js', 'package/lib/monitor.js',
  'package/lib/platform.js', 'package/lib/service.js', 'package/lib/tracker.js', 'package/package.json', 'package/ui/break.html',
];

function run(command, args, { cwd = ROOT, env = process.env, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 120000, shell: false });
  if (!allowFailure) assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}

function parseOctal(buffer, start, length) {
  return Number.parseInt(buffer.toString('utf8', start, start + length).replace(/\0.*$/, '').trim() || '0', 8);
}

function entries(tarball) {
  const archive = zlib.gunzipSync(fs.readFileSync(tarball));
  const found = [];
  for (let offset = 0; offset + 512 <= archive.length;) {
    if (archive.subarray(offset, offset + 512).every((byte) => byte === 0)) break;
    const name = archive.toString('utf8', offset, offset + 100).replace(/\0.*$/, '');
    const mode = parseOctal(archive, offset + 100, 8);
    const size = parseOctal(archive, offset + 124, 12);
    const type = archive.toString('utf8', offset + 156, offset + 157);
    const body = offset + 512;
    if (type === '0' || type === '\0' || type === '') found.push({ name, mode, content: archive.subarray(body, body + size) });
    offset = body + Math.ceil(size / 512) * 512;
  }
  return found;
}

function envFor(root) {
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(root, 'appdata'),
    LOCALAPPDATA: path.join(root, 'localappdata'),
    XDG_STATE_HOME: path.join(root, 'xdg-state'),
    OPEN_CLOWK_STATE_DIR: path.join(root, 'state'),
    OPEN_CLOWK_TEST_MODE: '1',
    OPEN_CLOWK_TEST_PROCESSES: 'codex',
    OPEN_CLOWK_TEST_THRESHOLD_MS: '250',
    OPEN_CLOWK_TEST_SAMPLE_MS: '25',
    OPEN_CLOWK_TEST_BROWSER_LOG: path.join(root, 'browser.log'),
    npm_config_cache: path.join(root, 'npm-cache'),
    npm_config_update_notifier: 'false',
  };
}

function binary(prefix) {
  return process.platform === 'win32' ? path.join(prefix, 'open-clowk.cmd') : path.join(prefix, 'bin', 'open-clowk');
}

function cli(executable, args, env, allowFailure = false) {
  if (process.platform === 'win32') {
    return run('cmd.exe', ['/d', '/s', '/c', executable, ...args], { env, allowFailure });
  }
  return run(executable, args, { env, allowFailure });
}

async function waitFor(predicate, message, timeout = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

function action(runtime, name) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1', port: runtime.port, path: `/action/${name}`, method: 'POST',
      headers: { 'X-Open-Clowk-Token': runtime.token }, timeout: 1500,
    }, (response) => {
      response.resume();
      response.on('end', () => response.statusCode === 200 ? resolve() : reject(new Error(`HTTP ${response.statusCode}`)));
    });
    request.on('error', reject);
    request.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 1500 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', reject);
  });
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-clowk-package-'));
  const env = envFor(root);
  const prefix = path.join(root, 'prefix');
  let executable;
  try {
    const packDir = path.join(root, 'pack');
    fs.mkdirSync(packDir);
    const metadata = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', packDir], { env }).stdout)[0];
    const tarball = path.join(packDir, metadata.filename);
    assert.equal(metadata.name, 'open-clowk');
    assert.equal(metadata.version, '0.1.0');
    const packed = entries(tarball);
    assert.deepEqual(packed.map((entry) => entry.name).sort(), EXPECTED);
    const entrypoint = packed.find((entry) => entry.name === 'package/bin/open-clowk.js');
    assert.equal(entrypoint.mode & 0o111, 0o111);
    assert.ok(entrypoint.content.toString().startsWith('#!/usr/bin/env node\n'));
    assert.ok(packed.every((entry) => !entry.content.toString().includes('https://d8j0ntlcm91z4.cloudfront.net')));

    run('npm', ['publish', '--dry-run', '--json', '--ignore-scripts'], { env });
    run('npm', ['install', '--global', '--prefix', prefix, tarball, '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], { env });
    executable = binary(prefix);
    assert.match(cli(executable, ['--help'], env).stdout, /setup.*detect.*start.*stop.*status/s);
    assert.match(cli(executable, ['detect'], env).stdout, /codex/);
    cli(executable, ['setup', '--minutes', '5', '--watch', 'codex', '--snooze', '5'], env);
    assert.match(cli(executable, ['status'], env).stdout, /Monitor: stopped/);
    assert.match(cli(executable, ['start'], env).stdout, /Monitor started/);
    assert.match(cli(executable, ['start'], env).stdout, /already running/);
    const reconfigure = cli(executable, ['setup', '--minutes', '6', '--watch', 'codex'], env, true);
    assert.equal(reconfigure.status, 1);
    assert.match(reconfigure.stderr, /Stop the running monitor/);
    await waitFor(() => fs.existsSync(env.OPEN_CLOWK_TEST_BROWSER_LOG), 'break page did not open');
    const url = fs.readFileSync(env.OPEN_CLOWK_TEST_BROWSER_LOG, 'utf8').trim();
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=[a-f0-9]+$/);
    const page = await get(url);
    assert.equal(page.status, 200);
    assert.match(page.body, /Take a break/);
    const unauthenticated = await get(url.replace(/\?token=.*/, ''));
    assert.equal(unauthenticated.status, 403);
    const runtime = JSON.parse(fs.readFileSync(path.join(env.OPEN_CLOWK_STATE_DIR, 'runtime.json'), 'utf8'));
    await action(runtime, 'keep-going');
    assert.match(cli(executable, ['status'], env).stdout, /State: tracking/);
    assert.match(cli(executable, ['stop'], env).stdout, /Monitor stopped/);
    assert.match(cli(executable, ['stop'], env).stdout, /already stopped/);

    run('npm', ['uninstall', '--global', '--prefix', prefix, 'open-clowk', '--offline', '--no-audit', '--no-fund'], { env });
    assert.equal(fs.existsSync(executable), false);
    run('npm', ['install', '--global', '--prefix', prefix, tarball, '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], { env });
    assert.match(cli(binary(prefix), ['--version'], env).stdout, /0\.1\.0/);
    console.log(`package canary: PASS ${metadata.filename} (${packed.length} allowlisted files)`);
    console.log('package canary: PASS setup, detect, start x2, automatic break page, action, status, stop x2, uninstall, reinstall');
  } finally {
    if (executable && fs.existsSync(executable)) cli(executable, ['stop'], env, true);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
