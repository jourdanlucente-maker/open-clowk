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

- CLI banner fixed to agree with `package.json` at `2.0.0`.
- Acceptance test suite added (window contract, no-browser path, overlay DOM, offline CSS-art, demo/persistence).
- Documentation updated (README, SECURITY, provenance).
- Project `AGENTS.md` added.

## Open captain decisions (not resolved here)

Sprite redistribution (the three Higgsfield PNGs stay uncommitted), distribution shape,
npm name, PR #1 fate, launch-at-login feature, and parent-repo reconciliation remain
captain decisions. Nothing here publishes, packages, signs, or releases anything.
