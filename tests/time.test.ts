import { describe, it, expect } from 'vitest';

import { currentUnixSeconds } from '../src/time.js';

const YEAR_2100_IN_SECONDS = 4_102_444_800n;

describe('currentUnixSeconds', () => {
  it('returns the current epoch time in whole seconds (not milliseconds)', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const got = currentUnixSeconds();
    // A sane "now" (well past the 2010s, before the 2100s).
    expect(Number(got)).toBeGreaterThan(1_700_000_000);
    expect(Number(got)).toBeLessThanOrEqual(nowSeconds);
    expect(Number(got)).toBeGreaterThan(nowSeconds - 5);
  });

  it('is nowhere near a far-future due date stored in seconds (year 2100)', () => {
    // Regression guard: Date.now() in milliseconds (~1.75e12) would blow past
    // any far-future due date expressed in seconds and classify as LATE.
    expect(currentUnixSeconds()).toBeLessThan(YEAR_2100_IN_SECONDS);
  });
});
