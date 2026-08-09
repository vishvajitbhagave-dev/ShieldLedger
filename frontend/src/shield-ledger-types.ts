// Shared types for the ShieldLedger DApp: the contract + private state shape,
// the providers stack, and the derived (public + private) view rendered by
// the UI.
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { Contract, Ledger } from '../../contracts/managed/shield-ledger/contract/index.js';
import type { ShieldLedgerPrivateState } from '../../src/witnesses.js';

/** The private-state key used for every ShieldLedger contract deployment. */
export const shieldLedgerPrivateStateKey = 'shieldLedgerPrivateState';
export type ShieldLedgerPrivateStateId = typeof shieldLedgerPrivateStateKey;

export type ShieldLedgerContract = Contract<ShieldLedgerPrivateState>;

export type ShieldLedgerCircuitKeys = Exclude<keyof ShieldLedgerContract['impureCircuits'], number | symbol>;

export type ShieldLedgerProviders = MidnightProviders<
  ShieldLedgerCircuitKeys,
  ShieldLedgerPrivateStateId,
  ShieldLedgerPrivateState
>;

export type DeployedShieldLedgerContract = FoundContract<ShieldLedgerContract>;

/** A serializable view of one public invoice entry. */
export interface InvoiceView {
  readonly nullifier: string;
  readonly smeCommitment: string;
  readonly lender: string | null;
  readonly amount: bigint;
  readonly dueDate: bigint;
}

/** A serializable view of one public bid entry. */
export interface BidView {
  readonly bidKey: string;
  readonly nullifier: string;
  readonly lender: string;
  readonly amount: bigint;
  readonly dueDate: bigint;
}

/** The derived application state: public ledger data plus wallet context. */
export interface ShieldLedgerDerivedState {
  readonly ledger: Ledger;
  readonly invoiceCount: bigint;
  readonly invoices: InvoiceView[];
  readonly bids: BidView[];
}
