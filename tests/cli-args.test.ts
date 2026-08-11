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

describe('parseShieldLedgerCliArgs — --confirm-invoice (buyer role)', () => {
  const NF = 'aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66';

  it('returns the nullifier when the flag is present', () => {
    const args = parseShieldLedgerCliArgs(['--confirm-invoice', NF]);
    expect(args.confirmInvoiceNullifier).toBe(NF);
    expect(args.confirmAmount).toBeUndefined();
    expect(args.unknown).toEqual([]);
  });

  it('supports --confirm-invoice=<hex> inline form and normalizes case', () => {
    const args = parseShieldLedgerCliArgs([`--confirm-invoice=${NF.toUpperCase()}`]);
    expect(args.confirmInvoiceNullifier).toBe(NF);
  });

  it('returns undefined when the flag is absent', () => {
    expect(parseShieldLedgerCliArgs([]).confirmInvoiceNullifier).toBeUndefined();
  });

  it('parses --confirm-amount alongside --confirm-invoice', () => {
    const args = parseShieldLedgerCliArgs(['--confirm-invoice', NF, '--confirm-amount', '1000']);
    expect(args.confirmInvoiceNullifier).toBe(NF);
    expect(args.confirmAmount).toBe(1000n);
  });

  it('rejects a malformed nullifier', () => {
    expect(() => parseShieldLedgerCliArgs(['--confirm-invoice', 'short'])).toThrow(/64 hex characters/);
    expect(() => parseShieldLedgerCliArgs(['--confirm-invoice'])).toThrow(/64 hex characters/);
  });

  it('rejects a non-integer confirm amount', () => {
    expect(() => parseShieldLedgerCliArgs(['--confirm-invoice', NF, '--confirm-amount', 'abc'])).toThrow(
      /non-negative integer/,
    );
  });
});
