#!/usr/bin/env node

'use strict';

const {
  WORLD_CLOCKS,
  timeIn,
  openClock,
  readLedger,
  summary,
} = require('../lib/clowk');

const ORANGE = '\x1b[38;5;208m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const HELP = `
${BOLD}OPEN CLOWK${RESET} — an agent that virtually opens every clock.

Usage:
  open-clowk              open your local clock
  open-clowk --all        open EVERY clock (12 timezones, no survivors)
  open-clowk --tz <zone>  open one specific clock (e.g. Europe/Paris)
  open-clowk --list       list the clocks the agent can open
  open-clowk --ledger     show total damage (clocks opened, tokens burned)
  open-clowk --fast       skip the dramatic pauses
  open-clowk --help       this

Why:
  So you can LOSE TRACK OF TIME while burning Jean Michel Tokens.
  ${ORANGE}Tic tac, MF.${RESET}
`;

const BANNER = `
${ORANGE}${BOLD}   ██████  ██████  ███████ ███    ██${RESET}
${ORANGE}${BOLD}  ██    ██ ██   ██ ██      ████   ██${RESET}
${ORANGE}${BOLD}  ██    ██ ██████  █████   ██ ██  ██${RESET}
${ORANGE}${BOLD}  ██    ██ ██      ██      ██  ██ ██${RESET}
${ORANGE}${BOLD}   ██████  ██      ███████ ██   ████${RESET}
${BOLD}   C L O W K${RESET}  ${DIM}· the anti-wellness agent · v1.0.0${RESET}
`;

async function main() {
  const args = process.argv.slice(2);
  const fast = args.includes('--fast');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  if (args.includes('--list')) {
    console.log(`\n${BOLD}Clocks the agent can (and will) open:${RESET}\n`);
    for (const c of WORLD_CLOCKS) {
      console.log(`  ${ORANGE}◷${RESET} ${c.label.padEnd(24)} ${DIM}${timeIn(c.tz)} — for now.${RESET}`);
    }
    console.log('');
    return;
  }

  if (args.includes('--ledger')) {
    console.log(summary(readLedger()));
    return;
  }

  console.log(BANNER);

  let ledger;

  const tzFlag = args.indexOf('--tz');
  if (tzFlag !== -1 && args[tzFlag + 1]) {
    const tz = args[tzFlag + 1];
    const known = WORLD_CLOCKS.find((c) => c.tz === tz);
    ledger = await openClock(known || { tz, label: tz }, { fast });
  } else if (args.includes('--all')) {
    console.log(`${DIM}   opening every clock. this is irreversible (virtually).${RESET}\n`);
    for (const clock of WORLD_CLOCKS) {
      ledger = await openClock(clock, { fast });
    }
  } else {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    ledger = await openClock({ tz, label: `${tz} (your clock)` }, { fast });
  }

  console.log(summary(ledger));
}

main().catch((err) => {
  console.error('The clock refused to open. Suspicious.', err.message);
  process.exit(1);
});
