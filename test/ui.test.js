'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'ui', 'break.html'), 'utf8');

test('break page packages the complete local visual and three non-coercive actions', () => {
  assert.match(html, /assets\/robot-crowbar\.webp/);
  assert.match(html, /assets\/watch-open\.webp/);
  assert.match(html, /object-fit: contain/);
  assert.doesNotMatch(html, /object-fit:\s*cover/);
  assert.match(html, /data-action="take-break"/);
  assert.match(html, /data-action="snooze"/);
  assert.match(html, /data-action="keep-going"/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test('break page labels the essential robot, crowbar, clock, and privacy content', () => {
  assert.match(html, /robot holding its complete crowbar/);
  assert.match(html, /Complete opened pocket watch/);
  assert.match(html, /OPEN <span>CLOWK<\/span>/);
  assert.match(html, /No commands, terminal content, keys, files, prompts, telemetry, or forced process action/);
});

test('the open page keeps its session alive with a data-free loopback heartbeat', () => {
  assert.match(html, /fetch\('\/session\/heartbeat', \{ method: 'POST', credentials: 'same-origin' \}\)/);
  assert.match(html, /setInterval\(\(\) => \{ beat\(\); \}, 300000\)/);
  assert.match(html, /addEventListener\('pagehide', stopHeartbeat\)/);
  assert.match(html, /finished = true;\s*\n\s*stopHeartbeat\(\);\s*\n\s*message\.textContent = copy\[action\]/);
});

test('the heartbeat resumes after a back-forward-cache restore but not after a choice', () => {
  assert.match(html, /addEventListener\('pageshow', async \(event\) => \{/);
  assert.match(html, /if \(!event\.persisted \|\| finished\) return;/);
  assert.match(html, /if \(await beat\(\)\) startHeartbeat\(\);/);
  assert.match(html, /function startHeartbeat\(\) \{\s*\n\s*if \(finished \|\| heartbeat !== null\) return;/);
});
