import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';

import {
  ShieldLedgerSimulator,
  derivePseudonym,
  deriveBidKey,
  deriveBidCommitment,
  derivePoolSlotKey,
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
const LENDER_A = bytes32(10);
const LENDER_B = bytes32(11);
const LENDER_C = bytes32(12);
const LENDER_D = bytes32(13);
const NULLIFIER = bytes32(7);
const DUE = 1_700_000_000n;

const LENDER = (secret: Uint8Array) => derivePseudonym(secret);

/** Pool bid commitment: lender seals their pseudonym+nullifier+commitment. */
const POOL_SEAL = (secret: Uint8Array, commitment: Uint8Array) =>
  deriveBidCommitment(secret, NULLIFIER, 0n, 0n, 0n, false);

describe('Pool financing — registration', () => {
  it('registers a pool invoice with splitCount > 0', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_A }),
    );
    sim.registerInvoice(NULLIFIER, 650n, 10_000n, 0n, 4n);

    const lg = sim.getLedger();
    const invoice = lg.invoices.lookup(NULLIFIER);
    expect(invoice.splitCount).toBe(4n);
  });

  it('registers a single-lender invoice with splitCount = 0 (default)', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_A }),
    );
    sim.registerInvoice(NULLIFIER);

    const lg = sim.getLedger();
    const invoice = lg.invoices.lookup(NULLIFIER);
    expect(invoice.splitCount).toBe(0n);
  });

  it('rejects splitCount > 4', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_A }),
    );
    expect(() => sim.registerInvoice(NULLIFIER, 650n, 10_000n, 0n, 5n)).toThrow();
  });
});

describe('Pool financing — poolSlotKey derivation', () => {
  it('derives deterministic keys per nullifier+slot', () => {
    const key0 = derivePoolSlotKey(NULLIFIER, 0n);
    const key1 = derivePoolSlotKey(NULLIFIER, 1n);
    const key2 = derivePoolSlotKey(NULLIFIER, 2n);
    const key3 = derivePoolSlotKey(NULLIFIER, 3n);
    // All four keys are distinct
    expect(hex(key0)).not.toBe(hex(key1));
    expect(hex(key1)).not.toBe(hex(key2));
    expect(hex(key2)).not.toBe(hex(key3));
    expect(hex(key0)).not.toBe(hex(key3));
    // Deterministic
    expect(hex(derivePoolSlotKey(NULLIFIER, 0n))).toBe(hex(key0));
  });

  it('different nullifiers produce different keys for the same slot', () => {
    const otherNullifier = bytes32(8);
    const keyA = derivePoolSlotKey(NULLIFIER, 0n);
    const keyB = derivePoolSlotKey(otherNullifier, 0n);
    expect(hex(keyA)).not.toBe(hex(keyB));
  });
});

