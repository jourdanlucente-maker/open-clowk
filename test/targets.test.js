/* Targets: frontmost matching on native app identity, Codex/Claude
 * executable-name-only requirement, preference validation, and honest
 * availability detection.
 *
 * Run: node test/targets.test.js
 */

'use strict';

const assert = require('assert');
const { TARGETS, matchFrontmost, validatePrefs, detectTargets } = require('../electron/targets');

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

// --- preference validation ---------------------------------------------------
{
  assert.ok(validatePrefs({ minutes: 30, targets: ['terminal'] }).ok, 'default-shaped prefs validate');
  assert.ok(!validatePrefs({ minutes: 0, targets: ['terminal'] }).ok, 'zero interval rejected');
  assert.ok(!validatePrefs({ minutes: -5, targets: ['terminal'] }).ok, 'negative interval rejected');
  assert.ok(!validatePrefs({ minutes: 'abc', targets: ['terminal'] }).ok, 'non-numeric interval rejected');
  assert.ok(!validatePrefs({ minutes: 30, targets: [] }).ok, 'at least one target is required');
  assert.ok(!validatePrefs({ minutes: 30 }).ok, 'missing targets rejected');
  const unknown = validatePrefs({ minutes: 30, targets: ['emacs'] });
  assert.ok(!unknown.ok && unknown.errors.some((e) => e.includes('emacs')), 'unknown target rejected by name');
  const dupes = validatePrefs({ minutes: 15, targets: ['terminal', 'terminal'] });
  assert.ok(dupes.ok && dupes.prefs.targets.length === 1, 'duplicates collapse');
}

// --- availability detection is honest ----------------------------------------
{
  const darwin = detectTargets({
    platform: 'darwin',
    probes: {
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

console.log('targets: all tests passed');
