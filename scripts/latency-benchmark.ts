/**
 * Latency benchmark for ShieldLedger circuits.
 *
 * WHAT THIS MEASURES (read before judging the numbers):
 *   This times the compiled circuits executing in the compact-runtime VM as
 *   plain JavaScript — i.e. the LOCAL SIMULATOR state-transition check used
 *   by the test suite (tests/shield-ledger-simulator.ts). It does NOT measure
 *   real ZK proof generation: no prover, no proof-server, no proving keys,
 *   no network submission. Real proving happens against the docker
 *   proof-server on a live network and is orders of magnitude heavier.
 *
 * Run:  npx tsx scripts/latency-benchmark.ts
 * Depends only on repo files + npm deps. No network, no docker.
 */
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import {
  ShieldLedgerSimulator,
  deriveBidCommitment,
} from '../tests/shield-ledger-simulator.js';
import { createShieldLedgerPrivateState } from '../src/witnesses.js';
import { insuranceContribution, insurancePoolKey } from '../src/insurance.js';

setNetworkId('undeployed');

const SAMPLES = 30;
const PASSES = 2;

const SME_SECRET = bytes32(1);
const LENDER = [bytes32(10), bytes32(11), bytes32(12), bytes32(13)];
const DUE = 1_700_000_000n;
const AFTER_DUE = DUE + 1n;
const AMOUNT = 10_000n;

function bytes32(value: number): Uint8Array {
  const out = new Uint8Array(32);
  out[31] = value;
  return out;
}

function newSim(): ShieldLedgerSimulator {
  return new ShieldLedgerSimulator(
    createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER[0] }),
  );
}

interface Sample {
  ms: number;
  compute: bigint;
  read: bigint;
}

function round4(n: number): string {
  return n.toFixed(4).padStart(9);
}

/** Summarise samples: min/median/max/avg/stddev/p95 + outlier count. */
function summarize(label: string, samples: Sample[]): void {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const n = ms.length;
  const avg = ms.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 === 1 ? ms[(n - 1) / 2] : (ms[n / 2 - 1] + ms[n / 2]) / 2;
  const p95 = ms[Math.min(n - 1, Math.ceil(n * 0.95) - 1)];
  const stddev = Math.sqrt(ms.reduce((a, b) => a + (b - avg) ** 2, 0) / n);
  const outliers = ms.filter((m) => m > median * 5 && median > 0).length;
  const calcMid = samples.map((s) => s.compute).filter((v) => v > 0n);
  const readMid = samples.map((s) => s.read).filter((v) => v > 0n);
  const computeLine = calcMid.length
    ? ` | modeled compute ${Number(calcMid[0])} ps`
    : '';
  const readLine = readMid.length
    ? ` | modeled read ${Number(readMid[0])} ps`
    : '';
  console.log(
    `${label.padEnd(26)} n=${n}  min=${round4(ms[0])}  avg=${round4(avg)}  ` +
      `median=${round4(median)}  max=${round4(ms[n - 1])}  p95=${round4(p95)}  ` +
      `stddev=${round4(stddev)} ms${outliers ? `  *** ${outliers} outlier(s) >5x median ***` : ''}` +
      (computeLine || readLine ? computeLine + readLine : ''),
  );
}

/** time a raw impure-circuit call on the live context; returns elapsed ms + gasCost. */
function timeCircuit(
  sim: ShieldLedgerSimulator,
  circuit: 'registerInvoice' | 'settleInvoice' | 'revealBid' | 'settleSplitInvoice' | 'claimInsurancePayout' | 'claimPoolInsurancePayout',
  args: unknown[],
): Sample {
  const fn = (sim.contract.impureCircuits as any)[circuit];
  const t0 = performance.now();
  const res = fn(sim.circuitContext, ...args);
  const ms = performance.now() - t0;
  sim.circuitContext = res.context;
  const compute = typeof res.gasCost?.computeTime === 'bigint' ? res.gasCost.computeTime : 0n;
  const read = typeof res.gasCost?.readTime === 'bigint' ? res.gasCost.readTime : 0n;
  return { ms, compute, read };
}

function sampleRegister(sim: ShieldLedgerSimulator, nullifier: Uint8Array): Sample {
  const lg = sim.getLedger();
  const poolKey = insurancePoolKey();
  const balance = lg.insurancePools.member(poolKey) ? lg.insurancePools.lookup(poolKey).balance : 0n;
  const premium = insuranceContribution(AMOUNT);
  return timeCircuit(sim, 'registerInvoice', [nullifier, 650n, AMOUNT, 0n, premium, balance + premium, 0n]);
}

