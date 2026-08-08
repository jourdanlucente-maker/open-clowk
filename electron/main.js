/**
 * OPEN CLOWK — timed terminal mascot.
 *
 * A native setup window lets you pick a reminder interval and one or more
 * supported terminal/IDE/agent targets. Launch arms a local timer: at each
 * interval the transparent always-on-top robot appears — but only while a
 * selected target is frontmost (Codex/Claude additionally require their
 * executable to be running). Every intervention offers exactly three
 * actions: Take a break (5-minute countdown, then the interval restarts),
 * Ignore (dismiss, interval restarts), Shut down (quits Open Clowk only).
 *
 * Privacy boundary: the app reads the frontmost application's NAME and, for
 * Codex/Claude, executable NAMES. Nothing else. No arguments, no command
 * lines, no prompts, no terminal contents, no window titles, no keystrokes,
 * no files, no screen pixels, no audio, no network contents. No telemetry.
 */

'use strict';

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const adapters = require('./adapters');
const { createReminder } = require('./reminder');
const { validatePrefs, detectTargets, matchFrontmost } = require('./targets');

const DEFAULT_MINUTES = 30;
const PREFS_DIR = path.join(os.homedir(), '.open-clowk');
const PREFS_FILE = path.join(PREFS_DIR, 'prefs.json');

let adapter = null; // created lazily so tests can inject fixtures
let reminder = null;
let setupWindow = null;
let overlayWindow = null;
let launched = false;
let prefs = { minutes: DEFAULT_MINUTES, targets: [] };

function getAdapter() {
  if (!adapter) adapter = adapters.createAdapter();
  return adapter;
}

function loadPrefs() {
  try {
    const raw = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    const result = validatePrefs(raw);
    if (result.ok) return result.prefs;
  } catch (e) {
    // no saved prefs yet — defaults apply
  }
  return { minutes: DEFAULT_MINUTES, targets: [] };
}

function savePrefs(p) {
  try {
    fs.mkdirSync(PREFS_DIR, { recursive: true });
    fs.writeFileSync(PREFS_FILE, JSON.stringify(p, null, 2));
  } catch (e) {
    // prefs are a convenience; the reminder still runs
  }
}

async function detect() {
  const a = getAdapter();
  if (!a.supported) return { supported: false, message: a.message };
  const running = {};
  for (const name of ['codex', 'claude']) {
    running[name] = await a.execRunning(name);
  }
  const targets = detectTargets({
    platform: a.platform,
    probes: {
      appInstalled: (bundle) => a.appInstalled(bundle),
      exeRunning: (name) => !!running[name],
    },
  });
  return { supported: true, targets };
}

/* ---------- windows ---------- */

function showSetup() {
  setupWindow = new BrowserWindow({
    width: 520,
    height: 660,
    resizable: false,
    autoHideMenuBar: true,
    title: 'Open Clowk',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  setupWindow.loadFile(path.join(__dirname, 'setup.html'));
  setupWindow.on('closed', () => {
    setupWindow = null;
  });
}

function showOverlay() {
  if (overlayWindow) return;

  const { width, height } = screen.getPrimaryDisplay().bounds;
  overlayWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.loadFile(path.join(__dirname, '..', 'overlay', 'overlay.html'), {
    query: { interval: String(prefs.minutes) },
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    // External close (Cmd+W / Alt+F4): never leave tracking paused —
    // the interval re-arms exactly like a dismissal.
    if (reminder) reminder.resolve('closed');
  });
}

function handleOverlayAction(reason) {
  if (!reminder) return;
  if (reason === 'shutdown') {
    // Quit Open Clowk only. Never touch the selected terminal/IDE/agent.
    reminder.resolve('shutdown');
    if (overlayWindow) overlayWindow.close();
    app.quit();
    return;
  }
  // 'break' (countdown finished) and 'ignore' both dismiss + re-arm.
  reminder.resolve(reason === 'break' ? 'break' : 'ignore');
  if (overlayWindow) overlayWindow.close();
}

/* ---------- launch ---------- */

async function launch(input) {
  const a = getAdapter();
  if (!a.supported) return { ok: false, errors: [a.message] };

  const result = validatePrefs(input);
  if (!result.ok) return { ok: false, errors: result.errors };

  const supportedIds = new Set(
    detectTargets({
      platform: a.platform,
      probes: { appInstalled: () => true, exeRunning: () => true },
    })
      .filter((t) => t.status !== 'unsupported-platform')
      .map((t) => t.id)
  );
  const unsupported = result.prefs.targets.filter((id) => !supportedIds.has(id));
  if (unsupported.length) {
    return { ok: false, errors: [`target(s) not supported on ${a.platform}: ${unsupported.join(', ')}`] };
  }

  prefs = result.prefs;
  savePrefs(prefs);
  launched = true;

  reminder = createReminder({
    checkFrontmost: () => pendingFrontmostMatch,
    onIntervene: showOverlay,
  });

  if (setupWindow) setupWindow.close();
  reminder.arm(prefs.minutes);
  console.log(
    `[open-clowk] launched: every ${prefs.minutes} minute(s), watching for ` +
      prefs.targets.join(', ') + '. Tic tac.'
  );
  return { ok: true };
}

// Set synchronously by the frontmost poller; the reminder reads it when an
// interval elapses and while an intervention is pending.
let pendingFrontmostMatch = false;

async function pollFrontmost() {
  if (!launched || !reminder) return;
  try {
    const front = await getAdapter().frontmost();
    pendingFrontmostMatch = matchFrontmost({
      frontmost: front,
      selected: prefs.targets,
      platform: getAdapter().platform,
      execRunning: (name) => cachedExecRunning[name] === true,
    });
  } catch (e) {
    pendingFrontmostMatch = false;
  }
}

const cachedExecRunning = {};
async function refreshExecRunning() {
  for (const name of ['codex', 'claude']) {
    cachedExecRunning[name] = await getAdapter().execRunning(name);
  }
}

/* ---------- wiring ---------- */

ipcMain.handle('setup:state', async () => {
  const d = await detect();
  return { ...d, defaults: { minutes: DEFAULT_MINUTES }, saved: loadPrefs() };
});

ipcMain.handle('setup:launch', (_event, input) => launch(input));

ipcMain.on('clowk-action', (_event, reason) => handleOverlayAction(reason));

app.whenReady().then(async () => {
  console.log('[open-clowk] timed terminal mascot. It reads app names, nothing else.');
  const a = getAdapter();
  if (!a.supported) console.log(`[open-clowk] ${a.message}`);
  prefs = loadPrefs();
  showSetup();
  await refreshExecRunning();
  setInterval(pollFrontmost, 2000);
  setInterval(refreshExecRunning, 5000);
});

app.on('window-all-closed', () => {
  // Before Launch, closing setup ends the app. After Launch the reminder runs
  // windowless until an intervention or Shut down.
  if (!launched) app.quit();
});

// Acceptance-test hook: lets the suite drive setup/launch/intervention with an
// injected (fake) Electron and adapter fixtures. No effect under the real app.
module.exports = {
  showSetup,
  showOverlay,
  launch,
  handleOverlayAction,
  loadPrefs,
  DEFAULT_MINUTES,
  _test: {
    setFrontmostMatch: (v) => {
      pendingFrontmostMatch = v;
    },
    getReminder: () => reminder,
  },
};
