/* Reminder state machine for the timed-terminal MVP.
 *
 * arm(minutes)         -> one intervention is scheduled at `minutes`
 * on timeout           -> checkFrontmost(); if a selected target is frontmost,
 *                         fire onIntervene(); otherwise stay pending and poll
 * resolve(outcome)     -> 'break' | 'ignore' | 'closed': dismiss and re-arm the
 *                         full original interval; 'shutdown': stop entirely
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

  function clearAll() {
    if (timer) t.clearTimeout(timer);
    if (poll) t.clearInterval(poll);
    timer = null;
    poll = null;
  }

  function attempt() {
    if (state === 'armed' || state === 'pending') {
      if (checkFrontmost()) {
        clearAll();
        state = 'intervening';
        onIntervene();
      } else if (state === 'armed') {
        // Interval elapsed but no selected target is frontmost: keep the
        // intervention pending; never fire globally in another app.
        state = 'pending';
        poll = t.setInterval(attempt, POLL_SECONDS * 1000);
      }
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
      attempt();
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
