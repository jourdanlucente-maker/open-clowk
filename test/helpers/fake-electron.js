/* Fake Electron module injected into electron/main.js by the acceptance tests.
 *
 * A faithful window double: it records every window option and call the
 * product makes (transparent / frameless / always-on-top / screen-saver level /
 * loadFile target), implements the 'closed' lifecycle synchronously, and never
 * opens a real window, binds a socket, or touches the screen.
 *
 * It also records any attempt by the product to require a forbidden module
 * (http / https / net / dgram / tls / shell). child_process is allowed ONLY
 * through electron/adapters.js (name-only platform probes); the static guards
 * in test/no-browser-static.test.js own that boundary.
 */

'use strict';

const Module = require('module');

const FORBIDDEN_REQUIRES = new Set(['http', 'https', 'net', 'dgram', 'tls', 'shell']);

function installFakeElectron() {
  const state = {
    windows: [],
    loginItemCalls: [],
    forbiddenRequires: [],
    quitCalls: 0,
    singleInstanceLockCalls: 0,
    singleInstanceLockGranted: true,
    ipcHandlers: {},
    ipcInvokeHandlers: {},
    appEvents: {},
  };

  class FakeBrowserWindow {
    constructor(opts) {
      this.opts = opts;
      this.calls = {
        setAlwaysOnTop: [],
        setVisibleOnAllWorkspaces: [],
        setIgnoreMouseEvents: [],
        loadFile: [],
        focus: 0,
        show: 0,
        restore: 0,
      };
      this.handlers = {};
      this.closed = false;
      this.minimized = false;
      state.windows.push(this);
    }
    setAlwaysOnTop(...args) {
      this.calls.setAlwaysOnTop.push(args);
    }
    setVisibleOnAllWorkspaces(...args) {
      this.calls.setVisibleOnAllWorkspaces.push(args);
    }
    setIgnoreMouseEvents(...args) {
      this.calls.setIgnoreMouseEvents.push(args);
    }
    focus() {
      this.calls.focus++;
    }
    show() {
      this.calls.show++;
    }
    restore() {
      this.minimized = false;
      this.calls.restore++;
    }
    isMinimized() {
      return this.minimized;
    }
    loadFile(...args) {
      this.calls.loadFile.push(args);
    }
    on(event, cb) {
      this.handlers[event] = cb;
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      if (this.handlers.closed) this.handlers.closed();
    }
  }

  const fakeElectron = {
    app: {
      whenReady: () => Promise.resolve(),
      requestSingleInstanceLock: () => {
        state.singleInstanceLockCalls++;
        return state.singleInstanceLockGranted;
      },
      setLoginItemSettings: (settings) => state.loginItemCalls.push(settings),
      on: (event, cb) => {
        state.appEvents[event] = cb;
      },
      quit: () => {
        state.quitCalls++;
      },
    },
    BrowserWindow: FakeBrowserWindow,
    ipcMain: {
      on: (channel, cb) => {
        state.ipcHandlers[channel] = cb;
      },
      handle: (channel, cb) => {
        state.ipcInvokeHandlers[channel] = cb;
      },
    },
    screen: {
      getPrimaryDisplay: () => ({ bounds: { width: 1440, height: 900 } }),
    },
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return fakeElectron;
    const bare = request.replace(/^node:/, '');
    if (FORBIDDEN_REQUIRES.has(bare)) {
      state.forbiddenRequires.push({ request, by: parent && parent.filename });
    }
    return originalLoad.apply(this, arguments);
  };

  return state;
}

module.exports = { installFakeElectron, FORBIDDEN_REQUIRES };
