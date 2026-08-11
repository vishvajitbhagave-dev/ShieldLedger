import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';

import {
  ShieldLedgerSimulator,
  deriveBuyerCommitment,
  deriveBidCommitment,
  derivePseudonym,
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
const BUYER_SECRET = bytes32(2);
const OTHER_BUYER = bytes32(3);
const LENDER_SECRET = bytes32(4);
const NULLIFIER = bytes32(7);
const OTHER_NULLIFIER = bytes32(8);
const AMOUNT = 1000n;
const DUE = 1_700_000_000n;
const RATE = 400n;

/** Register an invoice as the SME, then confirm it as the buyer. */
function registerAndConfirm(sim: ShieldLedgerSimulator, nullifier = NULLIFIER, amount = AMOUNT) {
  sim.registerInvoice(nullifier, 650n, amount);
  sim.switchIdentity({ buyerSecret: BUYER_SECRET });
  sim.confirmInvoice(nullifier, amount);
}

describe('ShieldLedger contract — buyer verification (ZK)', () => {
  it('registers the SME claim amount with buyerVerified=false', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, buyerSecret: BUYER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER, 650n, AMOUNT);

    const invoice = sim.getLedger().invoices.lookup(NULLIFIER);
    expect(invoice.invoiceAmount).toBe(AMOUNT);
    expect(invoice.buyerVerified).toBe(false);
    // The placeholder commitment is opaque and reveals nothing about any buyer.
    expect(invoice.buyerCommitment.length).toBe(32);
  });

  it('confirms a pending invoice: flag flips true and a per-invoice commitment is stored', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, buyerSecret: BUYER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER, 650n, AMOUNT);
    sim.switchIdentity({ buyerSecret: BUYER_SECRET });
    sim.confirmInvoice(NULLIFIER, AMOUNT);

    const invoice = sim.getLedger().invoices.lookup(NULLIFIER);
    expect(invoice.buyerVerified).toBe(true);
    // The stored commitment is hash(buyerSecret, nullifier) — bound to this
    // invoice, but opaque: it reveals neither the secret nor the nullifier.
    expect(hex(invoice.buyerCommitment)).toBe(hex(deriveBuyerCommitment(BUYER_SECRET, NULLIFIER)));
    expect(hex(invoice.buyerCommitment)).not.toBe(hex(BUYER_SECRET));
    expect(hex(invoice.buyerCommitment)).not.toBe(hex(NULLIFIER));
  });

  it('rejects a confirmation whose amount differs from the SME claim (circuit assert)', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, buyerSecret: BUYER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER, 650n, AMOUNT);
    sim.switchIdentity({ buyerSecret: BUYER_SECRET });

    expect(() => sim.confirmInvoice(NULLIFIER, AMOUNT + 1n)).toThrow(/amount mismatch/);
    expect(() => sim.confirmInvoice(NULLIFIER, AMOUNT - 1n)).toThrow(/amount mismatch/);
    expect(sim.getLedger().invoices.lookup(NULLIFIER).buyerVerified).toBe(false);
  });

  it('rejects confirmation of an unknown invoice', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, buyerSecret: BUYER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER, 650n, AMOUNT);
    sim.switchIdentity({ buyerSecret: BUYER_SECRET });

    expect(() => sim.confirmInvoice(OTHER_NULLIFIER, AMOUNT)).toThrow(/unknown invoice/);
  });

  it('rejects a second confirmation (no replay)', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, buyerSecret: BUYER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER, 650n, AMOUNT);
    sim.switchIdentity({ buyerSecret: BUYER_SECRET });
    sim.confirmInvoice(NULLIFIER, AMOUNT);

    expect(() => sim.confirmInvoice(NULLIFIER, AMOUNT)).toThrow(/already buyer verified/);
  });

  it('rejects confirmation once the invoice is financed', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, buyerSecret: BUYER_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER, 650n, AMOUNT);
    sim.switchIdentity({ lenderSecret: LENDER_SECRET });
    sim.submitBid(NULLIFIER, deriveBidCommitment(LENDER_SECRET, NULLIFIER, 100n, DUE, RATE));
    sim.revealBid(NULLIFIER, 100n, DUE, RATE);
    sim.settleInvoice(NULLIFIER, 100n, DUE);

    sim.switchIdentity({ buyerSecret: BUYER_SECRET });
    expect(() => sim.confirmInvoice(NULLIFIER, AMOUNT)).toThrow(/invoice not in bidding/);
  });

  it('binds the confirmation to the specific invoice', () => {
    // The commitment changes with the nullifier, so a confirmation cannot be
    // replayed or forged for a different invoice.
    expect(hex(deriveBuyerCommitment(BUYER_SECRET, NULLIFIER))).not.toBe(
      hex(deriveBuyerCommitment(BUYER_SECRET, OTHER_NULLIFIER)),
    );

    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, buyerSecret: BUYER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER, 650n, AMOUNT);
    sim.registerInvoice(OTHER_NULLIFIER, 650n, AMOUNT);
    sim.switchIdentity({ buyerSecret: BUYER_SECRET });
    sim.confirmInvoice(NULLIFIER, AMOUNT);

    expect(sim.getLedger().invoices.lookup(NULLIFIER).buyerVerified).toBe(true);
    expect(sim.getLedger().invoices.lookup(OTHER_NULLIFIER).buyerVerified).toBe(false);
  });

  it('keeps the buyer-verification flag through settlement', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, buyerSecret: BUYER_SECRET, lenderSecret: LENDER_SECRET }),
    );
    registerAndConfirm(sim);
    sim.switchIdentity({ lenderSecret: LENDER_SECRET });
    sim.submitBid(NULLIFIER, deriveBidCommitment(LENDER_SECRET, NULLIFIER, 100n, DUE, RATE));
    sim.revealBid(NULLIFIER, 100n, DUE, RATE);
    sim.settleInvoice(NULLIFIER, 100n, DUE);

    const invoice = sim.getLedger().invoices.lookup(NULLIFIER);
    expect(invoice.buyerVerified).toBe(true);
    expect(invoice.invoiceAmount).toBe(AMOUNT);
    expect(hex(invoice.buyerCommitment)).toBe(hex(deriveBuyerCommitment(BUYER_SECRET, NULLIFIER)));
  });

  it('never discloses buyer identity, other relationships, or terms in serialized public output', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, buyerSecret: BUYER_SECRET }),
    );
    registerAndConfirm(sim);

    // Serialize every public value exactly as a ledger observer/indexer would.
    const serialized = JSON.stringify({
      invoiceCount: sim.getLedger().invoiceCount.toString(),
      invoices: Array.from(sim.getLedger().invoices, ([nullifier, invoice]) => ({
        nullifier: hex(nullifier),
        smeCommitment: hex(invoice.smeCommitment),
        creditThreshold: invoice.creditThreshold.toString(),
        invoiceAmount: invoice.invoiceAmount.toString(),
        buyerVerified: invoice.buyerVerified,
        buyerCommitment: hex(invoice.buyerCommitment),
        lender: invoice.lender.is_some ? hex(invoice.lender.value) : null,
        amount: invoice.amount.toString(),
        dueDate: invoice.dueDate.toString(),
        rateBps: invoice.rateBps.toString(),
      })),
    });

    // The public view carries only the boolean flag and the opaque per-invoice
    // commitment — never the buyer's identity or any other supplier data.
    expect(serialized).toContain('"buyerVerified":true');
    expect(serialized).toContain('"invoiceAmount":"1000"');
    expect(serialized).toContain(`"buyerCommitment":"${hex(deriveBuyerCommitment(BUYER_SECRET, NULLIFIER))}"`);
    expect(serialized).not.toContain(hex(BUYER_SECRET));
    expect(serialized).not.toContain(hex(OTHER_BUYER));
    expect(serialized).not.toContain(hex(derivePseudonym(BUYER_SECRET)));
  });

  it('an unverified invoice is correctly reported as unverified', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, buyerSecret: BUYER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER, 650n, AMOUNT);

    const invoice = sim.getLedger().invoices.lookup(NULLIFIER);
    expect(invoice.buyerVerified).toBe(false);
    expect(hex(invoice.buyerCommitment)).not.toBe(hex(deriveBuyerCommitment(BUYER_SECRET, NULLIFIER)));
  });
});
