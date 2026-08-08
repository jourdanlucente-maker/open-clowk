# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Product identity (hard boundary)

Open Clowk is a **timed terminal/IDE break mascot**: a native Electron setup
window (interval + supported-target checklist + Launch, never a browser)
arms a timer; at each interval a transparent, frameless, always-on-top
(screen-saver level) overlay appears **only while a selected target is
frontmost** (Codex/Claude additionally require the executable NAME running).
Interventions offer exactly Take a break (visible 5:00 countdown) / Ignore /
Shut down (quits Open Clowk only). The approved spec is
`specs/2026-08-07-timed-terminal-mascot-mvp.md`. A browser page, loopback
server, OS URL opener, global (non-targeted) trigger, or any browser
fallback/preview is a build failure — `test/no-browser-static.test.js` and
`test/window-contract.test.js` enforce this.

## Sharp edges

- Privacy boundary: frontmost app NAME and Codex/Claude executable NAMES
  only. Never arguments, command lines, prompts, terminal contents, window
  titles, keystrokes, files, screen pixels, audio, or network contents; no
  telemetry; no convenience dependency that reads those fields (see
  `SECURITY.md`). Idle-time tracking (`powerMonitor`) was the superseded
  contract — do not reintroduce it.
- Never close/kill/inject into a selected terminal, IDE, Codex, or Claude
  session; Shut down quits only Open Clowk.
- No login persistence, no global install; prefs live in
  `~/.open-clowk/prefs.json`.
- Sprite policy is owned by `assets/README.md` (private local download OK —
  gitignored; no commit/convert/package/publish/redistribute; no PR #1
  WebP). Point to it; do not restate it.
- `npm test` must stay headless and deterministic: no real window, socket,
  screen/audio capture, or permission prompts. Windows/Linux adapters are
  fixture-tested only — never claim real runtime proof there.
- Do not publish, package, sign, or release anything. Never rewrite `main`,
  touch obsolete PR #1 or the archive refs (pinned in `MIGRATION.md`), and
  never mutate the read-only source repo `JEAN-MICHEL-REPOS`.


## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
