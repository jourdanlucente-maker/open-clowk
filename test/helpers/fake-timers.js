/* Manual-clock timers for deterministic reminder tests. */

'use strict';

function createFakeTimers() {
  let now = 0;
  let seq = 0;
  const tasks = [];

  function schedule(fn, ms, interval) {
    const task = { id: ++seq, fn, at: now + (ms || 0), interval: interval || 0, cancelled: false };
    tasks.push(task);
    return task;
  }

  return {
    setTimeout: (fn, ms) => schedule(fn, ms, 0),
    setInterval: (fn, ms) => schedule(fn, ms, ms || 1),
    clearTimeout: (t) => {
      if (t) t.cancelled = true;
    },
    clearInterval: (t) => {
      if (t) t.cancelled = true;
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = tasks
          .filter((t) => !t.cancelled && t.at <= end)
          .sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        now = due.at;
        if (due.interval) due.at = now + due.interval;
        else due.cancelled = true;
        due.fn();
      }
      now = end;
    },
  };
}

module.exports = { createFakeTimers };
