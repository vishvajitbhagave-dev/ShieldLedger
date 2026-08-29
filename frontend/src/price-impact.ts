// Slippage / Price-Impact Simulation — off-chain, informational, illustrative only.
//
// This is an ANALYSIS / SIMULATION module, deliberately separate from the live
// pricing engine (frontend/src/pricing.ts). It does NOT modify, replace, or
// conflict with getSuggestedRate — it CALLS it (unchanged) so its outputs stay
// consistent with the live suggestion, then layers the fundability/concentration
// analysis on top.
//
// CRITICAL HONESTY CONSTRAINT (mirrors docs/PRICE_IMPACT_SIMULATION.md and the
// stress-test methodology): ShieldLedger has NO observed data on "how much
// capital lenders typically have available." The only per-lender constraint is
// the private `lenderExposureCap()` witness, which is never on-chain and never
// observed. Therefore every capital number here is ASSUMED / CONFIGURABLE and
// every probability is generated from a seeded pseudo-random simulation. This
// demonstrates the CONCEPT of price impact given the hard 4-lender pool cap
// (contracts/shield-ledger.compact:291 enforces splitCount <= 4) — it is NOT a
// data-driven prediction from real platform activity.
//
// What "price impact" means here (not the deep-market "big order moves the
// price" analogy):
//   1. Fundability (primary) — a large invoice is HARDER TO FULLY FUND, not
//      smoothly costlier per unit. With a 4-lender cap, if even the deepest
//      four available lenders cannot cover the face amount, the invoice simply
//      cannot be filled.
//   2. Concentration (secondary) — a large invoice that does fill concentrates
//      risk on <= 4 lenders (each >= 25% of face in a full 4-way pool).
//   3. Scarcity premium — fewer eligible lenders justifies a bounded rate
//      premium, layered on top of the existing log-scale size adjustment.

import { getSuggestedRate } from './pricing.js';

/** Hard protocol cap on co-lenders per pool (splitCount <= 4 on-chain). */
export const POOL_SIZE_CAP = 4;

// ── Assumed capital model ──────────────────────────────────────────────────
/**
 * Assumed range for a lender's available capital for a single invoice
 * (conceptually this is their private exposureCap, which is never observed).
 * Uniform within [minCapital, maxCapital]. NOT real observed data.
 */
export interface CapitalModel {
  readonly minCapital: bigint;
  readonly maxCapital: bigint;
}

// ── Seeded deterministic PRNG (mulberry32) ─────────────────────────────────
/** Deterministic 0..1 PRNG, so every run is reproducible with the same seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randBigIntInclusive = (rnd: () => number, min: bigint, max: bigint): bigint => {
  const span = max - min + 1n;
  if (span <= 0n) throw new Error('capital range empty');
  // Bias is immaterial here — illustrative only.
  let acc = 0n;
  for (let i = 0n; i < 8n; i++) acc = acc * 256n + BigInt(Math.floor(rnd() * 256));
  return min + (acc % span);
};

// ── Public API ─────────────────────────────────────────────────────────────

export interface FundabilityParams {
  /** Number of lenders the SME can realistically reach. */
  readonly nAvailableLenders: number;
  /** Assumed distribution of each lender's available capital. */
  readonly capitalModel: CapitalModel;
  /** Monte-Carlo trial count per invoice point. */
  readonly iterations: number;
  /** Seed for reproducibility. */
  readonly seed: number;
}

export interface FundabilityPoint {
  readonly invoiceAmount: bigint;
  /** Fraction of trials where some <=4-lender pool fully covered the invoice. */
  readonly fillProbability: number;
  /** Mean funded pool capital across trials (deeper = easier to fill). */
  readonly meanPoolCapital: bigint;
}

export interface FundabilityCurve {
  /** Sampled available lender capitals (length = nAvailableLenders). */
  readonly capitalLenders: bigint[];
  /** Sum of the single deepest possible 4-lender pool (deterministic best case). */
  readonly maxPoolCapital: bigint;
  /** Whether even the deepest 4 available lenders cover the LARGEST evaluated amount. */
  readonly largestFillableByDeepestPool: boolean;
  readonly points: FundabilityPoint[];
}

/**
 * Sample the available lenders' capitals once (seeded), then for each invoice
 * amount run a Monte-Carlo over random <=4-lender subsets to estimate the
 * probability that SOME such pool fully funds the invoice.
 *
 * @param invoiceAmounts The invoice sizes to evaluate (ascending recommended).
 */
export function runFundabilitySimulation(
  invoiceAmounts: readonly bigint[],
  params: FundabilityParams,
): FundabilityCurve {
  const rnd = mulberry32(params.seed);
  const n = Math.max(0, Math.floor(params.nAvailableLenders));

  const capitalLenders: bigint[] = [];
  for (let i = 0; i < n; i++) {
    capitalLenders.push(randBigIntInclusive(rnd, params.capitalModel.minCapital, params.capitalModel.maxCapital));
  }

  // Deepest possible pool = the 4 largest capitals.
  const sorted = [...capitalLenders].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const top4 = sorted.slice(0, POOL_SIZE_CAP);
  const maxPoolCapital = top4.reduce((acc, c) => acc + c, 0n);
  const k = Math.min(POOL_SIZE_CAP, n) || 0;

  const points = invoiceAmounts.map((invoiceAmount) => {
    let funded = 0;
    let poolSum = 0n;
    for (let t = 0; t < params.iterations; t++) {
      // Draw k distinct lenders via a seeded shuffle.
      const idx = capitalLenders.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = idx[i];
        idx[i] = idx[j];
        idx[j] = tmp;
      }
      let sum = 0n;
      for (let s = 0; s < k; s++) sum += capitalLenders[idx[s]];
      poolSum += sum;
      if (sum >= invoiceAmount) funded++;
    }
    const fillProbability = params.iterations > 0 ? funded / params.iterations : 0;
    return {
      invoiceAmount,
      fillProbability,
      meanPoolCapital: params.iterations > 0 ? poolSum / BigInt(params.iterations) : 0n,
    };
  });

  return {
    capitalLenders,
    maxPoolCapital,
    largestFillableByDeepestPool: maxPoolCapital >= invoiceAmounts[invoiceAmounts.length - 1],
    points,
  };
}

