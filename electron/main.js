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

// The control card sits in the primary display's bottom-right corner.
// The card's body clips at the window size, so these must cover the tallest
// state — break: title + message wrapped to two lines (a 4-digit interval
// wraps it) + countdown + Resume now — or the clipped control is the break's
// only way out. Pinned by test/window-contract.test.js.
const CARD_WIDTH = 460;
const CARD_HEIGHT = 280;
const CARD_MARGIN = 40;

let adapter = null; // created lazily so tests can inject fixtures
let reminder = null;
let setupWindow = null;
let overlayWindow = null;
let controlWindow = null;
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
  // An 'activate' or second-instance event can arrive before the app is ready,
  // and constructing a BrowserWindow then throws.
  if (typeof app.isReady === 'function' && !app.isReady()) return;
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

/* An intervention is two windows, and the split is the whole point.
 *
 * Layer 1 (mascot) is display-sized, so it may never take a click or a
 * keystroke: it is created non-focusable, shown inactive, and hit-testing is
 * turned off outright. No pointer forwarding is involved, so it behaves the
 * same on Linux, where `forward` is not supported.
 *
 * Layer 2 (control card) is small, opaque and hit-tested normally on every
 * platform. It carries the three actions from the first frame, so reaching
 * them never depends on the animation finishing, on forwarded mouse moves, or
 * on the intervention holding keyboard focus. */
function interventionWindowOptions(extra) {
  return Object.assign(
    {
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      fullscreenable: false,
      focusable: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
      },
    },
    extra
  );
}

function showOverlay() {
  if (overlayWindow || controlWindow) return;

  const { width, height } = screen.getPrimaryDisplay().bounds;
  const query = { interval: String(prefs.minutes) };

  overlayWindow = new BrowserWindow(interventionWindowOptions({ width, height, x: 0, y: 0 }));
  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.loadFile(path.join(__dirname, '..', 'overlay', 'overlay.html'), { query });
  overlayWindow.showInactive();
  overlayWindow.on('closed', () => {
    overlayWindow = null;
    // Both layers are non-focusable and skip the taskbar, so this is reached
    // through dismissIntervention or a window-manager kill — never leave
    // tracking paused: the interval re-arms exactly like a dismissal.
    dismissIntervention('closed');
  });

  controlWindow = new BrowserWindow(
    interventionWindowOptions({
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      x: Math.max(0, width - CARD_WIDTH - CARD_MARGIN),
      y: Math.max(0, height - CARD_HEIGHT - CARD_MARGIN),
    })
  );
  controlWindow.setAlwaysOnTop(true, 'screen-saver');
  controlWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  controlWindow.loadFile(path.join(__dirname, '..', 'overlay', 'control.html'), { query });
  controlWindow.showInactive();
  controlWindow.on('closed', () => {
    controlWindow = null;
    dismissIntervention('closed');
  });
}

let dismissing = false;

/* Both layers live and die together; whichever one goes first takes the other
 * with it, and the reminder is resolved exactly once per intervention. */
function dismissIntervention(outcome) {
  if (dismissing) return;
  dismissing = true;
  const open = [overlayWindow, controlWindow].filter(Boolean);
  overlayWindow = null;
  controlWindow = null;
  for (const w of open) w.close();
  dismissing = false;
  if (outcome && reminder) reminder.resolve(outcome);
}

function handleOverlayAction(reason) {
  if (!reminder) return;
  if (reason === 'shutdown') {
    // Quit Open Clowk only. Never touch the selected terminal/IDE/agent.
    reminder.resolve('shutdown');
    dismissIntervention(null);
    app.quit();
    return;
  }
  // 'break' (countdown finished or Resume now) and 'ignore' dismiss + re-arm.
  dismissIntervention(reason === 'break' ? 'break' : 'ignore');
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
  clearCompatMessage();

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
let compatDelivered = false;

function sendCompatToSetup(message) {
  const wc = setupWindow && setupWindow.webContents;
  if (wc && typeof wc.send === 'function') wc.send('setup:compat', message);
}

/* showSetup only focuses a window that is already open, and setup.js reads the
 * message once per load — so an already-open window has to be told directly,
 * or the message the user needs is the one window they are staring at. */
function surfaceCompatMessage() {
  if (compatDelivered) return;
  compatDelivered = true;
  console.log(`[open-clowk] ${runtimeCompatMessage}`);
  const alreadyOpen = setupWindow;
  showSetup();
  if (alreadyOpen && alreadyOpen === setupWindow) sendCompatToSetup(runtimeCompatMessage);
}

function clearCompatMessage() {
  if (!runtimeCompatMessage) return;
  runtimeCompatMessage = null;
  compatDelivered = false;
  sendCompatToSetup(null);
}

/* A null/throwing probe is a lost capability, not "your target is elsewhere".
 * Denied macOS Automation consent returns null forever, so collapsing both
 * cases to `false` would leave the app running windowless and mute. */
function noteFrontmostProbeFailure() {
  pendingFrontmostMatch = false;
  frontmostFailures += 1;
  if (frontmostFailures < FRONTMOST_FAILURES_BEFORE_COMPAT) return;
  if (!runtimeCompatMessage) {
    const a = getAdapter();
    runtimeCompatMessage =
      a.frontmostFailureMessage ||
      `Open Clowk cannot read the frontmost application on ${a.platform}. No intervention ` +
        'can appear until it succeeds; there is no browser or global fallback.';
  }
  surfaceCompatMessage();
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
    clearCompatMessage();
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
  dismissIntervention(null);
  app.quit();
  return { ok: true };
});

ipcMain.on('clowk-action', (_event, reason) => handleOverlayAction(reason));

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
    // Reopening from the dock/taskbar is the other way back to settings and
    // Quit. Registered here so it can never fire before the app is ready.
    app.on('activate', () => showSetup());
  });

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
  },
};
