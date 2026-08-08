# ⏰ OPEN CLOWK

**A timed break mascot for people who live in the terminal.**

Tic tac, MF.

---

## What is this

Open Clowk is the anti-wellness wellness mascot from the
[Jean Michel](https://github.com/jourdanlucente-maker/JEAN-MICHEL-REPOS) universe.
It has two personalities:

1. **🖥 The Desktop Mascot (the useful one, accidentally).** You pick a
   reminder interval and the terminals/IDEs you work in. Every interval, the
   orange pixel robot walks onto your screen with a crowbar and opens your
   clocks — **but only while one of your chosen apps is frontmost**. It
   never interrupts you in another app, and it never opens a browser.
2. **💻 The CLI (the chaotic one).** `open-clowk --all` opens 12 timezone
   clocks in ASCII and burns Jean Michel Tokens into a persistent ledger.
   Zero utility. That's the point.

The clocks being "open" is the reminder: the time escaped, you can't be late
anymore — and you can't pretend you didn't see the robot.

## Try it (desktop mascot)

Open Clowk runs from source. This is currently the **only** supported way to
run it — there is no npm package, no DMG, no binary release (see
[Distribution status](#distribution-status)).

```bash
git clone https://github.com/jourdanlucente-maker/open-clowk.git
cd open-clowk
npm install
npm start
```

A native **setup window** opens (never a browser page):

1. **Reminder interval** — default 30 minutes; a whole number from 1 to 1440
   (24 hours). For a quick test, set 1 minute.
2. **Targets** — a checklist of supported apps, detected honestly:
   Terminal.app, Windows Terminal, WezTerm, GNOME Terminal, Konsole, Cursor,
   VS Code, Visual Studio, Codex, Claude Code. Detection asks two questions
   only: is the app's bundle where macOS keeps it, and is a process with the
   app's own executable name running. Platforms a target doesn't support are
   shown as such, and an app is called *not installed* only where that can
   actually be checked — on Windows and Linux, where it can't, an app that
   isn't running says so and stays selectable. Pick at least one.
3. **Launch** — arms the timer and closes the setup window.

At each interval the transparent, frameless, always-on-top mascot appears —
only while a selected target is frontmost (Codex/Claude additionally require
their executable to be running). If you've switched away, the intervention
stays pending and shows the moment you come back.

An intervention is **two layers**, and the split is deliberate:

1. **The mascot layer** — display-sized, showing the robot walking in and
   opening your clocks. It is created non-focusable and fully click-through,
   so it never takes a click or a keystroke from the terminal underneath. It
   is decoration: it is loaded without a preload script, so it has no bridge
   to the app and cannot send anything.
2. **The control card** — a small window in the bottom-right corner that
   carries the actions. It is an ordinary hit-tested window, so its buttons
   work on every platform and keep working after you click back into your
   terminal.

The card is there from the first frame: you never have to wait out the
animation to dismiss an intervention. Every intervention offers exactly three
actions:

- **Take a break 🌱** — a visible five-minute countdown runs on the card,
  then both layers dismiss and the original interval restarts.
- **Ignore 🙄** — dismisses immediately and restarts the full interval.
- **Shut down ✕** — quits Open Clowk. Only Open Clowk. It never closes,
  pauses, kills, injects into, or modifies your terminal, IDE, Codex, or
  Claude session.

During a break the card keeps a **Resume now** button on screen for the whole
five minutes, so ending it early never depends on the intervention holding
keyboard focus. Resume now resolves the break already running — it is not a
fourth action.

If you pick a Codex/Claude target *together with* host apps, only those hosts
count: **Claude Code + VS Code** never triggers in Terminal.app. Pick an agent
on its own and any supported host counts, otherwise it could never trigger.

Preferences persist locally (`~/.open-clowk/prefs.json`). The app starts only
when you launch it — no login persistence, no global install.

Only one Open Clowk runs at a time; starting it again reopens the running
instance's setup window (as does clicking its dock/taskbar icon), where you
can **Relaunch** with new settings or **Quit Open Clowk**.

## Known limits (deliberate, first cut)

- **Both layers appear on the primary display only.** If your selected target
  is frontmost on a secondary monitor, the mascot and the control card still
  appear on the primary one. This is an accepted owner decision for this cut,
  not an oversight — the window contract is pinned by
  `test/window-contract.test.js`. Multi-display placement is a separate
  decision.
- **No tray icon.** The setup window is the only surface: reopen it by
  starting Open Clowk again or via its dock/taskbar icon.
- **No keyboard shortcut dismisses an intervention.** Neither layer takes
  keyboard focus, by design, so the pointer is the way — which is why the
  card's buttons are always visible rather than hidden behind the animation
  or a countdown. Open Clowk registers no global shortcut and captures no
  keystrokes (`test/no-browser-static.test.js` enforces it).

## Platform support

- **macOS** — verified. The first foreground check asks for one-time
  Automation consent for System Events; it returns the frontmost app's
  **name** and nothing else. If that consent is denied or later revoked, the
  frontmost probe stops answering — Open Clowk says so in the setup window
  instead of running mute forever.
- **Windows / Linux (X11)** — adapters included (process-name-only probes),
  exercised through fixtures in the test suite but **not yet verified on
  real Windows/Linux machines**. Honest status, no claims.
- **Linux/Wayland** — clearly reported as unsupported. No browser fallback,
  no global reminder.

## The look

The robot and the pocket watches are the **same Higgsfield-rendered art as
the Open Clowk posters**. Sprites load in three tiers: local `assets/*.png`
(not committed — see the policy in [`assets/README.md`](assets/README.md)),
a user-scoped CDN, and built-in CSS pixel art that always works offline. Any
miss falls back to CSS art for the whole scene; the offline path is covered
by `test/overlay-dom.test.js`.

## What it knows about you

Almost nothing, on purpose. Open Clowk reads:

- the **frontmost application's name** (to know whether a selected target is
  in front) — read only when an interval is actually due, never on a
  background timer for the life of the app, and
- whether a process with a **supported target's executable name** is running:
  the whole list at setup, so the checklist is honest, and afterwards only
  `codex`/`claude` for the agent targets you selected.

It never records or inspects arguments, commands, prompts, terminal
contents, window titles, keystrokes, clicks, files, screen images, audio,
network contents, or activity history. No telemetry, no account, no cloud
service. See [`SECURITY.md`](SECURITY.md); the boundary is enforced by
`test/no-browser-static.test.js`.

## Try it (CLI)

```bash
npm run cli -- --all     # open every clock. no survivors.
npm run cli -- --ledger  # total damage: clocks opened, Jean Michel Tokens burned
```

## Distribution status

Unresolved, deliberately. There is **no** published npm package, no DMG, no
signed binary, and no release of any kind. `npm install -g open-clowk` is
**not** a supported installation path (an old marketing artifact claimed it;
that claim was and remains wrong). The distribution format is an open owner
decision — nothing here may be published, packaged, signed, or released
until it is made.

## Provenance

The product tree was imported byte-for-byte from `open-clowk/` at commit
`186619db09e3d8d693b90f7a38fae079bec0775b` (tree
`3c219a82c84723701b8187462748395c0e4d00ea`) of the read-only source
repository `JEAN-MICHEL-REPOS`, then rebuilt as the timed-terminal mascot
per the captain-approved spec ([`specs/2026-08-07-timed-terminal-mascot-mvp.md`](specs/2026-08-07-timed-terminal-mascot-mvp.md)).
Receipt, pinned preservation refs, and the full list of post-import changes:
[`MIGRATION.md`](MIGRATION.md).

## Tests

```bash
npm test
```

Headless and deterministic: reminder state machine, target matching,
platform adapters (fixtures), the full setup→launch→intervention cycle
through an injected Electron, overlay scene + countdown DOM, static
no-browser/privacy guards, CLI version agreement. No window opens, no
socket binds, no permission is requested.

## Contribute (money version)

Every Jean Michel repo runs on voluntary fuel:

**👉 https://link.mercadopago.cl/jeanmichelai**

Contributions go to Jean Michel AI (owned by Jourdan Lucente). They are
voluntary, non-refundable, and buy approximately: tokens, and the robot's
crowbar maintenance.

## License

MIT — Open freely. Time is a construct.
