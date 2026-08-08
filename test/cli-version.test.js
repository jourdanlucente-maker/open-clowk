/* Acceptance: the CLI banner and package.json agree on the version.
 *
 * Runs the real CLI as a subprocess with an isolated HOME (the joke ledger
 * writes to ~/.open-clowk) and checks the printed banner.
 *
 * Run: node test/cli-version.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const pkg = require('../package.json');

const fakeHome = fs.mkdtempSync(path.join(__dirname, '.tmp-home-'));
try {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, '..', 'bin', 'open-clowk.js'), '--fast', '--tz', 'UTC'],
    { env: { ...process.env, HOME: fakeHome }, encoding: 'utf8' }
  );

  assert.strictEqual(result.status, 0, `CLI exits cleanly (stderr: ${result.stderr})`);
  assert.ok(
    result.stdout.includes(`v${pkg.version}`),
    `banner carries the package.json version (v${pkg.version})`
  );
  assert.strictEqual(pkg.version, '2.0.0', 'package.json version is 2.0.0');
  assert.ok(!result.stdout.includes('v1.0.0'), 'no stale v1.0.0 banner remains');

  // the joke ledger stays inside the (fake) home, nowhere else
  assert.ok(
    fs.existsSync(path.join(fakeHome, '.open-clowk', 'ledger.json')),
    'CLI ledger writes only under the user home'
  );
} finally {
  fs.rmSync(fakeHome, { recursive: true, force: true });
}

console.log('CLI banner/version agreement: all tests passed');
