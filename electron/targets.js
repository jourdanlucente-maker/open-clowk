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

/* The closed set of executable NAMES this platform's supported targets
 * declare, normalized and deduplicated. Availability probing asks for these
 * and nothing else: no arguments, no command lines, no other process. */
function platformExeNames(platform) {
  const names = new Set();
  for (const target of TARGETS) {
    if (!target.platforms.includes(platform)) continue;
    for (const exe of target.exeNames || []) names.add(normalizeName(exe));
  }
  return [...names];
}

/* How an executable name must be compared against the processes that are
 * actually running.
 *
 * Application targets need case folding: the table stores normalized names
 * while the binaries that really run are `Cursor`, `Code`, `WindowsTerminal`.
 *
 * Agent targets are the opposite. `claude` and `codex` ARE the real CLI binary
 * names, and the check is an identity gate, not an availability hint — a
 * differently-cased process is a different program. Anthropic's `Claude`
 * desktop application must never satisfy a selected Claude Code target, or the
 * mascot appears for someone who has no agent session at all. */
const AGENT_EXE_NAMES = new Set(
  TARGETS.filter((t) => t.kind === 'agent').flatMap((t) =>
    (t.exeNames || []).map((exe) => normalizeName(exe))
  )
);

function exeMatchIsCaseSensitive(name) {
  return AGENT_EXE_NAMES.has(normalizeName(name));
}

/* Hosts an agent target may be spotted inside. Codex/Claude have no window of
 * their own, so they are matched through a host app. The user's host choices
 * win: selecting Claude Code + VS Code means VS Code only, never every
 * supported terminal. Selecting an agent with no host at all still has to
 * work, so that case falls back to the supported hosts for the platform. */
function agentHostTargets(selected, platform) {
  const chosen = selected
    .map((id) => getTarget(id))
    .filter((t) => t && t.kind === 'app' && t.platforms.includes(platform));
  return chosen.length ? chosen : hostTargets(platform);
}

/* Does `frontmost` (a native app identity string) satisfy any selected
 * target, given `execRunning(name)` — an executable-NAME-only check? */
function matchFrontmost({ frontmost, selected, platform, execRunning }) {
  const front = normalizeName(frontmost);
  if (!front) return false;
  const selectedIds = Array.isArray(selected) ? selected : [];
  const agentHosts = agentHostTargets(selectedIds, platform);
  for (const id of selectedIds) {
    const target = getTarget(id);
    if (!target || !target.platforms.includes(platform)) continue;
    if (target.kind === 'app') {
      if (targetNames(target).includes(front)) return true;
    } else {
      // agent target: a selected host app frontmost + the agent executable running
      const hostFrontmost = agentHosts.some((h) => targetNames(h).includes(front));
      if (hostFrontmost && (target.exeNames || []).some((exe) => execRunning(normalizeName(exe)))) {
        return true;
      }
    }
  }
  return false;
}

/* Interval bounds. This is the real trust boundary: the setup window's input
 * attributes are cosmetic, and ~/.open-clowk/prefs.json is a hand-editable
 * file. Anything below a whole minute turns the mascot into a strobe, and
 * anything past 2^31-1 milliseconds silently collapses setTimeout to 1ms —
 * which fires the overlay immediately, forever. */
const MIN_MINUTES = 1;
const MAX_MINUTES = 24 * 60;

/* Validate setup preferences. Returns { ok, errors, prefs }. */
function validatePrefs(input) {
  const errors = [];
  const minutes = Number(input && input.minutes);
  if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
    errors.push(
      `interval must be a whole number of minutes between ${MIN_MINUTES} and ${MAX_MINUTES}`
    );
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
 *   probes.canProbeInstall          -> bool   (does this platform have an
 *                                              install probe at all?)
 * Statuses: available | not-installed | not-running | unsupported-platform
 *
 * "not-installed" is a claim, so it is only made where it can be checked: a
 * platform with no install probe (Windows/Linux in this cut) reports an app it
 * cannot see running as `not-running`, which is what is actually known — and
 * which keeps the row selectable, so a running Konsole or Windows Terminal is
 * never locked out by a probe the platform does not have. */
function detectTargets({ platform, probes }) {
  return TARGETS.map((target) => {
    const row = { id: target.id, label: target.label, kind: target.kind };
    if (!target.platforms.includes(platform)) {
      return { ...row, status: 'unsupported-platform' };
    }
    const running = (target.exeNames || []).some((exe) => probes.exeRunning(normalizeName(exe)));
    if (target.kind === 'agent') {
      return { ...row, status: running ? 'available' : 'not-running' };
    }
    const bundles = target.appBundles || [];
    if (running || bundles.some((b) => probes.appInstalled(b))) {
      return { ...row, status: 'available' };
    }
    const installIsKnowable = !!probes.canProbeInstall && bundles.length > 0;
    return { ...row, status: installIsKnowable ? 'not-installed' : 'not-running' };
  });
}

module.exports = {
  TARGETS,
  getTarget,
  matchFrontmost,
  validatePrefs,
  detectTargets,
  normalizeName,
  platformExeNames,
  exeMatchIsCaseSensitive,
  MIN_MINUTES,
  MAX_MINUTES,
};
