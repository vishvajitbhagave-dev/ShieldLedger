import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';

import {
  ShieldLedgerSimulator,
  deriveBidCommitment,
  deriveClaimCommitment,
  derivePseudonym,
  deriveSecondaryPayee,
} from './shield-ledger-simulator.js';
import { createShieldLedgerPrivateState } from '../src/witnesses.js';

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
const WINNER_SECRET = bytes32(2); // the original winning lender
const INVESTOR_B = bytes32(3); // first secondary-market buyer
const INVESTOR_C = bytes32(4); // second secondary-market buyer
const OUTSIDER = bytes32(9); // never involved
const NULLIFIER = bytes32(7);
const DUE = 1_700_000_000n;

/** Full lifecycle up to a resolved auction won by WINNER_SECRET. */
function resolvedAuction(): ShieldLedgerSimulator {
  const sim = new ShieldLedgerSimulator(
    createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: WINNER_SECRET }),
  );
  sim.registerInvoice(NULLIFIER, 650n, 100n);
  bidAndReveal(sim, WINNER_SECRET);
  return sim;
}

function bidSeal(secret: Uint8Array): Uint8Array {
  return deriveBidCommitment(secret, NULLIFIER, 100n, DUE, 400n);
}

/** Seal + reveal a winning bid as `secret` on the current invoice. */
function bidAndReveal(sim: ShieldLedgerSimulator, secret: Uint8Array): void {
  sim.switchIdentity({ lenderSecret: secret });
  sim.submitBid(NULLIFIER, bidSeal(secret));
  sim.revealBid(NULLIFIER, 100n, DUE, 400n);
}

/** The current authorized party hands the claim to `newSecret`. */
function transferTo(sim: ShieldLedgerSimulator, newSecret: Uint8Array): void {
  sim.transferClaim(NULLIFIER, deriveClaimCommitment(newSecret, NULLIFIER));
}

