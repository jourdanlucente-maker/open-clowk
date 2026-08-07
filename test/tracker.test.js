'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { BreakTracker } = require('../lib/tracker');

test('five-minute threshold uses injected wall-clock samples without sleeping', () => {
  const tracker = new BreakTracker({ thresholdMs: 300000, snoozeMs: 300000 });
  assert.equal(tracker.sample({ now: 0, active: true }), 'active');
  assert.equal(tracker.sample({ now: 299999, active: true }), 'active');
  assert.equal(tracker.sample({ now: 300000, active: true }), 'prompt');
  assert.equal(tracker.snapshot().consecutiveMs, 300000);
});

test('consecutive time resets as soon as no selected process is open', () => {
  const tracker = new BreakTracker({ thresholdMs: 60000, snoozeMs: 300000 });
  tracker.sample({ now: 0, active: true });
  tracker.sample({ now: 45000, active: true });
  assert.equal(tracker.sample({ now: 45001, active: false }), 'reset');
  assert.equal(tracker.snapshot().consecutiveMs, 0);
  tracker.sample({ now: 120000, active: true });
  assert.equal(tracker.sample({ now: 135000, active: true }), 'active');
});

test('Take a break waits for watched processes to close before reset', () => {
  const tracker = new BreakTracker({ thresholdMs: 60000, snoozeMs: 300000 });
  tracker.sample({ now: 0, active: true });
  tracker.sample({ now: 60000, active: true });
  assert.equal(tracker.act('take-break', 60001), 'waiting-break');
  assert.equal(tracker.sample({ now: 120000, active: true }), 'waiting-break');
  assert.equal(tracker.snapshot().consecutiveMs, 60000);
  assert.equal(tracker.sample({ now: 120001, active: false }), 'reset');
  assert.equal(tracker.snapshot().consecutiveMs, 0);
});

test('Snooze delays another prompt by exactly the configured duration', () => {
  const tracker = new BreakTracker({ thresholdMs: 60000, snoozeMs: 300000 });
  tracker.sample({ now: 0, active: true });
  tracker.sample({ now: 60000, active: true });
  assert.equal(tracker.act('snooze', 60000), 'snoozed');
  assert.equal(tracker.sample({ now: 359999, active: true }), 'snoozed');
  assert.equal(tracker.sample({ now: 360000, active: true }), 'prompt');
});

test('0.1.0 deliberately counts wall-clock time across system sleep', () => {
  const tracker = new BreakTracker({ thresholdMs: 300000, snoozeMs: 300000 });
  tracker.sample({ now: 0, active: true });
  tracker.sample({ now: 5000, active: true });
  assert.equal(tracker.sample({ now: 28805000, active: true }), 'prompt');
  assert.equal(tracker.snapshot().consecutiveMs, 28805000);
});

test('one threshold crossing prompts exactly once until the cycle resets', () => {
  const tracker = new BreakTracker({ thresholdMs: 60000, snoozeMs: 300000 });
  tracker.sample({ now: 0, active: true });
  assert.equal(tracker.sample({ now: 60000, active: true }), 'prompt');
  assert.equal(tracker.sample({ now: 65000, active: true }), 'prompted');
  assert.equal(tracker.sample({ now: 120000, active: true }), 'prompted');
  assert.equal(tracker.sample({ now: 120001, active: false }), 'reset');
  tracker.sample({ now: 130000, active: true });
  assert.equal(tracker.sample({ now: 190000, active: true }), 'prompt');
});

test('Keep going resets the full threshold without killing anything', () => {
  const tracker = new BreakTracker({ thresholdMs: 60000, snoozeMs: 300000 });
  tracker.sample({ now: 0, active: true });
  tracker.sample({ now: 60000, active: true });
  assert.equal(tracker.act('keep-going', 60000), 'reset');
  assert.equal(tracker.sample({ now: 119999, active: true }), 'active');
  assert.equal(tracker.sample({ now: 120000, active: true }), 'prompt');
});
