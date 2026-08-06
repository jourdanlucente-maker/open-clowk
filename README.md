# Open Clowk

Open Clowk is a private, configurable terminal-time break intervention. It counts consecutive wall-clock time while one of your chosen process names is open. At the threshold, the orange robot opens a local break page — and some clocks — so you can stop, snooze, or deliberately keep going.

This repository is a release candidate. **The npm package is not published yet.**

## Safety and privacy

Open Clowk reads only process names from the operating system process list. It does not inspect keyboard input, commands, arguments, terminal contents, files, prompts, or network activity. It has no cloud service, account, analytics, telemetry, CDN, elevated privilege, postinstall daemon, login persistence, or forced process action. It never kills or blocks a process.

The monitor serves its packaged break page through a random loopback-only `127.0.0.1` port and authenticates all actions with a per-run local token. Runtime images are included in the package.

## Install

After a separate captain-approved npm publication:

```sh
npm install --global open-clowk
```

For the current release candidate, install the packed artifact into a temporary or user-owned prefix:

```sh
npm ci
npm pack
npm install --global --prefix "$PWD/.local-prefix" ./open-clowk-0.1.0.tgz
```

## Configure and run

Interactive setup:

```sh
open-clowk setup
```

Explicit five-minute setup using presets and a custom process name:

```sh
open-clowk setup --minutes 5 --watch terminal,claude,codex,kimi,my-cli --snooze 5
open-clowk start
open-clowk status
open-clowk stop
```

`terminal`, `claude`, `codex`, and `kimi` are presets. Other values are matched as exact process names after case normalization and removal of a Windows `.exe` suffix. To discover the names visible on your machine:

```sh
open-clowk detect
```

Commands:

- `setup` — save whole-minute threshold, Snooze duration, and watched process names; add `--start` to start afterward.
- `detect` — list only currently visible process names.
- `start` — start one detached per-user monitor; idempotent.
- `stop` — ask that monitor to exit through its loopback control channel; idempotent.
- `status` — report configuration, active matches, consecutive time, and intervention state.

`start` does not create a login item or service. After logout, reboot, or a manual stop, run it again.

## What each choice means

- **Take a break:** waits until every watched process is closed, then resets.
- **Snooze:** delays the next page by the configured duration, five minutes by default.
- **Keep going:** resets the entire threshold.

None of the choices closes or blocks a process.

## Five-minute acceptance canary

This is a human gate and must use an isolated state directory until installation is separately approved:

1. Set `OPEN_CLOWK_STATE_DIR` to a new temporary directory.
2. Run `open-clowk detect` and choose the exact terminal or CLI process name.
3. Run `open-clowk setup --minutes 5 --watch <name> --snooze 5 --start`.
4. Keep that selected process open for five consecutive real minutes.
5. Confirm the local Open Clowk page appears automatically and that robot, complete crowbar, open clock, title, and all three actions remain visible at the actual desktop and a narrow/mobile browser width.
6. Exercise each action in separate runs, confirm no process is killed, then run `open-clowk stop`.

Automated tests prove the same five-minute threshold with an injected clock and use a clearly test-only sub-minute smoke without sleeping.

## State and troubleshooting

Default state locations:

- macOS: `~/Library/Application Support/open-clowk`
- Linux: `${XDG_STATE_HOME:-~/.local/state}/open-clowk`
- Windows: `%LOCALAPPDATA%\open-clowk`

Use `OPEN_CLOWK_STATE_DIR` for isolated tests. If `status` shows a detection error, confirm `ps` (macOS/Linux) or `tasklist.exe` (Windows) is available. If the page cannot open, confirm `open`, `xdg-open`, or `rundll32.exe` can launch your default browser. Open Clowk does not request broader permissions as a fallback.

## Development

```sh
npm ci
npm test
npm run package:check
npm run check
npm run publish:dry-run
```

The package canary packs the exact tarball, checks its allowlist and executable, performs a publish dry-run, installs into a temporary global prefix with temporary home/app-data/state, starts the real detached monitor in explicit test mode, observes the automatic loopback page, exercises an action, stops cleanly, uninstalls, and reinstalls the same tarball.

## License

MIT © 2026 Jourdan Lucente.
