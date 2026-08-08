# Open Clowk — security & privacy boundary

## What Open Clowk reads

Two identity signals, both name-only:

1. **The frontmost application's name** — to decide whether a selected
   terminal/IDE is in front before showing the mascot. On macOS this uses a
   one-time Automation consent for System Events and returns the app name
   only; on Windows, the foreground window's **process name** (never its
   title); on X11 Linux, the active window's executable name via
   `/proc/<pid>/comm`. This is read only when a reminder interval is actually
   due, and then at the pending cadence until a selected target is in front —
   never on a background timer for the life of the app.
2. **Executable names** — asked as a yes/no "is a process with this name
   running?", via whole-name process checks (`pgrep -x[i]` /
   `tasklist /FI IMAGENAME eq`). Never arguments, never command lines —
   `pgrep`'s `-f`/`--full`, which would widen the match to the command line, is
   forbidden and pinned by `test/adapters.test.js`. Never any other process.
   Case folding is off by default and requested only for application
   availability, where the stored names are normalized but the real binaries
   are `Cursor`/`Code`/`WindowsTerminal`; the `codex`/`claude` check stays
   exact, so the `Claude` desktop application cannot pass for the Claude Code
   CLI. The set of names is closed and derived from the approved
   target list (`platformExeNames` in `electron/targets.js`), and it is asked
   in exactly two places:
   - **at setup**, for the platform's supported target names (e.g.
     `wezterm-gui`, `code`, `konsole`, `WindowsTerminal`, `devenv`, `codex`,
     `claude`), so the availability checklist is honest rather than blank on
     platforms with no install probe;
   - **while running**, only for the executable names of the agent targets you
     actually selected (`codex` / `claude`), and only when an interval is due.

## What Open Clowk never does

- No reading of arguments, commands, prompts, command history, terminal
  text/output, window titles, keystrokes, clicks, files, screen pixels,
  audio, or network contents. No activity history.
- No closing, pausing, killing, injecting into, or modifying any terminal,
  IDE, Codex, or Claude session. **Shut down** quits Open Clowk only.
- No telemetry, analytics, account, sync, or cloud service of its own.
- No HTTP server, loopback listener, OS URL opener, browser page, or browser
  fallback — including for previews or unsupported platforms. Unsupported
  environments (e.g. Linux/Wayland) get a clear compatibility message.
- No login persistence and no global install. Preferences persist locally in
  `~/.open-clowk/prefs.json`; the joke CLI keeps its ledger in
  `~/.open-clowk/ledger.json`. Nothing else is written outside the project.

## Network surface

One documented egress: at display time the overlay tries to load three
sprite PNGs — first from local `assets/` (never committed; see
[`assets/README.md`](assets/README.md) for the redistribution policy), then
from a user-scoped Higgsfield CloudFront CDN URL. Any miss renders the
built-in CSS pixel art, which works fully offline. The CDN URL is a
third-party-hosted, user-scoped dependency; treat its availability and its
hosting party accordingly.

## Enforcement

The boundaries above are executable, not aspirational:

- `test/no-browser-static.test.js` — scans every tracked code file for
  servers, sockets, browser/URL openers, capture APIs, idle-time tracking,
  login persistence, and non-sprite network egress; `child_process` is
  confined to the platform adapters, whose probes are pinned to name-only
  fields.
- `test/window-contract.test.js` — full setup→launch→intervention cycle
  through an injected Electron: no forbidden module loads, shutdown quits
  only the app, no login persistence, and the display-sized mascot layer is
  created with no preload, so the one renderer that loads third-party sprite
  images holds no bridge to the main process.
- `test/reminder.test.js` — the probe schedule: nothing is read while an
  interval is merely armed, during an intervention, or during the break, and
  a slow probe never stacks a second one.
- `test/adapters.test.js` — adapter commands verified name-only through
  fixtures; unsupported platforms produce clear messages.

## Reporting

Open a private report with the repository owner
(`jourdanlucente-maker`) before disclosing any vulnerability publicly.
