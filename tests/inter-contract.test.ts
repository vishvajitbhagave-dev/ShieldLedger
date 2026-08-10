import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';

import {
  ShieldLedgerSimulator,
  deriveBidCommitment,
} from './shield-ledger-simulator.js';
import { createShieldLedgerPrivateState } from '../src/witnesses.js';
import { EscrowSimulator } from './escrow-simulator.js';
import { planEscrowCommands } from '../frontend/src/escrow-orchestrator';

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
const WIN_AMOUNT = 1000n;
const DUE = 1_700_000_000n;

describe('inter-contract communication — ShieldLedger → Escrow', () => {
  /**
   * The full financing lifecycle across two contracts. The communication
   * layer (planEscrowCommands) reads the ShieldLedger ledger and issues the
   * matching Escrow transactions — the on-chain cross-contract call the
   * current Compact compiler does not yet support.
   */
  it('settles on ShieldLedger, then releases the Escrow via the communication layer', () => {
    const shield = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    const escrow = new EscrowSimulator({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET });

    // 1. ShieldLedger auction: register, seal, reveal, settle.
    shield.registerInvoice(NULLIFIER);
    shield.switchIdentity({ lenderSecret: LENDER_SECRET });
    shield.submitBid(NULLIFIER, deriveBidCommitment(LENDER_SECRET, NULLIFIER, WIN_AMOUNT, DUE, 400n));
    shield.revealBid(NULLIFIER, WIN_AMOUNT, DUE, 400n);
    shield.switchIdentity({ smeSecret: SME_SECRET });
    shield.settleInvoice(NULLIFIER, WIN_AMOUNT, DUE);

    const shieldLedger = shield.getLedger();
    const settled = shieldLedger.invoices.lookup(NULLIFIER);
    expect(settled.lender.is_some).toBe(true);

    // 2. Communication layer: read ShieldLedger, produce cross-contract commands.
    const bestBids = new Map<string, bigint>();
    for (const [nullifier, best] of shieldLedger.bestBids) {
      bestBids.set(hex(nullifier), best.amount);
    }
    const settledSet = new Set<string>();
    for (const [nullifier, invoice] of shieldLedger.invoices) {
      if (invoice.lender.is_some) settledSet.add(hex(nullifier));
    }

    // The winning bid resolves first → the layer asks the lender to deposit
    // exactly the winning amount into escrow.
    const beforeDeposit = planEscrowCommands({
      bestBids,
      settled: settledSet,
      escrowed: new Set(),
      released: new Set(),
    });
    expect(beforeDeposit).toContainEqual({ kind: 'deposit', nullifier: hex(NULLIFIER), amount: WIN_AMOUNT.toString() });

    // 3. Lender deposits into the Escrow contract.
    escrow.switchIdentity({ lenderSecret: LENDER_SECRET });
    escrow.deposit(NULLIFIER, WIN_AMOUNT);
    const escrowedSet = new Set<string>();
    for (const [nullifier] of escrow.getLedger().escrows) {
      escrowedSet.add(hex(nullifier));
    }

    // Once the deposit is observed, the invoice is settled → the layer now
    // asks the SME to release the funds.
    const beforeRelease = planEscrowCommands({
      bestBids,
      settled: settledSet,
      escrowed: escrowedSet,
      released: new Set(),
    });
    expect(beforeRelease).toContainEqual({ kind: 'release', nullifier: hex(NULLIFIER) });

    // 4. SME releases the escrow.
    escrow.switchIdentity({ smeSecret: SME_SECRET });
    escrow.release(NULLIFIER);

    const escrowLedger = escrow.getLedger();
    const stored = escrowLedger.escrows.lookup(NULLIFIER);
    expect(stored.amount).toBe(WIN_AMOUNT);
    expect(stored.released).toBe(true);

    // 5. Idempotence: once the release is observed, the layer is quiet.
    const releasedSet = new Set<string>();
    for (const [nullifier, e] of escrow.getLedger().escrows) {
      if (e.released) releasedSet.add(hex(nullifier));
    }
    const done = planEscrowCommands({
      bestBids,
      settled: settledSet,
      escrowed: escrowedSet,
      released: releasedSet,
    });
    expect(done).toEqual([]);
  });

  it('carries ownership across the contract boundary via the shared commitment', () => {
    // Both contracts store smeCommitment = hash(smeSecret, nullifier). The
    // identical secret that settled the invoice is what unlocks the escrow —
    // nothing about the SME is disclosed on either chain.
    const shield = new ShieldLedgerSimulator(
      createShieldLedgerPrivateState({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET }),
    );
    const escrow = new EscrowSimulator({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET });

    shield.registerInvoice(NULLIFIER);
    shield.switchIdentity({ lenderSecret: LENDER_SECRET });
    shield.submitBid(NULLIFIER, deriveBidCommitment(LENDER_SECRET, NULLIFIER, WIN_AMOUNT, DUE, 400n));
    shield.revealBid(NULLIFIER, WIN_AMOUNT, DUE, 400n);
    escrow.switchIdentity({ lenderSecret: LENDER_SECRET });
    escrow.deposit(NULLIFIER, WIN_AMOUNT);

    const shieldCommitment = shield.getLedger().invoices.lookup(NULLIFIER).smeCommitment;
    const escrowCommitment = escrow.getLedger().escrows.lookup(NULLIFIER).smeCommitment;
    expect(hex(escrowCommitment)).toBe(hex(shieldCommitment));
  });
});

