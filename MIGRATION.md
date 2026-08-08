# Open Clowk — standalone-project migration receipt

## Import provenance

Open Clowk was imported into this repository as a **non-destructive clean-tree import** on 2026-08-07.
No history was grafted, rewritten, or merged from the source repository.

| | |
|---|---|
| Source repository (read-only) | `JEAN-MICHEL-REPOS` (`INCUBADOR-IA/PRODUCTS/Jean Michel IA/`) |
| Source commit | `186619db09e3d8d693b90f7a38fae079bec0775b` (branch `claude/jean-michel-social-posts-p9ymf3`, HEAD) |
| Source subtree | `open-clowk/` |
| Source tree | `3c219a82c84723701b8187462748395c0e4d00ea` (14 tracked files) |
| Export method | `git archive 186619db09e3d8d693b90f7a38fae079bec0775b:open-clowk` (immutable object read) |
| Verification | every imported file's git blob hash matches the source tree exactly (byte-for-byte) |

The full evidence trail is the diagnosis report that authorized this import
(`open-clowk-canonical-source-diagnosis`, 2026-08-07) plus the captain's product decision of the same date.

## Preservation boundaries (pinned 2026-08-07)

These refs were verified reachable before the import and must not be rewritten,
moved, deleted, merged, or used as a base for this product line:

| Ref | Pinned commit |
|---|---|
| `main` | `71a87e4a140711b3c832cf227a72815f930b9ae6` |
| Obsolete PR #1 head (`fm/open-clowk-break-intervention-review-retry`) | `5827d2d97dcb64083c6427dd974be572e4c9a03e` |
| `archive/open-clowk-obsolete-cli-rc-20260806` | `4f54b4398494e092b8257c8e3ce1105737ce0beb` |

The obsolete PR #1 candidate (loopback-HTTP/browser-tab intervention) is **not** Open Clowk
and none of its code, assets (WebP sprite derivatives), or history is part of this product.

## Post-import changes

Every change after the import commit is a separate, reviewable commit:

- `6834c13` — CLI banner fixed to derive its version from `package.json` (`2.0.0`).
- `bfd7efa` — captain-approved timed-terminal mascot MVP spec committed under `specs/`.
- `09a988b` — timed-terminal MVP implemented per that spec: native setup window
  (interval + supported-target checklist + Launch), reminder state machine,
  least-information platform adapters, three exact intervention actions
  (Take a break / Ignore / Shut down), external-close bug fix. This
  **supersedes** the idle-time-only contract: the idle tracker, its config,
  its tests, and the `--demo` mode were removed.
- `836fa11` — deterministic acceptance suite for the timed MVP.
- `0ae7a4e` — documentation rewritten for the timed MVP (README, `SECURITY.md`,
  `assets/README.md` as the single sprite policy) and project `AGENTS.md`
  (+ `CLAUDE.md` symlink) added.
- `08a9b06` — `package-lock.json` committed so a clean clone installs the same
  Electron dev dependency tree.
- `5a6761f` — review hardening: overlay input, frontmost-probe failures
  surfaced as a compatibility message instead of running mute, enforced
  interval bounds (1–1440 minutes), and non-overlapping polling.
- `b9ce029` — the intervention became **two** windows: a click-through,
  non-focusable mascot layer (`overlay/overlay.*`) plus a hit-tested control
  card (`overlay/control.*`) that carries the three actions and **Resume now**.
- `a44e0a9` — review fixes: `hidden`-attribute override, control-card
  clipping, and speech-bubble overlap.
- `544c6bb` — mascot poses derived from the control card's geometry (passed in
  from the main process) and the entrance moved to the left, so no pose plays
  out behind the card.
- `a64f98d` — this post-import commit list completed and `AGENTS.md` tidied.
- `490927c` — minimal headless GitHub Actions workflow
  (`.github/workflows/test.yml`: `npm install` + `npm test`, Ubuntu, Node 22)
  so the pull request carries a real status check. No product change.
- `a4296d8` — review corrections: availability detection now resolves the
  whole supported executable-name set for the platform (every promised
  Windows/Linux terminal and IDE is selectable when running, and a platform
  with no install probe no longer claims an app is absent); the lifetime
  two-second frontmost poll is gone — the reminder probes only when an
  interval is due and then on its bounded pending cadence; the display-sized
  mascot layer lost its preload/IPC bridge; workflow least-privilege
  permissions and de-duplicated triggers; documentation matched to the exact
  probe scope.
- `890d847` — the POSIX executable check matches the whole name
  case-insensitively (`pgrep -xi`), so a real `Cursor`/`Code` binary is found
  from the normalized target name, and the setup checklist's probes run
  concurrently instead of one adapter timeout after another.
- `b22c454` — case folding scoped to application availability only: the
  `codex`/`claude` gate matches exactly (`exeMatchIsCaseSensitive` in
  `electron/targets.js` owns that decision), so the `Claude` desktop
  application cannot satisfy a selected Claude Code target.
- *(this commit)* — documentation matched to the final review round: this
  commit list split back into one entry per commit, and `SECURITY.md`'s
  examples of probed executable names written as the normalized names the
  adapters actually receive.

### Superseded idle-time line (archived, not part of this branch)

An earlier idle-time acceptance/docs line plus its pipeline review fixes
(`29797bf`, `da2bd61`, `5a8f784`, `6f08746`, `5cd8b0f`, `3870b26`) was
invalidated by the captain's product clarification. It is preserved
byte-for-byte at local ref `archive/open-clowk-idle-import-pre-supersession-20260807`
(commit `3870b26e0c1952883e20280a618a07c398375779`) and is deliberately
**not** in this branch's history. Its sprite-policy wording (captain's
Option A) was re-implemented fresh in `assets/README.md`.

## Open captain decisions (not resolved here)

Sprite redistribution (policy owned by `assets/README.md`), distribution shape,
npm name, PR #1 fate, and parent-repo reconciliation remain
captain decisions. Nothing here publishes, packages, signs, or releases anything.