describe('Secondary market — claim transfer basics', () => {
  it('the winning lender can transfer their claim to a new investor', () => {
    const sim = resolvedAuction();
    transferTo(sim, INVESTOR_B);

    const invoice = sim.getLedger().invoices.lookup(NULLIFIER);
    expect(invoice.transferred).toBe(true);
    expect(hex(invoice.claimCommitment)).toBe(hex(deriveClaimCommitment(INVESTOR_B, NULLIFIER)));
    expect(invoice.lender.is_some).toBe(false); // not settled yet
  });

  it('a non-winner cannot perform the first transfer', () => {
    const sim = resolvedAuction();
    sim.switchIdentity({ lenderSecret: OUTSIDER });
    expect(() => transferTo(sim, INVESTOR_B)).toThrow(/not the claim holder/);
    expect(sim.getLedger().invoices.lookup(NULLIFIER).transferred).toBe(false);
  });

  it('after a transfer only the CURRENT holder can re-transfer', () => {
    const sim = resolvedAuction();
    transferTo(sim, INVESTOR_B); // winner -> B

    // The original winner tries again — their authorization is spent.
    sim.switchIdentity({ lenderSecret: WINNER_SECRET });
    expect(() => transferTo(sim, INVESTOR_C)).toThrow(/not the claim holder/);

    // An unrelated party also fails.
    sim.switchIdentity({ claimSecret: OUTSIDER });
    expect(() => transferTo(sim, INVESTOR_C)).toThrow(/not the claim holder/);

    // The current holder (B) succeeds.
    sim.switchIdentity({ claimSecret: INVESTOR_B });
    transferTo(sim, INVESTOR_C);
    expect(hex(sim.getLedger().invoices.lookup(NULLIFIER).claimCommitment)).toBe(
      hex(deriveClaimCommitment(INVESTOR_C, NULLIFIER)),
    );
  });

  it('transfers are bound to one invoice — no replay onto another invoice', () => {
    const sim = resolvedAuction();
    const otherNullifier = bytes32(8);
    sim.registerInvoice(otherNullifier, 650n, 50n);

    // B's claim on NULLIFIER does not authorize transferring OTHER's claim.
    sim.switchIdentity({ claimSecret: INVESTOR_B });
    expect(() => sim.transferClaim(otherNullifier, deriveClaimCommitment(INVESTOR_C, otherNullifier))).toThrow(
      /auction not resolved/,
    );

    // A claim only becomes provable with a commitment derived from THIS
    // invoice's nullifier: writing a cross-invoice commitment leaves the
    // claim unprovable for everyone (no one can satisfy H(secret, NULLIFIER)).
    transferTo(sim, INVESTOR_B); // NULLIFIER now held by B
    sim.switchIdentity({ claimSecret: INVESTOR_B });
    sim.transferClaim(NULLIFIER, deriveClaimCommitment(INVESTOR_C, otherNullifier)); // wrong-nullifier commitment
    sim.switchIdentity({ claimSecret: INVESTOR_C });
    expect(sim.holdsClaim(NULLIFIER)).toBe(false); // H(C, other) != H(C, NULLIFIER)
  });

  it('rejects transfers before the auction resolves or after settlement', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: WINNER_SECRET }),
    );
    sim.registerInvoice(NULLIFIER);
    sim.switchIdentity({ lenderSecret: WINNER_SECRET });
    sim.submitBid(NULLIFIER, bidSeal(WINNER_SECRET)); // sealed only — auction NOT resolved yet

    // Auction still open.
    expect(() => transferTo(sim, INVESTOR_B)).toThrow(/auction not resolved/);

    sim.revealBid(NULLIFIER, 100n, DUE, 400n);
    sim.settleInvoice(NULLIFIER, 100n, DUE);
    expect(() => transferTo(sim, INVESTOR_B)).toThrow(/already settled/);
  });

  it('local holder-only check resolves ownership without any disclosure', () => {
    const sim = resolvedAuction();
    transferTo(sim, INVESTOR_B);

    sim.switchIdentity({ claimSecret: INVESTOR_B });
    expect(sim.holdsClaim(NULLIFIER)).toBe(true);
    sim.switchIdentity({ claimSecret: INVESTOR_C });
    expect(sim.holdsClaim(NULLIFIER)).toBe(false);
    sim.switchIdentity({ claimSecret: WINNER_SECRET });
    expect(sim.holdsClaim(NULLIFIER)).toBe(false); // former owner lost it
  });
});

describe('Secondary market — multiple sequential transfers', () => {
  it('resolves to the LATEST owner across winner → B → C → D chains', () => {
    const investorD = bytes32(5);
    const sim = resolvedAuction();
    transferTo(sim, INVESTOR_B);
    sim.switchIdentity({ claimSecret: INVESTOR_B });
    transferTo(sim, INVESTOR_C);
    sim.switchIdentity({ claimSecret: INVESTOR_C });
    transferTo(sim, investorD);

    const invoice = sim.getLedger().invoices.lookup(NULLIFIER);
    expect(invoice.transferred).toBe(true);
    expect(hex(invoice.claimCommitment)).toBe(hex(deriveClaimCommitment(investorD, NULLIFIER)));

    // Only the latest holder verifies locally.
    sim.switchIdentity({ claimSecret: investorD });
    expect(sim.holdsClaim(NULLIFIER)).toBe(true);
    sim.switchIdentity({ claimSecret: INVESTOR_B });
    expect(sim.holdsClaim(NULLIFIER)).toBe(false);
    sim.switchIdentity({ claimSecret: INVESTOR_C });
    expect(sim.holdsClaim(NULLIFIER)).toBe(false);
    // ...and only they can transfer onward.
    sim.switchIdentity({ claimSecret: INVESTOR_B });
    expect(() => transferTo(sim, OUTSIDER)).toThrow(/not the claim holder/);
  });
});

