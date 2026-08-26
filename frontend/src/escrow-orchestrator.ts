// Communication layer between the two contracts (see contracts/escrow.compact).
//
// The current Compact compiler does not yet implement on-chain cross-contract
// calls (the `contract` keyword is reserved for that), so ShieldLedger and
// Escrow are coordinated OFF-CHAIN: this module watches the ShieldLedger
// ledger, and turns settlement events into the corresponding Escrow
// transactions.
//
//   ShieldLedger ledger ──► planEscrowCommands() ──► Escrow transactions
//   (bestBids, invoices)      (pure, fully tested)    (deposit / release)
//
// Ownership still crosses the contract boundary securely: Escrow stores the
// same smeCommitment = hash(smeSecret, nullifier) that ShieldLedger stores,
// so only the wallet that can settle the invoice can release the escrow.
// See tests/inter-contract.test.ts for the end-to-end flow.

export type EscrowCommand =
  | { kind: 'deposit'; nullifier: string; amount: string }
  | { kind: 'release'; nullifier: string }
  | { kind: 'poolDeposit'; nullifier: string; lenderPseudonym: string }
  | { kind: 'poolRelease'; nullifier: string; lenderPseudonym: string };

export interface PoolSlotInfo {
  readonly lenderPseudonym: string;
}

export interface EscrowOrchestrationInput {
  /** Winning bids read from ShieldLedger's bestBids: nullifier -> amount. */
  readonly bestBids: ReadonlyMap<string, bigint>;
  /** Invoices already financed/settled on ShieldLedger (lender set). */
  readonly settled: ReadonlySet<string>;
  /** Nullifiers that already hold a LOCKED escrow on the Escrow contract. */
  readonly escrowed: ReadonlySet<string>;
  /** Nullifiers already released on the Escrow contract. */
  readonly released: ReadonlySet<string>;
  /** Pool settlement markers: nullifier -> "shieldledger:pool" for pool-settled invoices. */
  readonly poolSettled?: ReadonlyMap<string, string>;
  /** Pool lender slots: nullifier -> array of slot info (lender pseudonyms). */
  readonly poolSlots?: ReadonlyMap<string, PoolSlotInfo[]>;
  /** Nullifiers+lender pseudonyms that already hold a LOCKED pool escrow. */
  readonly poolEscrowed?: ReadonlySet<string>;
  /** Nullifiers+lender pseudonyms already released on the Escrow contract. */
  readonly poolReleased?: ReadonlySet<string>;
}

/**
 * Reads the state of both contracts and returns the next transactions to send
 * so the escrow mirrors the financing lifecycle:
 *
 *   1. a winning bid exists on ShieldLedger and no escrow yet  -> deposit
 *      the winning amount;
 *   2. the invoice is settled on ShieldLedger and the escrow is
 *      still LOCKED                                            -> release.
 *
 *   Pool settlements follow the same pattern per-lender:
 *   3. pool settlement detected, lender slot known, no pool escrow
 *      yet                                                    -> poolDeposit;
 *   4. pool escrow locked, invoice settled                     -> poolRelease.
 *
 * Idempotent: state already observed (escrowed, released) is skipped, so the
 * layer can be re-run after any event without producing duplicates.
 */
export function planEscrowCommands(input: EscrowOrchestrationInput): EscrowCommand[] {
  const commands: EscrowCommand[] = [];

  // Single-lender: deposit winning bid amount when no escrow exists.
  for (const [nullifier, amount] of input.bestBids) {
    if (!input.escrowed.has(nullifier) && !input.released.has(nullifier) && amount > 0n) {
      commands.push({ kind: 'deposit', nullifier, amount: amount.toString() });
    }
  }

  // Single-lender: release when escrowed and settled.
  for (const nullifier of input.escrowed) {
    if (input.settled.has(nullifier) && !input.released.has(nullifier)) {
      commands.push({ kind: 'release', nullifier });
    }
  }

  // Pool: deposit for each lender slot when pool settlement detected
  // and no pool escrow exists for that lender.
  const poolSettled = input.poolSettled ?? new Map();
  const poolSlots = input.poolSlots ?? new Map();
  const poolEscrowed = input.poolEscrowed ?? new Set();
  const poolReleased = input.poolReleased ?? new Set();

  for (const [nullifier] of poolSettled) {
    const slots = poolSlots.get(nullifier) ?? [];
    for (const slot of slots) {
      const compositeKey = `${nullifier}:${slot.lenderPseudonym}`;
      if (!poolEscrowed.has(compositeKey) && !poolReleased.has(compositeKey)) {
        commands.push({ kind: 'poolDeposit', nullifier, lenderPseudonym: slot.lenderPseudonym });
      }
    }
  }

  // Pool: release when pool escrowed and settled.
  for (const compositeKey of poolEscrowed) {
    const colonIdx = compositeKey.indexOf(':');
    const nullifier = compositeKey.substring(0, colonIdx);
    const lenderPseudonym = compositeKey.substring(colonIdx + 1);
    if (poolSettled.has(nullifier) && !poolReleased.has(compositeKey)) {
      commands.push({ kind: 'poolRelease', nullifier, lenderPseudonym });
    }
  }

  return commands;
}
