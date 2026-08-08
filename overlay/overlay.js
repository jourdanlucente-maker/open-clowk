/* OPEN CLOWK overlay scene: the robot walks in and opens every clock.
 *
 * Visuals come from the official Higgsfield-rendered sprites (same robot and
 * pocket watch as the Open Clowk posters). Load order per sprite:
 *   1. local file in ../assets/   2. CDN   3. built-in CSS art fallback
 *
 * The overlay runs only inside the Electron mascot window — there is no
 * browser mode. Actions: Take a break (visible 5-minute countdown, then the
 * interval restarts), Ignore (dismiss, interval restarts), Shut down (quits
 * Open Clowk only).
 */

'use strict';

const params = new URLSearchParams(location.search);
const INTERVAL = params.get('interval') || '30';
const BREAK_SECONDS = 300;

document.getElementById('bubble-line1').textContent =
  `You've been coding for ${INTERVAL} minutes straight.`;

/* ---------- sprites (poster-grade art) ---------- */
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_39GrJSxSPVFsFnh94GJ8Kef3kcI';
const SPRITES = {
  robot: { file: 'robot.png', cdn: `${CDN}/hf_20260727_183627_da82ab5d-ddbe-4b39-8a44-8a34d71e7777.png` },
  face: { file: 'watch-face.png', cdn: `${CDN}/hf_20260727_183630_1c5fe4c2-dd97-4f94-a398-f5222ef2e1d8.png` },
  open: { file: 'watch-open.png', cdn: `${CDN}/hf_20260727_183633_d9603648-92cd-42a6-b935-4e905113f441.png` },
};
const assetsBase = params.get('assetsBase') || '../assets';

function loadSprite({ file, cdn }) {
  const candidates = [`${assetsBase}/${file}`, cdn];
  return new Promise((resolve) => {
    let i = 0;
    const img = new Image();
    img.onload = () => resolve(img.src);
    img.onerror = () => {
      i++;
      if (i < candidates.length) img.src = candidates[i];
      else resolve(null);
    };
    img.src = candidates[0];
  });
}

async function loadSprites() {
  const timeout = new Promise((r) => setTimeout(() => r(null), 4000));
  const all = Promise.all([
    loadSprite(SPRITES.robot),
    loadSprite(SPRITES.face),
    loadSprite(SPRITES.open),
  ]);
  const result = await Promise.race([all, timeout]);
  if (!result || result.some((u) => !u)) return null; // any miss -> CSS art
  return { robot: result[0], face: result[1], open: result[2] };
}

/* ---------- pixel robot (CSS fallback sprite) ---------- */
const PIXELS = [
  '.....kk.....',
  '.....do.....',
  '..oooooooo..',
  '..o.k..k.o..',
  '..oooooooo..',
  '..od.oo.do..',
  '...oooooo...',
  'd..oooooo..d',
  'd.oo.oo.oo.d',
  '..oo.oo.oo..',
  '...d....d...',
  '...d....d...',
  '..dd....dd..',
];
const COLORS = { o: '#e8632a', d: '#b3541e', k: '#17130e', c: '#f2e9db' };
const SCALE = 6;
(function drawRobot() {
  const shadows = [];
  PIXELS.forEach((row, y) => {
    [...row].forEach((px, x) => {
      if (COLORS[px]) shadows.push(`${x * SCALE}px ${y * SCALE}px 0 ${COLORS[px]}`);
    });
  });
  document.getElementById('sprite').style.boxShadow = shadows.join(',');
})();

/* ---------- clocks ---------- */
const SPOTS = [
  { left: '12%', top: '16%' },
  { left: '38%', top: '36%' },
  { left: '66%', top: '14%' },
  { left: '30%', top: '66%' },
];

function sprImg(src) {
  const img = document.createElement('img');
  img.className = 'spr';
  img.src = src;
  img.alt = '';
  return img;
}

