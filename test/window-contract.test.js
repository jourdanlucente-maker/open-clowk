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
// `front.current = null` reproduces a denied/revoked macOS Automation consent:
// the probe answers nothing, forever, and never throws.
const front = { current: 'Terminal' };
// The processes really running, by their real NAME — so the fixture can honour
// the adapter's case contract instead of assuming the product asked correctly.
const runningProcesses = new Set();
const probeCalls = { frontmost: 0, execRunning: 0 };
const adapters = require('../electron/adapters');
adapters.createAdapter = () => ({
  platform: 'darwin',
  supported: true,
  frontmostFailureMessage: adapters.FRONTMOST_FAILED.darwin,
  canProbeInstall: true,
  frontmost: async () => {
    probeCalls.frontmost++;
    return front.current;
  },
  execRunning: async (name, { caseSensitive = true } = {}) => {
    probeCalls.execRunning++;
    return [...runningProcesses].some((proc) =>
      caseSensitive ? proc === name : proc.toLowerCase() === name.toLowerCase()
    );
  },
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
  assert.strictEqual(
    electronState.singleInstanceLockCalls,
    1,
    'the single-instance lock is taken, so a second launch cannot stack a second timer'
  );
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
    [{ minutes: 0.05, targets: ['terminal'] }, 'sub-minute interval (3s reminder loop)'],
    [{ minutes: 40000, targets: ['terminal'] }, 'interval that overflows setTimeout to 1ms'],
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

  // --- probing is due-driven, not a lifetime timer ----------------------------
  // Nothing may spawn a foreground probe while the interval is merely armed;
  // the reminder owns the schedule (test/reminder.test.js pins it), so arming
  // must leave the probe counters untouched.
  {
    const frontBefore = probeCalls.frontmost;
    const execBefore = probeCalls.execRunning;
    await flush();
    assert.strictEqual(probeCalls.frontmost, frontBefore, 'an armed interval spawns no frontmost probe');

    // ...and when a probe does run, no Codex/Claude target selected means no
    // executable-name lookup happens at all.
    assert.strictEqual(await main._test.checkFrontmostNow(), true, 'the due-time probe sees Terminal');
    assert.strictEqual(
      probeCalls.execRunning,
      execBefore,
      'no Codex/Claude target selected: nothing spawns pgrep'
    );
  }

  // --- intervention: two layers, each with its exact window contract ----------
  // The last two windows are always [mascot, control card] of the newest
  // intervention, so later cycles do not depend on a running index.
  const layers = () => electronState.windows.slice(-2);

  await reminder.elapseNow();
  assert.strictEqual(electronState.windows.length, 3, 'one intervention shows the mascot layer and the control card');
  const [mascot, card] = layers();

  for (const [win, what] of [[mascot, 'mascot layer'], [card, 'control card']]) {
    assert.strictEqual(win.opts.transparent, true, `${what} is transparent`);
    assert.strictEqual(win.opts.frame, false, `${what} is frameless`);
    assert.strictEqual(win.opts.alwaysOnTop, true, `${what} is always-on-top`);
    assert.deepStrictEqual(win.calls.setAlwaysOnTop, [[true, 'screen-saver']], `${what}: screen-saver level`);
    // Neither layer may activate: a keystroke aimed at the terminal must keep
    // landing in the terminal.
    assert.strictEqual(win.opts.focusable, false, `${what} is non-focusable`);
    assert.strictEqual(win.opts.show, false, `${what} does not auto-show (and therefore does not activate)`);
    assert.strictEqual(win.calls.showInactive, 1, `${what} is shown without taking focus`);
    assert.strictEqual(win.calls.focus, 0, `${what} never grabs focus`);
  }

  // --- authority lives on the card, never on the display-sized layer -----------
  // The mascot layer is decoration AND the one renderer that loads third-party
  // sprite images, so it gets no preload and therefore no `window.clowk`: it
  // cannot launch, quit, or send an action even if its content is compromised.
  assert.ok(
    !mascot.opts.webPreferences.preload,
    'the mascot layer is created with no preload — no IPC bridge at all'
  );
  assert.ok(
    card.opts.webPreferences.preload &&
      card.opts.webPreferences.preload.endsWith(path.join('electron', 'preload.js')),
    'the control card keeps the bridge, because it carries the three actions'
  );
  for (const [win, what] of [[mascot, 'mascot layer'], [card, 'control card']]) {
    assert.strictEqual(win.opts.webPreferences.contextIsolation, true, `${what} keeps context isolation`);
  }

  assert.deepStrictEqual(
    { width: mascot.opts.width, height: mascot.opts.height, x: mascot.opts.x, y: mascot.opts.y },
    { width: 1440, height: 900, x: 0, y: 0 },
    'the mascot layer covers the primary display'
  );
  const [overlayFile, overlayOpts] = mascot.calls.loadFile[0];
  assert.ok(overlayFile.endsWith(path.join('overlay', 'overlay.html')), 'the mascot layer is a local file');
  assert.strictEqual(overlayOpts.query.interval, '30', 'the scene carries the chosen interval');

  // The card is drawn on top of the mascot layer, so the layer has to know the
  // box it must keep its poses out of, rather than carrying its own copy.
  assert.deepStrictEqual(
    {
      width: overlayOpts.query.cardWidth,
      height: overlayOpts.query.cardHeight,
      margin: overlayOpts.query.cardMargin,
    },
    {
      width: String(card.opts.width),
      height: String(card.opts.height),
      margin: String(mascot.opts.width - card.opts.x - card.opts.width),
    },
    'the mascot layer is told the real card geometry'
  );

  // --- the display-sized layer never claims a click; the card always does ------
  assert.deepStrictEqual(
    mascot.calls.setIgnoreMouseEvents,
    [[true]],
    'the mascot layer is click-through outright — no forward-only trick, so Linux behaves like the rest'
  );
  assert.deepStrictEqual(
    card.calls.setIgnoreMouseEvents,
    [],
    'the control card keeps normal hit-testing: its buttons are reachable on every platform'
  );
  const [controlFile, controlOpts] = card.calls.loadFile[0];
  assert.ok(controlFile.endsWith(path.join('overlay', 'control.html')), 'the control card is a local file');
  assert.strictEqual(controlOpts.query.interval, '30', 'the card carries the chosen interval');
  assert.ok(card.opts.width < 1440 && card.opts.height < 900, 'the control card is compact, not display-sized');
  assert.ok(
    card.opts.x >= 0 && card.opts.y >= 0 && card.opts.x + card.opts.width <= 1440,
    'the control card sits inside the primary display'
  );

  // The card's body clips at the window size, so the window has to cover its
  // tallest state or the clipped control is the break's only way out.
  assert.ok(
    card.opts.height >= 260,
    'the card is tall enough for title + wrapped message + countdown + Resume now'
  );
  assert.ok(card.opts.width >= 440, 'the card is wide enough for the three action buttons');

  // The mascot bubble and the card own the same corner of the same display, and
  // the card is created second, so it draws on top of anything it overlaps.
  const overlayCss = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'overlay.css'), 'utf8');
  const bubbleBottom = Number((overlayCss.match(/#bubble\s*\{[^}]*bottom:\s*(\d+)px/) || [])[1]);
  assert.ok(Number.isInteger(bubbleBottom), 'the mascot bubble has a pinned bottom offset');
  assert.ok(
    bubbleBottom >= mascot.opts.height - card.opts.y,
    'the mascot bubble clears the control card instead of being covered by it'
  );

  const action = (reason) => electronState.ipcHandlers['clowk-action'](null, reason);

  // --- Ignore: dismiss, interval restarts --------------------------------------
  action('ignore');
  assert.ok(mascot.closed && card.closed, 'ignore closes both layers together');
  assert.strictEqual(reminder.state, 'armed', 'ignore restarts the interval');

  // --- either layer closed from outside: tracking must recover ------------------
  // Both layers are non-focusable and skip the taskbar, so this is a
  // window-manager kill rather than Cmd+W — it must still re-arm.
  await reminder.elapseNow();
  const [mascot2, card2] = layers();
  card2.close(); // no action — the window-manager path, on the card this time
  assert.ok(mascot2.closed, 'closing one layer takes the other with it');
  assert.strictEqual(reminder.state, 'armed', 'external close re-arms (inherited bug fixed)');

  // --- Take a break (countdown completed in the renderer): dismiss + re-arm ----
  await reminder.elapseNow();
  const [mascot3, card3] = layers();
  action('break');
  assert.ok(mascot3.closed && card3.closed, 'break closes both layers after the countdown');
  assert.strictEqual(reminder.state, 'armed', 'break restarts the original interval');

  // --- Shut down: quits Open Clowk only ----------------------------------------
  await reminder.elapseNow();
  const [mascot4, card4] = layers();
  action('shutdown');
  assert.ok(mascot4.closed && card4.closed, 'shutdown closes both layers');
  assert.strictEqual(reminder.state, 'stopped', 'shutdown stops the reminder');
  assert.strictEqual(electronState.quitCalls, 1, 'shutdown quits the app exactly once');
  // nothing else is touched: no exec/kill of any terminal, IDE, or agent —
  // the main process has no code path that does so (see no-browser-static).

  // --- a lost frontmost capability is reported, never silently swallowed --------
  const setupWindowsBefore = electronState.windows.length;
  front.current = null;
  for (let i = 0; i < 3; i++) await main._test.checkFrontmostNow();
  const compat = main._test.getCompatMessage();
  assert.ok(compat, 'a frontmost probe that stops answering produces a compatibility message');
  assert.ok(/Automation/.test(compat), 'the macOS message names the permission to grant');
  assert.ok(
    electronState.windows.length > setupWindowsBefore,
    'the compatibility message gets a window to appear in — the app is not mute'
  );
  const reopened = electronState.windows[electronState.windows.length - 1];
  assert.ok(
    reopened.calls.loadFile[0][0].endsWith(path.join('electron', 'setup.html')),
    'the surfaced window is the native setup window, never a browser page'
  );
  const compatState = await electronState.ipcInvokeHandlers['setup:state'](null);
  assert.strictEqual(compatState.compatMessage, compat, 'setup reads the runtime compatibility message');
  assert.strictEqual(compatState.running, true, 'setup knows the app is already running');

  front.current = 'Terminal';
  await main._test.checkFrontmostNow();
  assert.strictEqual(main._test.getCompatMessage(), null, 'a probe that recovers clears the message');
  assert.deepStrictEqual(
    reopened.webContents.sent.slice(-1),
    [['setup:compat', null]],
    'the open window is told the capability came back, so a stale warning does not linger'
  );

  // --- an ALREADY-OPEN setup window is told directly, not just focused ---------
  // showSetup() only focuses an existing window and setup.js reads the message
  // once per load, so window creation cannot be what carries it.
  {
    const windowsBefore = electronState.windows.length;
    const sentBefore = reopened.webContents.sent.length;
    front.current = null;
    for (let i = 0; i < 3; i++) await main._test.checkFrontmostNow();
    assert.strictEqual(
      electronState.windows.length,
      windowsBefore,
      'no second setup window is opened on top of the one already showing'
    );
    assert.deepStrictEqual(
      reopened.webContents.sent.slice(sentBefore),
      [['setup:compat', main._test.getCompatMessage()]],
      'the message is pushed into the window the user is already looking at'
    );
    assert.strictEqual(reopened.calls.focus > 0, true, 'and that window is brought forward');

    front.current = 'Terminal';
    await main._test.checkFrontmostNow();
  }

  // --- Quit from setup: the way out when no intervention ever arrives -----------
  await electronState.ipcInvokeHandlers['setup:quit'](null);
  assert.strictEqual(electronState.quitCalls, 2, 'Quit quits Open Clowk');
  assert.strictEqual(reminder.state, 'stopped', 'Quit stops the reminder');

  // --- the agent gate is an identity check, not an availability hint -----------
  // Anthropic's `Claude` desktop app runs a binary whose name differs from the
  // Claude Code CLI only in case. Selecting Claude Code alone means any
  // supported host counts, so the executable check is the whole gate: if it
  // folded case, this user would be interrupted with no agent session at all.
  {
    front.current = 'Terminal';
    runningProcesses.clear();
    runningProcesses.add('Claude');
    const relaunched = await launchIpc(null, { minutes: 30, targets: ['claude-code'] });
    assert.strictEqual(relaunched.ok, true, 'Claude Code on its own is a valid selection');

    assert.strictEqual(
      await main._test.checkFrontmostNow(),
      false,
      'the Claude desktop app never satisfies a selected Claude Code target'
    );

    const desktopState = await electronState.ipcInvokeHandlers['setup:state'](null);
    const desktopById = Object.fromEntries(desktopState.targets.map((t) => [t.id, t.status]));
    assert.strictEqual(
      desktopById['claude-code'],
      'not-running',
      'and the checklist reports it as not running rather than available'
    );

    runningProcesses.add('claude');
    assert.strictEqual(
      await main._test.checkFrontmostNow(),
      true,
      'the real lower-case claude CLI in a supported host does satisfy it'
    );

    // Host availability keeps folding case: a real `Cursor` binary counts even
    // though the target table stores the name normalized.
    runningProcesses.clear();
    runningProcesses.add('Cursor');
    const foldedState = await electronState.ipcInvokeHandlers['setup:state'](null);
    const foldedById = Object.fromEntries(foldedState.targets.map((t) => [t.id, t.status]));
    assert.strictEqual(foldedById['cursor'], 'available', 'a running "Cursor" is still detected');

    if (main._test.getReminder()) main._test.getReminder().stop();
  }

  // --- no forbidden module loads through the whole cycle ------------------------
  assert.deepStrictEqual(
    electronState.forbiddenRequires,
    [],
    'no http/https/net/dgram/tls/shell module loads during setup + intervention'
  );

  cleanup();
  console.log('window contract: all tests passed');
  process.exit(0);
})().catch((err) => {
  cleanup();
  console.error(err);
  process.exit(1);
});
