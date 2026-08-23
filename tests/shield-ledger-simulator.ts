import {
  type CircuitContext,
  sampleContractAddress,
  createConstructorContext,
  createCircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  type Ledger,
  ledger,
  pureCircuits,
} from '../contracts/managed/shield-ledger/contract/index.js';
import {
  type ShieldLedgerPrivateState,
  witnesses,
} from '../src/witnesses.js';
import { applyReputationUpdate } from '../src/reputation.js';

/**
 * Headless simulator for the ShieldLedger contract.
 *
 * Runs the circuits through the compact-runtime VM (no network, no proof
 * generation). A single simulator holds one private state; use
 * switchIdentity() to emulate a different actor (different SME secret, credit
 * profile, lender secret, ...) acting on the same ledger.
 */
// Mirrors the floor inlined in contracts/shield-ledger.compact (registerInvoice).
export const MIN_CREDIT_SCORE = 650n;

export class ShieldLedgerSimulator {
  readonly contract: Contract<ShieldLedgerPrivateState>;
  circuitContext: CircuitContext<ShieldLedgerPrivateState>;

  constructor(privateState: ShieldLedgerPrivateState) {
    this.contract = new Contract<ShieldLedgerPrivateState>(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      createConstructorContext(privateState, '0'.repeat(64)),
    );
    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  /** Emulate a different actor on the same ledger (like bboard's switchUser). */
  switchIdentity(partial: Partial<ShieldLedgerPrivateState>): void {
    this.circuitContext.currentPrivateState = {
      ...this.circuitContext.currentPrivateState,
      ...partial,
    };
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  getPrivateState(): ShieldLedgerPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  registerInvoice(
    nullifier: Uint8Array,
    creditThreshold: bigint = MIN_CREDIT_SCORE,
    invoiceAmount: bigint = 0n,
    reputationThreshold: bigint = 0n,
  ): Ledger {
    this.circuitContext = this.contract.impureCircuits.registerInvoice(
      this.circuitContext,
      nullifier,
      creditThreshold,
      invoiceAmount,
      reputationThreshold,
    ).context;
    return this.getLedger();
  }

  confirmInvoice(nullifier: Uint8Array, confirmedAmount: bigint): Ledger {
    this.circuitContext = this.contract.impureCircuits.confirmInvoice(
      this.circuitContext,
      nullifier,
      confirmedAmount,
    ).context;
    return this.getLedger();
  }

  submitBid(nullifier: Uint8Array, commitment: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.submitBid(
      this.circuitContext,
      nullifier,
      commitment,
    ).context;
    return this.getLedger();
  }

  revealBid(
    nullifier: Uint8Array,
    amount: bigint,
    dueDate: bigint,
    rateBps: bigint,
  ): Ledger {
    this.circuitContext = this.contract.impureCircuits.revealBid(
      this.circuitContext,
      nullifier,
      amount,
      dueDate,
      rateBps,
    ).context;
    return this.getLedger();
  }

  settleInvoice(
    nullifier: Uint8Array,
    financedAmount: bigint,
    financedDueDate: bigint,
    settledAt: bigint = financedDueDate,
  ): Ledger {
    const results = this.contract.impureCircuits.settleInvoice(
      this.circuitContext,
      nullifier,
      financedAmount,
      financedDueDate,
      settledAt,
    );
    this.circuitContext = results.context;
    // The circuit returns the on-time/late classification (settledAt <=
    // financedDueDate). The wallet layer applies it to the SME's private
    // reputation score; the ledger itself never records the classification.
    const onTime = results.result;
    this.circuitContext.currentPrivateState = applyReputationUpdate(
      this.circuitContext.currentPrivateState,
      onTime,
    );
    return this.getLedger();
  }

  /**
   * Secondary market: the current claim holder resells their claim. The
   * caller passes a commitment to the NEW owner's secret (deriveClaimCommit-
   * ment(newOwnerSecret, nullifier)). Authorization is in-circuit: the first
   * hand-over must come from the auction leader (lenderSecret), later ones
   * from whoever holds claimSecret matching the stored commitment.
   */
  transferClaim(nullifier: Uint8Array, newOwnerCommitment: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.transferClaim(
      this.circuitContext,
      nullifier,
      newOwnerCommitment,
    ).context;
    return this.getLedger();
  }

  /**
   * Holder-only, local ownership check: does THIS wallet's claimSecret match
   * the invoice's on-chain commitment? Pure computation against public state
   * plus private state — nothing is disclosed to anyone else.
   */
  holdsClaim(nullifier: Uint8Array): boolean {
    const invoice = this.getLedger().invoices.lookup(nullifier);
    if (!invoice.transferred) return false;
    const mine = pureCircuits.deriveClaimCommitment(
      this.circuitContext.currentPrivateState.claimSecret,
      nullifier,
    );
    return mine.length === invoice.claimCommitment.length && mine.every((v, i) => v === invoice.claimCommitment[i]);
  }
}

export function deriveCommitment(secret: Uint8Array, nullifier: Uint8Array): Uint8Array {
  return pureCircuits.deriveCommitment(secret, nullifier);
}

export function deriveBuyerCommitment(secret: Uint8Array, nullifier: Uint8Array): Uint8Array {
  return pureCircuits.deriveBuyerCommitment(secret, nullifier);
}

export function derivePseudonym(secret: Uint8Array): Uint8Array {
  return pureCircuits.derivePseudonym(secret);
}

export function deriveBidKey(nullifier: Uint8Array, pseudonym: Uint8Array): Uint8Array {
  return pureCircuits.deriveBidKey(nullifier, pseudonym);
}

export function deriveBidCommitment(
  secret: Uint8Array,
  nullifier: Uint8Array,
  amount: bigint,
  dueDate: bigint,
  rateBps: bigint,
): Uint8Array {
  return pureCircuits.deriveBidCommitment(secret, nullifier, amount, dueDate, rateBps);
}

export function deriveClaimCommitment(ownerSecret: Uint8Array, nullifier: Uint8Array): Uint8Array {
  return pureCircuits.deriveClaimCommitment(ownerSecret, nullifier);
}

/** The opaque public payee recorded when a transferred claim settles. */
export function deriveSecondaryPayee(): Uint8Array {
  return pureCircuits.deriveSecondaryPayee();
}
