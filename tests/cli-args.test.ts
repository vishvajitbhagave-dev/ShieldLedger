import { describe, it, expect } from 'vitest';

import { parseShieldLedgerCliArgs } from '../src/cli-args.js';

describe('parseShieldLedgerCliArgs — --sme-credit-threshold', () => {
  it('returns the threshold when the flag is present', () => {
    const args = parseShieldLedgerCliArgs(['--sme-credit-threshold', '700']);
    expect(args.smeCreditThreshold).toBe(700n);
    expect(args.unknown).toEqual([]);
  });

  it('returns undefined when the flag is absent', () => {
    const args = parseShieldLedgerCliArgs([]);
    expect(args.smeCreditThreshold).toBeUndefined();
    expect(args.unknown).toEqual([]);
  });

  it('accepts a threshold at the contract floor', () => {
    expect(parseShieldLedgerCliArgs(['--sme-credit-threshold', '650']).smeCreditThreshold).toBe(650n);
  });

  it('rejects a missing value', () => {
    expect(() => parseShieldLedgerCliArgs(['--sme-credit-threshold'])).toThrow(/expects a non-negative integer/);
  });

  it('rejects a non-integer value', () => {
    expect(() => parseShieldLedgerCliArgs(['--sme-credit-threshold', 'abc'])).toThrow(/expects a non-negative integer/);
    expect(() => parseShieldLedgerCliArgs(['--sme-credit-threshold', '-5'])).toThrow(/expects a non-negative integer/);
  });

  it('collects unknown flags for a warning', () => {
    const args = parseShieldLedgerCliArgs(['--bogus', 'x']);
    expect(args.unknown).toEqual(['--bogus', 'x']);
  });

  it('supports --sme-credit-threshold=N inline form', () => {
    expect(parseShieldLedgerCliArgs(['--sme-credit-threshold=720']).smeCreditThreshold).toBe(720n);
  });
});
