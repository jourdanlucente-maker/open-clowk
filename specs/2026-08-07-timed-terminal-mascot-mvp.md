# Open Clowk — Timed Terminal Mascot MVP

## Problem
Terminal and IDE users lose track of time during long sessions. Open Clowk should interrupt them at a chosen interval with a funny native mascot—not monitor general idle time or redirect them into a browser.

## User
A developer using terminals, Codex/Claude Code, or a common IDE on macOS, Windows, or Linux who wants a lightweight recurring break reminder.

## Acceptance criteria

- [ ] A native setup window lets the user choose a reminder interval and one or more detected supported targets: Terminal.app, Windows Terminal, WezTerm, GNOME Terminal, Konsole, Cursor, VS Code, Visual Studio, Codex, and Claude Code; unavailable targets are clearly identified rather than silently accepted.
- [ ] Clicking **Launch** starts a local background timer. At each interval, the transparent always-on-top mascot appears only when a selected host application is frontmost; Codex/Claude targeting additionally requires that selected executable to be running.
- [ ] Every intervention offers exactly three actions: **Take a break** starts a five-minute countdown and then resumes the original interval; **Ignore** dismisses it and restarts the interval; **Shut down** quits only Open Clowk and never closes or modifies the selected terminal, IDE, or agent session.
- [ ] The program reads only selected application identity and, for Codex/Claude, executable name. It never records or inspects arguments, commands, text, keystrokes, clicks, terminal contents, window titles, files, screen images, audio, network contents, or user activity history.
- [ ] The native behavior is verified on macOS, Windows, and Linux. Unsupported Linux display environments or missing foreground-app capabilities produce a clear compatibility message; they never fall back to a browser or silently trigger globally.

## Out of scope

- ✗ Browser pages, loopback servers, OS URL openers, browser previews, or browser fallbacks.
- ✗ Injecting text or commands into terminals, editing shell configuration, or installing Codex/Claude hooks.
- ✗ Reading process arguments, prompts, command history, terminal output, window titles, files, screen pixels, audio, or network traffic.
- ✗ Closing, pausing, killing, or modifying any selected terminal, IDE, Codex, or Claude session.
- ✗ Arbitrary-application targeting beyond the supported terminal/IDE list in this first cut.
- ✗ Configurable break lengths, streaks, analytics, accounts, sync, telemetry, cloud services, or launch-at-login.
- ✗ Public release, sprite redistribution, app-store submission, signing, notarization, or production installer publication; those remain separate approvals.

> **2026-08-08 — partial supersession of the last bullet.** The wording above
> is preserved as the 2026-08-07 approval record. On 2026-08-08 the captain
> approved exactly one of those separate approvals: **public developer source
> distribution from the repository, plus the reviewed root `install.sh`**.
> Binary packaging, signing/notarization, npm publication, GitHub binary
> releases, sprite publication/redistribution, launch at login, and broader
> release work remain unauthorized. Current authority lives in
> [`README.md` → Distribution status](../README.md#distribution-status) and
> [`AGENTS.md`](../AGENTS.md); this spec is not the place to look up
> distribution state.

## Smallest shippable version
A private native Electron build with one interval control, a supported-target checklist, one **Launch** button, the existing mascot overlay, and the three intervention actions. Preferences may persist locally, but the app starts only when the user launches it.

## Kill criteria
Stop and simplify target-specific detection if application-identity/executable-name-only methods cannot trigger reliably on at least one default terminal and one supported IDE per operating system without broader monitoring permissions or content access.