function sampleReveal(sim: ShieldLedgerSimulator, nullifier: Uint8Array, amt: bigint, rate: bigint): Sample {
  sim.registerInvoice(nullifier, 650n, AMOUNT, 0n, 0n);
  sim.switchIdentity({ lenderSecret: LENDER[0] });
  sim.submitBid(nullifier, deriveBidCommitment(LENDER[0], nullifier, amt, DUE, rate, false));
  return timeCircuit(sim, 'revealBid', [nullifier, amt, DUE, rate, false]);
}

function sampleSettle(sim: ShieldLedgerSimulator, nullifier: Uint8Array, amt: bigint, rate: bigint): Sample {
  sim.registerInvoice(nullifier, 650n, AMOUNT, 0n, 0n);
  sim.switchIdentity({ lenderSecret: LENDER[0] });
  sim.submitBid(nullifier, deriveBidCommitment(LENDER[0], nullifier, amt, DUE, rate, false));
  sim.revealBid(nullifier, amt, DUE, rate, false);
  sim.switchIdentity({ smeSecret: SME_SECRET });
  return timeCircuit(sim, 'settleInvoice', [nullifier, amt, DUE, DUE]);
}

/** Register a pool invoice and fill all 4 slots; returns payouts for the timed settle. */
function prepPool(sim: ShieldLedgerSimulator, nullifier: Uint8Array): [bigint, bigint, bigint, bigint] {
  sim.registerInvoice(nullifier, 650n, AMOUNT, 0n, 4n);
  for (let i = 0; i < LENDER.length; i++) {
    const commitment = bytes32(LENDER[i][31]);
    sim.switchIdentity({ lenderSecret: LENDER[i] });
    sim.submitBid(nullifier, commitment);
    sim.revealPoolBid(nullifier, BigInt(i), commitment);
  }
  sim.switchIdentity({ smeSecret: SME_SECRET });
  const payouts: [bigint, bigint, bigint, bigint] = [2400n, 2400n, 2400n, 2400n];
  return payouts;
}

function sampleSplitSettle(sim: ShieldLedgerSimulator, i: number): Sample {
  const nullifier = bytes32(200 + i);
  const payouts = prepPool(sim, nullifier);
  const lg = sim.getLedger();
  const poolKey = insurancePoolKey();
  const balance = lg.insurancePools.member(poolKey) ? lg.insurancePools.lookup(poolKey).balance : 0n;
  return timeCircuit(sim, 'settleSplitInvoice', [
    nullifier, DUE, DUE,
    2500n, 2500n, 2500n, 2500n,
    payouts[0], payouts[1], payouts[2], payouts[3],
    AMOUNT, 9600n, balance,
  ]);
}

/** Build a large pool balance, finance one invoice (single lender), leave it
 *  unsettled past due so the default-insurance claim is valid. */
function prepDefault(sim: ShieldLedgerSimulator, nullifier: Uint8Array): void {
  // Seed the pool with several registrations so the 50% payout can be paid.
  for (let k = 0; k < 4; k++) {
    sim.registerInvoice(bytes32(100 + k * 10), 650n, 100_000n, 0n, 0n);
  }
  sim.registerInvoice(nullifier, 650n, AMOUNT, 0n, 0n);
  sim.switchIdentity({ lenderSecret: LENDER[0] });
  sim.submitBid(nullifier, deriveBidCommitment(LENDER[0], nullifier, 1000n, DUE, 400n, false));
  sim.revealBid(nullifier, 1000n, DUE, 400n, false);
}

function sampleClaim(sim: ShieldLedgerSimulator, i: number): Sample {
  const nullifier = bytes32(300 + i);
  prepDefault(sim, nullifier);
  sim.switchIdentity({ lenderSecret: LENDER[0] });
  const lg = sim.getLedger();
  const balance = lg.insurancePools.lookup(insurancePoolKey()).balance;
  return timeCircuit(sim, 'claimInsurancePayout', [nullifier, 500n, 500n, balance - 500n, AFTER_DUE]);
}

