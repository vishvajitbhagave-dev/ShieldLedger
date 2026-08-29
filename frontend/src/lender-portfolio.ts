// Lender portfolio view for the CONNECTED wallet.
//
// PURE transformations over public derived state plus the wallet's own
// pseudonym. Identifies positions that belong to THIS lender and nothing else:
//
//   - Single-lender positions: winning bids (`state.bestBids`) whose disclosed
//     lender pseudonym matches the caller. Amount/rate/due date are public
//     because resolving the auction disclosed the winner's terms
//     (`contracts/shield-ledger.compact` bestBids).
//   - Pool positions: `state.poolBids` entries whose disclosed lender pseudonym
//     matches the caller. A pool slot's key is `poolSlotKey(nullifier, i)`, so
//     the slot is bound to its invoice by re-deriving the key for every
//     pool-registered invoice. The slot's CONTRIBUTION is a private witness
//     (`compact:194-195`) and pool invoices store `rateBps: 0`
//     (`compact:652`) - so a pool position's principal share and return are
//     NOT observable on-chain. The wallet may recall its own payout only from
//     the browser-local pool-payout record (written when THAT wallet settled
//     the pool), passed in via `localPayouts`.
//
// HONESTY NOTES (mirrors the project's standard):
//   - Dollar totals aggregate only amounts that are genuinely public: the
//     single-lender winning terms. Pool positions are counted but their
//     principal is marked confidential and excluded from the sums.
//   - "Distinct SMEs financed" is NOT derivable: an invoice's smeCommitment is
//     bound to its nullifier (hash(smeSecret, nullifier)), so a single SME's
//     invoices cannot be linked publicly. Position/invoice counts plus a
//     concentration ratio are used instead.
//
// This module performs NO new disclosure: matching is done by comparing the
// caller's own pseudonym against already-public entries.

import * as ShieldLedger from '../../contracts/managed/shield-ledger/contract/index.js';
import type {
  BestBidView,
  InsuranceClaimView,
  InvoiceView,
  PoolBidView,
  ShieldLedgerDerivedState,
} from './shield-ledger-types.js';

