/* Runs the full deterministic acceptance suite, one file per process so the
 * injected-Electron tests cannot pollute each other's module state.
 *
 * Everything here is headless: no window opens, no screen/audio is captured,
 * no socket is bound, no permission is requested.
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const TESTS = [
  'reminder.test.js',
  'targets.test.js',
  'adapters.test.js',
  'window-contract.test.js',
  'overlay-dom.test.js',
  'no-browser-static.test.js',
  'cli-version.test.js',
  'install-script.test.js',
];

let failed = 0;
for (const file of TESTS) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (result.status !== 0) {
    failed++;
    console.error(`✗ ${file}`);
  } else {
    console.log(`✓ ${file}`);
  }
}

if (failed) {
  console.error(`\n${failed}/${TESTS.length} test files failed`);
  process.exit(1);
}
console.log(`\nopen-clowk: all ${TESTS.length} test files passed`);
