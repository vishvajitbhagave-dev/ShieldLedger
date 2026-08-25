import { describe, it, expect } from 'vitest';
import { getSuggestedRate } from '../frontend/src/pricing.js';

describe('getSuggestedRate', () => {
  it('returns mid-range baseline for average inputs (750 credit, 50 rep, 10k invoice)', () => {
    const r = getSuggestedRate(750, 50, 10_000);
    // creditAdj = (750-750)*1 = 0; repAdj = (50-50)*2 = 0; invoiceAdj = log2(1)*25 = 0
    expect(r.midBps).toBe(500);
    expect(r.lowBps).toBe(450);
    expect(r.highBps).toBe(550);
    expect(r.estimated).toBe(false);
  });

  it('high credit + high reputation → lower suggested rate', () => {
    const r = getSuggestedRate(850, 100, 10_000);
    // creditAdj = (750-850)*1 = -100; repAdj = (50-100)*2 = -100; invoiceAdj = 0
    expect(r.midBps).toBe(300);
    expect(r.lowBps).toBe(250);
    expect(r.highBps).toBe(350);
  });

  it('low credit + low reputation → higher suggested rate', () => {
    const r = getSuggestedRate(650, 0, 10_000);
    // creditAdj = (750-650)*1 = 100; repAdj = (50-0)*2 = 100; invoiceAdj = 0
    expect(r.midBps).toBe(700);
    expect(r.lowBps).toBe(650);
    expect(r.highBps).toBe(750);
  });

  it('larger invoice → rate shifts up (log-scale)', () => {
    const small = getSuggestedRate(750, 50, 10_000);
    const medium = getSuggestedRate(750, 50, 100_000);
    const large = getSuggestedRate(750, 50, 1_000_000);

    // 10k → 0 adj, 100k → log2(10)*25 ≈ 83, 1M → log2(100)*25 ≈ 166
    expect(small.midBps).toBe(500);
    expect(medium.midBps).toBeGreaterThan(small.midBps);
    expect(large.midBps).toBeGreaterThan(medium.midBps);

    // Log-scale: the jump from 10k→100k should equal the jump from 100k→1M
    const jump1 = medium.midBps - small.midBps;
    const jump2 = large.midBps - medium.midBps;
    expect(jump1).toBe(jump2); // both are log2(10)*25
  });

  it('invoice of 0 yields same result as 10k (log2(0) is -Inf, clamped to 0)', () => {
    const zero = getSuggestedRate(750, 50, 0);
    const baseline = getSuggestedRate(750, 50, 10_000);
    expect(zero.midBps).toBe(baseline.midBps);
  });

  it('with dueDateEstimate in the future adds time-to-maturity adjustment', () => {
    const now = Math.floor(Date.now() / 1000);
    const future = now + 90 * 86_400; // 90 days from now
    const r = getSuggestedRate(750, 50, 10_000, future);
    // timeAdj = log2(90/30)*10 ≈ 15.8, rounded to 16
    expect(r.midBps).toBeGreaterThan(500);
    expect(r.estimated).toBe(true);
  });

  it('with dueDateEstimate in the past yields no time adjustment', () => {
    const now = Math.floor(Date.now() / 1000);
    const past = now - 30 * 86_400; // 30 days ago
    const withoutDue = getSuggestedRate(750, 50, 10_000);
    const withPastDue = getSuggestedRate(750, 50, 10_000, past);
    expect(withPastDue.midBps).toBe(withoutDue.midBps);
    expect(withPastDue.estimated).toBe(true);
  });

  it('floor of 100 bps (1%) is never breached', () => {
    // Extreme best case: 900 credit, 100 rep, tiny invoice
    const r = getSuggestedRate(900, 100, 1_000);
    // creditAdj = -150, repAdj = -100, invoiceAdj = log2(0.1)*25 ≈ -83
    // mid = 500 - 150 - 100 - 83 = 167, low = max(167-50, 100) = 117
    expect(r.lowBps).toBeGreaterThanOrEqual(100);
  });

  it('accepts bigint inputs without error', () => {
    const r = getSuggestedRate(750n, 50n, 10_000n);
    expect(r.midBps).toBe(500);
  });

  it('accepts bigint dueDateEstimate without error', () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const future = now + 90n * 86_400n;
    const r = getSuggestedRate(750n, 50n, 10_000n, future);
    expect(r.estimated).toBe(true);
    expect(r.midBps).toBeGreaterThan(500);
  });
});
