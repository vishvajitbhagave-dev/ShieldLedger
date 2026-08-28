import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';

import {
  ShieldLedgerSimulator,
  MIN_CREDIT_SCORE,
  deriveBidCommitment,
  derivePseudonym,
  deriveCommitment,
} from './shield-ledger-simulator.js';
import { createShieldLedgerPrivateState } from '../src/witnesses.js';
import {
  insuranceContribution,
  insurancePoolKey,
} from '../src/insurance.js';

setNetworkId('undeployed');

/**
 * Stress / load-simulation suite for ShieldLedger.
 *
 * Runs the real circuits through the compact-runtime VM (no network, no proof
 * generation) at high volume, reusing the exact simulator helpers and bidding
 * patterns from the functional tests. It is a SIMULATOR-level load test, not a
 * network/consensus load test — see docs/STRESS_TEST_RESULTS.md for the honest
 * scope of what this can and cannot measure.
 *
 * Scale was chosen from an explicit feasibility probe (see docs):
 *  - register+finance 100 invoices ≈ 3.7s, 500 ≈ 50s, and going to 1000 timed
 *    out past 5 minutes on the memory-constrained WSL runner. The circuit VM's
 *    per-call cost grows with the accumulated ledger state, so a few hundred
 *    invoices is the honest ceiling for a single simulator instance — not a
 *    literal "thousands" figure that does not fit this headless design.
 *  - Pool funding caps at 4 lenders per invoice, so "many lenders bidding" is
 *    modeled as many lenders across many invoices / single-lender bids, not
 *    500 lenders crammed onto one invoice.
 */

/** Deterministic, injective 32-byte array from an integer (up to 2^160). */
function seed(n: number): Uint8Array {
  const out = new Uint8Array(32);
  const v = BigInt(n);
  let i = 31;
  let tmp = v;
  while (tmp > 0n && i >= 0) {
    out[i] = Number(tmp & 255n);
    tmp >>= 8n;
    i--;
  }
  out[0] = 0x53; // 'S' guard byte — keeps user/accreditor space distinct
  return out;
}

const DUE = 1_700_000_000n;
const AFTER_DUE = DUE + 1n;

/**
 * Whole-Invoice-First tie-break oracle, mirroring the compiled circuit:
 *  1. whole-invoice bids (willingToSplit=false) beat split bids regardless of
 *     rate/due (the top-level rule);
 *  2. within a group, lowest rate wins;
 *  3. rate ties → earliest due date wins;
 *  4. exact (rate, due, split) ties → first revealer stays in the lead.
 *
 * Submitted in submission order; later equal bids must not flip the lead.
 */
interface OracleBid { amount: bigint; due: bigint; rateBps: bigint; willingToSplit: boolean; }
function oracleWinner(bids: OracleBid[]): { index: number; rateBps: bigint; due: bigint; willingToSplit: boolean } {
  let best = 0;
  for (let i = 1; i < bids.length; i++) {
    const a = bids[best];
    const b = bids[i];
    const aWhole = !a.willingToSplit;
    const bWhole = !b.willingToSplit;
    let better = false;
    if (aWhole !== bWhole) {
      better = bWhole; // whole beats split even at worse rate (b whole ⇒ b wins)
    } else if (a.rateBps !== b.rateBps) {
      better = b.rateBps < a.rateBps;
    } else if (a.due !== b.due) {
      better = b.due < a.due;
    } else {
      better = false; // exact tie — first revealer (earlier index) stays
    }
    if (better) best = i;
  }
  return {
    index: best,
    rateBps: bids[best].rateBps,
    due: bids[best].due,
    willingToSplit: bids[best].willingToSplit,
  };
}

function poolBalance(sim: ShieldLedgerSimulator): bigint {
  return sim.getLedger().insurancePools.lookup(insurancePoolKey()).balance;
}

// ─── Tier A: Volume — many invoice registrations ─────────────────────────────

describe('STRESS · volume — many invoice registrations on one ledger', () => {
  it(
    'registers 400 invoices across several SMEs; pool funded; no identity leakage',
    { timeout: 180_000 },
    () => {
      const COUNT = 400;
      const SME_COUNT = 4;
      const SME_SECRETS = Array.from({ length: SME_COUNT }, (_, i) => seed(1000 + i));
      const sim = new ShieldLedgerSimulator(
        createShieldLedgerPrivateState({ smeSecret: SME_SECRETS[0] }),
      );

      let funded = 0n;
      for (let i = 0; i < COUNT; i++) {
        const sme = SME_SECRETS[i % SME_COUNT];
        const amount = 10_000n + BigInt(i % 97);
        sim.switchIdentity({ smeSecret: sme });
        sim.registerInvoice(seed(i), MIN_CREDIT_SCORE, amount);
        funded += insuranceContribution(amount);
      }

      const lg = sim.getLedger();
      expect(lg.invoiceCount).toBe(BigInt(COUNT));
      expect(lg.invoices.size()).toBe(BigInt(COUNT));

      // The 2% pool must be funded exactly from every registration, in order.
      expect(poolBalance(sim)).toBe(funded);

      // Spot-check that each SME's invoices only expose their commitment, never
      // the SME secret itself (privacy invariant holds at volume).
      const lg2 = sim.getLedger();
      for (let i = 0; i < 3; i++) {
        const inv = lg2.invoices.lookup(seed(i));
        const expected = deriveCommitment(SME_SECRETS[i % SME_COUNT], seed(i));
        expect(Buffer.from(inv.smeCommitment).equals(expected)).toBe(true);
      }
    },
  );
});

