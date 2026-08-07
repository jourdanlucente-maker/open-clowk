/* Plain-node tests for the activity tracker: `node test/activity.test.js` */

'use strict';

const assert = require('assert');
const { createTracker } = require('../electron/activity');

function make() {
  // 90 active seconds target, 30s idle = real break, 5s ticks
  return createTracker({ targetSeconds: 90, idleResetSeconds: 30, tickSeconds: 5 });
}

// 1. continuous activity accumulates and fires exactly at the target
{
  const t = make();
  let fired = 0;
  for (let i = 0; i < 18; i++) {
    if (t.tick(0) === 'fire') fired++;
  }
  assert.strictEqual(fired, 1, 'fires exactly once at target');
  assert.strictEqual(t.activeSeconds, 90);
}

// 2. short pauses hold the counter (no growth, no reset)
{
  const t = make();
  t.tick(0); // +5
  const before = t.activeSeconds;
  assert.strictEqual(t.tick(10), 'hold'); // idle 10s: between tick and reset
  assert.strictEqual(t.activeSeconds, before, 'short pause holds the counter');
}

// 3. a real break resets the counter automatically
{
  const t = make();
  t.tick(0);
  t.tick(0);
  assert.strictEqual(t.tick(31), 'reset', 'long idle resets');
  assert.strictEqual(t.activeSeconds, 0);
  assert.strictEqual(t.tick(31), 'idle', 'staying idle reports idle, not reset');
}

// 4. paused (overlay on screen) freezes everything
{
  const t = make();
  t.tick(0);
  t.pause();
  assert.strictEqual(t.tick(0), 'paused');
  assert.strictEqual(t.activeSeconds, 5, 'no growth while paused');
  t.resume();
  assert.strictEqual(t.tick(0), 'active');
}

// 5. snooze re-arm: firing again after the snooze amount of activity
{
  const t = make();
  for (let i = 0; i < 18; i++) t.tick(0); // fire at 90
  t.activeSeconds = 90 - 10; // snooze equivalent: 10s until return
  assert.strictEqual(t.tick(0), 'active');
  assert.strictEqual(t.tick(0), 'fire', 'robot returns after snooze-worth of activity');
}

console.log('activity tracker: all 5 tests passed');
