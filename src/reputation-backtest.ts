// Reputation scoring backtest — pure, deterministic simulation.
//
// Simulates fake SME repayment histories and drives them through the REAL
// wallet-layer scoring function (applyReputationUpdate in ./reputation.ts) to
// check whether the formula's OUTPUT behavior actually separates reliable from
// unreliable SMEs. It also checks the downstream rate effect via the REAL
// pricing engine (getSuggestedRate in ../frontend/src/pricing.ts).
//
// This is deliberately NOT a reimplementation: both formulas are called, not
// copied. This is a different concern from the documented "reputation is
// publicly reconstructable on-chain" privacy limitation — that is about
// secrecy, this is about whether the formula's output semantics make sense.
//
// Scoring rule (from ./reputation.ts):
//   on-time settlement: score +10, capped at 100
//   late settlement:    score -20, floored at 0
// Net expected drift per settlement for an SME with on-time probability p:
//   10p - 20(1-p) = 30p - 20  →  zero drift at exactly p = 2/3.

import {
  applyReputationUpdate,
  REPUTATION_CAP,
  REPUTATION_FLOOR,
  type ReputationUpdate,
} from './reputation.js';
import type { ShieldLedgerPrivateState } from './witnesses.js';
import { getSuggestedRate } from '../frontend/src/pricing.js';

export type ArchetypeId =
  | 'alwaysOnTime'
  | 'alwaysLate'
  | 'mixed70'
  | 'reformed'
  | 'turnedBad';

export interface ArchetypeSpec {
  readonly id: ArchetypeId;
  readonly label: string;
  /** Decide whether settlement event `index` (0-based) was on-time. */
  readonly oracle: (index: number, rng: () => number) => boolean;
  /** Absorbing (monotone) or stochastic (mixed) trajectory. */
  readonly kind: 'absorbing' | 'stochastic';
}

export const MIXED_ON_TIME_RATE = 0.7;
export const REFORMED_OK_FROM = 20; // first 20 events late, then always on-time
export const TURNED_BAD_OK_UNTIL = 20; // first 20 events on-time, then always late
export const MAX_ABSORBING_EVENTS = 300;
export const MAX_STOCHASTIC_EVENTS = 2_000;
export const TAIL_WINDOW = 500;

// ── Archetype definitions ────────────────────────────────────────────────────

/** 100% on-time. Expected: climbs +10/event to the 100 cap and stays. */
export const ALWAYS_ON_TIME: ArchetypeSpec = {
  id: 'alwaysOnTime',
  label: 'Always on-time',
  kind: 'absorbing',
  oracle: () => true,
};

/** 100% late. Expected: floors at 0 immediately and stays. */
export const ALWAYS_LATE: ArchetypeSpec = {
  id: 'alwaysLate',
  label: 'Always late',
  kind: 'absorbing',
  oracle: () => false,
};

/**
 * 70% on-time (seeded PRNG). Expected-drift analysis: p = 0.7 > 2/3 ⇒ the
 * walk drifts upward; question is whether it settles at a meaningful middle
 * (task expectation) or hugs the cap (the honest measured answer).
 */
export const MIXED_70: ArchetypeSpec = {
  id: 'mixed70',
  label: 'Mixed / inconsistent (70% on-time)',
  kind: 'stochastic',
  oracle: (_i, rng) => rng() < MIXED_ON_TIME_RATE,
};

/** Recovers: late-heavy for 20 events, then consistently on-time. */
export const REFORMED: ArchetypeSpec = {
  id: 'reformed',
  label: 'Reformed (bad → good at event 20)',
  kind: 'absorbing',
  oracle: (i) => i >= REFORMED_OK_FROM,
};

/** Declines: consistently good for 20 events, then consistently late. */
export const TURNED_BAD: ArchetypeSpec = {
  id: 'turnedBad',
  label: 'Recently turned bad (good → bad at event 20)',
  kind: 'absorbing',
  oracle: (i) => i < TURNED_BAD_OK_UNTIL,
};

export const ALL_ARCHETYPES: readonly ArchetypeSpec[] = [
  ALWAYS_ON_TIME,
  ALWAYS_LATE,
  MIXED_70,
  REFORMED,
  TURNED_BAD,
];

// ── Seeded PRNG (deterministic trajectories) ─────────────────────────────────

/** mulberry32 — small deterministic PRNG so every backtest is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Plateau / stability detection ────────────────────────────────────────────

export type Plateau =
  | {
      readonly kind: 'absorbing';
      /** The score the trajectory reaches and then holds forever. */
      readonly plateauScore: bigint;
      /** 1-based event count at which the plateau is reached and held. */
      readonly eventsToPlateau: number;
    }
  | {
      readonly kind: 'stationary';
      /** Mean score over the last TAIL_WINDOW events. */
      readonly tailMean: number;
      /** Min/max score observed over the last TAIL_WINDOW events. */
      readonly tailMin: bigint;
      readonly tailMax: bigint;
      /** True when the two halves of the tail window have close means. */
      readonly settled: boolean;
    };

