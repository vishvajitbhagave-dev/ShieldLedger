import { describe, it, expect } from 'vitest';
import { getSuggestedRate } from '../frontend/src/pricing.js';
import {
  POOL_SIZE_CAP,
  runFundabilitySimulation,
  computeConcentrationSpread,
  computeScarcityPremium,
} from '../frontend/src/price-impact.js';

// Capital model represents an ASSUMED uniform range of a lender's available
// capital for a single invoice. There is no real observed lender-capital data
// in the system (and it would be private anyway) — see the module header and
// docs/PRICE_IMPACT_SIMULATION.md. The seeds make every run reproducible.

const CAP = { minCapital: 100_000n, maxCapital: 500_000n }; // assumed lender range
const LENDERS = 8;

const fundParams = (seed: number, iterations = 2000) => ({
  nAvailableLenders: LENDERS,
  capitalModel: CAP,
  iterations,
  seed,
});

const AMOUNTS = [100_000n, 300_000n, 600_000n, 1_000_000n, 2_000_000n, 4_000_000n];

describe('POOL_SIZE_CAP', () => {
  it('is exactly 4, matching the on-chain splitCount <= 4 constraint', () => {
    expect(POOL_SIZE_CAP).toBe(4);
  });
});

describe('runFundabilitySimulation', () => {
  it('fill probability never increases as invoice size grows', () => {
    const curve = runFundabilitySimulation(AMOUNTS, fundParams(1));
    expect(curve.points.length).toBe(AMOUNTS.length);
    for (let i = 1; i < curve.points.length; i++) {
      expect(curve.points[i].fillProbability).toBeLessThanOrEqual(curve.points[i - 1].fillProbability);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = runFundabilitySimulation(AMOUNTS, fundParams(42));
    const b = runFundabilitySimulation(AMOUNTS, fundParams(42));
    expect(a.capitalLenders).toEqual(b.capitalLenders);
    expect(a.points.map((p) => p.fillProbability)).toEqual(b.points.map((p) => p.fillProbability));
  });

  it('an invoice larger than the deepest possible 4-lender pool has ZERO fill probability', () => {
    // Sampled capitals <= 500k each, so the deepest 4-sum <= 2,000,000.
    // A 4,000,000 invoice therefore cannot be filled by ANY <=4-lender pool.
    const curve = runFundabilitySimulation([4_000_000n], fundParams(7));
    expect(curve.maxPoolCapital).toBeLessThanOrEqual(2_000_000n);
    expect(curve.points[0].fillProbability).toBe(0);
  });

  it('respects the 4-lender cap: total available capital across many lenders cannot help a single pool fill', () => {
    // 8 lenders exist, but any single pool draws at most POOL_SIZE_CAP people.
    const curve = runFundabilitySimulation([2_500_000n], fundParams(3));
    // Even the sum of ALL 8 is far above 2.5M, yet the contract cannot use them
    // at once — only <= 4 per pool, so fill probability stays 0.
    const totalAll = curve.capitalLenders.reduce((a, b) => a + b, 0n);
    expect(totalAll).toBeGreaterThan(2_500_000n);
    expect(curve.points[0].fillProbability).toBe(0);
    expect(curve.capitalLenders.length).toBe(LENDERS);
  });

  it('a small invoice well within reach is fillable most of the time', () => {
    const curve = runFundabilitySimulation([150_000n], fundParams(11));
    expect(curve.points[0].fillProbability).toBeGreaterThan(0.9);
  });

  it('handles zero available lenders without error', () => {
    const curve = runFundabilitySimulation([100_000n], { nAvailableLenders: 0, capitalModel: CAP, iterations: 100, seed: 1 });
    expect(curve.capitalLenders).toEqual([]);
    expect(curve.maxPoolCapital).toBe(0n);
    expect(curve.points[0].fillProbability).toBe(0);
  });
});

describe('computeConcentrationSpread', () => {
  it('reports a 25% per-lender share under a full 4-way pool', () => {
    const c = computeConcentrationSpread(800_000n, fundParams(5));
    expect(c.perLenderShareOfFace).toBe(25);
  });

  it('mean worst-share is at least the even 4-way share (25%)', () => {
    const c = computeConcentrationSpread(800_000n, fundParams(5));
    expect(c.meanWorstShare).toBeGreaterThanOrEqual(25);
  });
});

describe('computeScarcityPremium', () => {
  it('is zero when at least 4 eligible lenders can each cover a 1/4 share', () => {
    // required per-lender = 50_000/4 = 12,500; every lender (100k+) is eligible.
    const r = computeScarcityPremium(
      { invoiceAmount: 50_000n, params: fundParams(2), maxScarcityPremiumBps: 100 },
      750,
      50,
    );
    expect(r.eligibleCount).toBeGreaterThanOrEqual(4);
    expect(r.premiumBps).toBe(0);
    expect(r.adjustedMidBps).toBe(r.baseMidBps);
  });

  it('hits the configured max premium when no one can cover a 1/4 share', () => {
    // required per-lender = 10M/4 = 2.5M; max capital is 500k, so nobody is eligible.
    const r = computeScarcityPremium(
      { invoiceAmount: 10_000_000n, params: fundParams(2), maxScarcityPremiumBps: 100 },
      750,
      50,
    );
    expect(r.eligibleCount).toBe(0);
    expect(r.premiumBps).toBe(100);
    expect(r.adjustedMidBps).toBe(r.baseMidBps + 100);
  });

  it('reuses the live pricing engine unchanged for the base mid (no forked formula)', () => {
    const amount = 500_000n;
    const r = computeScarcityPremium(
      { invoiceAmount: amount, params: fundParams(9), maxScarcityPremiumBps: 100 },
      700,
      60,
    );
    const standalone = getSuggestedRate(700, 60, amount);
    expect(r.baseMidBps).toBe(standalone.midBps); // same engine (with size adjustment), not re-derived
  });
});
