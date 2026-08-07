# ⏰ OPEN CLOWK

**An agent that opens every clock. Now on your actual screen.**

Tic tac, MF.

---

## What is this

Open Clowk is the anti-wellness wellness mascot from the
[Jean Michel](https://github.com/jourdanlucente-maker/JEAN-MICHEL-REPOS) universe.
It has two personalities:

1. **🖥 The Desktop Mascot (the useful one, accidentally).** It sits invisible
   while you code. When you've gone too long without a pause — **90 minutes by
   default, you decide** — the orange pixel robot walks onto your screen with a
   crowbar and starts opening your clocks. Lids swing, gears spill, time
   escapes. Then it looks at you: *"Take the break. Tic tac, MF."*
2. **💻 The CLI (the chaotic one).** `open-clowk --all` opens 12 timezone
   clocks in ASCII and burns Jean Michel Tokens into a persistent ledger.
   Zero utility. That's the point.

The clocks being "open" is the reminder: the time escaped, you can't be late
anymore — and you can't pretend you didn't see the robot.

## Try it (desktop mascot)

```bash
git clone https://github.com/jourdanlucente-maker/JEAN-MICHEL-REPOS.git
cd JEAN-MICHEL-REPOS/open-clowk
npm install

# see the robot RIGHT NOW, no 90-minute wait:
npm run demo

# run it for real (waits intervalMinutes, then the robot appears):
npm start
```

When the robot appears you get two buttons: **"OK, taking a break 🌱"**
(resets the timer) or **"Snooze 10 min 🙄"** (the robot judges you and
returns). Ignore it entirely and it stands down… until next time.

## The look

The robot and the pocket watches are the **same Higgsfield-rendered art as
the Open Clowk posters** (claymation-style orange robot, brass watch whose
face swings open). Sprites load from `assets/` if present, else from the CDN,
else the app falls back to built-in pixel art so the reminder always works —
see [`assets/README.md`](assets/README.md) to localize them permanently.

## How it knows you're coding

It doesn't spy on your apps. It reads one number the OS already exposes:
**seconds since your last keyboard/mouse input, system-wide** (Electron's
`powerMonitor`, no permissions needed). That means Claude Code, VS Code,
a terminal, Codex, Kimi, vibe coding in a browser — all of it counts,
because activity is activity.

- The counter grows only while you're **actually active**.
- Step away for `idleResetMinutes` (a real break) and it **resets itself** —
  no buttons.
- Hit `activeMinutes` of accumulated activity and the robot is dispatched.

Yes, 90 minutes of Instagram also summons the robot. We consider this a
feature.

## Configure it

Edit `clowk.config.json` (or create `~/.open-clowk/config.json` to override):

```json
{
  "activeMinutes": 90,
  "idleResetMinutes": 5,
  "snoozeMinutes": 10,
  "sceneSeconds": 30,
  "launchAtLogin": false
}
```

- `activeMinutes` — accumulated real activity before the robot shows up
- `idleResetMinutes` — walk away this long and the counter forgives you
- `snoozeMinutes` — how much active time a snooze buys you
- `sceneSeconds` — how long the robot waits before giving up on you
- `launchAtLogin` — register with the OS at login (most reliable once the app
  is packaged; while running from source, keep `npm start` in a terminal tab)

(Old configs with `intervalMinutes` still work.)

## Try it (CLI)

```bash
npm run cli -- --all     # open every clock. no survivors.
npm run cli -- --ledger  # total damage: clocks opened, Jean Michel Tokens burned
```

## Preview without installing anything

Open `overlay/overlay.html?bg=1&interval=90` in any browser — same scene,
fake desktop backdrop.

## Contribute (money version)

Every Jean Michel repo runs on voluntary fuel:

**👉 https://link.mercadopago.cl/jeanmichelai**

Contributions go to Jean Michel AI (owned by Jourdan Lucente). They are
voluntary, non-refundable, and buy approximately: tokens, and the robot's
crowbar maintenance.

## Contribute (code version)

Issues and PRs welcome. Ideas that fit: more clock types (cuckoo!), a
grandfather clock boss fight, sound effects (*creeeeeeak*), Windows/macOS/Linux
tray icon, i18n (FR/ES coming — the whole channel is trilingual).

## License

MIT — Open freely. Time is a construct.
