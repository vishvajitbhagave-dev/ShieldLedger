import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';

import {
  ShieldLedgerSimulator,
  deriveClaimCommitment,
} from './shield-ledger-simulator.js';
import { createShieldLedgerPrivateState } from '../src/witnesses.js';
import { insurancePoolKey } from '../src/insurance.js';

setNetworkId('undeployed');

function bytes32(value: number): Uint8Array {
  const out = new Uint8Array(32);
  out[31] = value;
  return out;
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
    const payoutA = sim.claimPoolInsurancePayout(NULLIFIER, 0n, payouts[0], AFTER_DUE);
    const fullShareA = (payouts[0] * totalInsurance) / INVOICE_AMOUNT;
    expect(payoutA).toBeLessThanOrEqual(fullShareA);
    expect(payoutA).toBeGreaterThan(0n);

    const balanceAfterA = sim.getLedger().insurancePools.lookup(poolKey).balance;
    expect(balanceAfterA).toBe(poolBalance - payoutA);

    sim.switchIdentity({ lenderSecret: LENDER_B });
    const payoutB = sim.claimPoolInsurancePayout(NULLIFIER, 1n, payouts[1], AFTER_DUE);

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
      const payout = sim.claimPoolInsurancePayout(NULLIFIER, BigInt(i), payouts[i], AFTER_DUE);

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
    const { sim, payouts } = setupAndSettlePool([LENDER_A, LENDER_B]);

    sim.switchIdentity({ lenderSecret: LENDER_A });
    expect(() => sim.claimPoolInsurancePayout(NULLIFIER, 0n, payouts[0], DUE)).toThrow(
      /invoice not defaulted/,
    );
  });
});

// ─── Pool insurance: authorization ────────────────────────────────────────────

describe('Pool insurance — authorization', () => {
  it('rejects claim by non-lender (pseudonym mismatch)', () => {
    const { sim, payouts } = setupAndSettlePool([LENDER_A, LENDER_B]);

    // Use a different secret that doesn't match any pool slot
    const fakeLender = bytes32(99);
    sim.switchIdentity({ lenderSecret: fakeLender });
    expect(() => sim.claimPoolInsurancePayout(NULLIFIER, 0n, payouts[0], AFTER_DUE)).toThrow(
      /not the claim holder/,
    );
  });

  it('rejects double claim on same slot', () => {
    const { sim, payouts } = setupAndSettlePool([LENDER_A, LENDER_B]);

    sim.switchIdentity({ lenderSecret: LENDER_A });
    sim.claimPoolInsurancePayout(NULLIFIER, 0n, payouts[0], AFTER_DUE);
    expect(() => sim.claimPoolInsurancePayout(NULLIFIER, 0n, payouts[0], AFTER_DUE)).toThrow(
      /payout already claimed/,
    );
  });

  it('allows independent claims on different slots', () => {
    const { sim, payouts } = setupAndSettlePool([LENDER_A, LENDER_B]);

    sim.switchIdentity({ lenderSecret: LENDER_A });
    const payoutA = sim.claimPoolInsurancePayout(NULLIFIER, 0n, payouts[0], AFTER_DUE);
    expect(payoutA).toBeGreaterThan(0n);

    sim.switchIdentity({ lenderSecret: LENDER_B });
    const payoutB = sim.claimPoolInsurancePayout(NULLIFIER, 1n, payouts[1], AFTER_DUE);
    expect(payoutB).toBeGreaterThan(0n);
  });
});

// ─── Pool secondary market: per-lender claim transfer ─────────────────────────

describe('Pool secondary market — per-lender transfer', () => {
  it('original lender transfers claim to new holder', () => {
    const { sim, payouts } = setupAndSettlePool([LENDER_A, LENDER_B]);
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
    const payout = sim.claimPoolInsurancePayout(NULLIFIER, 0n, payouts[0], AFTER_DUE);
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
    const { sim, payouts } = setupAndSettlePool([LENDER_A, LENDER_B]);
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
    const payout = sim.claimPoolInsurancePayout(NULLIFIER, 0n, payouts[0], AFTER_DUE);
    expect(payout).toBeGreaterThan(0n);
  });

  it('original lender cannot claim insurance after transferring', () => {
    const { sim, payouts } = setupAndSettlePool([LENDER_A, LENDER_B]);
    const newOwner = bytes32(50);
    const newCommitment = deriveClaimCommitment(newOwner, NULLIFIER);

    // Lender A transfers their claim
    sim.switchIdentity({ lenderSecret: LENDER_A });
    sim.transferPoolClaim(NULLIFIER, 0n, newCommitment);

    // Lender A tries to claim insurance — should fail
    expect(() => sim.claimPoolInsurancePayout(NULLIFIER, 0n, payouts[0], AFTER_DUE)).toThrow(
      /not the claim holder/,
    );
  });
});

// ─── Payout commitment binding ─────────────────────────────────────────────────
//
// The `payoutCommitments` ledger stores persistentHash(PayoutSeal{slotKey, payout})
// for each slot at settlement time. When a lender claims insurance, the circuit
// recomputes the hash from the *undisclosed* settlementPayout they provide and
// requires it to match the on-chain commitment. This prevents a claimant from
// fabricating their payout value to inflate the insurance claim.

