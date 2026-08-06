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