function buildClock(spot, i, sprites) {
  const el = document.createElement('div');
  el.className = 'clock';
  el.id = `clock-${i}`;
  el.style.left = spot.left;
  el.style.top = spot.top;

  const interior = document.createElement('div');
  interior.className = 'case';
  if (sprites) {
    interior.appendChild(sprImg(sprites.open));
  } else {
    const voidLabel = document.createElement('div');
    voidLabel.className = 'void-label';
    voidLabel.innerHTML = 'no time<br>in here';
    interior.appendChild(voidLabel);
  }

  // the swinging door is the clock face itself, showing the real time
  const lid = document.createElement('div');
  lid.className = 'lid';
  if (sprites) {
    lid.appendChild(sprImg(sprites.face));
  } else {
    for (let t = 0; t < 12; t++) {
      const tick = document.createElement('div');
      tick.className = 'tick';
      tick.style.transform = `rotate(${t * 30}deg) translateY(-51px)`;
      lid.appendChild(tick);
    }
  }
  const now = new Date();
  const hour = document.createElement('div');
  hour.className = 'hand hour';
  hour.style.transform = `rotate(${(now.getHours() % 12) * 30 + now.getMinutes() / 2}deg)`;
  const minute = document.createElement('div');
  minute.className = 'hand minute';
  minute.style.transform = `rotate(${now.getMinutes() * 6}deg)`;
  const pin = document.createElement('div');
  pin.className = 'pin';
  lid.append(hour, minute, pin);

  const escaped = document.createElement('div');
  escaped.className = 'escaped';
  escaped.textContent = 'OPEN — time escaped';

  el.append(interior, lid, escaped);
  document.getElementById('stage').appendChild(el);
  return el;
}

function spillGears(clockEl) {
  for (let g = 0; g < 7; g++) {
    const gear = document.createElement('span');
    gear.className = 'gear';
    gear.textContent = '⚙';
    gear.style.setProperty('--dx', `${(Math.random() - 0.5) * 220}px`);
    gear.style.setProperty('--dy', `${60 + Math.random() * 160}px`);
    gear.style.animationDelay = `${g * 60}ms`;
    clockEl.appendChild(gear);
  }
}

/* ---------- timeline ---------- */
const robot = document.getElementById('robot');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function walkTo(clockEl) {
  const rect = clockEl.getBoundingClientRect();
  robot.style.left = `${Math.max(0, rect.left - 90)}px`;
  robot.style.bottom = `${Math.max(24, innerHeight - rect.bottom - 20)}px`;
}

async function scene() {
  const sprites = await loadSprites();
  if (sprites) {
    document.body.classList.add('sprites');
    document.getElementById('robot-img').src = sprites.robot;
  }
  const clocks = SPOTS.map((spot, i) => buildClock(spot, i, sprites));

  await wait(300);
  robot.style.left = `${innerWidth - 190}px`; // walk in from the right
  await wait(1400);

  for (const clockEl of clocks) {
    clockEl.classList.add('arrived');
    walkTo(clockEl);
    await wait(1300);
    robot.classList.remove('walking');
    robot.classList.add('prying');
    await wait(700);
    robot.classList.remove('prying');
    robot.classList.add('walking');
    clockEl.classList.add('open');
    spillGears(clockEl);
    await wait(400);
  }

  robot.style.left = `${innerWidth - 560}px`;
  robot.style.bottom = '80px';
  await wait(1300);
  robot.classList.remove('walking');
  document.getElementById('bubble').hidden = false;
}

function act(reason) {
  if (window.clowk) window.clowk.action(reason);
}

/* ---------- hit-testing: the window is display-sized, the mascot is not ----------
 * The main process keeps the overlay click-through and only hit-tests while the
 * pointer is over the message box, so the empty pixels never swallow a click. */
let interactive = false;

function setInteractive(next) {
  if (next === interactive) return;
  interactive = next;
  if (window.clowk && window.clowk.setInteractive) window.clowk.setInteractive(next);
}

function overBubble(x, y) {
  const bubble = document.getElementById('bubble');
  if (!bubble || bubble.hidden) return false;
  const r = bubble.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

document.addEventListener('mousemove', (e) => setInteractive(overBubble(e.clientX, e.clientY)));

/* ---------- actions ---------- */
let breaking = false;
let breakTick = null;

/* Escape is the escape hatch, available for the whole intervention: during the
 * ~12s walk-in the buttons do not exist yet, and during the five-minute break
 * they are hidden. It resolves the action already in progress — no fourth
 * intent reaches the main process. */
function dismiss() {
  if (breakTick) {
    clearInterval(breakTick);
    breakTick = null;
  }
  act(breaking ? 'break' : 'ignore');
}

function startBreak() {
  breaking = true;
  document.querySelector('.bubble-buttons').hidden = true;
  const el = document.getElementById('countdown');
  el.hidden = false;
  let left = BREAK_SECONDS;
  const render = () => {
    const m = Math.floor(left / 60);
    const s = String(left % 60).padStart(2, '0');
    el.textContent = `Break — the clocks stay open. Back in ${m}:${s} · Esc ends it now`;
  };
  render();
  breakTick = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(breakTick);
      breakTick = null;
      act('break');
      return;
    }
    render();
  }, 1000);
}

document.getElementById('btn-break').addEventListener('click', startBreak);
document.getElementById('btn-ignore').addEventListener('click', () => act('ignore'));
document.getElementById('btn-shutdown').addEventListener('click', () => act('shutdown'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') dismiss();
});

scene();
