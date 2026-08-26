import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';

import {
  ShieldLedgerSimulator,
  derivePseudonym,
  deriveClaimCommitment,
  derivePoolSlotKey,
} from './shield-ledger-simulator.js';
import { createShieldLedgerPrivateState } from '../src/witnesses.js';
import { insurancePoolKey } from '../src/insurance.js';

setNetworkId('undeployed');

function bytes32(value: number): Uint8Array {
  const out = new Uint8Array(32);
  out[31] = value;
  return out;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const SME_SECRET = bytes32(1);
const LENDER_A = bytes32(10);
const LENDER_B = bytes32(11);
const LENDER_C = bytes32(12);
const LENDER_D = bytes32(13);
const NULLIFIER = bytes32(7);
const DUE = 1_700_000_000n;
const AFTER_DUE = DUE + 1n;
const INVOICE_AMOUNT = 10_000n;

/**
 * Set up a pool invoice, submit and reveal pool bids, then settle the split
 * invoice. Leaves the invoice in a state where pool insurance can be claimed.
 */
function setupAndSettlePool(
  secrets: Uint8Array[],
  invoiceAmount: bigint = INVOICE_AMOUNT,
  splitCount: bigint = BigInt(secrets.length),
  totalPayout: bigint = invoiceAmount,
) {
  const sim = new ShieldLedgerSimulator(
    createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: secrets[0] }),
  );
  sim.registerInvoice(NULLIFIER, 650n, invoiceAmount, 0n, splitCount);

  for (let i = 0; i < secrets.length; i++) {
    const commitment = bytes32(secrets[i][31]);
    sim.switchIdentity({ lenderSecret: secrets[i] });
    sim.submitBid(NULLIFIER, commitment);
    sim.revealPoolBid(NULLIFIER, BigInt(i), commitment);
  }

  // Compute equal-share contributions that sum exactly to invoiceAmount.
  const n = secrets.length;
  const baseShare = invoiceAmount / BigInt(n);
  const contributions: [bigint, bigint, bigint, bigint] = [0n, 0n, 0n, 0n];
  for (let i = 0; i < n; i++) {
    contributions[i] = baseShare;
  }
  // Give the remainder to the last slot so sum == invoiceAmount.
  contributions[n - 1] += invoiceAmount - baseShare * BigInt(n);

  const totalContribution = invoiceAmount;
  const payouts: [bigint, bigint, bigint, bigint] = [0n, 0n, 0n, 0n];
  for (let i = 0; i < n; i++) {
    payouts[i] = (contributions[i] * totalPayout) / totalContribution;
  }

  sim.switchIdentity({ smeSecret: SME_SECRET });
  sim.settleSplitInvoice(NULLIFIER, DUE, DUE, contributions, payouts, totalContribution, totalPayout);

  return { sim, contributions, payouts };
}

// ─── Pool insurance: proportional claim ───────────────────────────────────────

describe('Pool insurance — proportional claim', () => {
  it('2 lenders: claims drain thin pool, total capped at pool balance', () => {
    const { sim, contributions, payouts } = setupAndSettlePool([LENDER_A, LENDER_B]);

    const totalInsurance = INVOICE_AMOUNT / 2n;
    const poolKey = insurancePoolKey();
    const poolBalance = sim.getLedger().insurancePools.lookup(poolKey).balance;

    sim.switchIdentity({ lenderSecret: LENDER_A });
    const payoutA = sim.claimPoolInsurancePayout(NULLIFIER, 0n, AFTER_DUE);

    // Payout is capped by the thin pool: min(full_share, pool.balance * proportion)
    const fullShareA = (payouts[0] * totalInsurance) / INVOICE_AMOUNT;
    expect(payoutA).toBeLessThanOrEqual(fullShareA);
    expect(payoutA).toBeGreaterThan(0n);

    const balanceAfterA = sim.getLedger().insurancePools.lookup(poolKey).balance;
    expect(balanceAfterA).toBe(poolBalance - payoutA);

    sim.switchIdentity({ lenderSecret: LENDER_B });
    const payoutB = sim.claimPoolInsurancePayout(NULLIFIER, 1n, AFTER_DUE);

    // Total claimed must not exceed original pool balance
    expect(payoutA + payoutB).toBeLessThanOrEqual(poolBalance);

    // Remaining pool must be >= 0
    const balanceAfterB = sim.getLedger().insurancePools.lookup(poolKey).balance;
    expect(balanceAfterB).toBeGreaterThanOrEqual(0n);
  });

  it('4 lenders: claims drain thin pool proportionally', () => {
    const { sim, payouts } = setupAndSettlePool(
      [LENDER_A, LENDER_B, LENDER_C, LENDER_D],
      INVOICE_AMOUNT,
      4n,
    );

    const totalInsurance = INVOICE_AMOUNT / 2n;
    const poolKey = insurancePoolKey();
    const poolBalance = sim.getLedger().insurancePools.lookup(poolKey).balance;
    let totalClaimed = 0n;

    for (let i = 0; i < 4; i++) {
      const secret = [LENDER_A, LENDER_B, LENDER_C, LENDER_D][i];
      sim.switchIdentity({ lenderSecret: secret });
      const payout = sim.claimPoolInsurancePayout(NULLIFIER, BigInt(i), AFTER_DUE);

      // Each payout must not exceed its ideal proportional share
      const idealShare = (payouts[i] * totalInsurance) / INVOICE_AMOUNT;
      expect(payout).toBeLessThanOrEqual(idealShare);
      expect(payout).toBeGreaterThanOrEqual(0n);

      totalClaimed += payout;
    }

    // Total claimed must not exceed original pool balance
    expect(totalClaimed).toBeLessThanOrEqual(poolBalance);
  });

  it('rejects claim before due date', () => {
    const { sim } = setupAndSettlePool([LENDER_A, LENDER_B]);

    sim.switchIdentity({ lenderSecret: LENDER_A });
    expect(() => sim.claimPoolInsurancePayout(NULLIFIER, 0n, DUE)).toThrow(
      /invoice not defaulted/,
    );
  });
});

