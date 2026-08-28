// Order-book style bid-depth transformation for ShieldLedger.
//
// PURE functions: take public, post-reveal derived state and produce chart-ready
// buckets. No rendering, no DOM, no contract/API changes.
//
// HONESTY NOTE (mirrors the project's standard): the on-chain design discloses
// the TERMS (rate, amount, due date, whole-vs-split) of only the SINGLE WINNING
// bid per single-lender auction (`bestBids` is keyed by nullifier and holds just
// the current best). Non-winning revealed bids' terms are never persisted
// (`revealBid` keeps only the best, `contracts/shield-ledger.compact:367-374`).
// Pool bids (`bestPools`) store only `{ lender, commitment }` — their rate and
// amount are committed and private (`:198-201`).
//
// So this module charts exactly what is public:
//   - A per-invoice view: the winning bid's rate/amount/whole-or-split, plus a
//     "pool members (committed)" lane when slot bids exist.
//   - A market-depth view across ALL resolved single-lender auctions: winning
//     bids grouped by rate (ascending, since lowest rate wins), with cumulative
//     depth — the closest honest analog to an order book, built only from
//     already-disclosed terms.
// It NEVER invents a rate for a non-winning or pool bid, because none exists
// publicly.

import type { BestBidView, InvoiceView, PoolBidView } from './shield-ledger-types.js';

/** One rate level in the depth chart (public data only). */
export interface DepthLevel {
  readonly rateBps: bigint;
  /** Number of winning bids disclosed at exactly this rate. */
  readonly count: number;
  /** Sum of the financed amounts disclosed at this rate. */
  readonly totalAmount: bigint;
  /** Winning bids at this rate that were whole-invoice (willingToSplit=false). */
  readonly wholeCount: number;
  /** Winning bids at this rate that were split (willingToSplit=true). */
  readonly splitCount: number;
  /** Disclosed winning lender pseudonyms at this rate. */
  readonly winners: readonly string[];
}

/** The chart-ready market depth derived from public state. */
export interface MarketDepth {
  readonly levels: readonly DepthLevel[];
  /** Running total of disclosed winning bids, one per level (ascending rate). */
  readonly cumulativeCount: readonly number[];
  /** Running total of disclosed financed amount per level (ascending rate). */
  readonly cumulativeAmount: readonly bigint[];
  /** Largest disclosed per-level amount — used to scale the depth bars. */
  readonly maxLevelAmount: bigint;
  /** Number of committed pool slots (their terms are private — shown as a lane only). */
  readonly poolCommitCount: number;
  /** Total resolved single-lender auctions whose winning bid was disclosed. */
  readonly disclosedCount: number;
}

/**
 * Aggregate market depth across all resolved single-lender auctions.
 *
 * @param bestBids Public winning-bid entries (`state.bestBids`).
 * @param poolBids Public committed pool slots (`state.poolBids`) — used only for
 *                 the committed-terms lane count, never for a fabricated rate.
 */
export function buildMarketDepth(
  bestBids: readonly BestBidView[],
  poolBids: readonly PoolBidView[],
): MarketDepth {
  if (bestBids.length === 0) {
    return {
      levels: [],
      cumulativeCount: [],
      cumulativeAmount: [],
      maxLevelAmount: 0n,
      poolCommitCount: poolBids.length,
      disclosedCount: 0,
    };
  }

  const byRate = new Map<bigint, DepthLevel>();
  for (const best of bestBids) {
    const r = best.rateBps;
    const existing = byRate.get(r);
    if (existing) {
      byRate.set(r, {
        rateBps: r,
        count: existing.count + 1,
        totalAmount: existing.totalAmount + best.amount,
        wholeCount: existing.wholeCount + (best.willingToSplit ? 0 : 1),
        splitCount: existing.splitCount + (best.willingToSplit ? 1 : 0),
        winners: [...existing.winners, best.lender],
      });
    } else {
      byRate.set(r, {
        rateBps: r,
        count: 1,
        totalAmount: best.amount,
        wholeCount: best.willingToSplit ? 0 : 1,
        splitCount: best.willingToSplit ? 1 : 0,
        winners: [best.lender],
      });
    }
  }

  // Lowest rate first (best for the borrower; the auction's winner).
  const levels = Array.from(byRate.values()).sort((a, b) =>
    a.rateBps < b.rateBps ? -1 : a.rateBps > b.rateBps ? 1 : 0,
  );

  const cumulativeCount: number[] = [];
  const cumulativeAmount: bigint[] = [];
  let count = 0;
  let amount = 0n;
  for (const level of levels) {
    count += level.count;
    amount += level.totalAmount;
    cumulativeCount.push(count);
    cumulativeAmount.push(amount);
  }

  const maxLevelAmount = levels.reduce((m, l) => (l.totalAmount > m ? l.totalAmount : m), 0n);

  return {
    levels,
    cumulativeCount,
    cumulativeAmount,
    maxLevelAmount,
    poolCommitCount: poolBids.length,
    disclosedCount: bestBids.length,
  };
}

/** Per-invoice winner summary (public terms of the single winning bid only). */
export interface InvoiceBidView {
  readonly nullifier: string;
  readonly winnerRateBps: bigint;
  readonly winnerAmount: bigint;
  readonly winnerWhole: boolean; // true = whole-invoice (willingToSplit=false)
  readonly poolSlotCount: number; // committed pool slots for this invoice (terms private)
  readonly isPoolInvoice: boolean;
}

/**
 * Per-invoice bid summary for a depth entry. For a single-lender auction this
 * is the disclosed winning bid; for a pool invoice the terms are committed and
 * only the committed-slot count is shown (rate/amount are not public).
 */
export function buildInvoiceBid(
  invoice: InvoiceView,
  bestBid: BestBidView | undefined,
  slotCountForInvoice: number,
): InvoiceBidView {
  const isPool = invoice.splitCount > 0n;
  return {
    nullifier: invoice.nullifier,
    winnerRateBps: bestBid?.rateBps ?? 0n,
    winnerAmount: bestBid?.amount ?? 0n,
    winnerWhole: bestBid ? !bestBid.willingToSplit : true,
    poolSlotCount: slotCountForInvoice,
    isPoolInvoice: isPool,
  };
}
