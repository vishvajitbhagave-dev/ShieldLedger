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
  /** The proven credit bound: the SME attested score >= creditThreshold in ZK. */
  readonly creditThreshold: bigint;
  /** The SME's claimed face amount, posted at registration (public so the buyer can vouch for it). */
  readonly invoiceAmount: bigint;
  /** True once a corporate buyer proved the invoice genuine in ZK. */
  readonly buyerVerified: boolean;
  /** Opaque per-invoice buyer binding: hash(buyerSecret, nullifier) — reveals no identity. */
  readonly buyerCommitment: string;
  readonly lender: string | null;
  readonly amount: bigint;
  readonly dueDate: bigint;
  readonly rateBps: bigint;
}

/**
 * A serializable view of one public bid entry. Bids are *sealed*: the ledger
 * only carries a commitment to the terms, never the terms themselves.
 */
export interface SealedBidView {
  readonly bidKey: string;
  readonly nullifier: string;
  readonly lender: string;
  readonly commitment: string;
}

/** A serializable view of the running best bid per invoice. */
export interface BestBidView {
  readonly nullifier: string;
  readonly lender: string;
  readonly amount: bigint;
  readonly dueDate: bigint;
  readonly rateBps: bigint;
}

/** The derived application state: public ledger data plus wallet context. */
export interface ShieldLedgerDerivedState {
  readonly ledger: Ledger;
  readonly invoiceCount: bigint;
  readonly invoices: InvoiceView[];
  readonly bids: SealedBidView[];
  readonly bestBids: BestBidView[];
}
