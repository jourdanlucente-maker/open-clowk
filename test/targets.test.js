/* Targets: frontmost matching on native app identity, Codex/Claude
 * executable-name-only requirement, preference validation, and honest
 * availability detection.
 *
 * Run: node test/targets.test.js
 */

'use strict';

const assert = require('assert');
const {
  TARGETS,
  matchFrontmost,
  validatePrefs,
  detectTargets,
  platformExeNames,
  exeMatchIsCaseSensitive,
} = require('../electron/targets');

const NOT_RUNNING = () => false;

// --- the supported first-cut identities are exactly the approved list -------
{
  assert.deepStrictEqual(
    TARGETS.map((t) => t.id),
    [
      'terminal',
      'windows-terminal',
      'wezterm',
      'gnome-terminal',
      'konsole',
      'cursor',
      'vscode',
      'visual-studio',
      'codex',
      'claude-code',
    ],
    'target list matches the spec'
  );
}

// --- frontmost matching: app targets ---------------------------------------
{
  const base = { platform: 'darwin', execRunning: NOT_RUNNING };
  assert.ok(
    matchFrontmost({ ...base, frontmost: 'Terminal', selected: ['terminal'] }),
    'Terminal.app frontmost matches its selection'
  );
  assert.ok(
    !matchFrontmost({ ...base, frontmost: 'Finder', selected: ['terminal'] }),
    'an unselected app frontmost does not match — no global trigger'
  );
  assert.ok(
    matchFrontmost({ ...base, frontmost: 'Code', selected: ['vscode'] }),
    'VS Code frontmost matches'
  );
  assert.ok(
    matchFrontmost({ ...base, frontmost: 'Cursor', selected: ['cursor'] }),
    'Cursor frontmost matches'
  );
  assert.ok(
    !matchFrontmost({ ...base, frontmost: 'Terminal', selected: ['windows-terminal'] }),
    'a platform-mismatched selection never matches'
  );
  assert.ok(
    !matchFrontmost({ ...base, frontmost: '', selected: ['terminal'] }),
    'unknown frontmost identity does not match'
  );
}

// --- Codex / Claude Code: supported host frontmost + executable running -----
{
  const runningCodex = (name) => name === 'codex';
  const selected = ['codex'];
  assert.ok(
    matchFrontmost({ frontmost: 'Terminal', selected, platform: 'darwin', execRunning: runningCodex }),
    'Codex matches: Terminal frontmost + codex executable running'
  );
  assert.ok(
    matchFrontmost({ frontmost: 'Code', selected, platform: 'darwin', execRunning: runningCodex }),
    'Codex matches inside a supported IDE host'
  );
  assert.ok(
    !matchFrontmost({ frontmost: 'Terminal', selected, platform: 'darwin', execRunning: NOT_RUNNING }),
    'Codex does NOT match when the executable is not running'
  );
  assert.ok(
    !matchFrontmost({ frontmost: 'Finder', selected, platform: 'darwin', execRunning: runningCodex }),
    'Codex does NOT match outside a supported host, even if running'
  );
  assert.ok(
    matchFrontmost({
      frontmost: 'Terminal',
      selected: ['claude-code'],
      platform: 'darwin',
      execRunning: (n) => n === 'claude',
    }),
    'Claude Code matches with its executable running'
  );
}

// --- an agent target never drags in a host the user left unchecked -----------
{
  const runningClaude = (name) => name === 'claude';
  assert.ok(
    !matchFrontmost({
      frontmost: 'Terminal',
      selected: ['claude-code', 'vscode'],
      platform: 'darwin',
      execRunning: runningClaude,
    }),
    'picking Claude Code + VS Code does not make Terminal.app a trigger'
  );
  assert.ok(
    matchFrontmost({
      frontmost: 'Code',
      selected: ['claude-code', 'vscode'],
      platform: 'darwin',
      execRunning: runningClaude,
    }),
    'the selected host still matches for the agent'
  );
  assert.ok(
    matchFrontmost({
      frontmost: 'Terminal',
      selected: ['claude-code', 'terminal'],
      platform: 'darwin',
      execRunning: () => false,
    }),
    'a selected host stands on its own, with or without the agent running'
  );
}

