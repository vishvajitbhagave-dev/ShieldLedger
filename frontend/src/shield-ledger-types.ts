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
  /** The proven reputation bound: the SME attested reputationScore >= this in ZK (0 = no requirement). */
  readonly reputationThreshold: bigint;
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
  /** True once the winning lender's claim was resold on the secondary market. */
  readonly transferred: boolean;
  /** Commitment to the CURRENT holder's secret: hash(claimSecret, nullifier). Identity stays hidden. */
  readonly claimCommitment: string;
  /** Number of co-lenders (0 = single-lender auction, 1–4 = pool financing). */
  readonly splitCount: bigint;
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
  readonly willingToSplit: boolean;
}

/**
 * The ONE shared default-insurance pool: every registration credits it with
 * 2% of the face amount; every paid default claim debits it. Only the running
 * balance is public — never who contributed or why a specific payout happened.
 */
export interface InsurancePoolView {
  readonly balance: bigint;
}

/** A paid default-insurance claim, keyed by the (already public) nullifier. */
export interface InsuranceClaimView {
  readonly nullifier: string;
  readonly payout: bigint;
  readonly claimedAt: bigint;
}

/**
 * A pool bid slot on-chain (bestPools map). Keyed by poolSlotKey hash;
 * stores only the lender pseudonym and bid commitment.
 */
export interface PoolBidView {
  readonly slotKey: string;
  readonly lender: string;
  readonly commitment: string;
}

/**
 * A per-lender settlement record for a pool-financed invoice. Keyed by
 * poolSlotKey hash; stores only the payout amount.
 */
export interface PoolSettlementView {
  readonly slotKey: string;
  readonly payout: bigint;
}

/**
 * Per-slot claim commitment for pool secondary market transfers. Keyed by
 * poolSlotKey hash.
 */
export interface PoolClaimView {
  readonly slotKey: string;
  readonly claimCommitment: string;
  readonly transferred: boolean;
}

/** The derived application state: public ledger data plus wallet context. */
export interface ShieldLedgerDerivedState {
  readonly ledger: Ledger;
  readonly invoiceCount: bigint;
  readonly invoices: InvoiceView[];
  readonly bids: SealedBidView[];
  readonly bestBids: BestBidView[];
  /** Null until the first registration seeds the pool entry. */
  readonly insurancePool: InsurancePoolView | null;
  readonly insuranceClaims: InsuranceClaimView[];
  readonly poolBids: PoolBidView[];
  readonly poolSettlements: PoolSettlementView[];
  readonly poolClaims: PoolClaimView[];
}
