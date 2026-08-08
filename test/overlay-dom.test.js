/* Acceptance for both halves of an intervention, at DOM level.
 *
 * Mascot layer (overlay.js): the scene completes end to end — robot walks in,
 * all clocks open, gears spill, the message box appears — and it stays pure
 * decoration: no bridge, no listeners, no intents.
 *
 * Control card (control.js): the three exact actions behave. Take a break
 * shows a visible 5:00 countdown and only then dismisses; Resume now ends it
 * early without inventing a fourth intent; Ignore dismisses; Shut down sends
 * the shutdown intent. The controls never depend on the animation.
 *
 * The offline CSS-art path is proven with no local assets and no network.
 * Everything runs headlessly in a vm sandbox with a minimal faithful DOM —
 * there is no browser mode to test.
 *
 * Run: node test/overlay-dom.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const OVERLAY_JS = read('overlay', 'overlay.js');
const OVERLAY_HTML = read('overlay', 'overlay.html');
const CONTROL_JS = read('overlay', 'control.js');
const CONTROL_HTML = read('overlay', 'control.html');

/* ---------- minimal faithful DOM ---------- */

class FakeClassList {
  constructor(el) {
    this.el = el;
    this.set = new Set();
  }
  add(...names) {
    names.forEach((n) => this.set.add(n));
    this.sync();
  }
  remove(...names) {
    names.forEach((n) => this.set.delete(n));
    this.sync();
  }
  contains(name) {
    return this.set.has(name);
  }
  sync() {
    this.el._className = [...this.set].join(' ');
  }
}

function makeStyle() {
  return {
    setProperty(k, v) {
      this[k] = v;
    },
  };
}

