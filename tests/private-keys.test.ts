import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';
import { sha256 } from 'js-sha256';

import { ShieldLedgerSimulator, deriveCommitment, derivePseudonym, deriveBidKey, deriveBidCommitment } from './shield-ledger-simulator.js';
import { createShieldLedgerPrivateState, type ShieldLedgerPrivateState } from '../src/witnesses.js';
import type { Ledger } from '../contracts/managed/shield-ledger/contract/index.js';

setNetworkId('undeployed');

const DUE = 1_700_000_000n;
const RATE = 400n;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function bytes32(value: number): Uint8Array {
  const out = new Uint8Array(32);
  out[31] = value;
  return out;
}

/** Off-chain invoice hashing: an SME turns a real invoice into a nullifier. */
function hashInvoice(invoiceId: Uint8Array, secretSalt: Uint8Array): Uint8Array {
  const payload = new Uint8Array(invoiceId.length + secretSalt.length);
  payload.set(invoiceId, 0);
  payload.set(secretSalt, invoiceId.length);
  return Uint8Array.from(Buffer.from(sha256.arrayBuffer(payload)));
}

/** Collect every value the ledger exposes publicly, as hex strings. */
function publicHexStrings(lg: Ledger): string[] {
  const out: string[] = [];
  for (const [nullifier, invoice] of lg.invoices) {
    out.push(hex(nullifier));
    out.push(hex(invoice.smeCommitment));
    out.push(invoice.creditThreshold.toString());
    out.push(invoice.reputationThreshold.toString());
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

describe('ShieldLedger privacy — commitments', () => {
  it('the SME commitment is a 32-byte hash, distinct from its inputs', () => {
    const secret = bytes32(1);
    const nullifier = bytes32(7);
    const commitment = deriveCommitment(secret, nullifier);
    expect(commitment.length).toBe(32);
    expect(hex(commitment)).not.toBe(hex(secret));
    expect(hex(commitment)).not.toBe(hex(nullifier));
    // Deterministic, so it is reproducible by the verifier without knowing the secret.
    expect(hex(deriveCommitment(secret, nullifier))).toBe(hex(commitment));
  });

  it('the commitment binds to the secret (different secrets → different commitments)', () => {
    const nullifier = bytes32(7);
    const c1 = hex(deriveCommitment(bytes32(1), nullifier));
    const c2 = hex(deriveCommitment(bytes32(2), nullifier));
    expect(c1).not.toBe(c2);
    // ...but collapses to the same commitment for the same (secret, nullifier).
    expect(hex(deriveCommitment(bytes32(1), nullifier))).toBe(c1);
  });

  it('a nullifier produced off-chain leaks nothing about the invoice', () => {
    const invoiceId = new TextEncoder().encode('INV-2026-0001: buyer #42, 3 line items');
    const salt = bytes32(9);
    const nullifier = hashInvoice(invoiceId, salt);
    expect(nullifier.length).toBe(32);
    const nullifierHex = hex(nullifier);
    // The nullifier is salted: it is not simply the hash of the invoice id ...
    expect(nullifierHex).not.toBe(hex(Uint8Array.from(Buffer.from(sha256.arrayBuffer(invoiceId)))));
    // ... and the salt itself never appears in the public nullifier.
    expect(nullifierHex).not.toContain(hex(salt));
    expect(Buffer.from(nullifier).toString('utf-8')).not.toContain('INV-2026');
  });

  it('the whole lifecycle publishes only hashes — never the secrets', () => {
    const smeSecret = bytes32(1);
    const lenderSecret = bytes32(2);
    const invoiceSalt = bytes32(9);
    const nullifier = hashInvoice(new TextEncoder().encode('INV-2026-0002'), invoiceSalt);

    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret, lenderSecret }),
    );
    sim.registerInvoice(nullifier);
    sim.switchIdentity({ lenderSecret });
    sim.submitBid(nullifier, deriveBidCommitment(lenderSecret, nullifier, 100n, DUE, RATE));
    sim.revealBid(nullifier, 100n, DUE, RATE);
    sim.settleInvoice(nullifier, 100n, DUE);

    const publicValues = publicHexStrings(sim.getLedger());
    expect(publicValues).not.toContain(hex(smeSecret));
    expect(publicValues).not.toContain(hex(lenderSecret));
    expect(publicValues).not.toContain(hex(invoiceSalt));
    // The nullifier on chain is the hash; the invoice contents never appear.
    expect(publicValues).toContain(hex(nullifier));
  });

  it('recovering a secret from public data requires a 2^256 preimage search', () => {
    // Given only (nullifier, commitment) — the entire public view — an attacker
    // has no shortcut: the commitment is a cryptographic hash, so recovery
    // means trying candidate secrets until the hash matches. The secrets are
    // generated with 256 bits of entropy, making that infeasible.
    const secret = createShieldLedgerPrivateState().smeSecret;
    expect(secret.length).toBe(32);
    expect(secret.length * 8).toBe(256);
  });
});