/** Local per-slot settlement payouts (browser storage), keyed by slot key. */
export type LocalPayouts = ReadonlyMap<string, bigint>;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(input: string): Uint8Array {
  const hex = input.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error('Expected exactly 64 hex characters (32 bytes).');
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export type PositionStatus = 'active' | 'settled' | 'defaulted';

/** A single-lender financing this wallet won and committed to. */
export interface SingleLenderPosition {
  readonly kind: 'single';
  readonly nullifier: string;
  readonly smeCommitment: string;
  /** The invoice face amount registered by the SME. */
  readonly faceAmount: bigint;
  /** The amount this wallet financed (the winning bid). */
  readonly financedAmount: bigint;
  /** Contracted annualized rate in basis points (public for winners). */
  readonly rateBps: bigint;
  readonly dueDate: bigint;
  readonly willingToSplit: boolean;
  readonly buyerVerified: boolean;
  readonly status: PositionStatus;
  /** financedAmount * rateBps / 10000 — expected if repaid on time. */
  readonly expectedReturn: bigint;
}

/** A pool slot this wallet contributed to (contribution itself is private). */
export interface PoolPosition {
  readonly kind: 'pool';
  readonly nullifier: string;
  readonly smeCommitment: string;
  readonly slotIndex: number;
  readonly slotKey: string;
  /** The invoice face amount registered by the SME. */
  readonly faceAmount: bigint;
  /** The whole pool's repayment at due date (invoice.amount = totalPayout). */
  readonly totalPayout: bigint;
  readonly dueDate: bigint;
  readonly status: PositionStatus;
  /**
   * THIS wallet's settlement payout, if it recorded locally (only the wallet
   * that settled the pool persists payouts). Null when confidential.
   */
  readonly myPayout: bigint | null;
}

export type LenderPosition = SingleLenderPosition | PoolPosition;

/** Aggregated portfolio facts for the connected lender. */
export interface LenderPortfolio {
  readonly positions: readonly LenderPosition[];
  readonly singleCount: number;
  readonly poolCount: number;
  readonly activeCount: number;
  readonly settledCount: number;
  readonly defaultedCount: number;
  /** Distinct financed invoices represented in this portfolio. */
  readonly invoiceCount: number;
  /** Sum of public single-lender financed amounts (pool principals excluded). */
  readonly issuedExposure: bigint;
  /** Sum of known pool payouts (browser-local, existing settlements only). */
  readonly knownPoolPayouts: bigint;
  /** Sum of single-lender contracted returns (active + settled, not defaulted). */
  readonly contractedReturn: bigint;
  /** Largest single exposure / issuedExposure (0..1), null when exposure is 0. */
  readonly concentrationRate: number | null;
  /** True when any pool position exists (share amounts are confidential). */
  readonly hasPoolPositions: boolean;
}

const SLOT_COUNT = 4;

const statusOfSingle = (
  bestBid: BestBidView,
  invoice: InvoiceView | undefined,
  claims: readonly InsuranceClaimView[],
): PositionStatus => {
  const defaulted = claims.some((c) => c.nullifier === bestBid.nullifier);
  if (defaulted) return 'defaulted';
  if (invoice && invoice.lender !== null) return 'settled';
  return 'active';
};

const statusOfPool = (
  invoice: InvoiceView,
  slotKey: string,
  claims: readonly InsuranceClaimView[],
): PositionStatus => {
  const defaulted = claims.some((c) => c.nullifier === slotKey);
  if (defaulted) return 'defaulted';
  if (invoice.lender !== null) return 'settled';
  return 'active';
};

const matchesLender = (lender: string, myPseudonym: string): boolean =>
  lender.toLowerCase() === myPseudonym.toLowerCase();

/**
 * Builds the connected lender's portfolio from public derived state and the
 * wallet's own pseudonym. Pool principals are reported as confidential;
 * single-lender terms are public and aggregated.
 */
export function buildLenderPortfolio(
  state: ShieldLedgerDerivedState,
  myPseudonym: string,
  localPayouts: LocalPayouts = new Map<string, bigint>(),
): LenderPortfolio {
  const positions: LenderPosition[] = [];
  const populatedInvoices = new Set<string>();

  for (const best of state.bestBids) {
    if (!matchesLender(best.lender, myPseudonym)) continue;
    const invoice = state.invoices.find((i) => i.nullifier === best.nullifier);
    // A pool-registered invoice must not be double-counted as a single-lender
    // position (its settlement is a pool settlement).
    if (invoice && invoice.splitCount > 0n) continue;
    const status = statusOfSingle(best, invoice, state.insuranceClaims);
    positions.push({
      kind: 'single',
      nullifier: best.nullifier,
      smeCommitment: invoice?.smeCommitment ?? '',
      faceAmount: invoice?.invoiceAmount ?? 0n,
      financedAmount: best.amount,
      rateBps: best.rateBps,
      dueDate: best.dueDate,
      willingToSplit: best.willingToSplit,
      buyerVerified: invoice?.buyerVerified ?? false,
      status,
      expectedReturn: (best.amount * best.rateBps) / 10000n,
    });
    populatedInvoices.add(best.nullifier);
  }

  for (const invoice of state.invoices) {
    if (invoice.splitCount <= 0n) continue;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const slotKey = toHex(
        ShieldLedger.pureCircuits.poolSlotKey(fromHex(invoice.nullifier), BigInt(i)),
      );
      const bid = state.poolBids.find((p) => p.slotKey === slotKey);
      if (!bid || !matchesLender(bid.lender, myPseudonym)) continue;
      positions.push({
        kind: 'pool',
        nullifier: invoice.nullifier,
        smeCommitment: invoice.smeCommitment,
        slotIndex: i,
        slotKey,
        faceAmount: invoice.invoiceAmount,
        totalPayout: invoice.amount,
        dueDate: invoice.dueDate,
        status: statusOfPool(invoice, slotKey, state.insuranceClaims),
        myPayout: localPayouts.get(slotKey) ?? null,
      });
      populatedInvoices.add(invoice.nullifier);
    }
  }

  const singles = positions.filter((p): p is SingleLenderPosition => p.kind === 'single');
  const pools = positions.filter((p): p is PoolPosition => p.kind === 'pool');

  const issuedExposure = singles.reduce((sum, p) => sum + p.financedAmount, 0n);
  const knownPoolPayouts = pools.reduce(
    (sum, p) => sum + (p.myPayout !== null ? p.myPayout : 0n),
    0n,
  );
  const contractedReturn = singles.reduce(
    (sum, p) => sum + (p.status === 'defaulted' ? 0n : p.expectedReturn),
    0n,
  );
  const largestExposure = singles.reduce(
    (m, p) => (p.financedAmount > m ? p.financedAmount : m),
    0n,
  );
  const concentrationRate =
    issuedExposure > 0n ? Number(largestExposure) / Number(issuedExposure) : null;

  return {
    positions,
    singleCount: singles.length,
    poolCount: pools.length,
    activeCount: positions.filter((p) => p.status === 'active').length,
    settledCount: positions.filter((p) => p.status === 'settled').length,
    defaultedCount: positions.filter((p) => p.status === 'defaulted').length,
    invoiceCount: populatedInvoices.size,
    issuedExposure,
    knownPoolPayouts,
    contractedReturn,
    concentrationRate,
    hasPoolPositions: pools.length > 0,
  };
}