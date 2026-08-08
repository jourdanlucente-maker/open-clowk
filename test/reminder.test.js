/* Reminder state machine: interval arming, pending-until-selected-target,
 * break/ignore re-arm, external-close recovery, shutdown.
 *
 * Run: node test/reminder.test.js
 */

'use strict';

const assert = require('assert');
const { createReminder, POLL_SECONDS } = require('../electron/reminder');
const { createFakeTimers } = require('./helpers/fake-timers');

const MIN = 60 * 1000;

function make({ frontmost = true } = {}) {
  const state = { frontmost, interventions: 0 };
  const timers = createFakeTimers();
  const reminder = createReminder({
    checkFrontmost: () => state.frontmost,
    onIntervene: () => state.interventions++,
    timers,
  });
  return { state, timers, reminder };
}

// 1. every interval arms exactly one intervention
{
  const { state, timers, reminder } = make();
  reminder.arm(30);
  assert.strictEqual(reminder.state, 'armed');
  assert.strictEqual(reminder.minutes, 30);
  timers.advance(30 * MIN - 1);
  assert.strictEqual(state.interventions, 0, 'does not fire early');
  timers.advance(1);
  assert.strictEqual(state.interventions, 1, 'fires exactly once at the interval');
  assert.strictEqual(reminder.state, 'intervening');
}

// 2. no selected target frontmost -> intervention stays pending, never fires globally
{
  const { state, timers, reminder } = make({ frontmost: false });
  reminder.arm(30);
  timers.advance(30 * MIN);
  assert.strictEqual(state.interventions, 0, 'no intervention without a selected target frontmost');
  assert.strictEqual(reminder.state, 'pending');
  timers.advance(10 * POLL_SECONDS * 1000);
  assert.strictEqual(state.interventions, 0, 'stays pending while another app is frontmost');
  state.frontmost = true; // selected target becomes frontmost
  timers.advance(POLL_SECONDS * 1000);
  assert.strictEqual(state.interventions, 1, 'shows when a selected target next becomes frontmost');
}

// 3. Ignore: dismiss and restart the full interval
{
  const { state, timers, reminder } = make();
  reminder.arm(30);
  timers.advance(30 * MIN);
  reminder.resolve('ignore');
  assert.strictEqual(reminder.state, 'armed', 'ignore re-arms');
  timers.advance(29 * MIN);
  assert.strictEqual(state.interventions, 1, 'the full interval restarts');
  timers.advance(1 * MIN);
  assert.strictEqual(state.interventions, 2, 'robot returns after the full interval');
}

// 4. Take a break (after the countdown completes): same re-arm
{
  const { state, timers, reminder } = make();
  reminder.arm(30);
  timers.advance(30 * MIN);
  reminder.resolve('break');
  assert.strictEqual(reminder.state, 'armed', 'break re-arms the original interval');
  timers.advance(30 * MIN);
  assert.strictEqual(state.interventions, 2);
}

// 5. external close (Cmd+W / Alt+F4): tracking must never stay paused
{
  const { state, timers, reminder } = make();
  reminder.arm(30);
  timers.advance(30 * MIN);
  reminder.resolve('closed');
  assert.strictEqual(reminder.state, 'armed', 'external close re-arms (inherited bug fixed)');
  timers.advance(30 * MIN);
  assert.strictEqual(state.interventions, 2, 'the mascot still fires after an external close');
  // idempotent: an action followed by the window's 'closed' event re-arms once
  reminder.resolve('ignore');
  reminder.resolve('closed');
  timers.advance(30 * MIN);
  assert.strictEqual(state.interventions, 3, 'exactly one cycle per interval after action+close');
}

// 6. Shut down: stops entirely, quits Open Clowk only
{
  const { state, timers, reminder } = make();
  reminder.arm(30);
  timers.advance(30 * MIN);
  reminder.resolve('shutdown');
  assert.strictEqual(reminder.state, 'stopped');
  timers.advance(120 * MIN);
  assert.strictEqual(state.interventions, 1, 'never fires again after shutdown');
}

console.log('reminder: all 6 tests passed');
