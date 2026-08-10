import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';

import {
  ShieldLedgerSimulator,
  deriveCommitment,
  derivePseudonym,
  deriveBidKey,
  deriveBidCommitment,
} from './shield-ledger-simulator.js';
import { createShieldLedgerPrivateState } from '../src/witnesses.js';

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
const OTHER_B = bytes32(4);
const NULLIFIER = bytes32(7);
const DUE = 1_700_000_000n;
const LENDER = (secret: Uint8Array) => derivePseudonym(secret);
const SEAL = (secret: Uint8Array, amount: bigint, due = DUE, rate = 400n) =>
  deriveBidCommitment(secret, NULLIFIER, amount, due, rate);

/** Bid (seal + reveal) as lender `secret` on the current invoice. */
function bid(sim: ShieldLedgerSimulator, secret: Uint8Array, amount: bigint, due = DUE, rate = 400n) {
  sim.switchIdentity({ lenderSecret: secret });
  sim.submitBid(NULLIFIER, SEAL(secret, amount, due, rate));
  sim.revealBid(NULLIFIER, amount, due, rate);
}

describe('ShieldLedger contract — lifecycle', () => {
  it('initializes an empty ledger deterministically', () => {
    const simA = new ShieldLedgerSimulator(createShieldLedgerPrivateState({ smeSecret: SME_SECRET }));
    const simB = new ShieldLedgerSimulator(createShieldLedgerPrivateState({ smeSecret: SME_SECRET }));
    const project = (lg: ReturnType<typeof simA.getLedger>) => ({
      invoiceCount: lg.invoiceCount,
      invoices: lg.invoices.size(),
      bids: lg.bids.size(),
      bestBids: lg.bestBids.size(),
    });
    expect(project(simA.getLedger())).toEqual(project(simB.getLedger()));
    const lg = simA.getLedger();
    expect(lg.invoices.isEmpty()).toBe(true);
    expect(lg.bids.isEmpty()).toBe(true);
    expect(lg.bestBids.isEmpty()).toBe(true);
    expect(lg.invoiceCount).toBe(0n);
  });

  it('registers an invoice without disclosing its contents', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);

    const lg = sim.getLedger();
    expect(lg.invoiceCount).toBe(1n);
    expect(lg.invoices.member(NULLIFIER)).toBe(true);
    const invoice = lg.invoices.lookup(NULLIFIER);
    expect(hex(invoice.smeCommitment)).toBe(hex(deriveCommitment(SME_SECRET, NULLIFIER)));
    expect(hex(invoice.smeCommitment)).not.toBe(hex(SME_SECRET));
    expect(invoice.lender.is_some).toBe(false);
    expect(invoice.amount).toBe(0n);
    expect(invoice.dueDate).toBe(0n);
    expect(invoice.rateBps).toBe(0n);
  });
});

describe('ShieldLedger contract — sealed bidding', () => {
  it('stores only a commitment for a sealed bid — no terms are public', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.switchIdentity({ lenderSecret: LENDER_SECRET });
    sim.submitBid(NULLIFIER, SEAL(LENDER_SECRET, 100n, DUE, 400n));

    const lg = sim.getLedger();
    expect(lg.invoiceCount).toBe(2n);
    const bidKey = deriveBidKey(NULLIFIER, LENDER(LENDER_SECRET));
    expect(lg.bids.member(bidKey)).toBe(true);
    const bid = lg.bids.lookup(bidKey);
    expect(bid.nullifier).toEqual(NULLIFIER);
    expect(hex(bid.lender)).toBe(hex(LENDER(LENDER_SECRET)));
    expect(hex(bid.commitment)).toBe(hex(SEAL(LENDER_SECRET, 100n, DUE, 400n)));
    // The public bid shape carries only the seal — no amount/due/rate fields.
    expect(Object.keys(bid).sort()).toEqual(['commitment', 'lender', 'nullifier']);
    // Nothing has been revealed yet.
    expect(lg.bestBids.isEmpty()).toBe(true);
  });

  it('keeps rival lenders blind: only commitments and pseudonyms are on-chain', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.switchIdentity({ lenderSecret: LENDER_SECRET });
    sim.submitBid(NULLIFIER, SEAL(LENDER_SECRET, 100n, DUE, 400n));
    sim.switchIdentity({ lenderSecret: OTHER_A });
    sim.submitBid(NULLIFIER, SEAL(OTHER_A, 150n, DUE, 300n));

    const lg = sim.getLedger();
    expect(lg.bids.size()).toBe(2n);
    // Every public bid is only a seal — no amount/due/rate fields exist.
    for (const [, bid] of lg.bids) {
      expect(Object.keys(bid).sort()).toEqual(['commitment', 'lender', 'nullifier']);
    }
    // The invoice is still BIDDING and nothing has been revealed yet.
    expect(lg.bestBids.isEmpty()).toBe(true);
    const invoice = lg.invoices.lookup(NULLIFIER);
    expect(invoice.lender.is_some).toBe(false);
    expect(invoice.amount).toBe(0n);
    expect(invoice.rateBps).toBe(0n);
  });

  it('rejects duplicate sealed bids from the same lender', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.switchIdentity({ lenderSecret: LENDER_SECRET });
    sim.submitBid(NULLIFIER, SEAL(LENDER_SECRET, 100n, DUE, 400n));
    expect(() => sim.submitBid(NULLIFIER, SEAL(LENDER_SECRET, 200n, DUE, 300n))).toThrow(/already bid/);
    expect(sim.getLedger().bids.size()).toBe(1n);
  });

  it('rejects sealed bids from lenders below the credit threshold', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET, lenderCreditScore: 699n }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.switchIdentity({ lenderSecret: LENDER_SECRET });
    expect(() => sim.submitBid(NULLIFIER, SEAL(LENDER_SECRET, 100n, DUE, 400n))).toThrow(/not creditworthy/);
    expect(sim.getLedger().bids.isEmpty()).toBe(true);
  });

  it('rejects sealed bids on an unknown invoice', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ lenderSecret: LENDER_SECRET }),
    );
    sim.switchIdentity({ lenderSecret: LENDER_SECRET });
    expect(() => sim.submitBid(NULLIFIER, SEAL(LENDER_SECRET, 100n, DUE, 400n))).toThrow(/unknown invoice/);
  });
});

