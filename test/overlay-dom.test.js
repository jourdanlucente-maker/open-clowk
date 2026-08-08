/* Acceptance: the overlay scene completes end to end at DOM level —
 * robot walks in, all clocks open, gears spill, the message box appears —
 * and the three exact actions behave: Take a break shows a visible 5:00
 * countdown and only then dismisses; Ignore dismisses; Shut down sends the
 * shutdown intent. The offline CSS-art path is proven with no local assets
 * and no network. Everything runs headlessly in a vm sandbox with a minimal
 * faithful DOM — there is no browser mode to test.
 *
 * Run: node test/overlay-dom.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OVERLAY_JS = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'overlay.js'), 'utf8');
const OVERLAY_HTML = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'overlay.html'), 'utf8');

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
  for (const id of [
    'stage',
    'robot',
    'sprite',
    'robot-img',
    'bubble',
    'bubble-line1',
    'countdown',
    'btn-break',
    'btn-ignore',
    'btn-shutdown',
  ]) {
    const el = new FakeElement('div', document);
    el.id = id;
  }
  const buttons = new FakeElement('div', document);
  buttons.className = 'bubble-buttons';
  document.body.appendChild(buttons);
  document.byId.robot.className = 'walking';
  document.byId.bubble.hidden = true;
  document.byId.countdown.hidden = true;

  document.listeners = {};
  document.addEventListener = function (event, cb) {
    (this.listeners[event] = this.listeners[event] || []).push(cb);
  };
  document.dispatch = function (event, payload) {
    (this.listeners[event] || []).forEach((cb) => cb(payload));
  };
  return document;
}

/* ---------- run the real overlay.js in a sandbox ---------- */

function runOverlay({ online }) {
  const document = buildDocument();
  const actions = [];
  const hints = [];

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
    window: {
      clowk: {
        action: (reason) => actions.push(reason),
        setInteractive: (on) => hints.push(on),
      },
    },
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

  return { document, actions, hints };
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
  assert.ok(OVERLAY_HTML.includes('Take a break'), 'Take a break action present');
  assert.ok(OVERLAY_HTML.includes('Ignore'), 'Ignore action present');
  assert.ok(OVERLAY_HTML.includes('Shut down'), 'Shut down action present');
  assert.ok(OVERLAY_HTML.includes('id="countdown"'), 'break countdown element exists');
  assert.ok(!OVERLAY_HTML.includes('btn-snooze'), 'the old snooze action is gone');
  assert.ok(!OVERLAY_JS.includes('demo-bg') && !OVERLAY_JS.includes("params.get('bg')"), 'no browser preview mode remains');

  // --- offline CSS-art scene + Take a break countdown --------------------------
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

    // Take a break: countdown becomes visible at 5:00, and ONLY after it
    // completes does the break action dismiss the overlay.
    document.byId['btn-break'].click();
    const countdown = document.byId.countdown;
    assert.strictEqual(countdown.hidden, false, 'the five-minute countdown is visible');
    assert.ok(countdown.textContent.includes('5:00'), 'countdown starts at 5:00');
    assert.strictEqual(actions.length, 0, 'break does not dismiss before the countdown ends');
    await untilActions(actions, 1);
    assert.deepStrictEqual(actions, ['break'], 'break action fires when the countdown completes');
  }

  // --- Ignore and Shut down send their exact intents ---------------------------
  {
    const { document, actions } = runOverlay({ online: false });
    await untilSceneDone(document);
    document.byId['btn-ignore'].click();
    document.byId['btn-shutdown'].click();
    assert.deepStrictEqual(actions, ['ignore', 'shutdown'], 'ignore and shutdown reach the bridge exactly');
  }

  // --- hit-testing is hinted only over the message box --------------------------
  {
    const { document, hints } = runOverlay({ online: false });
    // Mid-scene the message box is still hidden: nothing may claim the pointer.
    document.dispatch('mousemove', { clientX: 150, clientY: 150 });
    assert.deepStrictEqual(hints, [], 'while the bubble is hidden the overlay stays click-through');

    await untilSceneDone(document);
    document.dispatch('mousemove', { clientX: 150, clientY: 150 });
    assert.deepStrictEqual(hints, [true], 'pointer over the message box asks for hit-testing');
    document.dispatch('mousemove', { clientX: 150, clientY: 150 });
    assert.deepStrictEqual(hints, [true], 'the hint is not re-sent while the pointer stays put');
    document.dispatch('mousemove', { clientX: 900, clientY: 700 });
    assert.deepStrictEqual(hints, [true, false], 'leaving it hands the clicks back to the app underneath');
  }

  // --- Escape is available for the whole intervention ---------------------------
  {
    // During the walk-in the buttons do not exist yet.
    const { document, actions } = runOverlay({ online: false });
    await untilSceneDone(document);
    document.dispatch('keydown', { key: 'a' });
    assert.deepStrictEqual(actions, [], 'ordinary keys do nothing');
    document.dispatch('keydown', { key: 'Escape' });
    assert.deepStrictEqual(actions, ['ignore'], 'Escape dismisses and restarts the interval');
  }
  {
    // During the five-minute countdown every button is hidden.
    const { document, actions } = runOverlay({ online: false });
    await untilSceneDone(document);
    document.byId['btn-break'].click();
    assert.strictEqual(document.byId.countdown.hidden, false, 'the countdown is running');
    document.dispatch('keydown', { key: 'Escape' });
    assert.deepStrictEqual(actions, ['break'], 'Escape ends the break early — no fourth intent');
    await new Promise((r) => setTimeout(r, 30));
    assert.deepStrictEqual(actions, ['break'], 'the cancelled countdown never fires again');
  }

  // --- sprite path: CDN art loads when reachable --------------------------------
  {
    const { document } = runOverlay({ online: true });
    await untilSceneDone(document);
    assert.ok(document.body.classList.contains('sprites'), 'online: sprite mode enabled');
    assert.ok(document.byId['robot-img'].src.includes('cloudfront.net'), 'robot sprite from the CDN tier');
    assert.strictEqual(document.byId.stage.children.length, 4, 'four clocks staged with sprites');
  }

  console.log('overlay DOM: all tests passed (scene, countdown, three actions, offline CSS-art)');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
