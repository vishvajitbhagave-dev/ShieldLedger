import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';

import {
  ShieldLedgerSimulator,
  MIN_CREDIT_SCORE,
  deriveBidCommitment,
} from './shield-ledger-simulator.js';
import { createShieldLedgerPrivateState } from '../src/witnesses.js';
import {
  applyReputationUpdate,
  reputationView,
  REPUTATION_CAP,
  REPUTATION_FLOOR,
  REPUTATION_ON_TIME_INCREMENT,
  REPUTATION_LATE_PENALTY,
} from '../src/reputation.js';
import type { Ledger } from '../contracts/managed/shield-ledger/contract/index.js';

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
const NULLIFIER = bytes32(7);
const DUE = 1_700_000_000n;
const AMOUNT = 100n;
const RATE = 400n;

/** Register, bid (seal + reveal) and settle one invoice as the same SME wallet. */
function runDeal(
  sim: ShieldLedgerSimulator,
  nullifier: Uint8Array,
  settledAt: bigint,
  reputationThreshold = 0n,
) {
  sim.registerInvoice(nullifier, MIN_CREDIT_SCORE, 1000n, reputationThreshold);
  sim.switchIdentity({ lenderSecret: LENDER_SECRET });
  sim.submitBid(nullifier, deriveBidCommitment(LENDER_SECRET, nullifier, AMOUNT, DUE, RATE));
  sim.revealBid(nullifier, AMOUNT, DUE, RATE);
  sim.switchIdentity({ smeSecret: SME_SECRET });
  sim.settleInvoice(nullifier, AMOUNT, DUE, settledAt);
}

/** Every value the ledger exposes publicly (hex and numbers), for leak checks. */
function publicValues(lg: Ledger): string[] {
  const out: string[] = [];
  for (const [nullifier, invoice] of lg.invoices) {
    out.push(hex(nullifier));
    out.push(hex(invoice.smeCommitment));
    out.push(invoice.creditThreshold.toString());
    out.push(invoice.reputationThreshold.toString());
    out.push(invoice.invoiceAmount.toString());
    if (invoice.lender.is_some) out.push(hex(invoice.lender.value));
    out.push(invoice.amount.toString());
    out.push(invoice.dueDate.toString());
    out.push(invoice.rateBps.toString());
  }
  for (const [bidKey, bid] of lg.bids) {
    out.push(hex(bidKey));
    out.push(hex(bid.nullifier));
    out.push(hex(bid.lender));
    out.push(hex(bid.commitment));
  }
  for (const [, best] of lg.bestBids) {
    out.push(hex(best.lender));
    out.push(best.amount.toString());
    out.push(best.dueDate.toString());
    out.push(best.rateBps.toString());
  }
  return out;
}