// --- the promised Windows / Linux identities actually match ------------------
{
  assert.ok(
    matchFrontmost({
      frontmost: 'WindowsTerminal',
      selected: ['windows-terminal'],
      platform: 'win32',
      execRunning: NOT_RUNNING,
    }),
    'Windows Terminal frontmost matches on Windows'
  );
  assert.ok(
    matchFrontmost({ frontmost: 'devenv', selected: ['visual-studio'], platform: 'win32', execRunning: NOT_RUNNING }),
    'Visual Studio frontmost matches on Windows'
  );
  assert.ok(
    matchFrontmost({ frontmost: 'konsole', selected: ['konsole'], platform: 'linux', execRunning: NOT_RUNNING }),
    'Konsole frontmost matches on Linux'
  );
  assert.ok(
    matchFrontmost({
      frontmost: 'gnome-terminal-server',
      selected: ['gnome-terminal'],
      platform: 'linux',
      execRunning: NOT_RUNNING,
    }),
    'GNOME Terminal frontmost matches on Linux'
  );
  assert.ok(
    matchFrontmost({
      frontmost: 'wezterm-gui',
      selected: ['claude-code', 'wezterm'],
      platform: 'linux',
      execRunning: (n) => n === 'claude',
    }),
    'Claude Code inside a selected Linux host matches'
  );
  assert.ok(
    !matchFrontmost({ frontmost: 'nautilus', selected: ['konsole'], platform: 'linux', execRunning: NOT_RUNNING }),
    'an unselected Linux app frontmost does not match'
  );
  assert.ok(
    !matchFrontmost({ frontmost: 'konsole', selected: ['konsole'], platform: 'win32', execRunning: NOT_RUNNING }),
    'a Linux-only target never matches on Windows'
  );
}

// --- preference validation ---------------------------------------------------
{
  assert.ok(validatePrefs({ minutes: 30, targets: ['terminal'] }).ok, 'default-shaped prefs validate');
  assert.ok(!validatePrefs({ minutes: 0, targets: ['terminal'] }).ok, 'zero interval rejected');
  assert.ok(!validatePrefs({ minutes: -5, targets: ['terminal'] }).ok, 'negative interval rejected');
  assert.ok(!validatePrefs({ minutes: 'abc', targets: ['terminal'] }).ok, 'non-numeric interval rejected');
  // The trust boundary: prefs.json is hand-editable and the HTML input is cosmetic.
  assert.ok(!validatePrefs({ minutes: 0.05, targets: ['terminal'] }).ok, 'sub-minute interval rejected');
  assert.ok(!validatePrefs({ minutes: 1.5, targets: ['terminal'] }).ok, 'fractional interval rejected');
  assert.ok(
    !validatePrefs({ minutes: 35792, targets: ['terminal'] }).ok,
    'an interval that overflows setTimeout into a 1ms fire loop is rejected'
  );
  assert.ok(!validatePrefs({ minutes: Infinity, targets: ['terminal'] }).ok, 'infinite interval rejected');
  assert.ok(validatePrefs({ minutes: 1, targets: ['terminal'] }).ok, 'the shortest sane interval is allowed');
  assert.ok(validatePrefs({ minutes: 1440, targets: ['terminal'] }).ok, 'a full day is allowed');
  assert.ok(!validatePrefs({ minutes: 30, targets: [] }).ok, 'at least one target is required');
  assert.ok(!validatePrefs({ minutes: 30 }).ok, 'missing targets rejected');
  const unknown = validatePrefs({ minutes: 30, targets: ['emacs'] });
  assert.ok(!unknown.ok && unknown.errors.some((e) => e.includes('emacs')), 'unknown target rejected by name');
  const dupes = validatePrefs({ minutes: 15, targets: ['terminal', 'terminal'] });
  assert.ok(dupes.ok && dupes.prefs.targets.length === 1, 'duplicates collapse');
}

// --- the probed executable-name set is closed and platform-scoped ------------
{
  assert.deepStrictEqual(
    platformExeNames('win32').sort(),
    ['claude', 'code', 'codex', 'cursor', 'devenv', 'wezterm-gui', 'windowsterminal'],
    'Windows probes exactly the supported executable names'
  );
  assert.deepStrictEqual(
    platformExeNames('linux').sort(),
    ['claude', 'code', 'codex', 'cursor', 'gnome-terminal-server', 'konsole', 'wezterm-gui'],
    'Linux probes exactly the supported executable names'
  );
  assert.deepStrictEqual(
    platformExeNames('darwin').sort(),
    ['claude', 'code', 'codex', 'cursor', 'devenv', 'wezterm-gui'],
    'macOS probes exactly the supported executable names'
  );

  // Only the agent CLIs are matched exactly; app binaries need case folding
  // because the table stores them normalized. The predicate is a pure function
  // of the name, which is sound only while the two name sets stay disjoint.
  for (const agent of ['claude', 'codex', 'Claude.exe', 'CODEX']) {
    assert.ok(exeMatchIsCaseSensitive(agent), `${agent} is an agent identity and must match exactly`);
  }
  for (const app of ['cursor', 'code', 'konsole', 'wezterm-gui', 'windowsterminal', 'devenv']) {
    assert.ok(!exeMatchIsCaseSensitive(app), `${app} is an app binary and must fold case`);
  }
  {
    const agentNames = new Set(
      TARGETS.filter((t) => t.kind === 'agent').flatMap((t) =>
        (t.exeNames || []).map((e) => e.toLowerCase().replace(/\.exe$/, ''))
      )
    );
    const appNames = TARGETS.filter((t) => t.kind === 'app').flatMap((t) =>
      (t.exeNames || []).map((e) => e.toLowerCase().replace(/\.exe$/, ''))
    );
    assert.deepStrictEqual(
      appNames.filter((n) => agentNames.has(n)),
      [],
      'no app target shares an executable name with an agent, so per-name case policy is unambiguous'
    );
  }

  // The privacy boundary: detection may ask about these names and nothing else.
  for (const platform of ['darwin', 'win32', 'linux']) {
    const asked = [];
    detectTargets({
      platform,
      probes: {
        canProbeInstall: false,
        appInstalled: () => false,
        exeRunning: (name) => {
          asked.push(name);
          return false;
        },
      },
    });
    const allowed = new Set(platformExeNames(platform));
    assert.ok(
      asked.length > 0 && asked.every((name) => allowed.has(name)),
      `${platform}: no name outside the supported set is ever probed`
    );
  }
}

