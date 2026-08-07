# Changelog

## 0.1.0 — replacement release candidate

- Add configurable whole-minute thresholds and preset/custom watched process names.
- Add private process-name detection and one detached per-user monitor.
- Add automatic local robot/open-clock break intervention with Take a break, Snooze, and Keep going.
- Add deterministic five-minute tracking tests, an isolated detached-monitor smoke, packed-artifact validation, and a six-leg Node/OS CI matrix.
- Open the break page with a single-use bootstrap credential exchanged for a short-lived `HttpOnly`, `SameSite=Strict` loopback session cookie, so the page reloads while the intervention is unresolved and no reusable credential lands in a launcher command line.
- Sample process names asynchronously, reclaim monitor locks and runtime state by owning-process liveness, write runtime state atomically, guard page and asset I/O, and retry plus report a failed break page launch instead of losing the intervention.

Known scope boundary: 0.1.0 counts wall-clock time across system sleep; suspend/resume handling is deliberately out of scope.

The package is not yet published to npm.
