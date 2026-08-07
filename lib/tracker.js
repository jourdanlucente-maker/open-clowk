'use strict';

class BreakTracker {
  constructor({ thresholdMs, snoozeMs, initial = {} }) {
    if (!Number.isFinite(thresholdMs) || thresholdMs <= 0) throw new Error('thresholdMs must be positive.');
    if (!Number.isFinite(snoozeMs) || snoozeMs <= 0) throw new Error('snoozeMs must be positive.');
    this.thresholdMs = thresholdMs;
    this.snoozeMs = snoozeMs;
    this.consecutiveMs = Math.max(0, Number(initial.consecutiveMs) || 0);
    this.snoozeUntil = Math.max(0, Number(initial.snoozeUntil) || 0);
    this.mode = ['tracking', 'prompted', 'waiting-break'].includes(initial.mode) ? initial.mode : 'tracking';
    this.lastSampleAt = null;
    this.wasActive = false;
  }

  sample({ now, active }) {
    const delta = this.lastSampleAt === null ? 0 : Math.max(0, now - this.lastSampleAt);
    this.lastSampleAt = now;
    const activeDelta = this.wasActive && active ? delta : 0;
    this.wasActive = active;

    if (!active) {
      const changed = this.consecutiveMs > 0 || this.mode !== 'tracking' || this.snoozeUntil > 0;
      this.consecutiveMs = 0;
      this.snoozeUntil = 0;
      this.mode = 'tracking';
      return changed ? 'reset' : 'idle';
    }
    if (this.mode === 'waiting-break') return 'waiting-break';
    if (this.mode === 'prompted') return 'prompted';
    if (this.snoozeUntil > now) return 'snoozed';
    if (this.snoozeUntil > 0) {
      this.snoozeUntil = 0;
      this.mode = 'prompted';
      return 'prompt';
    }

    this.consecutiveMs += activeDelta;
    if (this.consecutiveMs >= this.thresholdMs) {
      this.mode = 'prompted';
      return 'prompt';
    }
    return 'active';
  }

  act(action, now) {
    if (this.mode !== 'prompted') throw new Error('No break intervention is currently awaiting a choice.');
    if (action === 'take-break') {
      this.mode = 'waiting-break';
      return 'waiting-break';
    }
    if (action === 'snooze') {
      this.mode = 'tracking';
      this.snoozeUntil = now + this.snoozeMs;
      this.lastSampleAt = now;
      return 'snoozed';
    }
    if (action === 'keep-going') {
      this.mode = 'tracking';
      this.consecutiveMs = 0;
      this.snoozeUntil = 0;
      this.lastSampleAt = now;
      return 'reset';
    }
    throw new Error(`Unknown break action: ${action}`);
  }

  snapshot() {
    return {
      consecutiveMs: Math.round(this.consecutiveMs),
      mode: this.mode,
      snoozeUntil: Math.round(this.snoozeUntil),
    };
  }
}

module.exports = { BreakTracker };
