/* Open Clowk setup window: interval + supported-target checklist + Launch. */

'use strict';

const STATUS_LABELS = {
  available: '',
  'not-running': 'not running right now',
  'not-installed': 'not installed',
  'unsupported-platform': 'not available on this platform',
};

const state = { minutes: 30, selected: new Set(), supported: false, hardCompat: false };

/* The message can arrive after load: the main process pushes it when the
 * frontmost probe stops answering while this window is already open. An
 * unsupported-platform message outranks it and is never cleared. */
function showCompat(message) {
  if (state.hardCompat && !message) return;
  const compat = document.getElementById('compat');
  compat.hidden = !message;
  compat.textContent = message || '';
}

// Mirrors the bounds the main process enforces in validatePrefs; the main
// process stays the authority, this only keeps the message immediate.
const limits = { min: 1, max: 1440 };

function validate() {
  const error = document.getElementById('error');
  const launch = document.getElementById('launch');
  const minutes = Number(document.getElementById('interval').value);
  let message = '';
  if (!Number.isInteger(minutes) || minutes < limits.min || minutes > limits.max)
    message = `The interval must be a whole number of minutes between ${limits.min} and ${limits.max}.`;
  else if (state.selected.size === 0) message = 'Pick at least one target.';
  error.hidden = !message;
  error.textContent = message;
  launch.disabled = !!message || !state.supported;
  return !message;
}

function renderTargets(targets) {
  const box = document.getElementById('targets');
  box.innerHTML = '';
  for (const t of targets) {
    const row = document.createElement('label');
    row.className = 'target';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = t.id;
    const selectable = t.status === 'available' || t.status === 'not-running';
    input.disabled = !selectable;
    if (state.selected.has(t.id)) input.checked = true;
    input.addEventListener('change', () => {
      if (input.checked) state.selected.add(t.id);
      else state.selected.delete(t.id);
      validate();
    });

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = t.label;

    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = STATUS_LABELS[t.status] || t.status;

    row.append(input, name, status);
    box.appendChild(row);
  }
}

async function init() {
  const s = await window.clowk.getSetupState();
  state.supported = s.supported;

  const interval = document.getElementById('interval');
  if (s.defaults) {
    if (Number.isInteger(s.defaults.minMinutes)) limits.min = s.defaults.minMinutes;
    if (Number.isInteger(s.defaults.maxMinutes)) limits.max = s.defaults.maxMinutes;
    interval.min = String(limits.min);
    interval.max = String(limits.max);
  }

  if (!s.supported) {
    state.hardCompat = true;
    showCompat(s.message);
    document.getElementById('launch').disabled = true;
  } else if (s.compatMessage) {
    // A capability that was granted at Launch can be revoked later; when the
    // frontmost probe stops answering, this window is how the user hears it.
    showCompat(s.compatMessage);
  }

  if (s.running) {
    document.getElementById('running').hidden = false;
    document.getElementById('launch').textContent = 'Relaunch';
  }

  const saved = s.saved || { minutes: s.defaults.minutes, targets: [] };
  interval.value = saved.minutes || s.defaults.minutes;
  for (const id of saved.targets || []) state.selected.add(id);

  if (s.supported) renderTargets(s.targets);
  validate();
}

document.getElementById('interval').addEventListener('input', validate);

document.getElementById('launch').addEventListener('click', async () => {
  if (!validate()) return;
  const result = await window.clowk.launch({
    minutes: Number(document.getElementById('interval').value),
    targets: [...state.selected],
  });
  if (!result.ok) {
    const error = document.getElementById('error');
    error.hidden = false;
    error.textContent = result.errors.join(' ');
  }
  // on success the main process closes this window and arms the timer
});

document.getElementById('quit').addEventListener('click', () => window.clowk.quit());

window.clowk.onCompatMessage(showCompat);

init();