class FakeElement {
  constructor(tag, document) {
    this.tagName = tag;
    this.document = document;
    this.children = [];
    this.style = makeStyle();
    this._className = '';
    this.classList = new FakeClassList(this);
    this.listeners = {};
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this._id = '';
    this._src = '';
  }
  get className() {
    return this._className;
  }
  set className(v) {
    this._className = v;
    this.classList.set = new Set(v.split(/\s+/).filter(Boolean));
  }
  get id() {
    return this._id;
  }
  set id(v) {
    this._id = v;
    this.document.byId[v] = this;
  }
  get src() {
    return this._src;
  }
  set src(v) {
    this._src = v;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  append(...children) {
    children.forEach((c) => this.children.push(c));
  }
  addEventListener(event, cb) {
    (this.listeners[event] = this.listeners[event] || []).push(cb);
  }
  click() {
    (this.listeners.click || []).forEach((cb) => cb());
  }
  getBoundingClientRect() {
    return { left: 100, top: 100, right: 220, bottom: 220, width: 120, height: 120 };
  }
  queryAll(pred, out = []) {
    for (const c of this.children) {
      if (pred(c)) out.push(c);
      c.queryAll(pred, out);
    }
    return out;
  }
}

function buildDocument() {
  const document = {
    byId: {},
    createElement: (tag) => new FakeElement(tag, document),
    getElementById(id) {
      return this.byId[id] || null;
    },
    querySelector(selector) {
      const cls = selector.replace(/^\./, '');
      const hits = this.body.queryAll((c) => c.classList.contains(cls));
      return hits[0] || null;
    },
  };
  document.body = new FakeElement('body', document);
  for (const id of ['stage', 'robot', 'sprite', 'robot-img', 'bubble', 'bubble-line1']) {
    const el = new FakeElement('div', document);
    el.id = id;
  }
  document.byId.robot.className = 'walking';
  document.byId.bubble.hidden = true;
  return document;
}

function buildControlDocument() {
  const document = {
    byId: {},
    createElement: (tag) => new FakeElement(tag, document),
    getElementById(id) {
      return this.byId[id] || null;
    },
  };
  document.body = new FakeElement('body', document);
  for (const id of [
    'card',
    'card-line',
    'countdown',
    'actions',
    'break-actions',
    'btn-break',
    'btn-ignore',
    'btn-shutdown',
    'btn-resume',
  ]) {
    const el = new FakeElement('div', document);
    el.id = id;
  }
  document.byId.countdown.hidden = true;
  document.byId['break-actions'].hidden = true;
  return document;
}

/* ---------- run the real overlay.js in a sandbox ---------- */

function runControl() {
  const document = buildControlDocument();
  const actions = [];
  const sandbox = {
    document,
    location: { search: '?interval=30' },
    URLSearchParams,
    window: { clowk: { action: (reason) => actions.push(reason) } },
    setInterval: (fn) => {
      const handle = { cleared: false, id: null };
      const loop = () => {
        if (handle.cleared) return;
        fn();
        handle.id = setTimeout(loop, 0);
      };
      handle.id = setTimeout(loop, 0);
      return handle;
    },
    clearInterval: (h) => {
      if (h) {
        h.cleared = true;
        clearTimeout(h.id);
      }
    },
    Math,
    String,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(CONTROL_JS, sandbox, { filename: 'control.js' });
  return { document, actions };
}

function runOverlay({ online }) {
  const document = buildDocument();
  const actions = [];

  class FakeImage {
    set src(value) {
      this._src = value;
      // Microtask: resolves before the 4s loadSprites timeout macrotask —
      // deterministic either way. Local asset files are absent (not
      // committed), so only http(s) URLs "load" when online.
      queueMicrotask(() => {
        if (online && /^https?:/.test(value)) this.onload && this.onload();
        else this.onerror && this.onerror();
      });
    }
    get src() {
      return this._src;
    }
  }

  const sandbox = {
    document,
    location: { search: '?interval=30' },
    URLSearchParams,
    Image: FakeImage,
    innerWidth: 1440,
    innerHeight: 900,
    window: { clowk: { action: (reason) => actions.push(reason) } },
    // Immediate timers: dramatic pauses and countdown seconds collapse to
    // macrotask turns; ordering is preserved, wall time is not.
    setTimeout: (fn) => setTimeout(fn, 0),
    setInterval: (fn) => {
      const handle = { cleared: false, id: null };
      const loop = () => {
        if (handle.cleared) return;
        fn();
        handle.id = setTimeout(loop, 0);
      };
      handle.id = setTimeout(loop, 0);
      return handle;
    },
    clearInterval: (h) => {
      if (h) {
        h.cleared = true;
        clearTimeout(h.id);
      }
    },
    queueMicrotask,
    Promise,
    Date,
    Math,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(OVERLAY_JS, sandbox, { filename: 'overlay.js' });

  return { document, actions };
}

async function untilSceneDone(document) {
  const bubble = document.byId.bubble;
  for (let i = 0; i < 500 && bubble.hidden; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.strictEqual(bubble.hidden, false, 'scene completes: the message box appears');
}

async function untilActions(actions, n) {
  for (let i = 0; i < 500 && actions.length < n; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.strictEqual(actions.length, n, `expected ${n} action(s), got ${actions.length}`);
}

(async () => {
  // --- static: exactly the three approved actions, no browser mode ------------
  assert.ok(OVERLAY_HTML.includes('id="bubble"'), 'the attached message box exists');
  assert.ok(CONTROL_HTML.includes('Take a break'), 'Take a break action present');
  assert.ok(CONTROL_HTML.includes('Ignore'), 'Ignore action present');
  assert.ok(CONTROL_HTML.includes('Shut down'), 'Shut down action present');
  assert.ok(CONTROL_HTML.includes('Resume now'), 'the break has a pointer-reachable way out');
  assert.ok(CONTROL_HTML.includes('id="countdown"'), 'break countdown element exists');
  assert.ok(!CONTROL_HTML.includes('btn-snooze'), 'the old snooze action is gone');
  assert.ok(!OVERLAY_JS.includes('demo-bg') && !OVERLAY_JS.includes("params.get('bg')"), 'no browser preview mode remains');

  // The controls must not ride on the display-sized click-through layer.
  assert.ok(!OVERLAY_HTML.includes('btn-break'), 'the mascot layer carries no buttons');
  assert.ok(!OVERLAY_JS.includes('window.clowk'), 'the mascot layer has no bridge to the main process');

  // --- offline CSS-art scene (the mascot layer, decoration only) ---------------
  {
    const { document, actions } = runOverlay({ online: false });
    await untilSceneDone(document);

    assert.ok(!document.body.classList.contains('sprites'), 'offline: CSS-art mode');
    assert.strictEqual(document.byId['robot-img'].src, '', 'offline: robot image never loads');
    assert.ok(document.byId.sprite.style.boxShadow.includes('#e8632a'), 'offline: CSS pixel robot drawn');

    const clocks = document.byId.stage.children;
    assert.strictEqual(clocks.length, 4, 'four clocks are staged');
    for (const clock of clocks) {
      assert.ok(clock.classList.contains('open'), `${clock.id} reached the open state`);
      assert.strictEqual(clock.queryAll((c) => c.classList.contains('gear')).length, 7, `${clock.id} spills gears`);
      assert.strictEqual(
        clock.queryAll((c) => c.classList.contains('tick')).length,
        12,
        `${clock.id} lid is a CSS-drawn clock face`
      );
    }
    assert.ok(document.byId['bubble-line1'].textContent.includes('30 minutes'), 'message carries the interval');
    assert.deepStrictEqual(actions, [], 'the mascot layer sends no intent of its own');
  }

  // --- the control card is usable immediately, without the animation ------------
  {
    const { document, actions } = runControl();
    assert.ok(document.byId['card-line'].textContent.includes('30 minutes'), 'the card carries the interval');
    assert.strictEqual(document.byId.actions.hidden, false, 'the three actions are there from the first frame');
    assert.deepStrictEqual(actions, [], 'nothing is sent until the user acts');
  }

  // --- Take a break: visible 5:00 countdown, dismissing only when it ends -------
  {
    const { document, actions } = runControl();
    document.byId['btn-break'].click();
    const countdown = document.byId.countdown;
    assert.strictEqual(countdown.hidden, false, 'the five-minute countdown is visible');
    assert.ok(countdown.textContent.includes('5:00'), 'countdown starts at 5:00');
    assert.strictEqual(document.byId.actions.hidden, true, 'the three actions step aside during the break');
    assert.strictEqual(
      document.byId['break-actions'].hidden,
      false,
      'Resume now is visible for the whole break — the way out never depends on focus'
    );
    assert.strictEqual(actions.length, 0, 'break does not dismiss before the countdown ends');
    await untilActions(actions, 1);
    assert.deepStrictEqual(actions, ['break'], 'break action fires when the countdown completes');
  }

  // --- Resume now ends a running break early, as the same break intent ---------
  {
    const { document, actions } = runControl();
    document.byId['btn-break'].click();
    document.byId['btn-resume'].click();
    assert.deepStrictEqual(actions, ['break'], 'Resume now resolves the break — no fourth intent');
    await new Promise((r) => setTimeout(r, 30));
    assert.deepStrictEqual(actions, ['break'], 'the cancelled countdown never fires again');
  }

  // --- Ignore and Shut down send their exact intents ---------------------------
  {
    const { document, actions } = runControl();
    document.byId['btn-ignore'].click();
    document.byId['btn-shutdown'].click();
    assert.deepStrictEqual(actions, ['ignore', 'shutdown'], 'ignore and shutdown reach the bridge exactly');
  }

  // --- sprite path: CDN art loads when reachable --------------------------------
  {
    const { document } = runOverlay({ online: true });
    await untilSceneDone(document);
    assert.ok(document.body.classList.contains('sprites'), 'online: sprite mode enabled');
    assert.ok(document.byId['robot-img'].src.includes('cloudfront.net'), 'robot sprite from the CDN tier');
    assert.strictEqual(document.byId.stage.children.length, 4, 'four clocks staged with sprites');
  }

  console.log(
    'overlay DOM: all tests passed (mascot scene, control card, countdown, Resume now, three actions, offline CSS-art)'
  );
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
