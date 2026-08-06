#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { stateDirectory } = require('./config');
const { runMonitor } = require('./monitor');

runMonitor().catch((error) => {
  try {
    const directory = stateDirectory();
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'last-error.txt'), `${error.message}\n`, { mode: 0o600 });
  } catch {}
  process.exitCode = 1;
});