// ── Concentration spread ────────────────────────────────────────────────────

export interface ConcentrationResult {
  /** Per-lender share of face in a full 4-way pool (minimum each covers). */
  readonly perLenderShareOfFace: number;
  /** Worst single-lender share (max) across funded pools (mean over trials). */
  readonly meanWorstShare: number;
  /** Highest single-lender share observed across funded trials. */
  readonly worstShareObserved: number;
}

/**
 * For a funded invoice, quantifies how concentrated the exposure is. Because
 * the pool caps at 4 lenders, each must cover at least ceil(face/4); a larger
 * face keeps that share high no matter how many "small" lenders exist.
 */
export function computeConcentrationSpread(
  invoiceAmount: bigint,
  params: FundabilityParams,
): ConcentrationResult {
  if (invoiceAmount <= 0n) {
    return { perLenderShareOfFace: 0, meanWorstShare: 0, worstShareObserved: 0 };
  }
  const rnd = mulberry32(params.seed ^ 0x5f3759df); // different stream from fundability
  const n = Math.max(0, Math.floor(params.nAvailableLenders));
  const capitalLenders: bigint[] = [];
  for (let i = 0; i < n; i++) {
    capitalLenders.push(randBigIntInclusive(rnd, params.capitalModel.minCapital, params.capitalModel.maxCapital));
  }
  const k = Math.min(POOL_SIZE_CAP, n) || 0;

  let totalWorst = 0n;
  let worstObserved = 0n;
  let fundedCount = 0;
  for (let t = 0; t < params.iterations && n > 0; t++) {
    const idx = capitalLenders.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = idx[i];
      idx[i] = idx[j];
      idx[j] = tmp;
    }
    let sum = 0n;
    let maxShare = 0n;
    for (let s = 0; s < k; s++) {
      sum += capitalLenders[idx[s]];
      if (capitalLenders[idx[s]] > maxShare) maxShare = capitalLenders[idx[s]];
    }
    if (sum >= invoiceAmount) {
      fundedCount++;
      totalWorst += maxShare;
      if (maxShare > worstObserved) worstObserved = maxShare;
    }
  }

  const perLenderShareOfFace = 100 / POOL_SIZE_CAP; // 25% by construction under the cap
  const meanWorst =
    fundedCount > 0 ? Number((totalWorst / BigInt(fundedCount) * 100n) / invoiceAmount) : 0;
  return {
    perLenderShareOfFace, // = 100/4 = 25 by construction
    meanWorstShare: meanWorst,
    worstShareObserved: fundedCount > 0 ? Number((worstObserved * 100n) / invoiceAmount) : 0,
  };
}

// ── Scarcity / concentration premium ────────────────────────────────────────

export interface ScarcityParams {
  readonly invoiceAmount: bigint;
  readonly params: FundabilityParams;
  /** Maximum premium (bps) when lenders are most scarce. */
  readonly maxScarcityPremiumBps: number;
}

export interface ScarcityResult {
  /** Number of available lenders whose capital >= an even 4-way share. */
  readonly eligibleCount: number;
  /** Required per-lender capital for a full 4-way pool (ceil(face/4)). */
  readonly requiredPerLender: bigint;
  /** Scarcity premium in bps (0 when >=4 eligible lenders). */
  readonly premiumBps: number;
  /** The unchanged suggested mid from the live pricing engine. */
  readonly baseMidBps: number;
  /** base mid + scarcity premium (illustrative upper bound). */
  readonly adjustedMidBps: number;
}

/**
 * Concrete scarcity model: how many of the available lenders could individually
 * cover an even 1/4 share. When fewer than 4 can, funding is scarce and a
 * bounded premium is justified. Requires assumed capital (see module header).
 */
export function computeScarcityPremium(
  { invoiceAmount, params, maxScarcityPremiumBps }: ScarcityParams,
  creditThreshold: number | bigint,
  reputationThreshold: number | bigint,
): ScarcityResult {
  const rnd = mulberry32((params.seed ^ 0x9e3779b9) >>> 0);
  const n = Math.max(0, Math.floor(params.nAvailableLenders));
  const capitals: bigint[] = [];
  for (let i = 0; i < n; i++) {
    capitals.push(randBigIntInclusive(rnd, params.capitalModel.minCapital, params.capitalModel.maxCapital));
  }

  const requiredPerLender = invoiceAmount > 0n ? (invoiceAmount + BigInt(POOL_SIZE_CAP) - 1n) / BigInt(POOL_SIZE_CAP) : 0n;
  const eligibleCount = capitals.filter((c) => c >= requiredPerLender).length;

  // Linear scarcity: 0 premium at 4+ eligible, full premium at 0-1 eligible.
  const shortage = Math.max(0, POOL_SIZE_CAP - eligibleCount);
  const premiumBps = Math.round((shortage / POOL_SIZE_CAP) * maxScarcityPremiumBps);

  const base = getSuggestedRate(creditThreshold, reputationThreshold, invoiceAmount);
  const adjustedMidBps = base.midBps + premiumBps;

  return { eligibleCount, requiredPerLender, premiumBps, baseMidBps: base.midBps, adjustedMidBps };
}