// --- availability detection is honest ----------------------------------------
{
  const darwin = detectTargets({
    platform: 'darwin',
    probes: {
      canProbeInstall: true,
      appInstalled: (bundle) => bundle.includes('Terminal.app'),
      exeRunning: (name) => name === 'claude',
    },
  });
  const byId = Object.fromEntries(darwin.map((t) => [t.id, t.status]));
  assert.strictEqual(byId['terminal'], 'available', 'Terminal.app detected');
  assert.strictEqual(byId['vscode'], 'not-installed', 'missing IDE reported, not silently accepted');
  assert.strictEqual(byId['windows-terminal'], 'unsupported-platform', 'Windows-only target reported');
  assert.strictEqual(byId['gnome-terminal'], 'unsupported-platform', 'Linux-only target reported');
  assert.strictEqual(byId['codex'], 'not-running', 'agent executable not running is reported');
  assert.strictEqual(byId['claude-code'], 'available', 'running agent executable is available');
}

// --- a running app rescues a target the install probe cannot see --------------
// macOS only knows the standard bundle paths, so a VS Code living outside
// /Applications has to be found by its running process or it is unselectable.
{
  const byId = Object.fromEntries(
    detectTargets({
      platform: 'darwin',
      probes: {
        canProbeInstall: true,
        appInstalled: () => false,
        exeRunning: (name) => name === 'code',
      },
    }).map((t) => [t.id, t.status])
  );
  assert.strictEqual(byId['vscode'], 'available', 'a running VS Code counts even outside /Applications');
  assert.strictEqual(byId['terminal'], 'not-installed', 'a bundle that really is absent is still reported');
}

// --- Windows: every promised target is genuinely selectable when available ----
// There is no install probe on Windows in this cut, so the running executable
// is the whole evidence — wiring it to two agent names left every terminal and
// IDE reported absent with a dead checkbox.
{
  const byId = Object.fromEntries(
    detectTargets({
      platform: 'win32',
      probes: {
        canProbeInstall: false,
        appInstalled: () => false,
        exeRunning: (name) => name === 'windowsterminal' || name === 'code',
      },
    }).map((t) => [t.id, t.status])
  );
  assert.strictEqual(byId['windows-terminal'], 'available', 'a running Windows Terminal is available');
  assert.strictEqual(byId['vscode'], 'available', 'a running VS Code is available on Windows');
  // Negative cases: not seen running, and never falsely claimed absent.
  for (const id of ['wezterm', 'cursor', 'visual-studio']) {
    assert.strictEqual(byId[id], 'not-running', `${id} not seen running is reported as not running`);
  }
  assert.strictEqual(byId['codex'], 'not-running', 'an agent not running is reported on Windows');
  for (const id of ['terminal', 'gnome-terminal', 'konsole']) {
    assert.strictEqual(byId[id], 'unsupported-platform', `${id} is not offered on Windows`);
  }
  assert.ok(
    !Object.values(byId).includes('not-installed'),
    'a platform with no install probe never claims an app is not installed'
  );
}

// --- Linux (X11): same contract -----------------------------------------------
{
  const byId = Object.fromEntries(
    detectTargets({
      platform: 'linux',
      probes: {
        canProbeInstall: false,
        appInstalled: () => false,
        exeRunning: (name) => name === 'konsole' || name === 'wezterm-gui',
      },
    }).map((t) => [t.id, t.status])
  );
  assert.strictEqual(byId['konsole'], 'available', 'a running Konsole is available');
  assert.strictEqual(byId['wezterm'], 'available', 'a running WezTerm is available on Linux');
  for (const id of ['gnome-terminal', 'cursor', 'vscode']) {
    assert.strictEqual(byId[id], 'not-running', `${id} not seen running is reported as not running`);
  }
  for (const id of ['terminal', 'windows-terminal', 'visual-studio']) {
    assert.strictEqual(byId[id], 'unsupported-platform', `${id} is not offered on Linux`);
  }
  assert.ok(
    !Object.values(byId).includes('not-installed'),
    'a platform with no install probe never claims an app is not installed'
  );
}

console.log('targets: all tests passed');
