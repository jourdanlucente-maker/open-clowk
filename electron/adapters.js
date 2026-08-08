/* Least-information platform adapters.
 *
 * Foreground detection returns the frontmost application's NAME only.
 * Codex/Claude detection checks executable NAMES only.
 * Nothing here reads arguments, command lines, prompts, terminal contents,
 * window titles, files' contents, screen pixels, audio, or network data.
 *
 * execFile/readFile are injectable so tests run entirely on fixtures.
 */

'use strict';

const fs = require('fs');
const { execFile } = require('child_process');

const WAYLAND_MESSAGE =
  'Open Clowk cannot detect the frontmost application on this Linux/Wayland session. ' +
  'Only X11 sessions are supported in this first cut. No browser or global fallback exists — ' +
  'the reminder simply will not arm here.';

function run(exec, file, args) {
  return new Promise((resolve) => {
    exec(file, args, { timeout: 4000 }, (err, stdout) => {
      resolve(err ? null : String(stdout || '').trim());
    });
  });
}

function createAdapter({ platform = process.platform, env = process.env, exec = execFile, readFile = fs.readFileSync } = {}) {
  if (platform === 'darwin') {
    return {
      platform,
      supported: true,
      // Automation consent (one-time) for System Events; returns the app NAME only.
      async frontmost() {
        return run(exec, 'osascript', [
          '-e',
          'tell application "System Events" to get name of first application process whose frontmost is true',
        ]);
      },
      async execRunning(name) {
        return (await run(exec, 'pgrep', ['-x', name])) !== null;
      },
      appInstalled(bundlePath) {
        try {
          return fs.statSync(bundlePath).isDirectory();
        } catch (e) {
          return false;
        }
      },
    };
  }

  if (platform === 'win32') {
    return {
      platform,
      supported: true,
      // GetForegroundWindow -> PID -> Process NAME only. Never the window title.
      async frontmost() {
        const script = [
          '$sig = "[System.Runtime.InteropServices.DllImport(\\"user32.dll\\")] public static extern System.IntPtr GetForegroundWindow();',
          '[System.Runtime.InteropServices.DllImport(\\"user32.dll\\")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint p);"',
          '$t = Add-Type -MemberDefinition $sig -Name FG -Namespace W -PassThru;',
          '$pid2 = 0; [void]$t::GetWindowThreadProcessId($t::GetForegroundWindow(), [ref]$pid2);',
          '(Get-Process -Id $pid2).ProcessName',
        ].join(' ');
        return run(exec, 'powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
      },
      async execRunning(name) {
        const out = await run(exec, 'tasklist', ['/NH', '/FI', `IMAGENAME eq ${name}.exe`]);
        return !!out && out.toLowerCase().includes(`${name}.exe`.toLowerCase());
      },
      appInstalled() {
        return false; // per-app install probing is not implemented on Windows in this cut
      },
    };
  }

  if (platform === 'linux') {
    if ((env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland') {
      return { platform, supported: false, message: WAYLAND_MESSAGE };
    }
    return {
      platform,
      supported: true,
      // X11: active window -> its PID -> /proc/<pid>/comm (executable name only).
      async frontmost() {
        const active = await run(exec, 'xprop', ['-root', '_NET_ACTIVE_WINDOW']);
        const id = active && active.match(/(0x[0-9a-f]+)/i);
        if (!id) return null;
        const wmPid = await run(exec, 'xprop', ['-id', id[1], 'WM_PID']);
        const pid = wmPid && wmPid.match(/=\s*(\d+)/);
        if (!pid) return null;
        try {
          return String(readFile(`/proc/${pid[1]}/comm`, 'utf8')).trim();
        } catch (e) {
          return null;
        }
      },
      async execRunning(name) {
        return (await run(exec, 'pgrep', ['-x', name])) !== null;
      },
      appInstalled() {
        return false;
      },
    };
  }

  return {
    platform,
    supported: false,
    message: `Open Clowk does not support foreground detection on ${platform} in this first cut. No browser or global fallback exists.`,
  };
}

module.exports = { createAdapter, WAYLAND_MESSAGE };