function samplePoolClaim(sim: ShieldLedgerSimulator, i: number): Sample {
  const nullifier = bytes32(400 + i);
  const payouts = prepPool(sim, nullifier);
  // Settle the pool first (mirrors setupAndSettlePool in pool-insurance.test.ts).
  sim.switchIdentity({ smeSecret: SME_SECRET });
  sim.settleSplitInvoice(nullifier, DUE, DUE, [2500n, 2500n, 2500n, 2500n], payouts, AMOUNT, 9600n);
  const lg = sim.getLedger();
  const inv = lg.invoices.lookup(nullifier);
  const poolKey = insurancePoolKey();
  const balance = lg.insurancePools.lookup(poolKey).balance;
  const totalInsurance = inv.amount / 2n;
  const insurancePayout =
    totalInsurance <= balance
      ? (payouts[0] * totalInsurance) / inv.amount
      : (payouts[0] * balance) / inv.amount;
  const newBalance = balance - insurancePayout;
  sim.switchIdentity({ lenderSecret: LENDER[0] });
  return timeCircuit(sim, 'claimPoolInsurancePayout', [
    nullifier, 0n, totalInsurance, insurancePayout, newBalance, AFTER_DUE, payouts[0],
  ]);
}

function runPass(pass: number, acc: Record<string, Sample[]>): void {
  console.log(`\n=== pass ${pass} ===`);

  // Warm-up pass: exercise every circuit once untimed so cold-start/JIT noise
  // does not pollute (or hide inside) the measured samples.
  { const s = newSim(); sampleRegister(s, bytes32(1)); }
  { const s = newSim(); sampleReveal(s, bytes32(2), 8000n, 400n); }
  { const s = newSim(); sampleSettle(s, bytes32(3), 8000n, 400n); }
  { const s = newSim(); sampleSplitSettle(s, 1); }
  { const s = newSim(); sampleClaim(s, 1); }
  { const s = newSim(); samplePoolClaim(s, 1); }

  const reg: Sample[] = [];
  const reveal: Sample[] = [];
  const settle: Sample[] = [];
  const split: Sample[] = [];
  const claim: Sample[] = [];
  const poolClaim: Sample[] = [];

  for (let i = 0; i < SAMPLES; i++) {
    reg.push(sampleRegister(newSim(), bytes32(10 + i)));
    reveal.push(sampleReveal(newSim(), bytes32(20 + i), 8000n, 400n));
    settle.push(sampleSettle(newSim(), bytes32(30 + i), 8000n, 400n));
    split.push(sampleSplitSettle(newSim(), 10 + i));
    claim.push(sampleClaim(newSim(), 10 + i));
    poolClaim.push(samplePoolClaim(newSim(), 10 + i));
  }

  const vectors: [string, Sample[]][] = [
    ['registerInvoice', reg],
    ['revealBid', reveal],
    ['settleInvoice', settle],
    ['settleSplitInvoice', split],
    ['claimInsurancePayout', claim],
    ['claimPoolInsurancePayout', poolClaim],
  ];

  console.log('\nSimulator circuit execution time in ms (compact-runtime VM, NOT real proving):');
  for (const [name, samples] of vectors) {
    summarize(name, samples);
    acc[name].push(...samples);
  }
}

console.log('ShieldLedger circuit latency benchmark (local simulator only)');
console.log('===============================================================');
console.log(`platform=${process.platform} arch=${process.arch} node=${process.version}`);
console.log(`cpu=${os.cpus()[0]?.model ?? 'unknown'} cores=${os.cpus().length}`);
console.log(`mem=${(os.totalmem() / 2 ** 30).toFixed(1)} GiB  uptime=${Math.round(os.uptime() / 60)} min`);
console.log(
  '\nMeasured entity: compiled circuits running in the compact-runtime VM as plain JS.\n' +
  'NOT measured: real ZK proof generation (proof-server + keys + network).\n' +
  'Numbers are wall-clock on this shared machine, sampled fresh-state each run.\n',
);

const acc: Record<string, Sample[]> = {
  registerInvoice: [], revealBid: [], settleInvoice: [],
  settleSplitInvoice: [], claimInsurancePayout: [], claimPoolInsurancePayout: [],
};
for (let p = 1; p <= PASSES; p++) runPass(p, acc);

console.log(`\n=== combined over ${PASSES} passes (n=${SAMPLES * PASSES} each) ===`);
for (const name of Object.keys(acc)) summarize(name, acc[name]);

console.log('\nDone. Interpretation and caveats: docs/LATENCY_BENCHMARKS.md');