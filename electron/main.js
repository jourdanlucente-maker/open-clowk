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
const {
  validatePrefs,
  detectTargets,
  matchFrontmost,
  getTarget,
  MIN_MINUTES,
  MAX_MINUTES,
} = require('./targets');

const DEFAULT_MINUTES = 30;
const PREFS_DIR = path.join(os.homedir(), '.open-clowk');
const PREFS_FILE = path.join(PREFS_DIR, 'prefs.json');

// Consecutive failed frontmost probes before the compatibility message is
// surfaced. At a 2s poll this is ~6s — long enough to ride out one slow probe,
// short enough that a denied permission never fails silently forever.
const FRONTMOST_FAILURES_BEFORE_COMPAT = 3;

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
  if (setupWindow) {
    if (setupWindow.isMinimized && setupWindow.isMinimized()) setupWindow.restore();
    if (setupWindow.show) setupWindow.show();
    if (setupWindow.focus) setupWindow.focus();
    return;
  }
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
  // The overlay is display-sized but mostly empty pixels. Stay click-through by
  // default (forwarding moves so the renderer can still track the pointer); the
  // renderer re-enables hit-testing only while the pointer is over the message
  // box. Without this the mascot swallows every click on the display, including
  // the ~12s walk-in and the whole five-minute break countdown.
  setOverlayInteractive(false);
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

function setOverlayInteractive(interactive) {
  if (!overlayWindow || !overlayWindow.setIgnoreMouseEvents) return;
  if (interactive) overlayWindow.setIgnoreMouseEvents(false);
  else overlayWindow.setIgnoreMouseEvents(true, { forward: true });
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
  frontmostFailures = 0;
  runtimeCompatMessage = null;

  // Prime the executable-name cache only when an agent target actually needs it.
  if (hasAgentTarget()) await refreshExecRunning();

  if (reminder) reminder.stop();
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
let frontmostPollInFlight = false;
let frontmostFailures = 0;
let runtimeCompatMessage = null;

/* A null/throwing probe is a lost capability, not "your target is elsewhere".
 * Denied macOS Automation consent returns null forever, so collapsing both
 * cases to `false` would leave the app running windowless and mute. */
function noteFrontmostProbeFailure() {
  pendingFrontmostMatch = false;
  frontmostFailures += 1;
  if (frontmostFailures < FRONTMOST_FAILURES_BEFORE_COMPAT || runtimeCompatMessage) return;
  const a = getAdapter();
  runtimeCompatMessage =
    a.frontmostFailureMessage ||
    `Open Clowk cannot read the frontmost application on ${a.platform}. No intervention ` +
      'can appear until it succeeds; there is no browser or global fallback.';
  console.log(`[open-clowk] ${runtimeCompatMessage}`);
  showSetup();
}

async function pollFrontmost() {
  if (!launched || !reminder || frontmostPollInFlight) return;
  // Probes are given up to 4s; without this guard a slow one lets polls pile up.
  frontmostPollInFlight = true;
  try {
    const a = getAdapter();
    const front = await a.frontmost();
    if (!front) {
      noteFrontmostProbeFailure();
      return;
    }
    frontmostFailures = 0;
    runtimeCompatMessage = null;
    pendingFrontmostMatch = matchFrontmost({
      frontmost: front,
      selected: prefs.targets,
      platform: a.platform,
      execRunning: (name) => cachedExecRunning[name] === true,
    });
  } catch (e) {
    noteFrontmostProbeFailure();
  } finally {
    frontmostPollInFlight = false;
  }
}

const cachedExecRunning = {};
let execPollInFlight = false;

function hasAgentTarget() {
  return prefs.targets.some((id) => {
    const t = getTarget(id);
    return !!t && t.kind === 'agent';
  });
}

async function refreshExecRunning() {
  if (execPollInFlight) return;
  execPollInFlight = true;
  try {
    const a = getAdapter();
    for (const name of ['codex', 'claude']) {
      cachedExecRunning[name] = await a.execRunning(name);
    }
  } catch (e) {
    // name-only probes are best effort; a failure just means "not running"
  } finally {
    execPollInFlight = false;
  }
}

/* Spawning pgrep/tasklist forever costs the user battery for nothing when no
 * agent target is selected — and before Launch there is nothing to watch. */
async function refreshExecRunningIfWatched() {
  if (!launched || !hasAgentTarget()) return;
  await refreshExecRunning();
}

/* ---------- wiring ---------- */

ipcMain.handle('setup:state', async () => {
  const d = await detect();
  return {
    ...d,
    defaults: { minutes: DEFAULT_MINUTES, minMinutes: MIN_MINUTES, maxMinutes: MAX_MINUTES },
    saved: loadPrefs(),
    running: launched,
    compatMessage: runtimeCompatMessage,
  };
});

ipcMain.handle('setup:launch', (_event, input) => launch(input));

// Quits Open Clowk only — the same boundary as the overlay's Shut down. It is
// the way out once the app is running windowless.
ipcMain.handle('setup:quit', () => {
  if (reminder) reminder.stop();
  if (overlayWindow) overlayWindow.close();
  app.quit();
  return { ok: true };
});

ipcMain.on('clowk-action', (_event, reason) => handleOverlayAction(reason));

ipcMain.on('clowk-interactive', (_event, interactive) => setOverlayInteractive(!!interactive));

// A second launch must not mean a second timer, a second pair of pollers, and a
// second display-sized overlay stacked on the first — it reopens this one's setup.
const gotSingleInstanceLock =
  typeof app.requestSingleInstanceLock === 'function' ? app.requestSingleInstanceLock() : true;

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => showSetup());

  app.whenReady().then(() => {
    console.log('[open-clowk] timed terminal mascot. It reads app names, nothing else.');
    const a = getAdapter();
    if (!a.supported) console.log(`[open-clowk] ${a.message}`);
    prefs = loadPrefs();
    showSetup();
    setInterval(pollFrontmost, 2000);
    setInterval(refreshExecRunningIfWatched, 5000);
  });

  // Reopening from the dock/taskbar is the other way back to settings and Quit.
  app.on('activate', () => showSetup());

  app.on('window-all-closed', () => {
    // Before Launch, closing setup ends the app. After Launch the reminder runs
    // windowless until an intervention, Shut down, or Quit from setup.
    if (!launched) app.quit();
  });
}

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
    pollFrontmost,
    refreshExecRunningIfWatched,
    getCompatMessage: () => runtimeCompatMessage,
    setOverlayInteractive,
  },
};