describe('ShieldLedger contract — reveal & best-bid selection', () => {
  it('reveals a bid and establishes the running best', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    bid(sim, LENDER_SECRET, 100n, DUE, 400n);

    const best = sim.getLedger().bestBids.lookup(NULLIFIER);
    expect(hex(best.lender)).toBe(hex(LENDER(LENDER_SECRET)));
    expect(best.amount).toBe(100n);
    expect(best.dueDate).toBe(DUE);
    expect(best.rateBps).toBe(400n);
  });

  it('rejects a reveal whose terms do not match the stored commitment', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.switchIdentity({ lenderSecret: LENDER_SECRET });
    sim.submitBid(NULLIFIER, SEAL(LENDER_SECRET, 100n, DUE, 400n));
    // Reject wrong amount, wrong rate, and wrong due date — each must fail.
    expect(() => sim.revealBid(NULLIFIER, 200n, DUE, 400n)).toThrow(/commitment mismatch/);
    expect(() => sim.revealBid(NULLIFIER, 100n, DUE, 350n)).toThrow(/commitment mismatch/);
    expect(() => sim.revealBid(NULLIFIER, 100n, DUE + 1n, 400n)).toThrow(/commitment mismatch/);
    expect(sim.getLedger().bestBids.isEmpty()).toBe(true);
  });

  it('rejects a reveal by a lender who never sealed a bid', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.switchIdentity({ lenderSecret: LENDER_SECRET });
    expect(() => sim.revealBid(NULLIFIER, 100n, DUE, 400n)).toThrow(/no such bid/);
  });

  it('rejects a reveal that exceeds the private exposure cap', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET, lenderExposureCap: 500n }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.switchIdentity({ lenderSecret: LENDER_SECRET });
    sim.submitBid(NULLIFIER, SEAL(LENDER_SECRET, 501n, DUE, 400n));
    expect(() => sim.revealBid(NULLIFIER, 501n, DUE, 400n)).toThrow(/bid exceeds exposure cap/);
    expect(sim.getLedger().bestBids.isEmpty()).toBe(true);
  });

  it('picks the lowest interest rate as the best bid regardless of reveal order', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    bid(sim, OTHER_A, 100n, DUE, 500n); // worst first
    bid(sim, LENDER_SECRET, 100n, DUE, 300n); // best second
    bid(sim, OTHER_B, 100n, DUE, 400n); // middle last

    const best = sim.getLedger().bestBids.lookup(NULLIFIER);
    expect(hex(best.lender)).toBe(hex(LENDER(LENDER_SECRET)));
    expect(best.rateBps).toBe(300n);
  });

  it('breaks rate ties by the smallest financed amount', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    bid(sim, OTHER_A, 150n, DUE, 400n);
    bid(sim, LENDER_SECRET, 100n, DUE, 400n); // same rate, smaller amount

    const best = sim.getLedger().bestBids.lookup(NULLIFIER);
    expect(hex(best.lender)).toBe(hex(LENDER(LENDER_SECRET)));
    expect(best.amount).toBe(100n);
  });

  it('breaks rate+amount ties by the earliest due date', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    bid(sim, OTHER_A, 100n, DUE + 100n, 400n);
    bid(sim, LENDER_SECRET, 100n, DUE, 400n); // same rate & amount, earlier due

    const best = sim.getLedger().bestBids.lookup(NULLIFIER);
    expect(hex(best.lender)).toBe(hex(LENDER(LENDER_SECRET)));
    expect(best.dueDate).toBe(DUE);
  });

  it('keeps the first revealer in the lead on an exact tie (deterministic)', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    bid(sim, LENDER_SECRET, 100n, DUE, 400n);
    bid(sim, OTHER_A, 100n, DUE, 400n); // identical terms — must not flip the lead

    const best = sim.getLedger().bestBids.lookup(NULLIFIER);
    expect(hex(best.lender)).toBe(hex(LENDER(LENDER_SECRET)));
  });

  it('rejects reveals once the invoice is financed', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    bid(sim, LENDER_SECRET, 100n, DUE, 400n);
    sim.settleInvoice(NULLIFIER, 100n, DUE);
    expect(() => sim.revealBid(NULLIFIER, 100n, DUE, 400n)).toThrow(/invoice not in bidding/);
  });
});

