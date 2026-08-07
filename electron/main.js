/**
 * OPEN CLOWK — desktop mascot.
 *
 * Sits quietly while you work. It counts only your REAL activity — system-wide
 * keyboard/mouse input, whatever app you're in (Claude Code, VS Code, a
 * terminal, a browser, all of it). After `activeMinutes` of accumulated
 * activity without a proper break, the robot appears and opens every clock
 * on your screen. Walk away for `idleResetMinutes` and the counter forgives
 * you all by itself.
 */

'use strict';

const { app, BrowserWindow, ipcMain, screen, powerMonitor } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createTracker } = require('./activity');

const DEFAULTS = {
  activeMinutes: 90, // accumulated activity before the robot intervenes
  idleResetMinutes: 5, // walk away this long and the counter self-resets
  snoozeMinutes: 10,
  sceneSeconds: 30, // overlay auto-dismisses after this long if ignored
  launchAtLogin: false,
};

const TICK_SECONDS = 15;

function loadConfig() {
  const candidates = [
    path.join(os.homedir(), '.open-clowk', 'config.json'),
    path.join(__dirname, '..', 'clowk.config.json'),
  ];
  for (const file of candidates) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      // back-compat: old configs used intervalMinutes
      if (raw.intervalMinutes && !raw.activeMinutes) raw.activeMinutes = raw.intervalMinutes;
      return { ...DEFAULTS, ...raw, configFile: file };
    } catch (e) {
      // try next
    }
  }
  return { ...DEFAULTS, configFile: null };
}

const config = loadConfig();
const demoMode = process.argv.includes('--demo');

const tracker = createTracker({
  targetSeconds: config.activeMinutes * 60,
  idleResetSeconds: config.idleResetMinutes * 60,
  tickSeconds: TICK_SECONDS,
});

let overlayWindow = null;
let lastLoggedMinutes = -1;

function minutesActive() {
  return Math.floor(tracker.activeSeconds / 60);
}

function onTick() {
  const idle = powerMonitor.getSystemIdleTime();
  const event = tracker.tick(idle);

  if (event === 'fire') {
    console.log(`[open-clowk] ${config.activeMinutes} minutes of real activity. Dispatching the robot.`);
    showOverlay();
    return;
  }
  if (event === 'reset') {
    console.log('[open-clowk] real break detected. Counter forgiven. Respect.');
    lastLoggedMinutes = -1;
    return;
  }
  // gentle heartbeat every 15 minutes of accumulated activity
  const m = minutesActive();
  if (event === 'active' && m > 0 && m % 15 === 0 && m !== lastLoggedMinutes) {
    lastLoggedMinutes = m;
    console.log(`[open-clowk] ${m}/${config.activeMinutes} active minutes. Tic tac.`);
  }
}

function showOverlay() {
  if (overlayWindow) return;
  tracker.pause();

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
    query: { interval: String(config.activeMinutes) },
  });

  // If the human ignores the robot entirely, stand down and forgive.
  const autoDismiss = setTimeout(() => dismissOverlay('ignored'), config.sceneSeconds * 1000);
  overlayWindow.on('closed', () => {
    clearTimeout(autoDismiss);
    overlayWindow = null;
  });
}

function dismissOverlay(reason) {
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
  }
  tracker.resume();

  if (reason === 'break') {
    tracker.activeSeconds = 0;
    console.log('[open-clowk] break acknowledged. Clocks will regenerate. Respect.');
  } else if (reason === 'snooze') {
    tracker.activeSeconds = Math.max(0, (config.activeMinutes - config.snoozeMinutes) * 60);
    console.log(`[open-clowk] snoozed. ~${config.snoozeMinutes} active minute(s) until the robot returns.`);
  } else {
    tracker.activeSeconds = 0;
    console.log('[open-clowk] ignored. Bold. Counter reset anyway.');
  }
  lastLoggedMinutes = -1;
}

ipcMain.on('clowk-dismiss', (_event, reason) => dismissOverlay(reason));

app.whenReady().then(() => {
  console.log('[open-clowk] the anti-wellness wellness mascot is watching (your idle time, nothing else).');
  if (config.configFile) console.log(`[open-clowk] config: ${config.configFile}`);
  console.log(
    `[open-clowk] robot after ${config.activeMinutes} active minutes; ` +
      `${config.idleResetMinutes} idle minutes = a real break.`
  );

  if (!demoMode && process.platform !== 'linux') {
    // Most reliable once the app is packaged; in dev, keep `npm start` running.
    app.setLoginItemSettings({ openAtLogin: !!config.launchAtLogin });
  }

  if (demoMode) {
    console.log('[open-clowk] --demo: skipping the wait. Enjoy the show.');
    showOverlay();
  } else {
    setInterval(onTick, TICK_SECONDS * 1000);
  }
});

app.on('window-all-closed', () => {
  // Keep the daemon alive; the whole point is to come back.
  if (demoMode) app.quit();
});
