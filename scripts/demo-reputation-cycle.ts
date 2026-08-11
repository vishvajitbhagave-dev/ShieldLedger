// ShieldLedger demo-only tool: walks through several invoice cycles and shows
// the SME's cross-deal reputation changing live, using the REAL contract
// circuits (via the headless simulator) and the REAL scoring formula from
// src/reputation.ts.
//
// Purely for demo recordings: no network, no wallet, no ledger writes.
//
//   npm run demo:reputation                                      # scripted 4-cycle demo
//   npm run demo:reputation -- on-time on-time late on-time      # custom outcome order
//   npm run cli -- --demo-reputation-cycle                       # same demo via the CLI flag
//
// The score printed after each settlement is the actual private state produced
// by applyReputationUpdate() once the settleInvoice circuit has classified the
// settlement on-time/late - nothing is faked or mocked.
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

import { createShieldLedgerPrivateState } from '../src/witnesses.js';
import { reputationView } from '../src/reputation.js';
import {
  MIN_CREDIT_SCORE,
  ShieldLedgerSimulator,
  deriveBidCommitment,
} from '../tests/shield-ledger-simulator.js';

export type DemoOutcome = 'on-time' | 'late';

/** The scripted demo script: three clean settlements, then one late/default. */
export const DEFAULT_DEMO_OUTCOMES: readonly DemoOutcome[] = [
  'on-time',
  'on-time',
  'late',
  'on-time',
];

const AMOUNT = 1000n;
const RATE_BPS = 400n;
const SECONDS_PER_DAY = 86_400n;
const DUE_IN_DAYS = 60n;
const ON_TIME_DAYS_BEFORE = 2n;
const LATE_DAYS_AFTER = 30n;

function nullifierFor(cycle: number): Uint8Array {
  const hex = cycle.toString(16).padStart(64, '0');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function padScore(value: bigint): string {
  return value.toString().padStart(3);
}

export function runReputationCycleDemo(
  outcomes: readonly DemoOutcome[] = DEFAULT_DEMO_OUTCOMES,
): void {
  // Deterministic identities so the recording is reproducible on every run.
  const smeSecret = new Uint8Array(32).map((_, i) => i + 1);
  const lenderSecret = new Uint8Array(32).map((_, i) => 200 + i);
  const sim = new ShieldLedgerSimulator(
    createShieldLedgerPrivateState({ smeSecret, lenderSecret }),
  );

  const dueDate = BigInt(Math.floor(Date.now() / 1000)) + DUE_IN_DAYS * SECONDS_PER_DAY;
  const invoiceLabel = (cycle: number): string => `INV-${String(cycle).padStart(4, '0')}`;

  console.log('='.repeat(74));
  console.log('  ShieldLedger - Cross-Deal Reputation Demo    [DEMO-ONLY TOOL]');
  console.log('='.repeat(74));
  console.log(`  ${outcomes.length} invoice cycles through the REAL Compact circuits`);
  console.log('  (headless simulator; no devnet, no wallet). Scoring formula:');
  console.log('  src/reputation.ts  ->  +10 on-time, -20 late, clamped 0..100.');
  console.log('-'.repeat(74));

  let onTimeTotal = 0n;
  let lateTotal = 0n;

  outcomes.forEach((outcome, index) => {
    const cycle = index + 1;
    const nullifier = nullifierFor(cycle);

    const before = reputationView(sim.getPrivateState());

    // Register with the honest ZK bound = the current score: the circuit
    // asserts smeReputationScore() >= reputationThreshold, so a bound above
    // the true score would make proof generation fail.
    sim.registerInvoice(nullifier, MIN_CREDIT_SCORE, AMOUNT, before.score);

    // A lender bids on the invoice; the bid is sealed, then revealed (the
    // lowest-rate reveal wins the auction).
    const commitment = deriveBidCommitment(lenderSecret, nullifier, AMOUNT, dueDate, RATE_BPS);
    sim.submitBid(nullifier, commitment);
    sim.revealBid(nullifier, AMOUNT, dueDate, RATE_BPS);

    // Settle on/before the due date (on-time) or after it (late/default). The
    // circuit compares settledAt <= financedDueDate and returns the boolean;
    // the simulator then applies the real formula via applyReputationUpdate.
    const settledAt =
      outcome === 'on-time'
        ? dueDate - ON_TIME_DAYS_BEFORE * SECONDS_PER_DAY
        : dueDate + LATE_DAYS_AFTER * SECONDS_PER_DAY;
    sim.settleInvoice(nullifier, AMOUNT, dueDate, settledAt);

    const after = reputationView(sim.getPrivateState());
    const delta = after.score - before.score;

    // The delta must equal the formula's constant (no cap/floor reached at
    // these magnitudes) - guards that the real logic ran, not a mock.
    const expectedDelta = outcome === 'on-time' ? 10n : -20n;
    if (delta !== expectedDelta) {
      throw new Error(
        `demo integrity check failed at cycle ${cycle}: expected ${expectedDelta}, simulator applied ${delta}`,
      );
    }

    if (outcome === 'on-time') onTimeTotal += 1n;
    else lateTotal += 1n;

    const timing =
      outcome === 'on-time'
        ? `settled ${ON_TIME_DAYS_BEFORE} day(s) before the due date`
        : `settled ${LATE_DAYS_AFTER} day(s) after the due date`;

    console.log('');
    console.log(`  Cycle ${cycle}/${outcomes.length}   ${invoiceLabel(cycle)}`);
    console.log(`    register   Invoice committed; ZK-proof: reputation >= ${before.score.toString()}`);
    console.log('    bid        Lender sealed a bid -> revealed (lowest rate wins)');
    console.log(`    settle     OUTCOME: ${outcome.toUpperCase().padEnd(7)}  (${timing})`);
    console.log(
      `    Reputation:  ${padScore(before.score)} -> ${padScore(after.score)}   (${delta > 0n ? '+' : ''}${delta.toString()})`,
    );
  });

  const finalView = reputationView(sim.getPrivateState());
  console.log('');
  console.log('-'.repeat(74));
  console.log(`  Final reputation: ${finalView.score.toString()}/100`);
  console.log(`  Settlements:      ${onTimeTotal.toString()} on-time, ${lateTotal.toString()} late`);
  console.log('');
  console.log('  Demo complete. This is a demo-only tool');
  console.log('  (scripts/demo-reputation-cycle.ts) and is not part of the');
  console.log('  production flow.');
  console.log('='.repeat(74));
}

const isDirectRun =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const positionals = process.argv.slice(2).filter((a) => a === 'on-time' || a === 'late') as DemoOutcome[];
  runReputationCycleDemo(positionals.length > 0 ? positionals : DEFAULT_DEMO_OUTCOMES);
}
