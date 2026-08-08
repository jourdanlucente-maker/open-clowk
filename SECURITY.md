# Open Clowk — security & privacy boundary

## What Open Clowk reads

Two identity signals, both name-only:

1. **The frontmost application's name** — to decide whether a selected
   terminal/IDE is in front before showing the mascot. On macOS this uses a
   one-time Automation consent for System Events and returns the app name
   only; on Windows, the foreground window's **process name** (never its
   title); on X11 Linux, the active window's executable name via
   `/proc/<pid>/comm`.
2. **Executable names** `codex` / `claude` — only when those agent targets
   are selected, via name-only process checks (`pgrep -x` /
   `tasklist /FI IMAGENAME eq`). Never arguments, never command lines.

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
  only the app, no login persistence.
- `test/adapters.test.js` — adapter commands verified name-only through
  fixtures; unsupported platforms produce clear messages.

## Reporting

Open a private report with the repository owner
(`jourdanlucente-maker`) before disclosing any vulnerability publicly.
