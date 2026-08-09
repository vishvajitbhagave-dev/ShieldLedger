import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';

import { ShieldLedgerSimulator, deriveCommitment, derivePseudonym, deriveBidKey } from './shield-ledger-simulator.js';
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
const NULLIFIER = bytes32(7);
const LENDER = (secret: Uint8Array) => derivePseudonym(secret);

describe('ShieldLedger contract — lifecycle', () => {
  it('initializes an empty ledger deterministically', () => {
    const simA = new ShieldLedgerSimulator(createShieldLedgerPrivateState({ smeSecret: SME_SECRET }));
    const simB = new ShieldLedgerSimulator(createShieldLedgerPrivateState({ smeSecret: SME_SECRET }));
    // The ledger() proxies wrap per-instance VM state, so compare semantic
    // projections rather than the proxy objects themselves.
    const project = (lg: ReturnType<typeof simA.getLedger>) => ({
      invoiceCount: lg.invoiceCount,
      invoices: lg.invoices.size(),
      bids: lg.bids.size(),
    });
    expect(project(simA.getLedger())).toEqual(project(simB.getLedger()));
    const lg = simA.getLedger();
    expect(lg.invoices.isEmpty()).toBe(true);
    expect(lg.bids.isEmpty()).toBe(true);
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
    // The commitment is a hash of (secret, nullifier), never the secret itself.
    expect(hex(invoice.smeCommitment)).toBe(hex(deriveCommitment(SME_SECRET, NULLIFIER)));
    expect(hex(invoice.smeCommitment)).not.toBe(hex(SME_SECRET));
    expect(invoice.lender.is_some).toBe(false);
    expect(invoice.amount).toBe(0n);
    expect(invoice.dueDate).toBe(0n);
  });

  it('accepts a compliant lender bid and stores it under a pseudonym', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.submitBid(NULLIFIER, 100n, 1_700_000_000n);

    const lg = sim.getLedger();
    expect(lg.invoiceCount).toBe(2n);
    const bidKey = deriveBidKey(NULLIFIER, LENDER(LENDER_SECRET));
    expect(lg.bids.member(bidKey)).toBe(true);
    const bid = lg.bids.lookup(bidKey);
    expect(bid.nullifier).toEqual(NULLIFIER);
    expect(bid.amount).toBe(100n);
    expect(bid.dueDate).toBe(1_700_000_000n);
    // The lender's true identity is replaced by a pseudonym.
    expect(hex(bid.lender)).toBe(hex(LENDER(LENDER_SECRET)));
    expect(hex(bid.lender)).not.toBe(hex(LENDER_SECRET));
  });

  it('settles the invoice to the winning lender', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.submitBid(NULLIFIER, 100n, 1_700_000_000n);
    sim.settleInvoice(NULLIFIER, LENDER(LENDER_SECRET), 100n, 1_700_000_000n);

    const lg = sim.getLedger();
    expect(lg.invoiceCount).toBe(3n);
    const invoice = lg.invoices.lookup(NULLIFIER);
    expect(invoice.lender.is_some).toBe(true);
    expect(hex(invoice.lender.value)).toBe(hex(LENDER(LENDER_SECRET)));
    expect(invoice.amount).toBe(100n);
    expect(invoice.dueDate).toBe(1_700_000_000n);
    // SME commitment is preserved across settlement.
    expect(hex(invoice.smeCommitment)).toBe(hex(deriveCommitment(SME_SECRET, NULLIFIER)));
  });

  it('allows a smaller financed amount than the winning bid', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.submitBid(NULLIFIER, 100n, 1_700_000_000n);
    sim.settleInvoice(NULLIFIER, LENDER(LENDER_SECRET), 75n, 1_700_000_000n);

    const invoice = sim.getLedger().invoices.lookup(NULLIFIER);
    expect(invoice.lender.is_some).toBe(true);
    expect(invoice.amount).toBe(75n);
  });
});