describe('Secondary market — settlement respects current ownership', () => {
  it('an untransferred invoice settles to the winning lender pseudonym as before', () => {
    const sim = resolvedAuction();
    sim.settleInvoice(NULLIFIER, 100n, DUE);

    const invoice = sim.getLedger().invoices.lookup(NULLIFIER);
    expect(hex(invoice.lender.value)).toBe(hex(derivePseudonym(WINNER_SECRET)));
    expect(invoice.transferred).toBe(false);
  });

  it('a transferred invoice settles to the opaque secondary marker — payout follows the current holder', () => {
    const sim = resolvedAuction();
    transferTo(sim, INVESTOR_B);
    sim.settleInvoice(NULLIFIER, 100n, DUE);

    const invoice = sim.getLedger().invoices.lookup(NULLIFIER);
    // Public receipt names NO ONE: the marker equals deriveSecondaryPayee()
    // and differs from every participant pseudonym.
    expect(invoice.lender.is_some).toBe(true);
    expect(hex(invoice.lender.value)).toBe(hex(deriveSecondaryPayee()));
    expect(hex(invoice.lender.value)).not.toBe(hex(derivePseudonym(WINNER_SECRET)));
    expect(hex(invoice.lender.value)).not.toBe(hex(derivePseudonym(INVESTOR_B)));
    // Ownership state survives settlement so the current holder can prove
    // their right to the payout in ZK.
    expect(invoice.transferred).toBe(true);
    expect(hex(invoice.claimCommitment)).toBe(hex(deriveClaimCommitment(INVESTOR_B, NULLIFIER)));
    sim.switchIdentity({ claimSecret: INVESTOR_B });
    expect(sim.holdsClaim(NULLIFIER)).toBe(true);
  });
});

describe('Secondary market — privacy of the transfer', () => {
  it('no party identity appears in any serialized public output', () => {
    const investorD = bytes32(5);
    const sim = resolvedAuction();
    transferTo(sim, INVESTOR_B);
    sim.switchIdentity({ claimSecret: INVESTOR_B });
    transferTo(sim, INVESTOR_C);
    sim.switchIdentity({ claimSecret: INVESTOR_C });
    transferTo(sim, investorD);
    sim.settleInvoice(NULLIFIER, 100n, DUE);

    // Serialize EVERY public value exactly as an observer/indexer would.
    const lg = sim.getLedger();
    const serialized = JSON.stringify({
      invoices: Array.from(lg.invoices, ([nf, inv]) => ({
        nullifier: hex(nf),
        smeCommitment: hex(inv.smeCommitment),
        creditThreshold: inv.creditThreshold.toString(),
        reputationThreshold: inv.reputationThreshold.toString(),
        invoiceAmount: inv.invoiceAmount.toString(),
        buyerVerified: inv.buyerVerified,
        buyerCommitment: hex(inv.buyerCommitment),
        lender: inv.lender.is_some ? hex(inv.lender.value) : null,
        amount: inv.amount.toString(),
        dueDate: inv.dueDate.toString(),
        rateBps: inv.rateBps.toString(),
        claimCommitment: hex(inv.claimCommitment),
        transferred: inv.transferred,
      })),
      bids: Array.from(lg.bids, ([key, bid]) => ({
        key: hex(key),
        nullifier: hex(bid.nullifier),
        lender: hex(bid.lender),
        commitment: hex(bid.commitment),
      })),
      bestBids: Array.from(lg.bestBids, ([nf, best]) => ({
        nullifier: hex(nf),
        lender: hex(best.lender),
        amount: best.amount.toString(),
      })),
    });

    // Secrets of every transfer participant…
    for (const secret of [WINNER_SECRET, INVESTOR_B, INVESTOR_C, investorD]) {
      expect(serialized).not.toContain(hex(secret));
    }
    // …and the pseudonyms of investors who NEVER bid publicly (B, C, D).
    for (const investor of [INVESTOR_B, INVESTOR_C, investorD]) {
      expect(serialized).not.toContain(hex(derivePseudonym(investor)));
    }
    // The public trace shows only that the claim moved and where it settled.
    expect(serialized).toContain('"transferred":true');
    expect(serialized).toContain(hex(deriveSecondaryPayee()));
    // The commitments are real bindings, not raw secrets.
    expect(serialized).toContain(hex(deriveClaimCommitment(investorD, NULLIFIER)));
  });
});