/** Detect an absorbing constant tail: score[i] === last for all i >= k. */
function absorbingPlateau(history: readonly bigint[]): Plateau | null {
  const last = history[history.length - 1];
  let k = history.length - 1;
  while (k >= 0 && history[k] === last) k--;
  const firstIndex = k + 1;
  if (firstIndex > history.length - 2) return null;
  // Any constant tail of length >= 2 counts as absorbing (monotone-capped
  // sequences reach cap/floor and stay; they never leave it).
  const tailLen = history.length - 1 - firstIndex + 1; // history.length - firstIndex
  if (tailLen < 2) return null;
  return { kind: 'absorbing', plateauScore: last, eventsToPlateau: firstIndex + 1 };
}

function stationaryStats(history: readonly bigint[], tail: number): Plateau {
  const start = Math.max(0, history.length - tail);
  const tailArr = history.slice(start);
  const asNum = tailArr.map(Number);
  const tailMean = asNum.reduce((a, b) => a + b, 0) / asNum.length;
  const tailMin = tailArr.reduce((a, b) => (b < a ? b : a), tailArr[0]);
  const tailMax = tailArr.reduce((a, b) => (b > a ? b : a), tailArr[0]);
  const half = Math.floor(tailArr.length / 2);
  const m1 =
    asNum.slice(0, half).reduce((a, b) => a + b, 0) / Math.max(1, half);
  const m2 =
    asNum.slice(half).reduce((a, b) => a + b, 0) / Math.max(1, asNum.length - half);
  const settled = Math.abs(m1 - m2) < 2;
  return { kind: 'stationary', tailMean, tailMin, tailMax, settled };
}

// ── Simulation ───────────────────────────────────────────────────────────────

export interface BacktestOutcome {
  readonly id: ArchetypeId;
  readonly label: string;
  readonly events: number;
  readonly plateau: Plateau;
  readonly finalScore: bigint;
  readonly onTimeCount: bigint;
  readonly lateCount: bigint;
}

function initialState(): ShieldLedgerPrivateState {
  const s = new Uint8Array(32);
  return {
    smeSecret: s,
    smeCreditScore: 720n,
    smeReputationScore: REPUTATION_FLOOR,
    smeOnTimeCount: 0n,
    smeLateCount: 0n,
    lenderSecret: s,
    lenderCreditScore: 750n,
    lenderExposureCap: 1_000_000n,
    lenderMinReputation: 0n,
    buyerSecret: s,
    claimSecret: s,
  };
}

/**
 * Run one deterministic trajectory for the archetype starting from score 0,
 * calling the REAL applyReputationUpdate for every settlement event.
 */
export function simulateArchetype(
  spec: ArchetypeSpec,
  seed = 42,
): BacktestOutcome {
  const rng = mulberry32(seed);
  const maxEvents =
    spec.kind === 'absorbing' ? MAX_ABSORBING_EVENTS : MAX_STOCHASTIC_EVENTS;
  let state = initialState();
  const history: bigint[] = [];
  for (let i = 0; i < maxEvents; i++) {
    const onTime = spec.oracle(i, rng);
    state = applyReputationUpdate(state, onTime);
    history.push(state.smeReputationScore);
  }
  const plateau =
    spec.kind === 'absorbing'
      ? (absorbingPlateau(history) ?? stationaryStats(history, TAIL_WINDOW))
      : stationaryStats(history, TAIL_WINDOW);
  return {
    id: spec.id,
    label: spec.label,
    events: maxEvents,
    plateau,
    finalScore: state.smeReputationScore,
    onTimeCount: state.smeOnTimeCount,
    lateCount: state.smeLateCount,
  };
}

export function simulateAll(): Record<ArchetypeId, BacktestOutcome> {
  const out = {} as Record<ArchetypeId, BacktestOutcome>;
  for (const spec of ALL_ARCHETYPES) out[spec.id] = simulateArchetype(spec);
  return out;
}

/** Tail-mean of the mixed archetype over a sweep of seeds (for robustness). */
export function mixedTailMeans(seeds: readonly number[]): number[] {
  return seeds.map((s) => {
    const o = simulateArchetype(MIXED_70, s);
    return o.plateau.kind === 'stationary' ? o.plateau.tailMean : Number(o.finalScore);
  });
}

// ── Downstream rate effect (REAL pricing engine) ─────────────────────────────

export const RATE_CREDIT_THRESHOLD = 700;
export const RATE_INVOICE_AMOUNT = 100_000;

/** Suggested mid/low/high bps that the real engine produces for a score. */
export function suggestedRateForScore(
  reputationScore: number | bigint,
): { midBps: number; lowBps: number; highBps: number } {
  const r = getSuggestedRate(
    RATE_CREDIT_THRESHOLD,
    reputationScore,
    RATE_INVOICE_AMOUNT,
  );
  return { midBps: r.midBps, lowBps: r.lowBps, highBps: r.highBps };
}

/** Representative plateau score (number) used for rate ordering checks. */
export function plateauScoreOf(o: BacktestOutcome): number {
  if (o.plateau.kind === 'absorbing') return Number(o.plateau.plateauScore);
  return o.plateau.tailMean;
}

export type { ReputationUpdate };