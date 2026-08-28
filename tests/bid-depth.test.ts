import { describe, it, expect } from 'vitest';
import { buildMarketDepth, buildInvoiceBid } from '../frontend/src/bid-depth.js';
import type { BestBidView, InvoiceView, PoolBidView } from '../frontend/src/shield-ledger-types.js';

function best(overrides: Partial<BestBidView> & { nullifier: string; rateBps: bigint }): BestBidView {
  return {
    lender: '0xL',
    amount: 1000n,
    dueDate: 100n,
    willingToSplit: false,
    ...overrides,
  };
}

function pool(overrides: Partial<PoolBidView> & { slotKey: string }): PoolBidView {
  return { lender: '0xP', commitment: '0xC', ...overrides };
}

function inv(overrides: Partial<InvoiceView> & { nullifier: string }): InvoiceView {
  return {
    smeCommitment: '',
    creditThreshold: 0n,
    reputationThreshold: 0n,
    invoiceAmount: 1000n,
    buyerVerified: false,
    buyerCommitment: '',
    lender: null,
    amount: 0n,
    dueDate: 0n,
    rateBps: 0n,
    transferred: false,
    claimCommitment: '',
    splitCount: 0n,
    ...overrides,
  };
}

describe('buildMarketDepth — normal mixed bids', () => {
  it('groups winning bids by rate, ascending, with whole/split breakdown and winner pseudonyms', () => {
    const bestBids: BestBidView[] = [
      best({ nullifier: 'a', rateBps: 400n, amount: 2000n, lender: '0xWa', willingToSplit: false }), // whole
      best({ nullifier: 'b', rateBps: 300n, amount: 1000n, lender: '0xWb', willingToSplit: false }), // whole
      best({ nullifier: 'c', rateBps: 400n, amount: 1500n, lender: '0xWc', willingToSplit: true }), // split
      best({ nullifier: 'd', rateBps: 500n, amount: 800n, lender: '0xWd', willingToSplit: false }), // whole
    ];

    const d = buildMarketDepth(bestBids, []);

    // Ascending by rate: 300, 400, 500.
    expect(d.levels.map((l) => l.rateBps.toString())).toEqual(['300', '400', '500']);
    expect(d.disclosedCount).toBe(4);

    // Rate 300: one whole winner.
    expect(d.levels[0]).toMatchObject({ rateBps: 300n, count: 1, totalAmount: 1000n, wholeCount: 1, splitCount: 0 });
    // Rate 400: two winners (one whole, one split).
    expect(d.levels[1]).toMatchObject({ rateBps: 400n, count: 2, totalAmount: 3500n, wholeCount: 1, splitCount: 1 });
    expect([...d.levels[1].winners].sort()).toEqual(['0xWa', '0xWc']);
    // Rate 500: one whole winner.
    expect(d.levels[2]).toMatchObject({ rateBps: 500n, count: 1, totalAmount: 800n, wholeCount: 1, splitCount: 0 });

    // Cumulative counts/amounts are monotonic across ascending rates.
    expect(d.cumulativeCount).toEqual([1, 3, 4]);
    expect(d.cumulativeAmount.map(String)).toEqual(['1000', '4500', '5300']);

    // Scaling anchor = largest per-level amount (3500 at 4%).
    expect(d.maxLevelAmount).toBe(3500n);
  });
});

describe('buildMarketDepth — single bid', () => {
  it('produces a single level with a sane cumulative profile', () => {
    const d = buildMarketDepth(
      [best({ nullifier: 'only', rateBps: 250n, amount: 5000n })],
      [],
    );
    expect(d.levels).toHaveLength(1);
    expect(d.levels[0]).toMatchObject({ rateBps: 250n, count: 1, totalAmount: 5000n, wholeCount: 1, splitCount: 0 });
    expect(d.cumulativeCount).toEqual([1]);
    expect(d.cumulativeAmount.map(String)).toEqual(['5000']);
    expect(d.maxLevelAmount).toBe(5000n);
    expect(d.disclosedCount).toBe(1);
  });
});

describe('buildMarketDepth — no bids', () => {
  it('returns an empty chart (no levels, zeros) when nothing is disclosed', () => {
    const d = buildMarketDepth([], []);
    expect(d.disclosedCount).toBe(0);
    expect(d.levels).toEqual([]);
    expect(d.cumulativeCount).toEqual([]);
    expect(d.cumulativeAmount).toEqual([]);
    expect(d.maxLevelAmount).toBe(0n);
    expect(d.poolCommitCount).toBe(0);
  });

  it('still counts committed pool bids even with zero disclosed winners', () => {
    const d = buildMarketDepth([], [pool({ slotKey: 's1' }), pool({ slotKey: 's2' })]);
    expect(d.disclosedCount).toBe(0);
    expect(d.levels).toEqual([]);
    expect(d.poolCommitCount).toBe(2);
  });
});

describe('buildMarketDepth — pool vs whole-invoice bids mixed', () => {
  it('counts pool commits separately and never assigns them a rate', () => {
    const bestBids: BestBidView[] = [
      best({ nullifier: 'a', rateBps: 300n, amount: 1000n, willingToSplit: false }),
      best({ nullifier: 'b', rateBps: 300n, amount: 1200n, willingToSplit: true }),
    ];
    const poolBids: PoolBidView[] = [pool({ slotKey: 'p1' }), pool({ slotKey: 'p2' }), pool({ slotKey: 'p3' })];

    const d = buildMarketDepth(bestBids, poolBids);

    // Pool commitments are NOT folded into any rate level.
    expect(d.levels).toHaveLength(1);
    expect(d.levels[0]).toMatchObject({ rateBps: 300n, count: 2, totalAmount: 2200n, wholeCount: 1, splitCount: 1 });
    // ...but they are surfaced as a separate, honest count.
    expect(d.poolCommitCount).toBe(3);
    expect(d.disclosedCount).toBe(2);
  });
});

describe('buildInvoiceBid — per-invoice winner / pool view', () => {
  it('single-lender auction: exposes the disclosed winning bid terms', () => {
    const invoice = inv({ nullifier: 'n1', splitCount: 0n });
    const view = buildInvoiceBid(invoice, best({ nullifier: 'n1', rateBps: 400n, amount: 900n, willingToSplit: false }), 0);
    expect(view.isPoolInvoice).toBe(false);
    expect(view.winnerRateBps).toBe(400n);
    expect(view.winnerAmount).toBe(900n);
    expect(view.winnerWhole).toBe(true);
    expect(view.poolSlotCount).toBe(0);
  });

  it('split single-lender winner is reported as split (winnerWhole=false)', () => {
    const invoice = inv({ nullifier: 'n2', splitCount: 0n });
    const view = buildInvoiceBid(invoice, best({ nullifier: 'n2', rateBps: 500n, amount: 700n, willingToSplit: true }), 0);
    expect(view.winnerWhole).toBe(false);
    expect(view.winnerRateBps).toBe(500n);
  });

  it('pool invoice: terms are not public, only the committed-slot count is surfaced', () => {
    const invoice = inv({ nullifier: 'pool1', splitCount: 4n });
    const view = buildInvoiceBid(invoice, undefined, 4);
    expect(view.isPoolInvoice).toBe(true);
    expect(view.poolSlotCount).toBe(4);
    // No invented rate/amount for a pool bid.
    expect(view.winnerRateBps).toBe(0n);
    expect(view.winnerAmount).toBe(0n);
  });
});
