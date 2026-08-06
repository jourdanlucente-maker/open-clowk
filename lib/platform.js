'use strict';

const fs = require('node:fs');
const { execFileSync, spawn } = require('node:child_process');

function parseWindowsTasklist(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.match(/^"((?:[^"]|"")*)"/)?.[1]?.replaceAll('""', '"'))
    .filter(Boolean);
}

function processCommand(platform) {
  if (platform === 'darwin') return { command: 'ps', args: ['-axo', 'comm='] };
  if (platform === 'linux') return { command: 'ps', args: ['-eo', 'comm='] };
  if (platform === 'win32') return { command: 'tasklist.exe', args: ['/fo', 'csv', '/nh'] };
  throw new Error(`Process detection is not supported on ${platform}.`);
}

function listProcesses({
  platform = process.platform,
  env = process.env,
  execFileSyncFn = execFileSync,
} = {}) {
  if (env.OPEN_CLOWK_TEST_MODE === '1' && env.OPEN_CLOWK_TEST_PROCESSES !== undefined) {
    return env.OPEN_CLOWK_TEST_PROCESSES.split(',').map((value) => value.trim()).filter(Boolean);
  }
  const { command, args } = processCommand(platform);
  const output = execFileSyncFn(command, args, { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  if (platform === 'win32') return parseWindowsTasklist(output);
  return output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

function browserCommand(platform, url) {
  if (!url.startsWith('http://127.0.0.1:')) throw new Error('Open Clowk only opens its loopback break page.');
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'linux') return { command: 'xdg-open', args: [url] };
  if (platform === 'win32') {
    return { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] };
  }
  throw new Error(`Default-browser opening is not supported on ${platform}.`);
}

function openBrowser(url, {
  platform = process.platform,
  env = process.env,
  spawnFn = spawn,
} = {}) {
  if (env.OPEN_CLOWK_TEST_MODE === '1' && env.OPEN_CLOWK_TEST_BROWSER_LOG) {
    fs.writeFileSync(env.OPEN_CLOWK_TEST_BROWSER_LOG, `${url}\n`);
    return;
  }
  const { command, args } = browserCommand(platform, url);
  const child = spawnFn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {});
  child.unref();
}

module.exports = {
  browserCommand,
  listProcesses,
  openBrowser,
  parseWindowsTasklist,
  processCommand,
};
