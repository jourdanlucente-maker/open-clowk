# Open Clowk asset provenance

The packaged WebP files are optimized local derivatives of captain-owned Open Clowk artwork referenced by the read-only legacy source at commit `186619db09e3d8d693b90f7a38fae079bec0775b`, file `open-clowk/assets/README.md`.

| Packaged file | Legacy source URL SHA-256 | Transformation |
|---|---|---|
| `assets/robot-crowbar.webp` | `98a52a05c22fc1e2a61bf5e550e5f423941249bd211ba419e0d67f242e219bf5` | 1024×1024 PNG → 768×768 WebP, quality 82 |
| `assets/watch-open.webp` | `1296ddc8e6f806c99045f504d3540f9a9054dcdcf57ddc6f241ae6c48b6f3c1c` | 1024×1024 PNG → 768×768 WebP, quality 82 |

The source URLs are not present in runtime code or the packed payload. The break page uses `object-fit: contain`; the robot, full crowbar, open clock, gears, and HTML title are never intentionally cropped.