describe('Escrow contract — invariants', () => {
  it('rejects a second deposit for the same invoice', () => {
    const escrow = new EscrowSimulator({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET });
    escrow.deposit(NULLIFIER, WIN_AMOUNT);
    expect(() => escrow.deposit(NULLIFIER, WIN_AMOUNT)).toThrow(/escrow already exists/);
    expect(escrow.getLedger().escrows.size()).toBe(1n);
  });

  it('rejects a zero-amount deposit', () => {
    const escrow = new EscrowSimulator({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET });
    expect(() => escrow.deposit(NULLIFIER, 0n)).toThrow(/amount must be positive/);
    expect(escrow.getLedger().escrows.isEmpty()).toBe(true);
  });

  it('rejects a release by anyone other than the SME', () => {
    const escrow = new EscrowSimulator({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET });
    escrow.deposit(NULLIFIER, WIN_AMOUNT);
    escrow.switchIdentity({ smeSecret: bytes32(99) });
    expect(() => escrow.release(NULLIFIER)).toThrow(/not the SME/);
    expect(escrow.getLedger().escrows.lookup(NULLIFIER).released).toBe(false);
  });

  it('rejects releasing an escrow twice', () => {
    const escrow = new EscrowSimulator({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET });
    escrow.deposit(NULLIFIER, WIN_AMOUNT);
    escrow.release(NULLIFIER);
    expect(() => escrow.release(NULLIFIER)).toThrow(/already released/);
  });

  it('never stores the raw secrets anywhere public', () => {
    const escrow = new EscrowSimulator({ smeSecret: SME_SECRET, lenderSecret: LENDER_SECRET });
    escrow.deposit(NULLIFIER, WIN_AMOUNT);
    const publicValues: string[] = [];
    for (const [, e] of escrow.getLedger().escrows) {
      publicValues.push(hex(e.lender), hex(e.smeCommitment));
    }
    expect(publicValues).not.toContain(hex(SME_SECRET));
    expect(publicValues).not.toContain(hex(LENDER_SECRET));
  });
});

describe('communication layer — planEscrowCommands', () => {
  const noBids = new Map<string, bigint>();
  const empty = new Set<string>();

  it('emits nothing for an empty system', () => {
    expect(planEscrowCommands({ bestBids: noBids, settled: empty, escrowed: empty, released: empty })).toEqual([]);
  });

  it('deposits the winning amount when a best bid resolves but no escrow exists', () => {
    const commands = planEscrowCommands({
      bestBids: new Map([['n1', 500n]]),
      settled: empty,
      escrowed: empty,
      released: empty,
    });
    expect(commands).toEqual([{ kind: 'deposit', nullifier: 'n1', amount: '500' }]);
  });

  it('skips a deposit when an escrow (or a release) already exists for that invoice', () => {
    const commands = planEscrowCommands({
      bestBids: new Map([['n1', 500n], ['n2', 700n]]),
      settled: new Set(['n1']),
      escrowed: new Set(['n1']),
      released: new Set(['n2']),
    });
    // n1 is already escrowed → deposit skipped (release may still be due);
    // n2 is already released → deposit skipped.
    expect(commands).toEqual([{ kind: 'release', nullifier: 'n1' }]);
  });

  it('skips a deposit for a zero-amount best bid', () => {
    const commands = planEscrowCommands({
      bestBids: new Map([['n1', 0n]]),
      settled: empty,
      escrowed: empty,
      released: empty,
    });
    expect(commands).toEqual([]);
  });

  it('releases only escrowed invoices that are settled and not yet released', () => {
    const settled = new Set(['n1']);
    const commands = planEscrowCommands({
      bestBids: noBids,
      settled,
      escrowed: new Set(['n1']),
      released: empty,
    });
    expect(commands).toEqual([{ kind: 'release', nullifier: 'n1' }]);
  });

  it('keeps an escrowed-but-unsettled invoice locked', () => {
    const commands = planEscrowCommands({
      bestBids: noBids,
      settled: empty,
      escrowed: new Set(['n1']),
      released: empty,
    });
    expect(commands).toEqual([]);
  });

  it('does not re-issue a release once the release is observed', () => {
    const commands = planEscrowCommands({
      bestBids: noBids,
      settled: new Set(['n1']),
      escrowed: new Set(['n1']),
      released: new Set(['n1']),
    });
    expect(commands).toEqual([]);
  });
});