describe('Pool financing — revealPoolBid', () => {
  function setupPoolInvoice(splitCount: bigint = 4n) {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_A }),
    );
    sim.registerInvoice(NULLIFIER, 650n, 10_000n, 0n, splitCount);
    return sim;
  }

  function submitPoolBid(sim: ShieldLedgerSimulator, secret: Uint8Array) {
    const commitment = bytes32(secret[31]); // arbitrary deterministic commitment
    sim.switchIdentity({ lenderSecret: secret });
    const bidKey = deriveBidKey(NULLIFIER, LENDER(secret));
    sim.submitBid(NULLIFIER, commitment);
    return { commitment, bidKey };
  }

  it('reveals a pool bid into slot 0', () => {
    const sim = setupPoolInvoice();
    const { commitment } = submitPoolBid(sim, LENDER_A);

    sim.revealPoolBid(NULLIFIER, 0n, commitment);

    const lg = sim.getLedger();
    const slotKey = derivePoolSlotKey(NULLIFIER, 0n);
    expect(lg.bestPools.member(slotKey)).toBe(true);
    const bid = lg.bestPools.lookup(slotKey);
    expect(hex(bid.lender)).toBe(hex(LENDER(LENDER_A)));
    expect(hex(bid.commitment)).toBe(hex(commitment));
  });

  it('fills all four pool slots', () => {
    const sim = setupPoolInvoice();
    const secrets = [LENDER_A, LENDER_B, LENDER_C, LENDER_D];
    const commitments: Uint8Array[] = [];

    for (let i = 0; i < 4; i++) {
      const { commitment } = submitPoolBid(sim, secrets[i]);
      commitments.push(commitment);
      sim.revealPoolBid(NULLIFIER, BigInt(i), commitment);
    }

    const lg = sim.getLedger();
    for (let i = 0; i < 4; i++) {
      const slotKey = derivePoolSlotKey(NULLIFIER, BigInt(i));
      expect(lg.bestPools.member(slotKey)).toBe(true);
      const bid = lg.bestPools.lookup(slotKey);
      expect(hex(bid.lender)).toBe(hex(LENDER(secrets[i])));
    }
  });

  it('rejects pool reveal into an already-filled slot', () => {
    const sim = setupPoolInvoice();
    const { commitment } = submitPoolBid(sim, LENDER_A);
    sim.revealPoolBid(NULLIFIER, 0n, commitment);

    // Second lender tries to fill the same slot
    const { commitment: c2 } = submitPoolBid(sim, LENDER_B);
    expect(() => sim.revealPoolBid(NULLIFIER, 0n, c2)).toThrow(/slot already filled/);
  });

  it('rejects pool reveal with invalid slot index (>= 4)', () => {
    const sim = setupPoolInvoice();
    const { commitment } = submitPoolBid(sim, LENDER_A);
    expect(() => sim.revealPoolBid(NULLIFIER, 4n, commitment)).toThrow(/invalid slot index/);
    expect(() => sim.revealPoolBid(NULLIFIER, 10n, commitment)).toThrow(/invalid slot index/);
  });

  it('rejects pool reveal on a single-lender invoice (splitCount = 0)', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_A }),
    );
    sim.registerInvoice(NULLIFIER); // splitCount defaults to 0

    const commitment = bytes32(42);
    sim.switchIdentity({ lenderSecret: LENDER_A });
    sim.submitBid(NULLIFIER, commitment);
    expect(() => sim.revealPoolBid(NULLIFIER, 0n, commitment)).toThrow(/not a pool invoice/);
  });

  it('rejects pool reveal on unknown invoice', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_A }),
    );
    const commitment = bytes32(42);
    expect(() => sim.revealPoolBid(NULLIFIER, 0n, commitment)).toThrow(/unknown invoice/);
  });

  it('rejects pool reveal without a matching sealed bid', () => {
    const sim = setupPoolInvoice();
    // Lender A never submitted a bid
    sim.switchIdentity({ lenderSecret: LENDER_A });
    const commitment = bytes32(42);
    expect(() => sim.revealPoolBid(NULLIFIER, 0n, commitment)).toThrow(/no sealed bid/);
  });

  it('rejects pool reveal with commitment mismatch', () => {
    const sim = setupPoolInvoice();
    submitPoolBid(sim, LENDER_A);
    // Wrong commitment passed to reveal
    const wrongCommitment = bytes32(99);
    expect(() => sim.revealPoolBid(NULLIFIER, 0n, wrongCommitment)).toThrow(/commitment mismatch/);
  });

  it('rejects pool reveal from a lender below credit threshold', () => {
    // Create sim with creditworthy lender (750 >= 700 submitBid threshold).
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({
        smeSecret: SME_SECRET,
        lenderSecret: LENDER_A,
        lenderCreditScore: 750n,
      }),
    );
    sim.registerInvoice(NULLIFIER, 650n, 10_000n, 0n, 4n);

    // submitBid succeeds (credit 750 >= 700).
    const commitment = bytes32(42);
    sim.switchIdentity({ lenderSecret: LENDER_A });
    sim.submitBid(NULLIFIER, commitment);

    // Now drop credit below 700 for the reveal — same lender, lower score.
    sim.switchIdentity({ lenderSecret: LENDER_A, lenderCreditScore: 699n });
    expect(() => sim.revealPoolBid(NULLIFIER, 0n, commitment)).toThrow(/not creditworthy/);
  });
});

describe('Pool financing — invoice count', () => {
  it('increments invoiceCount for each pool reveal', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_A }),
    );
    sim.registerInvoice(NULLIFIER, 650n, 10_000n, 0n, 4n);
    const commitment = bytes32(42);
    sim.switchIdentity({ lenderSecret: LENDER_A });
    sim.submitBid(NULLIFIER, commitment);
    // Count is now 2: registerInvoice (1) + submitBid (1).
    const afterSubmit = sim.getLedger();
    const countAfterSubmit = afterSubmit.invoiceCount;

    sim.revealPoolBid(NULLIFIER, 0n, commitment);

    const afterReveal = sim.getLedger();
    // revealPoolBid increments by 1.
    expect(afterReveal.invoiceCount).toBe(countAfterSubmit + 1n);
  });
});

describe('Pool financing — independence from single-lender bids', () => {
  it('pool reveal does not affect bestBids map', () => {
    const sim = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_A }),
    );
    sim.registerInvoice(NULLIFIER, 650n, 10_000n, 0n, 4n);

    // Submit + reveal into pool
    const commitment = bytes32(42);
    sim.switchIdentity({ lenderSecret: LENDER_A });
    sim.submitBid(NULLIFIER, commitment);
    sim.revealPoolBid(NULLIFIER, 0n, commitment);

    const lg = sim.getLedger();
    // bestBids should still be empty (pool uses bestPools, not bestBids)
    expect(lg.bestBids.isEmpty()).toBe(true);
    // bestPools should have the entry
    expect(lg.bestPools.member(derivePoolSlotKey(NULLIFIER, 0n))).toBe(true);
  });
});