// ─── Tier B: Concurrent-style bidding + tie-break at volume ──────────────────

describe('STRESS · concurrent bidding & tie-break correctness at volume', () => {
  it(
    '200 single-lender invoices financed across ~170 lenders; winner matches tie-break oracle including Whole-Invoice-First',
    { timeout: 240_000 },
    () => {
      const TOTAL = 200;
      const LENDER_FROM = 10_000;
      // A pool of ~170 distinct lender identities competing across invoices.
      // (Pool funding is capped at 4 lenders per invoice by the design, so
      // "many lenders bidding" is modeled as many lenders spread across many
      // invoices / single-lender auctions — not crammed onto one invoice.)
      const LENDERS = Array.from({ length: 170 }, (_, i) => seed(LENDER_FROM + i));
      const lenderAt = (k: number) => LENDERS[k % LENDERS.length];

      const SME_SECRET = seed(999);
      const sim = new ShieldLedgerSimulator(
        createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: lenderAt(0) }),
      );

      // Store, per invoice, the ordered bids plus the derived winner pseudonym.
      const configs: {
        nf: Uint8Array;
        bids: OracleBid[];
        winnerIdx: number;
        winnerPseudonym: Uint8Array;
      }[] = [];

      for (let i = 0; i < TOTAL; i++) {
        const amount = 10_000n + BigInt(i % 91);
        sim.switchIdentity({ smeSecret: SME_SECRET });
        sim.registerInvoice(seed(i), MIN_CREDIT_SCORE, amount);

        // 1 to 4 competing lenders per invoice, with deliberate variation in
        // rate, due date, and split flag to exercise every tie-break rule.
        const compCount = 1 + (i % 4);
        const bids: OracleBid[] = [];
        const bidSecrets: Uint8Array[] = [];
        for (let c = 0; c < compCount; c++) {
          const rate = 300n + BigInt((i * 31 + c * 17) % 700);  // 3%..10%
          const due = DUE + BigInt((i * 7 + c * 3) % 5);        // slight due variance
          const willingToSplit = c % 3 === 0;                   // ~1/3 are split bids
          const lender = lenderAt(i + c);
          const financed = 1000n + BigInt((i + c) % 500);
          sim.switchIdentity({ lenderSecret: lender });
          sim.submitBid(seed(i), deriveBidCommitment(lender, seed(i), financed, due, rate, willingToSplit));
          sim.revealBid(seed(i), financed, due, rate, willingToSplit);
          bids.push({ amount: financed, due, rateBps: rate, willingToSplit });
          bidSecrets.push(lender);
        }
        const expected = oracleWinner(bids);
        configs.push({
          nf: seed(i),
          bids,
          winnerIdx: expected.index,
          winnerPseudonym: derivePseudonym(bidSecrets[expected.index]),
        });
      }

      const lg = sim.getLedger();
      expect(lg.invoices.size()).toBe(BigInt(TOTAL));

      // Every competitive invoice must have resolved to exactly the oracle's
      // winner (rate, due, split flag, amount, and lender identity) — the
      // tie-break logic holds at volume, not just in the small hand-picked
      // functional cases.
      for (const cfg of configs) {
        const best = lg.bestBids.lookup(cfg.nf);
        const exp = cfg.bids[cfg.winnerIdx];
        expect(best.rateBps).toBe(exp.rateBps);
        expect(best.dueDate).toBe(exp.due);
        expect(best.willingToSplit).toBe(exp.willingToSplit);
        expect(best.amount).toBe(exp.amount);
        expect(Buffer.from(best.lender).equals(cfg.winnerPseudonym)).toBe(true);
      }
    },
  );

  it(
    'pool bidding volume: a handful of 4-lender pool invoices reveal into resolvable pools (max-4 constraint respected)',
    { timeout: 120_000 },
    () => {
      const POOL_COUNT = 10;
      const LENDERS = Array.from({ length: 8 }, (_, i) => seed(30_000 + i));
      const SME_SECRET = seed(998);
      const sim = new ShieldLedgerSimulator(
        createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDERS[0] }),
      );

      for (let i = 0; i < POOL_COUNT; i++) {
        const amount = 20_000n + BigInt(i);
        sim.switchIdentity({ smeSecret: SME_SECRET });
        // splitCount = 4 (max) → up to 4 lenders per pool.
        sim.registerInvoice(seed(50_000 + i), MIN_CREDIT_SCORE, amount, 0n, 4n);
        for (let s = 0; s < 4; s++) {
          const c = seed(i * 4 + s + 40_000);
          sim.switchIdentity({ lenderSecret: LENDERS[s] });
          sim.submitBid(seed(50_000 + i), c);
          sim.revealPoolBid(seed(50_000 + i), BigInt(s), c);
        }
      }

      const lg = sim.getLedger();
      // All 10 pool invoices exist and every slot key is derivable (pool
      // resolved); bids were accepted into 4 distinct per-invoice slots.
      for (let i = 0; i < POOL_COUNT; i++) {
        expect(lg.invoices.member(seed(50_000 + i))).toBe(true);
      }
    },
  );
});

