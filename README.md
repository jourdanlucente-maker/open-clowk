# ⏰ OPEN CLOWK

**A timed break mascot for people who live in the terminal.**

Tic tac, MF.

---

## Install and run

Open Clowk is a **developer source install**, not a packaged consumer app. The
shareable social link is the public repository itself:

**https://github.com/jourdanlucente-maker/open-clowk**

You need macOS or Linux/X11, Node.js 18 or newer, npm, and a terminal. The
installer validates these prerequisites before installing dependencies. It
does not use `sudo`, install a package manager, create a global npm install,
add login persistence, or hide the commands it runs.

### Transparent manual install

With Git installed:

```sh
git clone https://github.com/jourdanlucente-maker/open-clowk.git
cd open-clowk
node --version  # must be v18 or newer
npm --version
npm ci
npm start
```

Without Git, download the official
[`main` source archive](https://github.com/jourdanlucente-maker/open-clowk/archive/refs/heads/main.tar.gz),
unpack it, enter the extracted `open-clowk-main` directory, verify Node/npm as
above, then run `npm ci` and `npm start`.

### Reviewed installer: inspect first

The safer convenience path downloads the repository's [`install.sh`](install.sh)
so you can read the exact script before running it:

```sh
curl -fsSL https://raw.githubusercontent.com/jourdanlucente-maker/open-clowk/main/install.sh -o /tmp/open-clowk-install.sh
less /tmp/open-clowk-install.sh
bash /tmp/open-clowk-install.sh
```

By default it places source in `~/.local/share/open-clowk/source`. Override
that user-owned destination for one run with, for example:

```sh
OPEN_CLOWK_SOURCE_DIR="$HOME/src/open-clowk" bash /tmp/open-clowk-install.sh
```

The script uses Git when available. Without Git it downloads GitHub's official
`main` source archive with `curl`. It validates Node 18+ and npm first, runs
`npm ci`, then launches an attached `npm start`; closing the app or pressing
Ctrl-C returns control to that terminal. Every consequential command is shown
before it runs.

### Fast path (`curl | bash`)

```sh
curl -fsSL https://raw.githubusercontent.com/jourdanlucente-maker/open-clowk/main/install.sh | bash
```

This is faster, but it executes the current repository script without giving
you a review pause. Use the inspect-first sequence if that trust tradeoff is
not acceptable.

### Reruns, updates, and recovery

On rerun, the installer updates only a recognized, clean Open Clowk Git
checkout, using `fetch` plus a fast-forward-only merge before another
`npm ci`. "Recognized" means this repository's own GitHub origin, over HTTPS
(`https://github.com/jourdanlucente-maker/open-clowk`) or SSH
(`git@github.com:jourdanlucente-maker/open-clowk`), with or without a `.git`
suffix or trailing slash — any other origin is refused. It also refuses an
unknown destination, a checkout with local changes, or an existing archive
install. It never overwrites, deletes, resets, stashes, or pulls through those
directories. Move the directory aside, choose a new `OPEN_CLOWK_SOURCE_DIR`,
or resolve local Git changes yourself and rerun.

If Node is missing or older than 18, the script can offer `brew install node`
only when Homebrew already exists and it can open your controlling terminal.
That channel is hard-wired to `/dev/tty` and verified to be a real terminal:
the prompt is printed there and your typed answer is read back from there.
No environment variable, flag, redirected file, or piped stdin can supply that
answer — which is also why the `curl | bash` path can still ask you. Declining,
running with no controlling terminal, or having no Homebrew stops with a direct
Node.js download link and leaves system packages unchanged. If you accept and Homebrew then
fails, the script says so and reports Homebrew's exit status rather than
claiming nothing changed. It never installs Homebrew or nvm, runs a
third-party installer, writes a shell profile, or uses `sudo`. If `npm ci`
fails, fix the reported dependency/network problem and rerun; the app is not
launched after a failed install.

On macOS, the first foreground check asks for Automation permission to read
the frontmost application's **name** through System Events; denying it prevents
targeted reminders and is reported in the setup window. Linux support is X11
only: Wayland is detected and refused, with no fallback. Be aware that **only
macOS is runtime-verified**: the Linux/X11 adapter this installer sets up, like
the Windows one, is **fixture-tested only**, with no claim of real Linux or
Windows runtime evidence. Windows additionally has no install script here.

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

## Run the desktop mascot

After the source install above, a native **setup window** opens (never a
browser page):

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
The agent check is an exact match on the CLI's own name, so having Anthropic's
`Claude` desktop app open is not the same as having a Claude Code session
running — only the latter satisfies the target.

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
- **A lost frontmost capability is reported at the first due interval, not
  seconds after Launch.** Open Clowk reads the frontmost application only when
  an interval comes due (and then on the pending cadence until a selected
  target is in front), so it does not burn battery probing a machine nobody is
  waiting on. The trade is that if macOS Automation consent is denied or
  revoked, the setup window says so at the first due interval — 30 minutes by
  default, up to 24 hours at the longest interval — and until then the app
  looks armed while no intervention can appear. The reporting itself is
  unchanged and covered by `test/window-contract.test.js`; the schedule is a
  deliberate owner decision.
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

Developer source distribution from this public repository is the accepted
path. There is **no** published npm package, DMG, signed/notarized app, or
GitHub binary release. `npm install -g open-clowk` is **not** supported (an old
marketing artifact claimed it; that claim was and remains wrong). Binary
packaging, signing/notarization, npm publication, GitHub binary releases,
launch at login, and broader release work remain separately unauthorized.

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
