import { describe, it, expect } from 'vitest';
import { buildLenderPortfolio } from '../frontend/src/lender-portfolio.js';
import type {
  BestBidView,
  InsuranceClaimView,
  InvoiceView,
  PoolBidView,
  ShieldLedgerDerivedState,
} from '../frontend/src/shield-ledger-types.js';
import * as ShieldLedger from '../contracts/managed/shield-ledger/contract/index.js';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(input: string): Uint8Array {
  const hex = input.trim().toLowerCase().replace(/^0x/, '');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const ME = '0xMine';
const OTHER = '0xOther';

// 64-hex nullifiers (real 32-byte shape) for pool-slot derivation.
const N_POOL = `${'a'.repeat(63)}1`;
const N_SINGLE = `${'b'.repeat(63)}1`;

const slotKey = (nullifier: string, i: number): string =>
  toHex(ShieldLedger.pureCircuits.poolSlotKey(fromHex(nullifier), BigInt(i)));

function best(overrides: Partial<BestBidView> & { nullifier: string }): BestBidView {
  return {
    lender: ME,
    amount: 1000n,
    dueDate: 200n,
    rateBps: 400n,
    willingToSplit: false,
    ...overrides,
  };
}

function pool(overrides: Partial<PoolBidView> & { slotKey: string }): PoolBidView {
  return { lender: ME, commitment: '0xC', ...overrides };
}

function claim(overrides: Partial<InsuranceClaimView> & { nullifier: string }): InsuranceClaimView {
  return { payout: 500n, claimedAt: 300n, ...overrides };
}

function inv(overrides: Partial<InvoiceView> & { nullifier: string }): InvoiceView {
  return {
    smeCommitment: '0xSME',
    creditThreshold: 0n,
    reputationThreshold: 0n,
    invoiceAmount: 2000n,
    buyerVerified: true,
    buyerCommitment: '0xBuyer',
    lender: null,
    amount: 0n,
    dueDate: 200n,
    rateBps: 0n,
    transferred: false,
    claimCommitment: '0xCl',
    splitCount: 0n,
    ...overrides,
  };
}

function state(parts: {
  invoices?: InvoiceView[];
  bestBids?: BestBidView[];
  poolBids?: PoolBidView[];
  insuranceClaims?: InsuranceClaimView[];
}): ShieldLedgerDerivedState {
  return {
    ledger: {} as unknown as ShieldLedgerDerivedState['ledger'],
    invoiceCount: 0n,
    invoices: parts.invoices ?? [],
    bids: [],
    bestBids: parts.bestBids ?? [],
    insurancePool: null,
    insuranceClaims: parts.insuranceClaims ?? [],
    poolBids: parts.poolBids ?? [],
    payoutCommitments: [],
    poolClaims: [],
  };
}

describe('buildLenderPortfolio — single-lender positions', () => {
  it('reports my winning bid as an active position with public terms', () => {
    const portfolio = buildLenderPortfolio(
      state({ invoices: [inv({ nullifier: 'n1' })], bestBids: [best({ nullifier: 'n1', amount: 900n, rateBps: 400n })] }),
      ME,
    );

    expect(portfolio.singleCount).toBe(1);
    expect(portfolio.poolCount).toBe(0);
    expect(portfolio.invoiceCount).toBe(1);
    expect(portfolio.activeCount).toBe(1);
    expect(portfolio.positions[0]).toMatchObject({
      kind: 'single',
      nullifier: 'n1',
      financedAmount: 900n,
      rateBps: 400n,
      dueDate: 200n,
      willingToSplit: false,
      buyerVerified: true,
      status: 'active',
      expectedReturn: 36n, // 900 * 400 / 10000
    });
    expect(portfolio.issuedExposure).toBe(900n);
    expect(portfolio.concentrationRate).toBe(1);
  });

  it('ignores winning bids that belong to other lenders', () => {
    const portfolio = buildLenderPortfolio(
      state({ bestBids: [best({ nullifier: 'n1', lender: OTHER })] }),
      ME,
    );

    expect(portfolio.positions).toEqual([]);
    expect(portfolio.issuedExposure).toBe(0n);
    expect(portfolio.concentrationRate).toBeNull();
  });

  it('treats a financed invoice as settled and a claimed one as defaulted', () => {
    const settled = buildLenderPortfolio(
      state({
        invoices: [inv({ nullifier: 'n1', lender: '0xMine', amount: 900n })],
        bestBids: [best({ nullifier: 'n1' })],
      }),
      ME,
    );
    expect(settled.positions[0].status).toBe('settled');
    expect(settled.settledCount).toBe(1);

    const defaulted = buildLenderPortfolio(
      state({
        invoices: [inv({ nullifier: 'n2' })],
        bestBids: [best({ nullifier: 'n2' })],
        insuranceClaims: [claim({ nullifier: 'n2' })],
      }),
      ME,
    );
    expect(defaulted.positions[0].status).toBe('defaulted');
    // A defaulted position contributes nothing to contracted return.
    expect(defaulted.contractedReturn).toBe(0n);
  });

  it('sums exposure and computes the concentration ratio across positions', () => {
    const portfolio = buildLenderPortfolio(
      state({
        invoices: [inv({ nullifier: 'n1' }), inv({ nullifier: 'n2' })],
        bestBids: [
          best({ nullifier: 'n1', amount: 400n }),
          best({ nullifier: 'n2', amount: 1600n }),
        ],
      }),
      ME,
    );

    expect(portfolio.issuedExposure).toBe(2000n);
    expect(portfolio.invoiceCount).toBe(2);
    // Largest (1600) / total (2000) = 0.8
    expect(portfolio.concentrationRate).toBeCloseTo(0.8, 10);
    expect(portfolio.contractedReturn).toBe(80n); // (400+1600)*400/10000
  });
});

describe('buildLenderPortfolio — pool slots', () => {
  it('maps my pool slot to its invoice via the derived slot key', () => {
    const key1 = slotKey(N_POOL, 1);
    const portfolio = buildLenderPortfolio(
      state({
        invoices: [inv({ nullifier: N_POOL, splitCount: 2n, invoiceAmount: 5000n, amount: 5200n, dueDate: 500n })],
        poolBids: [pool({ slotKey: key1 })],
      }),
      ME,
    );

    expect(portfolio.poolCount).toBe(1);
    expect(portfolio.invoiceCount).toBe(1);
    expect(portfolio.positions[0]).toMatchObject({
      kind: 'pool',
      nullifier: N_POOL,
      slotIndex: 1,
      slotKey: key1,
      faceAmount: 5000n,
      totalPayout: 5200n,
      dueDate: 500n,
      status: 'active',
      myPayout: null,
    });
    // Pool principal is confidential: it never enters the exposure sum.
    expect(portfolio.issuedExposure).toBe(0n);
    expect(portfolio.hasPoolPositions).toBe(true);
  });

  it('surfaces my browser-local payout when this wallet recorded one', () => {
    const key1 = slotKey(N_POOL, 0);
    const portfolio = buildLenderPortfolio(
      state({
        invoices: [inv({ nullifier: N_POOL, splitCount: 4n, lender: '0x00', amount: 4000n })],
        poolBids: [pool({ slotKey: key1 })],
      }),
      ME,
      new Map([[key1, 1400n]]),
    );

    const pos = portfolio.positions[0];
    if (pos.kind !== 'pool') throw new Error('expected a pool position');
    expect(pos.myPayout).toBe(1400n);
    expect(portfolio.knownPoolPayouts).toBe(1400n);
    expect(pos.status).toBe('settled');
  });

  it('marks a pool invoice defaulted when the insurance claim is keyed by slot', () => {
    const key1 = slotKey(N_POOL, 2);
    const portfolio = buildLenderPortfolio(
      state({
        invoices: [inv({ nullifier: N_POOL, splitCount: 4n })],
        poolBids: [pool({ slotKey: key1 })],
        insuranceClaims: [claim({ nullifier: key1 })],
      }),
      ME,
    );

    expect(portfolio.positions[0].status).toBe('defaulted');
    expect(portfolio.defaultedCount).toBe(1);
  });

  it('never double-counts a pool invoice as a single-lender position', () => {
    const key0 = slotKey(N_POOL, 0);
    const portfolio = buildLenderPortfolio(
      state({
        invoices: [inv({ nullifier: N_POOL, splitCount: 4n })],
        // A stale bestBid for a pool invoice must NOT become a single position.
        bestBids: [best({ nullifier: N_POOL, amount: 900n })],
        poolBids: [pool({ slotKey: key0 })],
      }),
      ME,
    );

    expect(portfolio.singleCount).toBe(0);
    expect(portfolio.poolCount).toBe(1);
    expect(portfolio.issuedExposure).toBe(0n);
  });

  it('keeps other lenders’ pool slots out even on my invoices', () => {
    const key1 = slotKey(N_POOL, 1);
    const portfolio = buildLenderPortfolio(
      state({
        invoices: [inv({ nullifier: N_POOL, splitCount: 4n })],
        poolBids: [pool({ slotKey: key1, lender: OTHER })],
      }),
      ME,
    );

    expect(portfolio.positions).toEqual([]);
  });
});

describe('buildLenderPortfolio — mixed single + pool', () => {
  it('combines single positions with pool slots across multiple invoices', () => {
    const keyA = slotKey(N_POOL, 3);
    const portfolio = buildLenderPortfolio(
      state({
        invoices: [
          inv({ nullifier: N_POOL, splitCount: 4n, invoiceAmount: 6000n, amount: 6200n }),
          inv({ nullifier: N_SINGLE, invoiceAmount: 3000n }),
        ],
        bestBids: [best({ nullifier: N_SINGLE, amount: 3000n })],
        poolBids: [pool({ slotKey: keyA })],
      }),
      ME,
    );

    expect(portfolio.singleCount).toBe(1);
    expect(portfolio.poolCount).toBe(1);
    expect(portfolio.positions).toHaveLength(2);
    const kinds = portfolio.positions.map((p) => p.kind).sort();
    expect(kinds).toEqual(['pool', 'single']);
    expect(portfolio.invoiceCount).toBe(2);
    // Only the public single amount is exposed; the pool share stays confidential.
    expect(portfolio.issuedExposure).toBe(3000n);
    expect(portfolio.hasPoolPositions).toBe(true);
    expect(portfolio.concentrationRate).toBe(1);
  });
});

describe('buildLenderPortfolio — empty', () => {
  it('returns zeros and a null concentration rate when I hold nothing', () => {
    const portfolio = buildLenderPortfolio(
      state({
        invoices: [inv({ nullifier: 'n1' })],
        bestBids: [best({ nullifier: 'n1', lender: OTHER })],
      }),
      ME,
    );

    expect(portfolio.positions).toEqual([]);
    expect(portfolio.singleCount).toBe(0);
    expect(portfolio.poolCount).toBe(0);
    expect(portfolio.invoiceCount).toBe(0);
    expect(portfolio.issuedExposure).toBe(0n);
    expect(portfolio.contractedReturn).toBe(0n);
    expect(portfolio.concentrationRate).toBeNull();
    expect(portfolio.hasPoolPositions).toBe(false);
  });
});
