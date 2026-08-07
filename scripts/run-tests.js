#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const directory = path.resolve(__dirname, '..', 'test');
const files = fs.readdirSync(directory)
  .filter((file) => file.endsWith('.test.js'))
  .sort()
  .map((file) => path.join(directory, file));

if (files.length === 0) {
  console.error('No test files found.');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', shell: false });
  process.exitCode = result.status === null ? 1 : result.status;
}
