# Open Clowk configurable break intervention

**Date:** 2026-08-06
**Status:** Captain-approved replacement contract

## Problem

CLI users lose track of time; the current package concept only opens virtual clocks manually and does not notice prolonged terminal use or offer a break.

## User

A developer who chooses the CLI or terminal processes they use and wants a configurable, private on-screen break intervention after sustained use.

## Acceptance criteria

1. The user can configure whole-minute thresholds of at least one minute and select preset or custom process names to monitor.
2. A private monitor counts consecutive wall-clock time only while a selected process is open, using bounded local state without inspecting input, commands, terminal contents, files, prompts, or network activity.
3. At the threshold, an automatic local robot/open-clock screen offers non-coercive **Take a break**, **Snooze**, and **Keep going** actions without killing or blocking processes.
4. Packed installation plus `setup`, `detect`, `start`, `stop`, and `status` have deterministic automated evidence and an isolated five-minute human-acceptance procedure.
5. The Node 20/22 package is safe across supported macOS, Linux, and Windows behavior, with no captured content, runtime network dependency, telemetry, elevated privilege, or forced process action.

## Out of scope

Login startup; an npm postinstall daemon; a native or Electron application; keyboard or terminal-content monitoring; cloud services, accounts, or analytics; forced process termination; npm publication; merge or release; and Instagram modification or posting.

## Smallest shippable version

Install the package, run setup with a five-minute threshold and selected terminal or CLI, start the monitor, and automatically receive the local break screen after five consecutive minutes.

## Kill criterion

Stop if reliable selected-process monitoring or local display requires invasive permissions, content capture, elevated privilege, or a materially larger native application.