describe('ShieldLedger contract — settlement', () => {
  it('rejects settlement before any bid is revealed', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    expect(() => sim.settleInvoice(NULLIFIER, 100n, DUE)).toThrow(/auction not resolved/);
  });

  it('pays the lowest-rate winner automatically — the SME cannot pick a loser', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    bid(sim, OTHER_A, 100n, DUE, 500n);
    bid(sim, LENDER_SECRET, 100n, DUE, 300n); // the true winner

    sim.settleInvoice(NULLIFIER, 100n, DUE);
    const invoice = sim.getLedger().invoices.lookup(NULLIFIER);
    expect(invoice.lender.is_some).toBe(true);
    // Even though OTHER_A revealed first, settlement pays the lowest rate.
    expect(hex(invoice.lender.value)).toBe(hex(LENDER(LENDER_SECRET)));
    expect(invoice.amount).toBe(100n);
    expect(invoice.dueDate).toBe(DUE);
    expect(invoice.rateBps).toBe(300n);
    expect(hex(invoice.smeCommitment)).toBe(hex(deriveCommitment(SME_SECRET, NULLIFIER)));
  });

  it('allows a smaller financed amount than the winning bid', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    bid(sim, LENDER_SECRET, 100n, DUE, 400n);
    sim.settleInvoice(NULLIFIER, 75n, DUE);

    const invoice = sim.getLedger().invoices.lookup(NULLIFIER);
    expect(invoice.lender.is_some).toBe(true);
    expect(invoice.amount).toBe(75n);
  });

  it('rejects settlement by anyone but the invoice owner', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    bid(sim, LENDER_SECRET, 100n, DUE, 400n);

    sim.switchIdentity({ smeSecret: bytes32(99) });
    expect(() => sim.settleInvoice(NULLIFIER, 100n, DUE)).toThrow(/not the SME/);
    expect(sim.getLedger().invoices.lookup(NULLIFIER).lender.is_some).toBe(false);
  });

  it('rejects settling for more than the winning bid', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    bid(sim, LENDER_SECRET, 100n, DUE, 400n);
    expect(() => sim.settleInvoice(NULLIFIER, 101n, DUE)).toThrow(/amount exceeds winning bid/);
    expect(sim.getLedger().invoices.lookup(NULLIFIER).lender.is_some).toBe(false);
  });

  it('rejects a second settlement of an already-financed invoice', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    bid(sim, LENDER_SECRET, 100n, DUE, 400n);
    sim.settleInvoice(NULLIFIER, 100n, DUE);
    expect(() => sim.settleInvoice(NULLIFIER, 100n, DUE)).toThrow(/already financed/);
  });
});

describe('ShieldLedger contract — pseudonym unlinkability', () => {
  it('gives distinct pseudonyms to distinct lenders', () => {
    expect(hex(LENDER(bytes32(1)))).not.toBe(hex(LENDER(bytes32(2))));
  });

  it('never stores raw secrets or bid terms anywhere public', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    bid(sim, LENDER_SECRET, 100n, DUE, 400n);
    bid(sim, OTHER_A, 150n, DUE, 300n);

    const publicValues: string[] = [];
    for (const [nullifier, invoice] of sim.getLedger().invoices) {
      publicValues.push(hex(nullifier), hex(invoice.smeCommitment));
      if (invoice.lender.is_some) publicValues.push(hex(invoice.lender.value));
    }
    for (const [bidKey, bid] of sim.getLedger().bids) {
      publicValues.push(hex(bidKey), hex(bid.nullifier), hex(bid.lender), hex(bid.commitment));
    }
    for (const [nullifier, best] of sim.getLedger().bestBids) {
      publicValues.push(hex(nullifier), hex(best.lender));
    }
    expect(publicValues).not.toContain(hex(LENDER_SECRET));
    expect(publicValues).not.toContain(hex(SME_SECRET));
    expect(publicValues).not.toContain(hex(OTHER_A));
  });
});
