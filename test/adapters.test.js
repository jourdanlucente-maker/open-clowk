/* Platform adapters through injected fixtures: macOS frontmost app name,
 * executable-name-only process checks, Windows/Linux command shapes, and the
 * honest unsupported-Wayland message. No real system calls are made.
 *
 * Run: node test/adapters.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createAdapter, WAYLAND_MESSAGE } = require('../electron/adapters');

function fixtureExec(map) {
  const calls = [];
  const exec = (file, args, _opts, cb) => {
    calls.push([file, ...args].join(' '));
    const key = [file, ...args].join(' ');
    const hit = Object.entries(map).find(([k]) => key.includes(k));
    cb(hit ? null : new Error('fixture: no match'), hit ? hit[1] : '');
  };
  exec.calls = calls;
  return exec;
}

// --- macOS: frontmost app NAME only; executable-name-only checks -------------
{
  const exec = fixtureExec({
    osascript: 'Terminal\n',
    'pgrep -xi codex': '12345\n',
  });
  const adapter = createAdapter({ platform: 'darwin', exec });
  assert.strictEqual(adapter.supported, true);
  assert.strictEqual(adapter.canProbeInstall, true, 'macOS can check bundle presence');
  (async () => {
    assert.strictEqual(await adapter.frontmost(), 'Terminal', 'frontmost returns the app name only');
    assert.ok(exec.calls[0].includes('name of first application process'), 'queries the name field only');
    assert.ok(!/title|position|bounds|miniaturized/i.test(exec.calls[0]), 'never reads window properties');
    assert.strictEqual(await adapter.execRunning('codex'), true, 'running executable detected by name');
    assert.strictEqual(await adapter.execRunning('claude'), false, 'absent executable reported');
    assert.deepStrictEqual(
      exec.calls.filter((c) => c.startsWith('pgrep')),
      ['pgrep -xi codex', 'pgrep -xi claude'],
      'pgrep is asked for one whole executable name, case-insensitively, and nothing else'
    );

    // --- Windows: process NAME via GetForegroundWindow PID; tasklist image name ---
    const winExec = fixtureExec({
      powershell: 'WindowsTerminal\r\n',
      'tasklist /NH /FI IMAGENAME eq codex.exe': 'codex.exe   1234 Console   1   50,000 K\r\n',
      'tasklist /NH /FI IMAGENAME eq WindowsTerminal.exe':
        'WindowsTerminal.exe   4321 Console   1   90,000 K\r\n',
      // tasklist's IMAGENAME filter is case-insensitive: the normalized
      // (lower-cased) probe name still has to recognise the real image name.
      'tasklist /NH /FI IMAGENAME eq cursor.exe': 'Cursor.exe   777 Console   1   80,000 K\r\n',
    });
    const win = createAdapter({ platform: 'win32', exec: winExec });
    assert.strictEqual(win.supported, true);
    assert.strictEqual(win.canProbeInstall, false, 'Windows has no install probe in this cut');
    assert.strictEqual(
      await win.execRunning('WindowsTerminal'),
      true,
      'a running host executable is detectable by name, not just the agents'
    );
    assert.strictEqual(await win.frontmost(), 'WindowsTerminal');
    const psCall = winExec.calls.find((c) => c.startsWith('powershell'));
    assert.ok(psCall.includes('ProcessName'), 'Windows reads the process name');
    assert.ok(!/MainWindowTitle|GetWindowText/i.test(psCall), 'Windows never reads the window title');
    assert.strictEqual(await win.execRunning('codex'), true);
    assert.strictEqual(await win.execRunning('claude'), false);
    assert.strictEqual(
      await win.execRunning('cursor'),
      true,
      'a capitalized real image name is recognised from the normalized probe name'
    );

    // --- Linux X11: active window -> PID -> /proc/<pid>/comm (name only) ------
    const x11Exec = fixtureExec({
      'xprop -root _NET_ACTIVE_WINDOW': '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x3a00007\n',
      'xprop -id 0x3a00007 WM_PID': 'WM_PID(CARDINAL) = 4242\n',
      'pgrep -xi konsole': '4242\n',
    });
    const x11 = createAdapter({
      platform: 'linux',
      env: { XDG_SESSION_TYPE: 'x11' },
      exec: x11Exec,
      readFile: (p) => (p === '/proc/4242/comm' ? 'konsole\n' : fs.readFileSync(p, 'utf8')),
    });
    assert.strictEqual(x11.supported, true);
    assert.strictEqual(x11.canProbeInstall, false, 'Linux has no install probe in this cut');
    assert.strictEqual(await x11.frontmost(), 'konsole', 'X11 frontmost resolves to the executable name');
    assert.strictEqual(await x11.execRunning('konsole'), true);

    // --- POSIX: the normalized probe name finds the REAL, capitalized binary ---
    // Target names are normalized to lower case before they reach an adapter,
    // while the binaries actually running are `Cursor`, `Code`,
    // `WindowsTerminal`. This fixture implements pgrep's own flag semantics, so
    // dropping either flag fails it: without `-i` a capitalized process is
    // missed, without `-x` a partial name matches something it should not.
    {
      const RUNNING = ['Cursor', 'Code', 'WindowsTerminal', 'konsole'];
      const pgrepExec = (file, args, _opts, cb) => {
        if (file !== 'pgrep') return cb(new Error('fixture: only pgrep'), '');
        const [flags, name] = args;
        const exact = flags.includes('x');
        const fold = (s) => (flags.includes('i') ? s.toLowerCase() : s);
        const hit = RUNNING.some((proc) =>
          exact ? fold(proc) === fold(name) : fold(proc).includes(fold(name))
        );
        cb(hit ? null : new Error('no match'), hit ? '4242\n' : '');
      };

      for (const platform of ['darwin', 'linux']) {
        const posix = createAdapter({
          platform,
          env: { XDG_SESSION_TYPE: 'x11' },
          exec: pgrepExec,
        });
        assert.strictEqual(
          await posix.execRunning('cursor'),
          true,
          `${platform}: a running "Cursor" is found by the normalized name`
        );
        assert.strictEqual(
          await posix.execRunning('code'),
          true,
          `${platform}: a running "Code" is found by the normalized name`
        );
        assert.strictEqual(
          await posix.execRunning('konsole'),
          true,
          `${platform}: an already-lower-case binary still matches`
        );
        assert.strictEqual(
          await posix.execRunning('codex'),
          false,
          `${platform}: an executable that is not running is never invented`
        );
        assert.strictEqual(
          await posix.execRunning('terminal'),
          false,
          `${platform}: a partial name never matches — the check stays whole-name`
        );
      }
    }

    // --- Linux Wayland: clear compatibility message, never a fallback ---------
    const wayland = createAdapter({ platform: 'linux', env: { XDG_SESSION_TYPE: 'wayland' } });
    assert.strictEqual(wayland.supported, false, 'Wayland is honestly unsupported');
    assert.strictEqual(wayland.message, WAYLAND_MESSAGE);
    assert.ok(/Wayland/.test(wayland.message), 'message names the environment');
    assert.ok(!/browser/i.test(wayland.message) || /No browser/.test(wayland.message), 'never offers a browser fallback');

    // --- unknown platform ------------------------------------------------------
    const other = createAdapter({ platform: 'freebsd' });
    assert.strictEqual(other.supported, false);
    assert.ok(other.message.includes('freebsd'), 'unknown platforms get a clear message');

    // --- static: the adapter source stays inside the privacy boundary ---------
    const src = fs.readFileSync(path.join(__dirname, '..', 'electron', 'adapters.js'), 'utf8');
    for (const forbidden of [/MainWindowTitle/, /GetWindowText/, /\bwmic\b/, /CommandLine/, /\bps\s+aux/, /getSystemIdleTime/]) {
      assert.ok(!forbidden.test(src), `adapters.js must not contain ${forbidden}`);
    }
    // pgrep's -f/--full widens matching from the executable name to the whole
    // command line, which is exactly the field the privacy boundary forbids.
    assert.ok(
      !/'--?[a-z]*f[a-z]*'/.test(src),
      'no probe flag that matches against the full command line'
    );

    console.log('adapters: all tests passed (fixtures only — no Windows/Linux runtime proof)');
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
