/**
 * Activity tracker — the part of Open Clowk that "knows you're coding."
 *
 * It doesn't watch apps or keystrokes. It only consumes the system-wide
 * idle time (seconds since the last keyboard/mouse input, any app), which
 * Electron's powerMonitor provides without any special permissions.
 *
 * Rules per tick:
 *   - idle >= idleResetSeconds  -> you took a real break: counter resets itself
 *   - idle <  tickSeconds       -> you were active this tick: counter grows
 *   - in between                -> short pause: counter holds, neither grows nor resets
 *   - counter reaches target    -> 'fire' (the robot is dispatched)
 */

'use strict';

function createTracker({ targetSeconds, idleResetSeconds, tickSeconds }) {
  let activeSeconds = 0;
  let paused = false; // true while the overlay is on screen

  return {
    get activeSeconds() {
      return activeSeconds;
    },
    set activeSeconds(v) {
      activeSeconds = Math.max(0, v);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    tick(idleSeconds) {
      if (paused) return 'paused';
      if (idleSeconds >= idleResetSeconds) {
        const hadProgress = activeSeconds > 0;
        activeSeconds = 0;
        return hadProgress ? 'reset' : 'idle';
      }
      if (idleSeconds < tickSeconds) {
        activeSeconds += tickSeconds;
        return activeSeconds >= targetSeconds ? 'fire' : 'active';
      }
      return 'hold';
    },
  };
}

module.exports = { createTracker };
