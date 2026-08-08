/* Reminder state machine: interval arming, pending-until-selected-target,
 * break/ignore re-arm, external-close recovery, shutdown, and the frontmost
 * probe's scheduling contract (when it may run, and that it never stacks).
 *
 * Run: node test/reminder.test.js
 */

'use strict';

const assert = require('assert');
const { createReminder, POLL_SECONDS } = require('../electron/reminder');
const { createFakeTimers } = require('./helpers/fake-timers');

const MIN = 60 * 1000;

function make({ frontmost = true } = {}) {
  const state = { frontmost, interventions: 0, probes: 0 };
  const timers = createFakeTimers();
  const reminder = createReminder({
    checkFrontmost: async () => {
      state.probes++;
      return state.frontmost;
    },
    onIntervene: () => state.interventions++,
    timers,
  });
  return { state, timers, reminder };
}

(async () => {
  // 1. every interval arms exactly one intervention
  {
    const { state, timers, reminder } = make();
    reminder.arm(30);
    assert.strictEqual(reminder.state, 'armed');
    assert.strictEqual(reminder.minutes, 30);
    await timers.advance(30 * MIN - 1);
    assert.strictEqual(state.interventions, 0, 'does not fire early');
    await timers.advance(1);
    assert.strictEqual(state.interventions, 1, 'fires exactly once at the interval');
    assert.strictEqual(reminder.state, 'intervening');
  }

  // 2. no selected target frontmost -> intervention stays pending, never fires globally
  {
    const { state, timers, reminder } = make({ frontmost: false });
    reminder.arm(30);
    await timers.advance(30 * MIN);
    assert.strictEqual(state.interventions, 0, 'no intervention without a selected target frontmost');
    assert.strictEqual(reminder.state, 'pending');
    await timers.advance(10 * POLL_SECONDS * 1000);
    assert.strictEqual(state.interventions, 0, 'stays pending while another app is frontmost');
    state.frontmost = true; // selected target becomes frontmost
    await timers.advance(POLL_SECONDS * 1000);
    assert.strictEqual(state.interventions, 1, 'shows when a selected target next becomes frontmost');
  }

  // 3. Ignore: dismiss and restart the full interval
  {
    const { state, timers, reminder } = make();
    reminder.arm(30);
    await timers.advance(30 * MIN);
    reminder.resolve('ignore');
    assert.strictEqual(reminder.state, 'armed', 'ignore re-arms');
    await timers.advance(29 * MIN);
    assert.strictEqual(state.interventions, 1, 'the full interval restarts');
    await timers.advance(1 * MIN);
    assert.strictEqual(state.interventions, 2, 'robot returns after the full interval');
  }

  // 4. Take a break (after the countdown completes): same re-arm
  {
    const { state, timers, reminder } = make();
    reminder.arm(30);
    await timers.advance(30 * MIN);
    reminder.resolve('break');
    assert.strictEqual(reminder.state, 'armed', 'break re-arms the original interval');
    await timers.advance(30 * MIN);
    assert.strictEqual(state.interventions, 2);
  }

  // 5. external close (Cmd+W / Alt+F4): tracking must never stay paused
  {
    const { state, timers, reminder } = make();
    reminder.arm(30);
    await timers.advance(30 * MIN);
    reminder.resolve('closed');
    assert.strictEqual(reminder.state, 'armed', 'external close re-arms (inherited bug fixed)');
    await timers.advance(30 * MIN);
    assert.strictEqual(state.interventions, 2, 'the mascot still fires after an external close');
    // idempotent: an action followed by the window's 'closed' event re-arms once
    reminder.resolve('ignore');
    reminder.resolve('closed');
    await timers.advance(30 * MIN);
    assert.strictEqual(state.interventions, 3, 'exactly one cycle per interval after action+close');
  }

  // 6. Shut down: stops entirely, quits Open Clowk only
  {
    const { state, timers, reminder } = make();
    reminder.arm(30);
    await timers.advance(30 * MIN);
    reminder.resolve('shutdown');
    assert.strictEqual(reminder.state, 'stopped');
    await timers.advance(120 * MIN);
    assert.strictEqual(state.interventions, 1, 'never fires again after shutdown');
  }

  // 7. scheduling contract: the frontmost probe runs ONLY when an interval is
  //    due, and then only on the bounded pending cadence. A resident mascot may
  //    not spawn a foreground probe on a lifetime timer.
  {
    const { state, timers, reminder } = make({ frontmost: false });
    reminder.arm(30);
    await timers.advance(30 * MIN - 1);
    assert.strictEqual(state.probes, 0, 'nothing is probed while the interval is merely armed');

    await timers.advance(1);
    assert.strictEqual(state.probes, 1, 'exactly one probe when the interval becomes due');
    assert.strictEqual(reminder.state, 'pending');

    await timers.advance(3 * POLL_SECONDS * 1000);
    assert.strictEqual(state.probes, 4, 'pending polls at the existing bounded cadence, not faster');

    state.frontmost = true;
    await timers.advance(POLL_SECONDS * 1000);
    assert.strictEqual(state.interventions, 1);
    assert.strictEqual(reminder.state, 'intervening');
    const duringIntervention = state.probes;

    // The overlay is on screen and then the 5-minute break runs: both are
    // resolved by the user, never by a probe, so neither costs one.
    await timers.advance(60 * MIN);
    assert.strictEqual(state.probes, duringIntervention, 'no probing during an intervention or the break');

    reminder.resolve('break');
    await timers.advance(30 * MIN - 1);
    assert.strictEqual(state.probes, duringIntervention, 'no probing while the next interval is armed');
    await timers.advance(1);
    assert.strictEqual(state.probes, duringIntervention + 1, 'the next due interval probes once');
  }

  // 8. a slow probe never stacks: one attempt in flight blocks the next
  {
    const timers = createFakeTimers();
    let calls = 0;
    let release = null;
    const reminder = createReminder({
      checkFrontmost: () => {
        calls++;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
      onIntervene: () => {},
      timers,
    });
    reminder.arm(30);
    const first = reminder.elapseNow();
    const second = reminder.elapseNow();
    assert.strictEqual(calls, 1, 'a probe already in flight is never doubled');
    release(false);
    await first;
    await second;
    assert.strictEqual(reminder.state, 'pending', 'the in-flight probe still resolves the cycle');
    reminder.stop();
  }

  // 9. a probe that throws is "not yet", never a phantom match
  {
    const timers = createFakeTimers();
    let interventions = 0;
    const reminder = createReminder({
      checkFrontmost: async () => {
        throw new Error('automation consent revoked');
      },
      onIntervene: () => interventions++,
      timers,
    });
    reminder.arm(30);
    await timers.advance(30 * MIN);
    assert.strictEqual(interventions, 0, 'a failed probe never fires the mascot');
    assert.strictEqual(reminder.state, 'pending', 'and it keeps retrying on the pending cadence');
    await timers.advance(POLL_SECONDS * 1000);
    assert.strictEqual(interventions, 0);
    reminder.stop();
  }

  console.log('reminder: all 9 tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
