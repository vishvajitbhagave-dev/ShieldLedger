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
  | { kind: 'release'; nullifier: string };

export interface EscrowOrchestrationInput {
  /** Winning bids read from ShieldLedger's bestBids: nullifier -> amount. */
  readonly bestBids: ReadonlyMap<string, bigint>;
  /** Invoices already financed/settled on ShieldLedger (lender set). */
  readonly settled: ReadonlySet<string>;
  /** Nullifiers that already hold a LOCKED escrow on the Escrow contract. */
  readonly escrowed: ReadonlySet<string>;
  /** Nullifiers already released on the Escrow contract. */
  readonly released: ReadonlySet<string>;
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
 * Idempotent: state already observed (escrowed, released) is skipped, so the
 * layer can be re-run after any event without producing duplicates.
 */
export function planEscrowCommands(input: EscrowOrchestrationInput): EscrowCommand[] {
  const commands: EscrowCommand[] = [];

  for (const [nullifier, amount] of input.bestBids) {
    if (!input.escrowed.has(nullifier) && !input.released.has(nullifier) && amount > 0n) {
      commands.push({ kind: 'deposit', nullifier, amount: amount.toString() });
    }
  }

  for (const nullifier of input.escrowed) {
    if (input.settled.has(nullifier) && !input.released.has(nullifier)) {
      commands.push({ kind: 'release', nullifier });
    }
  }

  return commands;
}
