import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';

import {
  ShieldLedgerSimulator,
  MIN_CREDIT_SCORE,
  deriveClaimCommitment,
  deriveBidCommitment,
} from './shield-ledger-simulator.js';
import { createShieldLedgerPrivateState } from '../src/witnesses.js';
import {
  insuranceContribution,
  fullInsurancePayout,
  insurancePayoutFor,
  insurancePoolKey,
} from '../src/insurance.js';

setNetworkId('undeployed');

/** Deterministic 32-byte value with `value` in the last byte. */
function bytes32(value: number): Uint8Array {
  const out = new Uint8Array(32);
  out[31] = value;
  return out;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const SME_SECRET = bytes32(1);
const LENDER_SECRET = bytes32(2);
const OTHER_A = bytes32(3);
const HOLDER_B = bytes32(9);
const NULLIFIER = bytes32(7);
const DUE = 1_700_000_000n;
const AFTER_DUE = DUE + 1n;

/**
 * Registers and finances an invoice (sealed bid + reveal by LENDER_SECRET),
 * optionally transferring the claim to another holder's secret. Leaves the
 * ledger one step short of settlement so the invoice can default.
 */
function financedInvoice(
  sim: ShieldLedgerSimulator,
  nullifier: Uint8Array,
  opts: {
    invoiceAmount?: bigint;
    financedAmount?: bigint;
    due?: bigint;
    rate?: bigint;
    transferredTo?: Uint8Array;
  } = {},
): void {
  const { invoiceAmount = 100_000n, financedAmount = 1000n, due = DUE, rate = 400n, transferredTo } = opts;
  sim.switchIdentity({ smeSecret: SME_SECRET });
  sim.registerInvoice(nullifier, MIN_CREDIT_SCORE, invoiceAmount);
  sim.switchIdentity({ lenderSecret: LENDER_SECRET });
  sim.submitBid(nullifier, deriveBidCommitment(LENDER_SECRET, nullifier, financedAmount, due, rate));
  sim.revealBid(nullifier, financedAmount, due, rate);
  if (transferredTo !== undefined) {
    sim.transferClaim(nullifier, deriveClaimCommitment(transferredTo, nullifier));
  }
}

/** Public balance of the single shared insurance pool. */
function poolBalance(sim: ShieldLedgerSimulator): bigint {
  return sim.getLedger().insurancePools.lookup(insurancePoolKey()).balance;
}

describe('ShieldLedger contract — default insurance pool', () => {
  it('credits the shared pool with exactly 2% (floored) of every registered face amount', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET }),
    );
    // Seeded by the first registration...
    sim.registerInvoice(bytes32(11), MIN_CREDIT_SCORE, 1000n);
    expect(poolBalance(sim)).toBe(insuranceContribution(1000n));
    expect(poolBalance(sim)).toBe(20n);
    // ...and accumulated by every later one.
    sim.switchIdentity({ smeSecret: OTHER_A });
    sim.registerInvoice(bytes32(12), MIN_CREDIT_SCORE, 500n);
    expect(poolBalance(sim)).toBe(30n);
  });

  it('proves the premium in ZK — the caller cannot overpay or underpay', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET }),
    );
    // Premium that is not floor(amount / 50) fails the quotient proof...
    expect(() =>
      sim.contract.impureCircuits.registerInvoice(sim.circuitContext, NULLIFIER, 650n, 1000n, 0n, 21n, 21n, 0n),
    ).toThrow(/quota mismatch/);
    // ...and a correct premium with a wrong resulting balance fails the
    // equality against the on-chain pool state.
    expect(() =>
      sim.contract.impureCircuits.registerInvoice(sim.circuitContext, NULLIFIER, 650n, 1000n, 0n, 20n, 19n, 0n),
    ).toThrow(/pool balance mismatch/);
    expect(sim.getLedger().invoices.isEmpty()).toBe(true);
  });

  it('pays the winning lender 50% of the financed amount once the invoice defaults', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    financedInvoice(sim, NULLIFIER, { invoiceAmount: 100_000n, financedAmount: 1000n });
    expect(poolBalance(sim)).toBe(2000n);

    const paid = sim.claimInsurancePayout(NULLIFIER, AFTER_DUE);

    expect(paid).toBe(fullInsurancePayout(1000n));
    expect(paid).toBe(500n);
    expect(poolBalance(sim)).toBe(1500n);
    const lg = sim.getLedger();
    expect(lg.insuranceClaims.member(NULLIFIER)).toBe(true);
    const claim = lg.insuranceClaims.lookup(NULLIFIER);
    expect(claim.payout).toBe(500n);
    expect(claim.claimedAt).toBe(AFTER_DUE);
  });

  it('rejects a claim before the due date — no default yet', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    financedInvoice(sim, NULLIFIER);
    expect(() => sim.claimInsurancePayout(NULLIFIER, DUE)).toThrow(/invoice not defaulted/);
    expect(sim.getLedger().insuranceClaims.isEmpty()).toBe(true);
  });

  it('rejects a claim on an invoice that was settled', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    financedInvoice(sim, NULLIFIER);
    sim.switchIdentity({ smeSecret: SME_SECRET });
    sim.settleInvoice(NULLIFIER, 1000n, DUE, DUE);
    expect(() => sim.claimInsurancePayout(NULLIFIER, AFTER_DUE)).toThrow(/invoice already settled/);
  });

  it('rejects a claim while the auction is unresolved', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER, MIN_CREDIT_SCORE, 1000n);
    expect(() => sim.claimInsurancePayout(NULLIFIER, AFTER_DUE)).toThrow(/auction not resolved/);
  });

  it('never pays twice for the same default', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    financedInvoice(sim, NULLIFIER);
    expect(sim.claimInsurancePayout(NULLIFIER, AFTER_DUE)).toBe(500n);
    expect(() => sim.claimInsurancePayout(NULLIFIER, AFTER_DUE)).toThrow(/payout already claimed/);
    expect(poolBalance(sim)).toBe(1500n);
  });

  it('pays only partially — and drains the pool — when the balance cannot cover the entitlement', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    // Pool holds just 20n; the entitlement is 500n.
    financedInvoice(sim, NULLIFIER, { invoiceAmount: 1000n, financedAmount: 1000n });

    const paid = sim.claimInsurancePayout(NULLIFIER, AFTER_DUE);

    expect(paid).toBe(insurancePayoutFor(1000n, 20n));
    expect(paid).toBe(20n);
    expect(poolBalance(sim)).toBe(0n);
    expect(sim.getLedger().insuranceClaims.lookup(NULLIFIER).payout).toBe(20n);
  });

  it('proves maximality in ZK: a fully covered claim cannot quietly under-pay', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    financedInvoice(sim, NULLIFIER);
    expect(() =>
      sim.contract.impureCircuits.claimInsurancePayout(sim.circuitContext, NULLIFIER, 500n, 400n, 1600n, AFTER_DUE),
    ).toThrow(/fully covered claims must be maximal/);
    expect(poolBalance(sim)).toBe(2000n);
  });

  it('proves the drain rule in ZK: a partial payout must take the whole remaining pool', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    financedInvoice(sim, NULLIFIER, { invoiceAmount: 1000n, financedAmount: 1000n });
    expect(() =>
      sim.contract.impureCircuits.claimInsurancePayout(sim.circuitContext, NULLIFIER, 500n, 15n, 5n, AFTER_DUE),
    ).toThrow(/partially covered claims must drain the pool/);
    expect(poolBalance(sim)).toBe(20n);
  });

  it('rejects a claim by anyone but the current claim holder', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    financedInvoice(sim, NULLIFIER);
    sim.switchIdentity({ lenderSecret: OTHER_A });
    expect(() => sim.claimInsurancePayout(NULLIFIER, AFTER_DUE)).toThrow(/not the claim holder/);
    expect(sim.getLedger().insuranceClaims.isEmpty()).toBe(true);
  });

  it('follows the secondary market: the transferred holder collects, the old winner cannot', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    financedInvoice(sim, NULLIFIER, { transferredTo: HOLDER_B });

    // The original auction leader lost the claim with the trade.
    sim.switchIdentity({ lenderSecret: LENDER_SECRET });
    expect(() => sim.claimInsurancePayout(NULLIFIER, AFTER_DUE)).toThrow(/not the claim holder/);

    // The CURRENT holder proves their right via claimSecret.
    sim.switchIdentity({ claimSecret: HOLDER_B });
    expect(sim.holdsClaim(NULLIFIER)).toBe(true);
    expect(sim.claimInsurancePayout(NULLIFIER, AFTER_DUE)).toBe(500n);
    expect(poolBalance(sim)).toBe(1500n);
  });

  it('keeps the defaulting SME invisible: insurance records carry no identity data', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    financedInvoice(sim, NULLIFIER);
    sim.claimInsurancePayout(NULLIFIER, AFTER_DUE);

    const lg = sim.getLedger();
    // A paid claim exposes only its size and time, keyed by the (already
    // public) invoice nullifier.
    const claim = lg.insuranceClaims.lookup(NULLIFIER);
    expect(Object.keys(claim).sort()).toEqual(['claimedAt', 'payout']);
    // Serialize every public insurance-related value exactly as an observer
    // would see it: nothing links back to the SME's secret.
    const serialized = JSON.stringify({
      pools: Array.from(lg.insurancePools, ([key, pool]) => ({
        key: hex(key),
        balance: pool.balance.toString(),
      })),
      claims: Array.from(lg.insuranceClaims, ([nullifier, c]) => ({
        nullifier: hex(nullifier),
        payout: c.payout.toString(),
        claimedAt: c.claimedAt.toString(),
      })),
    });
    expect(serialized).toContain('"balance":"1500"');
    expect(serialized).not.toContain(hex(SME_SECRET));
    expect(serialized).not.toContain(hex(HOLDER_B));
    expect(serialized).not.toContain(hex(LENDER_SECRET));
  });
});
