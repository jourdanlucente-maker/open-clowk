#!/usr/bin/env node

'use strict';

const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { version } = require('../package.json');
const {
  PRESETS,
  createConfig,
  normalizeProcessName,
  readConfig,
  stateDirectory,
  writeConfig,
} = require('../lib/config');
const { monitorStatus } = require('../lib/control');
const { listProcesses } = require('../lib/platform');
const { startMonitor, stopMonitor } = require('../lib/service');

const HELP = `OPEN CLOWK — a private terminal-time break intervention.

Usage:
  open-clowk setup [--minutes N] [--watch names] [--snooze N] [--start]
  open-clowk detect
  open-clowk start
  open-clowk stop
  open-clowk status
  open-clowk --help
  open-clowk --version

Setup options:
  --minutes N   whole consecutive minutes before the intervention (minimum 1)
  --watch LIST  comma-separated presets or exact process names
  --snooze N    whole minutes for Snooze (default 5)
  --start       start the detached per-user monitor after saving

Presets: ${Object.keys(PRESETS).join(', ')}

Privacy: process names only. Never commands, terminal content, keys, files, prompts,
or external network activity. The monitor never kills or blocks a process.`;

function parseOptions(args) {
  const options = { start: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--start') {
      options.start = true;
      continue;
    }
    if (['--minutes', '--watch', '--snooze'].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown setup option: ${arg}`);
  }
  return options;
}

async function interactiveOptions(options) {
  if (options.minutes && options.watch) return options;
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('Non-interactive setup requires --minutes and --watch.');
  }
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    const minutes = options.minutes || await prompt.question('Intervene after how many consecutive minutes? [25] ');
    const watch = options.watch || await prompt.question('Watch presets/custom process names? [terminal,claude,codex,kimi] ');
    const snooze = options.snooze || await prompt.question('Snooze for how many minutes? [5] ');
    let start = options.start;
    if (!start) start = /^y(es)?$/i.test(await prompt.question('Start the monitor now? [y/N] '));
    return {
      minutes: minutes || '25',
      watch: watch || 'terminal,claude,codex,kimi',
      snooze: snooze || '5',
      start,
    };
  } finally {
    prompt.close();
  }
}

function duration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

async function setup(args, env) {
  const options = await interactiveOptions(parseOptions(args));
  if ((await monitorStatus({ env })).running) {
    throw new Error('Stop the running monitor before changing its configuration.');
  }
  const config = createConfig({
    thresholdMinutes: options.minutes,
    snoozeMinutes: options.snooze || 5,
    watchedProcesses: options.watch,
  });
  writeConfig(config, { env });
  console.log(`Saved ${stateDirectory({ env })}`);
  console.log(`Intervention: ${config.thresholdMinutes} minute(s) · Snooze: ${config.snoozeMinutes} minute(s)`);
  console.log(`Watching: ${config.watchedProcesses.join(', ')}`);
  if (options.start) {
    const result = await startMonitor({ env });
    console.log(result.started ? 'Monitor started. Tic tac.' : 'Monitor was already running.');
  } else {
    console.log('Run open-clowk start when ready.');
  }
}

async function detect(env) {
  const visible = await listProcesses({ env });
  const names = [...new Set(visible.map(normalizeProcessName))].sort((a, b) => a.localeCompare(b));
  console.log('Visible process names (names only; no commands or content):');
  for (const name of names) console.log(`  ${name}`);
  console.log(`\n${names.length} unique process name(s). Use exact names with open-clowk setup --watch.`);
}

async function status(env) {
  const config = readConfig({ env });
  if (!config) {
    console.log('Open Clowk is not configured. Run open-clowk setup.');
    return;
  }
  const result = await monitorStatus({ env });
  console.log(`Monitor: ${result.running ? 'running' : 'stopped'}`);
  console.log(`Threshold: ${config.thresholdMinutes} minute(s)`);
  console.log(`Watching: ${config.watchedProcesses.join(', ')}`);
  if (result.running) {
    console.log(`Selected process open: ${result.health.activeMatches.length ? 'yes' : 'no'}`);
    console.log(`Matches: ${result.health.activeMatches.join(', ') || 'none'}`);
    console.log(`Consecutive time: ${duration(result.health.tracker.consecutiveMs)}`);
    console.log(`State: ${result.health.tracker.mode}`);
    if (result.health.lastError) console.log(`Monitor error: ${result.health.lastError}`);
    if (result.health.lastBrowserError) {
      console.log(`Break page launch error: ${result.health.lastBrowserError}`);
    }
  }
}

async function main(args = process.argv.slice(2), env = process.env) {
  const [command, ...rest] = args;
  if (!command || command === '--help') {
    console.log(HELP);
    return;
  }
  if (command === '--version') {
    console.log(`open-clowk ${version}`);
    return;
  }
  if (command === 'setup') return setup(rest, env);
  if (command === 'detect') {
    if (rest.length) throw new Error('detect does not accept options.');
    return detect(env);
  }
  if (command === 'start') {
    if (rest.length) throw new Error('start does not accept options.');
    const result = await startMonitor({ env });
    console.log(result.started ? 'Monitor started. Tic tac.' : 'Monitor already running. One robot is enough.');
    return;
  }
  if (command === 'stop') {
    if (rest.length) throw new Error('stop does not accept options.');
    console.log(await stopMonitor({ env }) ? 'Monitor stopped. Take the break.' : 'Monitor already stopped.');
    return;
  }
  if (command === 'status') {
    if (rest.length) throw new Error('status does not accept options.');
    return status(env);
  }
  throw new Error(`Unknown command: ${command}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Open Clowk refused. ${error.message}`);
    console.error('Run open-clowk --help for truthful instructions.');
    process.exitCode = 1;
  });
}

module.exports = { HELP, duration, main, parseOptions };