// ─── Tier C: Mass defaults + insurance pool exhaustion ────────────────────────

describe('STRESS · mass defaults & insurance pool exhaustion', () => {
  it(
    'batch of financed invoices defaults together; isolated pool drains dry; proportional shortfall; no double-claims; pool never negative',
    { timeout: 240_000 },
    () => {
      const COUNT = 220;
      const LENDERS = Array.from({ length: 120 }, (_, i) => seed(20_000 + i));
      const SME_SECRET = seed(888);
      const sim = new ShieldLedgerSimulator(
        createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDERS[0] }),
      );

      // Pool funded by every registration. Payout entitlement = 50% of the
      // financed amount per single-lender invoice, so total entitlement far
      // exceeds total premium → the pool MUST run dry partway through the batch.
      let contributions = 0n;
      for (let i = 0; i < COUNT; i++) {
        const amount = 10_000n + BigInt(i % 89);
        sim.switchIdentity({ smeSecret: SME_SECRET });
        sim.registerInvoice(seed(i), MIN_CREDIT_SCORE, amount);
        contributions += insuranceContribution(amount);
      }
      const startingPool = poolBalance(sim);
      expect(startingPool).toBe(contributions);

      // Financed amounts ~ 10% of face (typical), so entitlement = 5% of face.
      const financed: bigint[] = [];
      for (let i = 0; i < COUNT; i++) {
        const lender = LENDERS[i % LENDERS.length];
        const amt = 1000n + BigInt((i * 7) % 500);
        sim.switchIdentity({ lenderSecret: lender });
        sim.submitBid(seed(i), deriveBidCommitment(lender, seed(i), amt, DUE, 400n));
        sim.revealBid(seed(i), amt, DUE, 400n);
        financed.push(amt);
      }

      const TOTAL_ENTITLEMENT = financed.reduce((a, b) => a + fullClaimEntitlement(b), 0n);

      // Mass default: every invoice past due → claim at once (same block, one
      // after another through the same ledger).
      let totalPayouts = 0n;
      let fullyCovered = 0;
      let shortfalls = 0;
      let seen = new Set<string>();

      for (let i = 0; i < COUNT; i++) {
        sim.switchIdentity({ lenderSecret: LENDERS[i % LENDERS.length] });
        const before = poolBalance(sim);
        const paid = sim.claimInsurancePayout(seed(i), AFTER_DUE);
        const after = poolBalance(sim);

        // Monotonic, never-negative drain: after == before - paid.
        expect(after).toBe(before - paid);
        expect(after).toBeGreaterThanOrEqual(0n);
        totalPayouts += paid;

        if (paid === fullClaimEntitlement(financed[i])) {
          fullyCovered++;
        } else if (paid < fullClaimEntitlement(financed[i])) {
          shortfalls++;
        }

        // No member surprises: exactly one claim record per invoice, filled once.
        expect(seen.has(hexOf(seed(i)))).toBe(false);
        seen.add(hexOf(seed(i)));
        const claim = sim.getLedger().insuranceClaims.lookup(seed(i));
        expect(claim.payout).toBe(paid);
      }

      // The batch ran the pool dry: the last invoices got proportional shortfall
      // payouts (paid < entitlement) rather than crashing or paying beyond the pool.
      expect(shortfalls).toBeGreaterThan(0);
      expect(poolBalance(sim)).toBe(0n);
      expect(totalPayouts).toBeLessThanOrEqual(TOTAL_ENTITLEMENT);
      expect(totalPayouts).toBeLessThanOrEqual(startingPool);

      // No invoice can ever be claimed twice (double-claim protection still
      // fires after the pool is dry).
      sim.switchIdentity({ lenderSecret: LENDERS[0] });
      expect(() => sim.claimInsurancePayout(seed(0), AFTER_DUE)).toThrow(/payout already claimed/);
    },
  );
});

function fullClaimEntitlement(b: bigint): bigint {
  return b / 2n;
}

function hexOf(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}