// ─── Pool insurance: authorization ────────────────────────────────────────────

describe('Pool insurance — authorization', () => {
  it('rejects claim by non-lender (pseudonym mismatch)', () => {
    const { sim } = setupAndSettlePool([LENDER_A, LENDER_B]);

    // Use a different secret that doesn't match any pool slot
    const fakeLender = bytes32(99);
    sim.switchIdentity({ lenderSecret: fakeLender });
    expect(() => sim.claimPoolInsurancePayout(NULLIFIER, 0n, AFTER_DUE)).toThrow(
      /not the claim holder/,
    );
  });

  it('rejects double claim on same slot', () => {
    const { sim } = setupAndSettlePool([LENDER_A, LENDER_B]);

    sim.switchIdentity({ lenderSecret: LENDER_A });
    sim.claimPoolInsurancePayout(NULLIFIER, 0n, AFTER_DUE);
    expect(() => sim.claimPoolInsurancePayout(NULLIFIER, 0n, AFTER_DUE)).toThrow(
      /payout already claimed/,
    );
  });

  it('allows independent claims on different slots', () => {
    const { sim } = setupAndSettlePool([LENDER_A, LENDER_B]);

    sim.switchIdentity({ lenderSecret: LENDER_A });
    const payoutA = sim.claimPoolInsurancePayout(NULLIFIER, 0n, AFTER_DUE);
    expect(payoutA).toBeGreaterThan(0n);

    sim.switchIdentity({ lenderSecret: LENDER_B });
    const payoutB = sim.claimPoolInsurancePayout(NULLIFIER, 1n, AFTER_DUE);
    expect(payoutB).toBeGreaterThan(0n);
  });
});

// ─── Pool secondary market: per-lender claim transfer ─────────────────────────

describe('Pool secondary market — per-lender transfer', () => {
  it('original lender transfers claim to new holder', () => {
    const { sim } = setupAndSettlePool([LENDER_A, LENDER_B]);
    const newOwner = bytes32(50);
    const newCommitment = deriveClaimCommitment(newOwner, NULLIFIER);

    // Original lender A transfers their slot claim
    sim.switchIdentity({ lenderSecret: LENDER_A });
    sim.transferPoolClaim(NULLIFIER, 0n, newCommitment);

    // New holder should now be able to claim insurance
    sim.switchIdentity({ smeSecret: SME_SECRET }); // claimSecret is part of private state
    // Actually, we need to switch to the new holder's identity
    // The new holder uses claimSecret = newOwner to derive the commitment
    sim.switchIdentity({ claimSecret: newOwner });
    const payout = sim.claimPoolInsurancePayout(NULLIFIER, 0n, AFTER_DUE);
    expect(payout).toBeGreaterThan(0n);
  });

  it('original lender cannot transfer a slot they do not own', () => {
    const { sim } = setupAndSettlePool([LENDER_A, LENDER_B]);
    const newOwner = bytes32(50);
    const newCommitment = deriveClaimCommitment(newOwner, NULLIFIER);

    // Lender B tries to transfer lender A's slot (slot 0)
    sim.switchIdentity({ lenderSecret: LENDER_B });
    expect(() => sim.transferPoolClaim(NULLIFIER, 0n, newCommitment)).toThrow(
      /not the claim holder/,
    );
  });

  it('secondary buyer can transfer the claim further', () => {
    const { sim } = setupAndSettlePool([LENDER_A, LENDER_B]);
    const buyer1 = bytes32(50);
    const buyer2 = bytes32(51);
    const commitment1 = deriveClaimCommitment(buyer1, NULLIFIER);
    const commitment2 = deriveClaimCommitment(buyer2, NULLIFIER);

    // Lender A transfers to buyer1
    sim.switchIdentity({ lenderSecret: LENDER_A });
    sim.transferPoolClaim(NULLIFIER, 0n, commitment1);

    // Buyer1 transfers to buyer2
    sim.switchIdentity({ claimSecret: buyer1 });
    sim.transferPoolClaim(NULLIFIER, 0n, commitment2);

    // Buyer2 can claim insurance
    sim.switchIdentity({ claimSecret: buyer2 });
    const payout = sim.claimPoolInsurancePayout(NULLIFIER, 0n, AFTER_DUE);
    expect(payout).toBeGreaterThan(0n);
  });

  it('original lender cannot claim insurance after transferring', () => {
    const { sim } = setupAndSettlePool([LENDER_A, LENDER_B]);
    const newOwner = bytes32(50);
    const newCommitment = deriveClaimCommitment(newOwner, NULLIFIER);

    // Lender A transfers their claim
    sim.switchIdentity({ lenderSecret: LENDER_A });
    sim.transferPoolClaim(NULLIFIER, 0n, newCommitment);

    // Lender A tries to claim insurance — should fail
    expect(() => sim.claimPoolInsurancePayout(NULLIFIER, 0n, AFTER_DUE)).toThrow(
      /not the claim holder/,
    );
  });
});