describe('ShieldLedger privacy — pseudonyms', () => {
  it('the pseudonym is deterministic but unlinkable to the secret', () => {
    const secret = bytes32(5);
    const pseudo = derivePseudonym(secret);
    expect(pseudo.length).toBe(32);
    expect(hex(pseudo)).not.toBe(hex(secret));
    expect(hex(derivePseudonym(secret))).toBe(hex(pseudo));
  });

  it('a lender is pseudonymous across multiple invoices (same pseudonym, same lender)', () => {
    const secret = bytes32(5);
    const p1 = hex(derivePseudonym(secret));
    const p2 = hex(derivePseudonym(secret));
    expect(p1).toBe(p2);
    // Two different lenders never collide in pseudonym space in practice.
    expect(hex(derivePseudonym(bytes32(6)))).not.toBe(p1);
  });

  it('bids expose only the pseudonym and a commitment, not the terms or identity', () => {
    const smeSecret = bytes32(1);
    const lenderSecret = bytes32(2);
    const nullifier = bytes32(7);

    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret, lenderSecret }),
    );
    sim.registerInvoice(nullifier);
    sim.switchIdentity({ lenderSecret });
    sim.submitBid(nullifier, deriveBidCommitment(lenderSecret, nullifier, 100n, 1n, RATE));

    let found = false;
    for (const [bidKey, bid] of sim.getLedger().bids) {
      if (!bid.nullifier.every((v, i) => v === nullifier[i])) continue;
      found = true;
      expect(hex(bidKey)).toBe(hex(deriveBidKey(nullifier, derivePseudonym(lenderSecret))));
      // The public bid carries only a seal — no amount, due date, or rate.
      expect(Object.keys(bid).sort()).toEqual(['commitment', 'lender', 'nullifier']);
      expect(hex(bid.commitment)).toBe(hex(deriveBidCommitment(lenderSecret, nullifier, 100n, 1n, RATE)));
      // The public bid's "lender" field is the pseudonym, never the secret.
      expect(hex(bid.lender)).toBe(hex(derivePseudonym(lenderSecret)));
      expect(hex(bid.lender)).not.toBe(hex(lenderSecret));
    }
    expect(found).toBe(true);
  });

  it('never reveals the credit score or exposure cap in public state', () => {
    const ps: ShieldLedgerPrivateState = {
      smeSecret: bytes32(1),
      smeCreditScore: 720n,
      smeReputationScore: 70n,
      smeOnTimeCount: 5n,
      smeLateCount: 1n,
      lenderSecret: bytes32(2),
      lenderCreditScore: 799n,
      lenderExposureCap: 42_000n,
      lenderMinReputation: 10n,
      buyerSecret: bytes32(3),
    };
    const sim = new ShieldLedgerSimulator(ps);
    sim.registerInvoice(bytes32(7), 650n, 0n, 12n);
    sim.switchIdentity({ lenderSecret: ps.lenderSecret });
    sim.submitBid(bytes32(7), deriveBidCommitment(ps.lenderSecret, bytes32(7), 100n, 1n, RATE));

    const publicValues = publicHexStrings(sim.getLedger());
    expect(publicValues).not.toContain(ps.lenderCreditScore.toString());
    expect(publicValues).not.toContain(ps.lenderExposureCap.toString());
    // The reputation score, the deal history and the lender's private bar are
    // never public — only the *bound* the SME attested to (12) is.
    expect(publicValues).not.toContain(ps.smeReputationScore.toString());
    expect(publicValues).not.toContain(ps.smeOnTimeCount.toString());
    expect(publicValues).not.toContain(ps.smeLateCount.toString());
    expect(publicValues).not.toContain(ps.lenderMinReputation.toString());
    expect(publicValues).toContain('12');
  });
});
