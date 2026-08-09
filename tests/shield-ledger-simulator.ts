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

/**
 * Headless simulator for the ShieldLedger contract.
 *
 * Runs the circuits through the compact-runtime VM (no network, no proof
 * generation). A single simulator holds one private state; use
 * switchIdentity() to emulate a different actor (different SME secret, credit
 * profile, ...) acting on the same ledger.
 */
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

  registerInvoice(nullifier: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.registerInvoice(
      this.circuitContext,
      nullifier,
    ).context;
    return this.getLedger();
  }

  submitBid(nullifier: Uint8Array, bidAmount: bigint, bidDueDate: bigint): Ledger {
    this.circuitContext = this.contract.impureCircuits.submitBid(
      this.circuitContext,
      nullifier,
      bidAmount,
      bidDueDate,
    ).context;
    return this.getLedger();
  }

  settleInvoice(
    nullifier: Uint8Array,
    winningLender: Uint8Array,
    financedAmount: bigint,
    financedDueDate: bigint,
  ): Ledger {
    this.circuitContext = this.contract.impureCircuits.settleInvoice(
      this.circuitContext,
      nullifier,
      winningLender,
      financedAmount,
      financedDueDate,
    ).context;
    return this.getLedger();
  }
}

export function deriveCommitment(secret: Uint8Array, nullifier: Uint8Array): Uint8Array {
  return pureCircuits.deriveCommitment(secret, nullifier);
}

export function derivePseudonym(secret: Uint8Array): Uint8Array {
  return pureCircuits.derivePseudonym(secret);
}

export function deriveBidKey(nullifier: Uint8Array, pseudonym: Uint8Array): Uint8Array {
  return pureCircuits.deriveBidKey(nullifier, pseudonym);
}
