/* Manual-clock timers for deterministic reminder tests.
 *
 * `advance` awaits each due callback, so an async scheduled task (the reminder's
 * frontmost probe) is fully settled before the clock moves on — the schedule
 * stays deterministic without any real time passing. */

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
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = tasks
          .filter((t) => !t.cancelled && t.at <= end)
          .sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        now = due.at;
        if (due.interval) due.at = now + due.interval;
        else due.cancelled = true;
        await due.fn();
      }
      now = end;
    },
  };
}

module.exports = { createFakeTimers };