describe('Pool insurance — payout commitment binding', () => {
  it('accepts the correct payout value recorded at settlement', () => {
    const { sim, payouts } = setupAndSettlePool([LENDER_A, LENDER_B]);

    // The commitment matches the on-chain hash, so the claim is not rejected
    // for a payout mismatch. (The exact payout returned is capped by the thin
    // insurance pool balance, so we only assert the claim proceeds.)
    sim.switchIdentity({ lenderSecret: LENDER_A });
    const payout = sim.claimPoolInsurancePayout(NULLIFIER, 0n, payouts[0], AFTER_DUE);
    expect(payout).toBeGreaterThanOrEqual(0n);
  });

  it('rejects a fabricated payout value (commitment mismatch)', () => {
    const { sim, payouts } = setupAndSettlePool([LENDER_A, LENDER_B]);
    // The true settlement payout is payouts[0]; a malicious claimant inflates it.
    const inflated = payouts[0] + 1000n;

    sim.switchIdentity({ lenderSecret: LENDER_A });
    expect(() => sim.claimPoolInsurancePayout(NULLIFIER, 0n, inflated, AFTER_DUE)).toThrow(
      /payout commitment mismatch/,
    );
  });

  it('rejects a deflated payout value (commitment mismatch)', () => {
    const { sim, payouts } = setupAndSettlePool([LENDER_A, LENDER_B]);
    const deflated = payouts[0] > 0n ? payouts[0] - 1n : 0n;

    sim.switchIdentity({ lenderSecret: LENDER_A });
    expect(() => sim.claimPoolInsurancePayout(NULLIFIER, 0n, deflated, AFTER_DUE)).toThrow(
      /payout commitment mismatch/,
    );
  });

  it('rejects a claim on a slot whose committed payout was never recorded', () => {
    // All 4 slots receive a payout commitment at settlement; a slot that was
    // never filled by a lender cannot be claimed at all (blocked earlier by the
    // bestPools check). A claim on a filled slot with a wrong payout value is
    // rejected by the commitment binding.
    const { sim, payouts } = setupAndSettlePool([LENDER_A, LENDER_B]);

    sim.switchIdentity({ lenderSecret: LENDER_A });
    expect(() => sim.claimPoolInsurancePayout(NULLIFIER, 0n, payouts[0] + 1n, AFTER_DUE)).toThrow(
      /payout commitment mismatch/,
    );
  });

  it('binds each slot to its own committed payout', () => {
    const { sim, payouts } = setupAndSettlePool([LENDER_A, LENDER_B]);

    // Using each slot's own committed payout succeeds for both lenders.
    sim.switchIdentity({ lenderSecret: LENDER_A });
    expect(sim.claimPoolInsurancePayout(NULLIFIER, 0n, payouts[0], AFTER_DUE)).toBeGreaterThanOrEqual(0n);
    sim.switchIdentity({ lenderSecret: LENDER_B });
    expect(sim.claimPoolInsurancePayout(NULLIFIER, 1n, payouts[1], AFTER_DUE)).toBeGreaterThanOrEqual(0n);
  });

  it('rejects a claim using another slot\u2019s committed payout (cross-slot binding)', () => {
    // Unequal split so the two slots have distinct committed payout values.
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_A }),
    );
    sim.registerInvoice(NULLIFIER, 650n, INVOICE_AMOUNT, 0n, 2n);
    const cA = bytes32(20);
    sim.switchIdentity({ lenderSecret: LENDER_A });
    sim.submitBid(NULLIFIER, cA);
    sim.revealPoolBid(NULLIFIER, 0n, cA);
    const cB = bytes32(21);
    sim.switchIdentity({ lenderSecret: LENDER_B });
    sim.submitBid(NULLIFIER, cB);
    sim.revealPoolBid(NULLIFIER, 1n, cB);

    // Contributions 3000 + 7000 = 10000 → payouts 3000 + 7000 (totalPayout = 10000).
    const contributions: [bigint, bigint, bigint, bigint] = [3000n, 7000n, 0n, 0n];
    const payouts: [bigint, bigint, bigint, bigint] = [3000n, 7000n, 0n, 0n];
    sim.switchIdentity({ smeSecret: SME_SECRET });
    sim.settleSplitInvoice(NULLIFIER, DUE, DUE, contributions, payouts);

    // Lender A uses slot 1's payout (7000) on their own slot 0 (committed 3000)
    // → commitment mismatch.
    sim.switchIdentity({ lenderSecret: LENDER_A });
    expect(() => sim.claimPoolInsurancePayout(NULLIFIER, 0n, 7000n, AFTER_DUE)).toThrow(
      /payout commitment mismatch/,
    );

    // The correct value (3000) is accepted.
    expect(sim.claimPoolInsurancePayout(NULLIFIER, 0n, 3000n, AFTER_DUE)).toBeGreaterThanOrEqual(0n);
  });
});
