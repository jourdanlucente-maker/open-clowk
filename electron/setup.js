/* Open Clowk setup window: interval + supported-target checklist + Launch. */

'use strict';

const STATUS_LABELS = {
  available: '',
  'not-running': 'not running right now',
  'not-installed': 'not installed',
  'unsupported-platform': 'not available on this platform',
};

const state = { minutes: 30, selected: new Set(), supported: false };

function validate() {
  const error = document.getElementById('error');
  const launch = document.getElementById('launch');
  const minutes = Number(document.getElementById('interval').value);
  let message = '';
  if (!Number.isFinite(minutes) || minutes <= 0) message = 'The interval must be a positive number of minutes.';
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

  if (!s.supported) {
    const compat = document.getElementById('compat');
    compat.hidden = false;
    compat.textContent = s.message;
    document.getElementById('launch').disabled = true;
  }

  const saved = s.saved || { minutes: s.defaults.minutes, targets: [] };
  document.getElementById('interval').value = saved.minutes || s.defaults.minutes;
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

init();
