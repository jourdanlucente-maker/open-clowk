/* Reminder state machine for the timed-terminal MVP.
 *
 * arm(minutes)         -> one intervention is scheduled at `minutes`
 * on timeout           -> await checkFrontmost(); if a selected target is
 *                         frontmost, fire onIntervene(); otherwise stay pending
 *                         and poll at POLL_SECONDS until one is
 * resolve(outcome)     -> 'break' | 'ignore' | 'closed': dismiss and re-arm the
 *                         full original interval; 'shutdown': stop entirely
 *
 * This state machine owns the whole frontmost-probe schedule: the probe runs
 * only from `attempt`, so nothing is spawned while the interval is merely
 * armed, while an intervention is on screen, or during the five-minute break.
 * `checkFrontmost` may be async, and one attempt never starts while another is
 * still in flight, so a slow probe cannot stack.
 *
 * Pure and timer-injected, so tests drive it with a manual clock.
 */

'use strict';

const POLL_SECONDS = 5;

function createReminder({ checkFrontmost, onIntervene, timers }) {
  const t = timers || {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };

  let state = 'idle'; // idle | armed | pending | intervening | stopped
  let minutes = 0;
  let timer = null;
  let poll = null;
  let probing = false;

  function clearAll() {
    if (timer) t.clearTimeout(timer);
    if (poll) t.clearInterval(poll);
    timer = null;
    poll = null;
  }

  function due() {
    return state === 'armed' || state === 'pending';
  }

  async function attempt() {
    if (probing || !due()) return;
    probing = true;
    try {
      let frontmost = false;
      try {
        frontmost = !!(await checkFrontmost());
      } catch (e) {
        // A failed probe is not "your target is frontmost"; the caller owns
        // reporting the lost capability. Here it simply means: not yet.
        frontmost = false;
      }
      // resolve()/stop() can land while the probe is in flight.
      if (!due()) return;
      if (frontmost) {
        clearAll();
        state = 'intervening';
        onIntervene();
      } else if (state === 'armed') {
        // Interval elapsed but no selected target is frontmost: keep the
        // intervention pending; never fire globally in another app.
        state = 'pending';
        poll = t.setInterval(attempt, POLL_SECONDS * 1000);
      }
    } finally {
      probing = false;
    }
  }

  return {
    get state() {
      return state;
    },
    get minutes() {
      return minutes;
    },
    arm(m) {
      clearAll();
      minutes = m;
      state = 'armed';
      timer = t.setTimeout(attempt, Math.round(m * 60 * 1000));
    },
    // test/debug aid: behave exactly as if the interval just elapsed
    elapseNow() {
      return attempt();
    },
    resolve(outcome) {
      if (outcome === 'shutdown') {
        clearAll();
        state = 'stopped';
        return;
      }
      // break / ignore / closed all re-arm the full original interval.
      // Idempotent per cycle: an overlay 'closed' event may follow an action.
      if (state !== 'stopped') {
        this.arm(minutes);
      }
    },
    stop() {
      clearAll();
      state = 'stopped';
    },
  };
}

module.exports = { createReminder, POLL_SECONDS };