describe('Cross-deal reputation — wallet scoring (0..100)', () => {
  it('a fresh SME starts at score 0 with no deal history', () => {
    const view = reputationView(createShieldLedgerPrivateState());
    expect(view.score).toBe(REPUTATION_FLOOR);
    expect(view.onTimeCount).toBe(0n);
    expect(view.lateCount).toBe(0n);
  });

  it('an on-time settlement raises the score by 10 and counts it on-time', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    runDeal(sim, NULLIFIER, DUE - 1n); // settled before the due date
    const view = reputationView(sim.getPrivateState());
    expect(view.score).toBe(REPUTATION_ON_TIME_INCREMENT);
    expect(view.onTimeCount).toBe(1n);
    expect(view.lateCount).toBe(0n);
  });

  it('a late settlement lowers the score by 20 and counts it late', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({
        smeSecret: SME_SECRET,
        smeReputationScore: 30n,
        lenderSecret: LENDER_SECRET,
      }),
    );
    runDeal(sim, NULLIFIER, DUE + 1n); // settled after the due date
    const view = reputationView(sim.getPrivateState());
    expect(view.score).toBe(30n - REPUTATION_LATE_PENALTY);
    expect(view.onTimeCount).toBe(0n);
    expect(view.lateCount).toBe(1n);
  });

  it('settling exactly on the due date counts as on-time', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    runDeal(sim, NULLIFIER, DUE);
    expect(reputationView(sim.getPrivateState()).score).toBe(REPUTATION_ON_TIME_INCREMENT);
    expect(reputationView(sim.getPrivateState()).lateCount).toBe(0n);
  });

  it('a far-future due date (year 2100) settles as on-time at the current epoch time', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    // 2100-01-01T00:00:00Z in unix SECONDS. Settling "now" (seconds) must be
    // classified on-time: the circuit compares settledAt <= financedDueDate in
    // the same (second) units. A ms-vs-seconds mix-up (settledAt ~1.75e12)
    // would blow past this and be misclassified as LATE.
    const dueDate2100 = 4_102_444_800n;
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const nullifier = bytes32(20);
    sim.registerInvoice(nullifier, MIN_CREDIT_SCORE, 1000n, 0n);
    sim.switchIdentity({ lenderSecret: LENDER_SECRET });
    sim.submitBid(nullifier, deriveBidCommitment(LENDER_SECRET, nullifier, AMOUNT, dueDate2100, RATE));
    sim.revealBid(nullifier, AMOUNT, dueDate2100, RATE);
    sim.switchIdentity({ smeSecret: SME_SECRET });
    sim.settleInvoice(nullifier, AMOUNT, dueDate2100, nowSeconds);
    const view = reputationView(sim.getPrivateState());
    expect(view.score).toBe(REPUTATION_ON_TIME_INCREMENT);
    expect(view.onTimeCount).toBe(1n);
    expect(view.lateCount).toBe(0n);
  });

  it('the score accumulates across invoices in the same wallet (cross-deal)', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    runDeal(sim, bytes32(10), DUE - 1n);
    runDeal(sim, bytes32(11), DUE - 1n);
    runDeal(sim, bytes32(12), DUE - 1n);
    const view = reputationView(sim.getPrivateState());
    expect(view.score).toBe(3n * REPUTATION_ON_TIME_INCREMENT);
    expect(view.onTimeCount).toBe(3n);
    expect(view.lateCount).toBe(0n);
  });

  it('capping: enough on-time settlements reach 100 and stop there', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({
        smeSecret: SME_SECRET,
        smeReputationScore: REPUTATION_CAP - 5n,
        lenderSecret: LENDER_SECRET,
      }),
    );
    runDeal(sim, bytes32(10), DUE - 1n);
    runDeal(sim, bytes32(11), DUE - 1n);
    expect(reputationView(sim.getPrivateState()).score).toBe(REPUTATION_CAP);
  });

  it('flooring: the score never drops below 0', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({
        smeSecret: SME_SECRET,
        smeReputationScore: 15n,
        lenderSecret: LENDER_SECRET,
      }),
    );
    runDeal(sim, bytes32(10), DUE + 1n);
    runDeal(sim, bytes32(11), DUE + 1n);
    expect(reputationView(sim.getPrivateState()).score).toBe(REPUTATION_FLOOR);
    expect(reputationView(sim.getPrivateState()).lateCount).toBe(2n);
  });

  it('the pure formula is the single source of truth for cap/floor edges', () => {
    const atCap = applyReputationUpdate(
      createShieldLedgerPrivateState({ smeReputationScore: REPUTATION_CAP }),
      true,
    );
    expect(atCap.smeReputationScore).toBe(REPUTATION_CAP);
    expect(atCap.smeOnTimeCount).toBe(1n);

    const atFloor = applyReputationUpdate(
      createShieldLedgerPrivateState({ smeReputationScore: REPUTATION_FLOOR }),
      false,
    );
    expect(atFloor.smeReputationScore).toBe(REPUTATION_FLOOR);
    expect(atFloor.smeLateCount).toBe(1n);
  });
});

