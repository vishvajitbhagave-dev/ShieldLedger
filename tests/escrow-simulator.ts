import {
  type CircuitContext,
  type WitnessContext,
  createConstructorContext,
  createCircuitContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  type Ledger,
  ledger,
  pureCircuits,
} from '../contracts/managed/escrow/contract/index.js';

/**
 * Headless simulator for the Escrow contract (see contracts/escrow.compact).
 *
 * Mirrors the ShieldLedger simulator: runs circuits through the
 * compact-runtime VM with a single private state; switchIdentity() emulates a
 * different actor on the same ledger.
 */
export interface EscrowPrivateState {
  readonly smeSecret: Uint8Array;
  readonly lenderSecret: Uint8Array;
}

const witnesses = {
  smeSecret: ({
    privateState,
  }: WitnessContext<Ledger, EscrowPrivateState>): [EscrowPrivateState, Uint8Array] => [
    privateState,
    privateState.smeSecret,
  ],

  lenderSecret: ({
    privateState,
  }: WitnessContext<Ledger, EscrowPrivateState>): [EscrowPrivateState, Uint8Array] => [
    privateState,
    privateState.lenderSecret,
  ],
};

export class EscrowSimulator {
  readonly contract: Contract<EscrowPrivateState>;
  circuitContext: CircuitContext<EscrowPrivateState>;

  constructor(privateState: EscrowPrivateState) {
    this.contract = new Contract<EscrowPrivateState>(witnesses);
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

  switchIdentity(partial: Partial<EscrowPrivateState>): void {
    this.circuitContext.currentPrivateState = {
      ...this.circuitContext.currentPrivateState,
      ...partial,
    };
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  deposit(nullifier: Uint8Array, amount: bigint): Ledger {
    this.circuitContext = this.contract.impureCircuits.deposit(
      this.circuitContext,
      nullifier,
      amount,
    ).context;
    return this.getLedger();
  }

  release(nullifier: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.release(
      this.circuitContext,
      nullifier,
    ).context;
    return this.getLedger();
  }
}

export function escrowCommitment(secret: Uint8Array, nullifier: Uint8Array): Uint8Array {
  return pureCircuits.deriveCommitment(secret, nullifier);
}
