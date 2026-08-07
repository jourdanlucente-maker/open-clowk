/**
 * OPEN CLOWK — the core.
 *
 * An agent that virtually opens every clock.
 * Once a clock is open, the time inside escapes.
 * You lose track of it. That is the product.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ORANGE = '\x1b[38;5;208m';
const GOLD = '\x1b[38;5;220m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const LEDGER_DIR = path.join(os.homedir(), '.open-clowk');
const LEDGER_FILE = path.join(LEDGER_DIR, 'ledger.json');

// Every clock the agent knows how to open. It will open all of them.
const WORLD_CLOCKS = [
  { tz: 'America/Santiago', label: 'Santiago' },
  { tz: 'America/New_York', label: 'New York' },
  { tz: 'America/Los_Angeles', label: 'Los Angeles' },
  { tz: 'America/Sao_Paulo', label: 'São Paulo' },
  { tz: 'Europe/Paris', label: 'Paris' },
  { tz: 'Europe/London', label: 'London' },
  { tz: 'Europe/Zurich', label: 'Zurich (they hate this)' },
  { tz: 'Africa/Cairo', label: 'Cairo' },
  { tz: 'Asia/Dubai', label: 'Dubai' },
  { tz: 'Asia/Tokyo', label: 'Tokyo' },
  { tz: 'Australia/Sydney', label: 'Sydney' },
  { tz: 'Pacific/Auckland', label: 'Auckland' },
];

function timeIn(tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  } catch (e) {
    return '??:??';
  }
}

function closedClock(label, time) {
  return [
    '                .--=--.',
    "             .-'  ___  '-.",
    "            /   .' 12 '.   \\",
    `           |   |  ${BOLD}${time}${RESET}  |   |`,
    "           |   | 9     3 |   |",
    "            \\   '. 6  .'   /",
    "             '-.  ¯¯¯  .-'",
    "                '--=--'",
    `           ${DIM}[ ${label} — closed ]${RESET}`,
  ].join('\n');
}

function openedClock(label) {
  return [
    `                .--=--.         ${GOLD}_.-._${RESET}`,
    `             .-'       '-.     ${GOLD}/ 12  \\${RESET}`,
    `            /             \\   ${GOLD}| 9   3|${RESET}`,
    `           |               |   ${GOLD}\\  6  /${RESET}`,
    `           |   ${DIM}(no time)${RESET}   |    ${GOLD}'-.-'${RESET}`,
    "            \\             /",
    "             '-.       .-'",
    `                '--=--'    ${ORANGE}⚙ ° ⚙ * ⚙${RESET}`,
    `           ${ORANGE}[ ${label} — OPEN. time escaped ]${RESET}`,
  ].join('\n');
}

function burnAmount() {
  // Every opened clock burns a strictly unreasonable amount of Jean Michel Tokens.
  return 100000 + Math.floor(Math.random() * 400000);
}

function readLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
  } catch (e) {
    return { clocksOpened: 0, tokensBurned: 0 };
  }
}

function writeLedger(ledger) {
  try {
    fs.mkdirSync(LEDGER_DIR, { recursive: true });
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));
  } catch (e) {
    // If we can't persist the damage, the damage was still done.
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openClock({ tz, label }, { fast = false } = {}) {
  const time = timeIn(tz);

  process.stdout.write(closedClock(label, time) + '\n');
  if (!fast) await sleep(700);

  process.stdout.write(`\n           ${DIM}the agent inserts the crowbar...${RESET}\n`);
  if (!fast) await sleep(500);
  process.stdout.write(`           ${DIM}creeeeeeak.${RESET}\n\n`);
  if (!fast) await sleep(500);

  process.stdout.write(openedClock(label) + '\n');

  const burned = burnAmount();
  const ledger = readLedger();
  ledger.clocksOpened += 1;
  ledger.tokensBurned += burned;
  writeLedger(ledger);

  process.stdout.write(
    `           ${ORANGE}🔥 burned ${burned.toLocaleString('en-US')} Jean Michel Tokens${RESET}\n\n`
  );

  return ledger;
}

function summary(ledger) {
  const lines = [
    `${BOLD}   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`,
    `   ${BOLD}OPEN CLOWK — session report${RESET}`,
    `   clocks opened (virtually) : ${ORANGE}${ledger.clocksOpened}${RESET}`,
    `   Jean Michel Tokens burned : ${ORANGE}${ledger.tokensBurned.toLocaleString('en-US')}${RESET}`,
    `   current time              : ${DIM}unknown. you opened the clocks.${RESET}`,
    '',
    `   ${BOLD}You have successfully lost track of time.${RESET}`,
    `   ${ORANGE}${BOLD}Tic tac, MF.${RESET}`,
    `${BOLD}   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`,
  ];

  if (ledger.tokensBurned > 3000000) {
    lines.push(
      `   ${DIM}⚠ 3M+ tokens burned. jean-michel-repos would like a word.${RESET}`,
      `   ${DIM}  (Real REST > API REST. But you knew that.)${RESET}`
    );
  }

  return lines.join('\n');
}

module.exports = {
  WORLD_CLOCKS,
  timeIn,
  closedClock,
  openedClock,
  openClock,
  readLedger,
  summary,
};
