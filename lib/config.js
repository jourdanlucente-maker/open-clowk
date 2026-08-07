'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PRESETS = Object.freeze({
  claude: ['claude'],
  codex: ['codex'],
  kimi: ['kimi', 'kimi-cli'],
  terminal: [
    'Terminal',
    'iTerm2',
    'iTerm',
    'Warp',
    'WezTerm',
    'alacritty',
    'kitty',
    'gnome-terminal-server',
    'gnome-terminal-',
    'gnome-terminal',
    'konsole',
    'WindowsTerminal',
    'wt',
  ],
});

function stateDirectory({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (env.OPEN_CLOWK_STATE_DIR) return path.resolve(env.OPEN_CLOWK_STATE_DIR);
  if (platform === 'win32') {
    return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'open-clowk');
  }
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'open-clowk');
  return path.join(env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'open-clowk');
}

function configPath(options = {}) {
  return path.join(options.stateDir || stateDirectory(options), 'config.json');
}

function runtimePath(options = {}) {
  return path.join(options.stateDir || stateDirectory(options), 'runtime.json');
}

function lockPath(options = {}) {
  return path.join(options.stateDir || stateDirectory(options), 'monitor.lock');
}

function normalizeProcessName(value) {
  const base = path.basename(String(value).trim().replaceAll('\\', '/'));
  return base.replace(/\.exe$/i, '').toLocaleLowerCase('en-US');
}

function expandWatchedProcesses(values) {
  const requested = Array.isArray(values) ? values : String(values || '').split(',');
  const expanded = [];
  for (const raw of requested) {
    const value = String(raw).trim();
    if (!value) continue;
    const preset = PRESETS[value.toLocaleLowerCase('en-US')];
    expanded.push(...(preset || [value]));
  }
  const seen = new Set();
  return expanded.filter((value) => {
    const normalized = normalizeProcessName(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function wholeMinutes(value, label, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${label} must be a whole number from 1 to ${maximum} minutes.`);
  }
  return parsed;
}

function createConfig({ thresholdMinutes, snoozeMinutes = 5, watchedProcesses }) {
  const watched = expandWatchedProcesses(watchedProcesses);
  if (watched.length === 0 || watched.length > 64) {
    throw new Error('Choose between 1 and 64 process names or presets to watch.');
  }
  return {
    version: 1,
    thresholdMinutes: wholeMinutes(thresholdMinutes, 'Threshold', 10080),
    snoozeMinutes: wholeMinutes(snoozeMinutes, 'Snooze', 1440),
    watchedProcesses: watched,
  };
}

function validateConfig(value) {
  if (!value || value.version !== 1) throw new Error('Unsupported or missing Open Clowk configuration.');
  return createConfig(value);
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot read ${file}: ${error.message}`);
  }
}

function readJson(file) {
  const raw = readText(file);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Cannot read ${file}: ${error.message}`);
  }
}

function writeFileAtomic(file, contents) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary, contents, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {}
    throw error;
  }
}

function writeJson(file, value) {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readConfig(options = {}) {
  const value = readJson(configPath(options));
  return value ? validateConfig(value) : null;
}

function writeConfig(config, options = {}) {
  const validated = validateConfig(config);
  writeJson(configPath(options), validated);
  return validated;
}

function readRuntime(options = {}) {
  const raw = readText(runtimePath(options));
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeRuntime(runtime, options = {}) {
  writeJson(runtimePath(options), runtime);
}

function removeRuntime(expectedToken, options = {}) {
  const file = runtimePath(options);
  const current = readRuntime(options);
  if (current && expectedToken && current.token !== expectedToken) return false;
  try {
    fs.unlinkSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  return true;
}

function lockRecord(token, pid) {
  return `${JSON.stringify({ version: 1, token, pid })}\n`;
}

function acquireMonitorLock(token, options = {}) {
  const file = lockPath(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let descriptor;
  try {
    descriptor = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(descriptor, lockRecord(token, options.pid || process.pid));
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function claimMonitorLock(token, options = {}) {
  const current = readMonitorLockRecord(options);
  if (!current || current.token !== token) return false;
  writeFileAtomic(lockPath(options), lockRecord(token, options.pid || process.pid));
  return true;
}

function readMonitorLockRecord(options = {}) {
  let raw;
  try {
    raw = fs.readFileSync(lockPath(options), 'utf8').trim();
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === 'string' && parsed.token) {
      return { token: parsed.token, pid: Number.isInteger(parsed.pid) ? parsed.pid : null };
    }
  } catch {}
  return { token: raw, pid: null };
}

function readMonitorLock(options = {}) {
  return readMonitorLockRecord(options)?.token || null;
}

function processAlive(pid, { killFn = process.kill } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    killFn(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function reclaimAbandonedState(options = {}) {
  let reclaimed = false;
  const lock = readMonitorLockRecord(options);
  if (lock && !processAlive(lock.pid, options)) {
    reclaimed = removeMonitorLock(lock.token, options) || reclaimed;
  }
  const runtime = readRuntime(options);
  if (runtime && !processAlive(runtime.pid, options)) {
    reclaimed = removeRuntime(runtime.token, options) || reclaimed;
  }
  return reclaimed;
}

function removeMonitorLock(expectedToken, options = {}) {
  const file = lockPath(options);
  const current = readMonitorLock(options);
  if (!current) return false;
  if (expectedToken && current !== expectedToken) return false;
  fs.unlinkSync(file);
  return true;
}

module.exports = {
  PRESETS,
  acquireMonitorLock,
  claimMonitorLock,
  configPath,
  createConfig,
  expandWatchedProcesses,
  lockPath,
  normalizeProcessName,
  processAlive,
  readConfig,
  readMonitorLock,
  readMonitorLockRecord,
  readRuntime,
  reclaimAbandonedState,
  removeRuntime,
  removeMonitorLock,
  runtimePath,
  stateDirectory,
  validateConfig,
  writeConfig,
  writeRuntime,
};
