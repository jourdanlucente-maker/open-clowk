/* OPEN CLOWK control card: the interactive half of an intervention.
 *
 * Deliberately separate from the mascot layer (overlay/overlay.js). That layer
 * is display-sized and must stay click-through and non-focusable, which makes
 * it useless as a control surface: pointer forwarding into an ignore-mouse
 * window is macOS/Windows only, and a keyboard hatch dies the moment the user
 * clicks back into the terminal. This card is a small ordinary window, so it
 * is hit-tested on every platform and its buttons survive losing focus.
 *
 * Exactly the three approved actions reach the main process: Take a break
 * (visible five-minute countdown, then the interval restarts), Ignore
 * (dismiss, interval restarts), Shut down (quits Open Clowk only). Resume now
 * ends a running break early — it resolves the break already in progress, so
 * it is not a fourth intent.
 */

'use strict';

const params = new URLSearchParams(location.search);
const INTERVAL = params.get('interval') || '30';
const BREAK_SECONDS = 300;

document.getElementById('card-line').textContent =
  `You've been coding for ${INTERVAL} minutes straight.`;

function act(reason) {
  if (window.clowk) window.clowk.action(reason);
}

let breakTick = null;

function endBreak() {
  if (breakTick) {
    clearInterval(breakTick);
    breakTick = null;
  }
  act('break');
}

function startBreak() {
  if (breakTick) return;
  document.getElementById('actions').hidden = true;
  document.getElementById('break-actions').hidden = false;
  const el = document.getElementById('countdown');
  el.hidden = false;
  let left = BREAK_SECONDS;
  const render = () => {
    const m = Math.floor(left / 60);
    const s = String(left % 60).padStart(2, '0');
    el.textContent = `Break — the clocks stay open. Back in ${m}:${s}`;
  };
  render();
  breakTick = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      endBreak();
      return;
    }
    render();
  }, 1000);
}

document.getElementById('btn-break').addEventListener('click', startBreak);
document.getElementById('btn-ignore').addEventListener('click', () => act('ignore'));
document.getElementById('btn-shutdown').addEventListener('click', () => act('shutdown'));
document.getElementById('btn-resume').addEventListener('click', endBreak);
