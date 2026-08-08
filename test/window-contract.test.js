/* Acceptance: setup -> Launch -> timed intervention -> overlay contract ->
 * the three exact actions, driven through a faithful injected Electron and
 * adapter fixtures. No real window, no sockets, no browser, no permissions.
 *
 * Covers: overlay window contract (transparent/frameless/always-on-top/
 * screen-saver, loadFile only), preference validation through the real IPC
 * handlers, unsupported-target rejection, ignore/break re-arm, external-close
 * recovery, Open-Clowk-only shutdown, no login persistence, no forbidden
 * module loads.
 *
 * Run: node test/window-contract.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const fakeHome = fs.mkdtempSync(path.join(__dirname, '.tmp-home-'));
process.env.HOME = fakeHome;

const { installFakeElectron } = require('./helpers/fake-electron');
const electronState = installFakeElectron();

// Adapter fixtures: macOS with Terminal frontmost; no agent running by default.
const front = { current: 'Terminal' };
const execs = { codex: false, claude: false };
const adapters = require('../electron/adapters');
adapters.createAdapter = () => ({
  platform: 'darwin',
  supported: true,
  frontmost: async () => front.current,
  execRunning: async (name) => execs[name] === true,
  appInstalled: (bundle) => bundle.includes('Terminal.app'),
});

const main = require('../electron/main.js');

async function flush() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

function cleanup() {
  fs.rmSync(fakeHome, { recursive: true, force: true });
}

(async () => {
  await flush();

  // --- setup window is the first surface, and it is native --------------------
  assert.strictEqual(electronState.windows.length, 1, 'the setup window opens first');
  const setup = electronState.windows[0];
  assert.ok(
    setup.calls.loadFile[0][0].endsWith(path.join('electron', 'setup.html')),
    'setup content comes from a local file, never a URL'
  );
  assert.ok(!setup.opts.transparent, 'setup is a normal settings window (the mascot is the overlay)');
  assert.strictEqual(electronState.loginItemCalls.length, 0, 'no login persistence is ever requested');

  // --- setup:state IPC reports detected targets honestly ----------------------
  const state = await electronState.ipcInvokeHandlers['setup:state'](null);
  assert.strictEqual(state.supported, true);
  assert.strictEqual(state.defaults.minutes, 30, 'default interval is 30 minutes');
  const byId = Object.fromEntries(state.targets.map((t) => [t.id, t.status]));
  assert.strictEqual(byId['terminal'], 'available');
  assert.strictEqual(byId['gnome-terminal'], 'unsupported-platform');

  // --- preference validation through the real launch IPC ----------------------
  const launchIpc = electronState.ipcInvokeHandlers['setup:launch'];
  for (const [input, why] of [
    [{}, 'empty input'],
    [{ minutes: 0, targets: ['terminal'] }, 'non-positive interval'],
    [{ minutes: 30, targets: [] }, 'no targets'],
    [{ minutes: 30, targets: ['emacs'] }, 'unknown target'],
    [{ minutes: 30, targets: ['konsole'] }, 'unsupported-platform target'],
  ]) {
    const result = await launchIpc(null, input);
    assert.strictEqual(result.ok, false, `launch rejects ${why}`);
    assert.ok(result.errors.length > 0, `rejection for ${why} carries a reason`);
  }
  assert.strictEqual(electronState.windows.length, 1, 'rejected launches arm nothing');

  // --- Launch: setup closes, the timer arms, prefs persist locally ------------
  const launched = await launchIpc(null, { minutes: 30, targets: ['terminal'] });
  assert.strictEqual(launched.ok, true, 'valid launch accepted');
  assert.ok(setup.closed, 'setup window closes on Launch');
  const saved = JSON.parse(fs.readFileSync(path.join(fakeHome, '.open-clowk', 'prefs.json'), 'utf8'));
  assert.deepStrictEqual(saved, { minutes: 30, targets: ['terminal'] }, 'prefs persist locally only');

  const reminder = main._test.getReminder();
  assert.strictEqual(reminder.state, 'armed');
  assert.strictEqual(reminder.minutes, 30);

  // --- intervention: the mascot overlay keeps its exact window contract -------
  main._test.setFrontmostMatch(true);
  reminder.elapseNow();
  assert.strictEqual(electronState.windows.length, 2, 'one intervention shows one overlay');
  const win = electronState.windows[1];
  assert.strictEqual(win.opts.transparent, true, 'overlay is transparent');
  assert.strictEqual(win.opts.frame, false, 'overlay is frameless');
  assert.strictEqual(win.opts.alwaysOnTop, true, 'overlay is always-on-top');
  assert.deepStrictEqual(
    { width: win.opts.width, height: win.opts.height, x: win.opts.x, y: win.opts.y },
    { width: 1440, height: 900, x: 0, y: 0 },
    'overlay covers the primary display'
  );
  assert.deepStrictEqual(win.calls.setAlwaysOnTop, [[true, 'screen-saver']], 'screen-saver level');
  const [overlayFile, overlayOpts] = win.calls.loadFile[0];
  assert.ok(overlayFile.endsWith(path.join('overlay', 'overlay.html')), 'overlay is a local file');
  assert.strictEqual(overlayOpts.query.interval, '30', 'the scene carries the chosen interval');

  const action = (reason) => electronState.ipcHandlers['clowk-action'](null, reason);

  // --- Ignore: dismiss, interval restarts --------------------------------------
  action('ignore');
  assert.ok(win.closed, 'ignore closes the overlay');
  assert.strictEqual(reminder.state, 'armed', 'ignore restarts the interval');

  // --- external close (Cmd+W): tracking must recover ---------------------------
  reminder.elapseNow();
  const win2 = electronState.windows[2];
  win2.close(); // no action — the OS-level close path
  assert.strictEqual(reminder.state, 'armed', 'external close re-arms (inherited bug fixed)');

  // --- Take a break (countdown completed in the renderer): dismiss + re-arm ----
  reminder.elapseNow();
  const win3 = electronState.windows[3];
  action('break');
  assert.ok(win3.closed, 'break closes the overlay after the countdown');
  assert.strictEqual(reminder.state, 'armed', 'break restarts the original interval');

  // --- Shut down: quits Open Clowk only ----------------------------------------
  reminder.elapseNow();
  const win4 = electronState.windows[4];
  action('shutdown');
  assert.ok(win4.closed, 'shutdown closes the overlay');
  assert.strictEqual(reminder.state, 'stopped', 'shutdown stops the reminder');
  assert.strictEqual(electronState.quitCalls, 1, 'shutdown quits the app exactly once');
  // nothing else is touched: no exec/kill of any terminal, IDE, or agent —
  // the main process has no code path that does so (see no-browser-static).

  // --- no forbidden module loads through the whole cycle ------------------------
  assert.deepStrictEqual(
    electronState.forbiddenRequires,
    [],
    'no http/https/net/dgram/tls/shell module loads during setup + intervention'
  );

  cleanup();
  console.log('window contract: all tests passed');
  process.exit(0); // frontmost/exec pollers keep the loop alive by design
})().catch((err) => {
  cleanup();
  console.error(err);
  process.exit(1);
});