describe('ShieldLedger contract — access control', () => {
  it('rejects registering the same invoice twice', () => {
    const sim = new ShieldLedgerSimulator(createShieldLedgerPrivateState({ smeSecret: SME_SECRET }));
    sim.registerInvoice(NULLIFIER);
    expect(() => sim.registerInvoice(NULLIFIER)).toThrow(/invoice already registered/);
    expect(sim.getLedger().invoices.size()).toBe(1n);
    expect(sim.getLedger().invoiceCount).toBe(1n);
  });

  it('rejects bids on an unknown invoice', () => {
    const sim = new ShieldLedgerSimulator(createShieldLedgerPrivateState({ lenderSecret: LENDER_SECRET }));
    expect(() => sim.submitBid(NULLIFIER, 100n, 1n)).toThrow(/unknown invoice/);
  });

  it('rejects bids from lenders below the credit threshold without disclosing the score', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET, lenderCreditScore: 699n }),
    );
    sim.registerInvoice(NULLIFIER);
    expect(() => sim.submitBid(NULLIFIER, 100n, 1n)).toThrow(/not creditworthy/);
    expect(sim.getLedger().bids.isEmpty()).toBe(true);
  });

  it('accepts a score of exactly 700', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET, lenderCreditScore: 700n }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.submitBid(NULLIFIER, 100n, 1n);
    expect(sim.getLedger().bids.member(deriveBidKey(NULLIFIER, LENDER(LENDER_SECRET)))).toBe(true);
  });

  it('rejects bids that would exceed the private exposure cap', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET, lenderExposureCap: 500n }),
    );
    sim.registerInvoice(NULLIFIER);
    expect(() => sim.submitBid(NULLIFIER, 501n, 1n)).toThrow(/bid exceeds exposure cap/);
    expect(sim.getLedger().bids.isEmpty()).toBe(true);
  });

  it('rejects duplicate bids from the same lender', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.submitBid(NULLIFIER, 100n, 1n);
    expect(() => sim.submitBid(NULLIFIER, 200n, 1n)).toThrow(/already bid/);
  });

  it('lets multiple lenders bid on the same invoice', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.submitBid(NULLIFIER, 100n, 1n);

    const OTHER = bytes32(3);
    sim.switchIdentity({ lenderSecret: OTHER });
    sim.submitBid(NULLIFIER, 150n, 1n);

    const bids = sim.getLedger().bids;
    expect(bids.member(deriveBidKey(NULLIFIER, LENDER(LENDER_SECRET)))).toBe(true);
    expect(bids.member(deriveBidKey(NULLIFIER, LENDER(OTHER)))).toBe(true);
  });

  it('rejects settlement by anyone but the invoice owner', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.submitBid(NULLIFIER, 100n, 1n);

    sim.switchIdentity({ smeSecret: bytes32(99) }); // wrong SME
    expect(() => sim.settleInvoice(NULLIFIER, LENDER(LENDER_SECRET), 100n, 1n)).toThrow(/not the SME/);
    expect(sim.getLedger().invoices.lookup(NULLIFIER).lender.is_some).toBe(false);
  });

  it('rejects settlement referencing a lender that never bid', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    expect(() => sim.settleInvoice(NULLIFIER, LENDER(LENDER_SECRET), 100n, 1n)).toThrow(/no such bid/);
  });

  it('rejects settling for more than the winning bid', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.submitBid(NULLIFIER, 100n, 1n);
    expect(() => sim.settleInvoice(NULLIFIER, LENDER(LENDER_SECRET), 101n, 1n)).toThrow(/amount exceeds winning bid/);
    expect(sim.getLedger().invoices.lookup(NULLIFIER).lender.is_some).toBe(false);
  });

  it('rejects a second settlement of an already-financed invoice', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.submitBid(NULLIFIER, 100n, 1n);
    sim.settleInvoice(NULLIFIER, LENDER(LENDER_SECRET), 100n, 1n);
    expect(() => sim.settleInvoice(NULLIFIER, LENDER(LENDER_SECRET), 100n, 1n)).toThrow(/already financed/);
  });
});

describe('ShieldLedger contract — pseudonym unlinkability', () => {
  it('gives distinct pseudonyms to distinct lenders', () => {
    expect(hex(LENDER(bytes32(1)))).not.toBe(hex(LENDER(bytes32(2))));
  });

  it('never stores the raw lender secret anywhere public', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.submitBid(NULLIFIER, 100n, 1n);

    const publicValues: string[] = [];
    for (const [nullifier, invoice] of sim.getLedger().invoices) {
      publicValues.push(hex(nullifier), hex(invoice.smeCommitment));
      if (invoice.lender.is_some) publicValues.push(hex(invoice.lender.value));
      for (const [bidKey, bid] of sim.getLedger().bids) {
        publicValues.push(hex(bidKey), hex(bid.nullifier), hex(bid.lender));
      }
    }
    expect(publicValues).not.toContain(hex(LENDER_SECRET));
    expect(publicValues).not.toContain(hex(SME_SECRET));
  });
});
