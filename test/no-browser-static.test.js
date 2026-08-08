/* Static guards: the forbidden-data and no-browser boundaries are executable.
 *
 * Scans every tracked code file (derived from `git ls-files`, so new files
 * and directories are covered by default — docs/specs/test harness excluded).
 * A browser path, a listening socket, input/screen/audio capture, idle-time
 * tracking, login persistence, or content-reading process inspection is a
 * build failure.
 *
 * Run: node test/no-browser-static.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// Committed files AND new not-yet-committed ones (respecting .gitignore): a
// privacy guard that only sees `git ls-files` gives a free pass to every file
// added since the last commit, which is exactly when it matters most.
const listFiles = (args) =>
  execSync(`git ls-files ${args}`, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

const tracked = [...new Set([...listFiles(''), ...listFiles('--others --exclude-standard')])]
  .filter((f) => fs.existsSync(path.join(ROOT, f)))
  .filter(
    (f) =>
      !f.startsWith('test/') && // the test harness itself mentions patterns as strings
      !f.startsWith('specs/') &&
      !f.startsWith('assets/') &&
      !f.endsWith('.md') &&
      !f.endsWith('.png') &&
      !f.endsWith('.webp')
  );

assert.ok(tracked.includes('electron/main.js'), 'scan sees the product sources');
assert.ok(tracked.includes('electron/adapters.js'), 'scan sees the adapters');
assert.ok(tracked.includes('overlay/overlay.js'), 'scan sees the mascot layer');
assert.ok(tracked.includes('overlay/control.js'), 'scan sees the control card');

const sources = {};
for (const f of tracked) {
  sources[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
}

// --- no browser / server / socket / capture surface anywhere -----------------
const FORBIDDEN = [
  [/require\(\s*['"](?:node:)?https?['"]\s*\)|from\s+['"](?:node:)?https?['"]/, 'uses the http/https module'],
  [/require\(\s*['"](?:node:)?(net|dgram|tls)['"]\s*\)/, 'uses net/dgram/tls'],
  [/\bcreateServer\s*\(/, 'creates a server'],
  [/\.listen\s*\(/, 'binds a listening socket'],
  [/\bopenExternal\b/, 'opens a URL in the default browser'],
  [/\bshell\s*\./, 'uses electron.shell'],
  [/\bloadURL\s*\(/, 'loads a URL instead of a local file'],
  [/\b(window\s*\.\s*)?open\s*\(\s*['"]https?/, 'opens a URL from a renderer'],
  [/desktopCapturer|capturePage|getDisplayMedia|mediaDevices|getUserMedia/i, 'screen/audio capture'],
  [/globalShortcut|iohook|keylog/i, 'keyboard capture'],
  [/clipboard/i, 'clipboard access'],
  [/powerMonitor|getSystemIdleTime/, 'idle-time tracking (superseded contract)'],
  [/setLoginItemSettings/, 'login persistence (out of scope)'],
  [/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b/, 'network egress (outside the documented sprite Image loads)'],
];

for (const [file, text] of Object.entries(sources)) {
  for (const [pattern, what] of FORBIDDEN) {
    assert.ok(!pattern.test(text), `${file}: ${what} is forbidden`);
  }
}

// --- child_process is allowed only in the platform adapters -------------------
for (const [file, text] of Object.entries(sources)) {
  if (file === 'electron/adapters.js') continue;
  assert.ok(
    !/require\(\s*['"](?:node:)?child_process['"]\s*\)/.test(text),
    `${file}: child_process belongs to electron/adapters.js only`
  );
}

// --- the adapters never read prohibited fields --------------------------------
const adapters = sources['electron/adapters.js'];
for (const pattern of [/MainWindowTitle/, /GetWindowText/, /\bwmic\b/, /CommandLine/, /\bps\s+aux/, /arguments\b.*process/i]) {
  assert.ok(!pattern.test(adapters), `electron/adapters.js must not read prohibited fields (${pattern})`);
}
assert.ok(adapters.includes('name of first application process'), 'macOS probe reads the app NAME only');
assert.ok(adapters.includes('ProcessName'), 'Windows probe reads the process NAME only');
assert.ok(adapters.includes('/proc/'), 'Linux probe reads /proc/<pid>/comm (executable NAME only)');

// --- no browser preview mode survives in the overlay --------------------------
assert.ok(!sources['overlay/overlay.js'].includes('demo-bg'), 'no browser preview backdrop remains');
assert.ok(
  !sources['overlay/overlay.html'].includes('?bg=') && !sources['overlay/overlay.css'].includes('demo-bg'),
  'no browser preview surface remains'
);

// --- the three intervention actions are the only overlay intents --------------
const controlJs = sources['overlay/control.js'];
for (const reason of ['break', 'ignore', 'shutdown']) {
  assert.ok(controlJs.includes(`'${reason}'`), `the control card sends the '${reason}' intent`);
}
assert.ok(!controlJs.includes("'snooze'"), 'no snooze intent survives');

// --- the display-sized mascot layer is decoration, never a control surface -----
const overlayJs = sources['overlay/overlay.js'];
assert.ok(!/window\.clowk/.test(overlayJs), 'the mascot layer holds no bridge to the main process');
assert.ok(!/addEventListener/.test(overlayJs), 'the mascot layer listens for no input at all');
assert.ok(
  !/btn-break|btn-ignore|btn-shutdown|btn-resume/.test(sources['overlay/overlay.html']),
  'the actions live on the control card, not on the click-through layer'
);

// --- the mascot layer never claims input; the card is never made click-through --
const mainJs = sources['electron/main.js'];
assert.ok(
  /overlayWindow\.setIgnoreMouseEvents\(true\)/.test(mainJs),
  'the display-sized layer is click-through outright — no forward-only trick'
);
assert.ok(
  !/forward:\s*true/.test(mainJs),
  'no reliance on pointer forwarding, which Electron supports on macOS/Windows only'
);
assert.ok(
  !/controlWindow\.setIgnoreMouseEvents/.test(mainJs),
  'the control card keeps normal hit-testing on every platform'
);
assert.ok(
  (mainJs.match(/focusable:\s*false/g) || []).length >= 1 && /showInactive\(\)/.test(mainJs),
  'intervention windows are non-focusable and shown inactive — no keystroke theft'
);

console.log(`no-browser / privacy static guards: all tests passed (${tracked.length} files scanned)`);
