/* Supported targets, matching, preference validation, and availability
 * detection for the timed-terminal MVP.
 *
 * Privacy boundary: targets match on native application identity only.
 * Agent targets (Codex, Claude Code) additionally check the executable NAME
 * only. Nothing here reads arguments, command lines, prompts, terminal
 * contents, window titles, files, screen pixels, audio, or network data.
 */

'use strict';

// kind: 'app'   — matched when the frontmost application is this app.
// kind: 'agent' — matched when a supported host app is frontmost AND this
//                 executable is running (Codex/Claude live inside terminals).
const TARGETS = [
  {
    id: 'terminal',
    label: 'Terminal.app',
    kind: 'app',
    platforms: ['darwin'],
    appNames: ['Terminal'],
    appBundles: ['/System/Applications/Utilities/Terminal.app'],
  },
  {
    id: 'windows-terminal',
    label: 'Windows Terminal',
    kind: 'app',
    platforms: ['win32'],
    appNames: ['WindowsTerminal'],
    exeNames: ['WindowsTerminal.exe'],
  },
  {
    id: 'wezterm',
    label: 'WezTerm',
    kind: 'app',
    platforms: ['darwin', 'win32', 'linux'],
    appNames: ['WezTerm', 'wezterm-gui'],
    appBundles: ['/Applications/WezTerm.app'],
    exeNames: ['wezterm-gui', 'wezterm-gui.exe'],
  },
  {
    id: 'gnome-terminal',
    label: 'GNOME Terminal',
    kind: 'app',
    platforms: ['linux'],
    appNames: ['gnome-terminal-server', 'gnome-terminal'],
    exeNames: ['gnome-terminal-server'],
  },
  {
    id: 'konsole',
    label: 'Konsole',
    kind: 'app',
    platforms: ['linux'],
    appNames: ['konsole', 'Konsole'],
    exeNames: ['konsole'],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    kind: 'app',
    platforms: ['darwin', 'win32', 'linux'],
    appNames: ['Cursor'],
    appBundles: ['/Applications/Cursor.app'],
    exeNames: ['Cursor.exe', 'cursor'],
  },
  {
    id: 'vscode',
    label: 'VS Code',
    kind: 'app',
    platforms: ['darwin', 'win32', 'linux'],
    appNames: ['Code', 'Visual Studio Code', 'code'],
    appBundles: ['/Applications/Visual Studio Code.app'],
    exeNames: ['Code.exe', 'code'],
  },
  {
    id: 'visual-studio',
    label: 'Visual Studio',
    kind: 'app',
    platforms: ['darwin', 'win32'],
    appNames: ['Visual Studio', 'devenv'],
    appBundles: ['/Applications/Visual Studio.app'],
    exeNames: ['devenv.exe'],
  },
  {
    id: 'codex',
    label: 'Codex',
    kind: 'agent',
    platforms: ['darwin', 'win32', 'linux'],
    exeNames: ['codex', 'codex.exe'],
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    kind: 'agent',
    platforms: ['darwin', 'win32', 'linux'],
    exeNames: ['claude', 'claude.exe'],
  },
];

function getTarget(id) {
  return TARGETS.find((t) => t.id === id) || null;
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\.exe$/, '');
}

function targetNames(target) {
  return [...(target.appNames || []), ...(target.exeNames || [])].map(normalizeName);
}

function hostTargets(platform) {
  return TARGETS.filter((t) => t.kind === 'app' && t.platforms.includes(platform));
}

/* Does `frontmost` (a native app identity string) satisfy any selected
 * target, given `execRunning(name)` — an executable-NAME-only check? */
function matchFrontmost({ frontmost, selected, platform, execRunning }) {
  const front = normalizeName(frontmost);
  if (!front) return false;
  for (const id of selected) {
    const target = getTarget(id);
    if (!target || !target.platforms.includes(platform)) continue;
    if (target.kind === 'app') {
      if (targetNames(target).includes(front)) return true;
    } else {
      // agent target: any supported host app frontmost + the agent executable running
      const hostFrontmost = hostTargets(platform).some((h) => targetNames(h).includes(front));
      if (hostFrontmost && (target.exeNames || []).some((exe) => execRunning(normalizeName(exe)))) {
        return true;
      }
    }
  }
  return false;
}

/* Validate setup preferences. Returns { ok, errors, prefs }. */
function validatePrefs(input) {
  const errors = [];
  const minutes = Number(input && input.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    errors.push('interval must be a positive number of minutes');
  }
  const selected = Array.isArray(input && input.targets) ? input.targets : [];
  if (selected.length === 0) {
    errors.push('at least one target is required');
  }
  const unknown = selected.filter((id) => !getTarget(id));
  if (unknown.length) {
    errors.push(`unknown target(s): ${unknown.join(', ')}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    prefs: { minutes, targets: [...new Set(selected)] },
  };
}

/* Availability for the setup checklist, via injected probes so tests never
 * touch the real system:
 *   probes.appInstalled(bundlePath) -> bool   (macOS .app presence)
 *   probes.exeRunning(name)         -> bool   (executable-name-only)
 * Statuses: available | not-installed | not-running | unsupported-platform */
function detectTargets({ platform, probes }) {
  return TARGETS.map((target) => {
    if (!target.platforms.includes(platform)) {
      return { id: target.id, label: target.label, kind: target.kind, status: 'unsupported-platform' };
    }
    if (target.kind === 'agent') {
      const running = (target.exeNames || []).some((exe) => probes.exeRunning(normalizeName(exe)));
      return {
        id: target.id,
        label: target.label,
        kind: target.kind,
        status: running ? 'available' : 'not-running',
      };
    }
    const installed =
      (target.appBundles || []).some((b) => probes.appInstalled(b)) ||
      (target.exeNames || []).some((exe) => probes.exeRunning(normalizeName(exe)));
    return {
      id: target.id,
      label: target.label,
      kind: target.kind,
      status: installed ? 'available' : 'not-installed',
    };
  });
}

module.exports = { TARGETS, getTarget, matchFrontmost, validatePrefs, detectTargets, normalizeName };
