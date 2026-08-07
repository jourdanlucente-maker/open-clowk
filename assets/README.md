# Open Clowk sprites

The overlay uses the official poster-grade sprites (same robot and pocket
watch as the Open Clowk carousel, rendered with Higgsfield, backgrounds
removed). It loads them in this order:

1. **This folder** — `robot.png`, `watch-face.png`, `watch-open.png`
2. **CDN** — the URLs below (used automatically if this folder is empty)
3. **Built-in CSS pixel art** — offline fallback, so the reminder always works

To make the app fully offline/permanent, download the three files into this
folder with these exact names:

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

(The sprite files aren't committed because this build environment can't reach
the CDN — first machine that runs the curl above can commit them.)