describe('Cross-deal reputation — registration threshold proof', () => {
  it('stores only the proven bound: score >= reputationThreshold is disclosed, not the score', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, smeReputationScore: 70n }),
    );
    sim.registerInvoice(NULLIFIER, MIN_CREDIT_SCORE, 1000n, 40n);
    const invoice = sim.getLedger().invoices.lookup(NULLIFIER);
    expect(invoice.reputationThreshold).toBe(40n);
    // The public ledger shows the bound the SME attested to — nothing higher.
    expect(publicValues(sim.getLedger())).toContain('40');
  });

  it('rejects a threshold above the SME private score ("insufficient reputation")', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, smeReputationScore: 40n }),
    );
    expect(() => sim.registerInvoice(NULLIFIER, MIN_CREDIT_SCORE, 1000n, 41n)).toThrow(
      /insufficient reputation/,
    );
  });

  it('a threshold of 0 means "no reputation requirement" and always proves', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, smeReputationScore: 0n }),
    );
    expect(() => sim.registerInvoice(NULLIFIER, MIN_CREDIT_SCORE, 1000n, 0n)).not.toThrow();
  });

  it('never exposes the raw score, deal counts or lender bar across multiple deals', () => {
    const ps = createShieldLedgerPrivateState({
      smeSecret: SME_SECRET,
      smeReputationScore: 60n,
      smeOnTimeCount: 4n,
      smeLateCount: 1n,
      lenderSecret: LENDER_SECRET,
      lenderMinReputation: 30n,
    });
    const sim = new ShieldLedgerSimulator(ps);
    runDeal(sim, bytes32(10), DUE - 1n, 35n);
    runDeal(sim, bytes32(11), DUE + 1n, 35n);
    runDeal(sim, bytes32(12), DUE - 1n, 35n);

    const tokens = new Set(publicValues(sim.getLedger()));
    expect(tokens.has(ps.smeReputationScore.toString())).toBe(false); // 60
    expect(tokens.has(ps.smeOnTimeCount.toString())).toBe(false); // 4
    expect(tokens.has(ps.smeLateCount.toString())).toBe(false); // 1
    expect(tokens.has(ps.lenderMinReputation.toString())).toBe(false); // 30
    expect(tokens.has(hex(ps.smeSecret))).toBe(false);
    expect(tokens.has('35')).toBe(true); // only the *bound* the SME attested to is public
  });
});

describe('Cross-deal reputation — lender minimum at bidding', () => {
  it('lets a lender bid only when the invoice bound clears their private bar', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({
        smeSecret: SME_SECRET,
        smeReputationScore: 50n,
        lenderSecret: LENDER_SECRET,
      }),
    );
    sim.registerInvoice(NULLIFIER, MIN_CREDIT_SCORE, 1000n, 30n);

    // A bar above the attested bound is rejected in-circuit.
    sim.switchIdentity({ lenderSecret: LENDER_SECRET, lenderMinReputation: 40n });
    expect(() => sim.submitBid(NULLIFIER, deriveBidCommitment(LENDER_SECRET, NULLIFIER, AMOUNT, DUE, RATE))).toThrow(
      /reputation below lender minimum/,
    );

    // A bar at or below the bound clears.
    sim.switchIdentity({ lenderSecret: LENDER_SECRET, lenderMinReputation: 30n });
    expect(() =>
      sim.submitBid(NULLIFIER, deriveBidCommitment(LENDER_SECRET, NULLIFIER, AMOUNT, DUE, RATE)),
    ).not.toThrow();
    expect(sim.getLedger().bids.size()).toBe(1n);
  });

  it('an unproven invoice (threshold 0) is eligible for lenders with no bar', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER, MIN_CREDIT_SCORE, 1000n, 0n);
    sim.switchIdentity({ lenderSecret: LENDER_SECRET, lenderMinReputation: 0n });
    expect(() =>
      sim.submitBid(NULLIFIER, deriveBidCommitment(LENDER_SECRET, NULLIFIER, AMOUNT, DUE, RATE)),
    ).not.toThrow();
    expect(sim.getLedger().bids.size()).toBe(1n);
  });

  it('the settlement classification (settledAt vs due) drives the score change', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({
        smeSecret: SME_SECRET,
        smeReputationScore: 20n,
        lenderSecret: LENDER_SECRET,
      }),
    );
    // Invoice A settled before its due date: on-time.
    runDeal(sim, bytes32(10), DUE - 5000n);
    expect(reputationView(sim.getPrivateState()).score).toBe(30n);
    expect(reputationView(sim.getPrivateState()).onTimeCount).toBe(1n);
    // Invoice B settled after its due date: late.
    runDeal(sim, bytes32(11), DUE + 5000n);
    expect(reputationView(sim.getPrivateState()).score).toBe(10n);
    expect(reputationView(sim.getPrivateState()).lateCount).toBe(1n);
  });
});
