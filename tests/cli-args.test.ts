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

describe('parseShieldLedgerCliArgs — --min-reputation (lender bar)', () => {
  it('returns the value when the flag is present', () => {
    const args = parseShieldLedgerCliArgs(['--min-reputation', '30']);
    expect(args.minReputation).toBe(30n);
    expect(args.unknown).toEqual([]);
  });

  it('supports --min-reputation=N inline form', () => {
    expect(parseShieldLedgerCliArgs(['--min-reputation=0']).minReputation).toBe(0n);
  });

  it('returns undefined when the flag is absent', () => {
    expect(parseShieldLedgerCliArgs([]).minReputation).toBeUndefined();
  });

  it('rejects a missing or non-integer value', () => {
    expect(() => parseShieldLedgerCliArgs(['--min-reputation'])).toThrow(/non-negative integer/);
    expect(() => parseShieldLedgerCliArgs(['--min-reputation', 'high'])).toThrow(/non-negative integer/);
  });
});

describe('parseShieldLedgerCliArgs — --show-reputation', () => {
  it('is false when absent and true when present', () => {
    expect(parseShieldLedgerCliArgs([]).showReputation).toBe(false);
    expect(parseShieldLedgerCliArgs(['--show-reputation']).showReputation).toBe(true);
  });

  it('can be combined with other flags without side effects', () => {
    const args = parseShieldLedgerCliArgs(['--show-reputation', '--min-reputation', '20']);
    expect(args.showReputation).toBe(true);
    expect(args.minReputation).toBe(20n);
    expect(args.unknown).toEqual([]);
  });
});

describe('parseShieldLedgerCliArgs — --demo-reputation-cycle (demo tool)', () => {
  it('is false when absent and true when present', () => {
    expect(parseShieldLedgerCliArgs([]).demoReputationCycle).toBe(false);
    expect(parseShieldLedgerCliArgs(['--demo-reputation-cycle']).demoReputationCycle).toBe(true);
    expect(parseShieldLedgerCliArgs(['--demo-reputation-cycle']).unknown).toEqual([]);
  });

  it('can be combined with other flags without side effects', () => {
    const args = parseShieldLedgerCliArgs(['--demo-reputation-cycle', '--min-reputation', '30']);
    expect(args.demoReputationCycle).toBe(true);
    expect(args.minReputation).toBe(30n);
    expect(args.unknown).toEqual([]);
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

describe('parseShieldLedgerCliArgs — secondary market flags', () => {
  const NF = 'aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66';
  const SECRET = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';

  it('parses --transfer-claim with --new-owner-secret', () => {
    const args = parseShieldLedgerCliArgs(['--transfer-claim', NF, '--new-owner-secret', SECRET]);
    expect(args.transferClaimNullifier).toBe(NF);
    expect(args.newOwnerSecret).toBe(SECRET);
    expect(args.unknown).toEqual([]);
  });

  it('supports the inline forms and normalizes case', () => {
    const args = parseShieldLedgerCliArgs([`--transfer-claim=${NF.toUpperCase()}`, `--new-owner-secret=${SECRET}`]);
    expect(args.transferClaimNullifier).toBe(NF);
    expect(args.newOwnerSecret).toBe(SECRET);
  });

  it('returns undefined when absent', () => {
    const args = parseShieldLedgerCliArgs([]);
    expect(args.transferClaimNullifier).toBeUndefined();
    expect(args.newOwnerSecret).toBeUndefined();
    expect(args.checkClaimNullifier).toBeUndefined();
  });

  it('parses --check-claim and rejects malformed hex', () => {
    expect(parseShieldLedgerCliArgs(['--check-claim', NF]).checkClaimNullifier).toBe(NF);
    expect(() => parseShieldLedgerCliArgs(['--check-claim', 'zz'])).toThrow(/64 hex characters/);
    expect(() => parseShieldLedgerCliArgs(['--new-owner-secret', 'short'])).toThrow(/64 hex characters/);
  });
});
