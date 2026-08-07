# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- The approved product contract and scope boundary live in `specs/2026-08-06-open-clowk-break-intervention.md`.
- Run `npm run check` before delivery; `scripts/package-canary.js` is the authoritative isolated packed-artifact and detached-monitor smoke.
- Keep process observation behind `lib/platform.js`, state behind `lib/config.js`, and timing semantics deterministic in `lib/tracker.js`.
- Preserve the exact privacy boundary in `README.md`: process names only, packaged assets, authenticated loopback actions, and no coercive process behavior.
- npm publication, merge, release, login persistence, real-user installation, and Instagram changes are separate captain gates.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
