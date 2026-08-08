# Open Clowk sprites

The overlay uses the official poster-grade sprites (same robot and pocket
watch as the Open Clowk carousel, rendered with Higgsfield, backgrounds
removed). It loads them in this order:

1. **This folder** — `robot.png`, `watch-face.png`, `watch-open.png`
2. **CDN** — the URLs below (used automatically if this folder is empty)
3. **Built-in CSS pixel art** — offline fallback, so the reminder always works

## Sprite policy (the single authoritative copy)

- **Private local use is fine.** You may download the three PNGs onto your
  own machine, into this folder, for your own local runs — the working tree
  is exactly where the local tier reads from. `.gitignore` blocks
  `assets/*.png` and `assets/*.webp`, so a personal download cannot be
  staged or committed by accident.
- **Redistribution is not allowed without an explicit owner decision.** Do
  not commit, convert, package, publish, or redistribute the PNGs — no Git
  history, no npm package, no binary, no DMG, no release payload. Do not
  substitute the obsolete PR #1 WebP derivatives either; they belong to a
  different, rejected product.
- **The CDN is a convenience, not a contract.** The URLs below are
  user-scoped (`user_39GrJSxSPVFsFnh94GJ8Kef3kcI`) Higgsfield CloudFront
  links; they work today and could vanish. The CSS-art tier guarantees the
  scene works with zero assets and zero network.

Other docs (README, SECURITY, AGENTS.md, MIGRATION.md) point here instead of
restating this policy.

## Local download (private use only)

| File | URL |
|---|---|
| `robot.png` | https://d8j0ntlcm91z4.cloudfront.net/user_39GrJSxSPVFsFnh94GJ8Kef3kcI/hf_20260727_183627_da82ab5d-ddbe-4b39-8a44-8a34d71e7777.png |
| `watch-face.png` | https://d8j0ntlcm91z4.cloudfront.net/user_39GrJSxSPVFsFnh94GJ8Kef3kcI/hf_20260727_183630_1c5fe4c2-dd97-4f94-a398-f5222ef2e1d8.png |
| `watch-open.png` | https://d8j0ntlcm91z4.cloudfront.net/user_39GrJSxSPVFsFnh94GJ8Kef3kcI/hf_20260727_183633_d9603648-92cd-42a6-b935-4e905113f441.png |

One-liner:

```bash
cd open-clowk/assets
curl -o robot.png "https://d8j0ntlcm91z4.cloudfront.net/user_39GrJSxSPVFsFnh94GJ8Kef3kcI/hf_20260727_183627_da82ab5d-ddbe-4b39-8a44-8a34d71e7777.png" \
  -o watch-face.png "https://d8j0ntlcm91z4.cloudfront.net/user_39GrJSxSPVFsFnh94GJ8Kef3kcI/hf_20260727_183630_1c5fe4c2-dd97-4f94-a398-f5222ef2e1d8.png" \
  -o watch-open.png "https://d8j0ntlcm91z4.cloudfront.net/user_39GrJSxSPVFsFnh94GJ8Kef3kcI/hf_20260727_183633_d9603648-92cd-42a6-b935-4e905113f441.png"
```
