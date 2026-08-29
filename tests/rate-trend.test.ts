import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  averageRate,
  bucketize,
  bucketMsFor,
  creditBandCounts,
  creditBandOf,
  detectNewlyFinanced,
  recordFor,
  reputationBandOf,
  type RateTrendRecord,
} from '../frontend/src/rate-trend.js';
import {
  clearRateTrendRecords,
  loadRateTrendRecords,
  persistRateTrendRecords,
} from '../frontend/src/rate-trend-store.js';
import type { InvoiceView } from '../frontend/src/shield-ledger-types.js';

const N1 = `${'a'.repeat(63)}1`;
const N2 = `${'a'.repeat(63)}2`;
const N3 = `${'a'.repeat(63)}3`;

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

describe('creditBandOf / reputationBandOf — threshold bands', () => {
  it('maps attested credit bounds onto risk bands', () => {
    expect(creditBandOf(650n)).toBe('0–699');
    expect(creditBandOf(699n)).toBe('0–699');
    expect(creditBandOf(700n)).toBe('700–749');
    expect(creditBandOf(749n)).toBe('700–749');
    expect(creditBandOf(750n)).toBe('750–799');
    expect(creditBandOf(799n)).toBe('750–799');
    expect(creditBandOf(800n)).toBe('800–900');
    expect(creditBandOf(900n)).toBe('800–900');
  });

  it('maps reputation bounds onto low/high bands', () => {
    expect(reputationBandOf(0n)).toBe('0–49');
    expect(reputationBandOf(49n)).toBe('0–49');
    expect(reputationBandOf(50n)).toBe('50–100');
    expect(reputationBandOf(100n)).toBe('50–100');
  });
});

describe('detectNewlyFinanced — forward-only transition detection', () => {
  it('records an invoice that flips lender=null → financed with a public rate', () => {
    const prev = [inv({ nullifier: N1 })];
    const next = [inv({ nullifier: N1, lender: '0xWinner', amount: 900n, rateBps: 400n })];

    const transitions = detectNewlyFinanced(prev, next);
    expect(transitions).toEqual([
      {
        nullifier: N1,
        rateBps: 400n,
        creditThreshold: 0n,
        reputationThreshold: 0n,
        financedAmount: 900n,
      },
    ]);
  });

  it('skips invoices already financed in the previous state (no observed transition)', () => {
    const prev = [inv({ nullifier: N1, lender: '0xWinner', amount: 900n, rateBps: 400n })];
    const next = [inv({ nullifier: N1, lender: '0xWinner', amount: 900n, rateBps: 400n })];

    expect(detectNewlyFinanced(prev, next)).toEqual([]);
  });

  it('skips invoices absent from the previous state (financed before we saw them)', () => {
    const next = [inv({ nullifier: N1, lender: '0xWinner', rateBps: 400n })];
    expect(detectNewlyFinanced([], next)).toEqual([]);
  });

  it('never records pool-financed invoices (rateBs is 0, not public)', () => {
    const prev = [inv({ nullifier: N1, splitCount: 4n })];
    const next = [inv({ nullifier: N1, splitCount: 4n, lender: '0x00', amount: 5000n, rateBps: 0n })];
    expect(detectNewlyFinanced(prev, next)).toEqual([]);
  });

  it('detects multiple transitions within a single state update', () => {
    const prev = [inv({ nullifier: N1 }), inv({ nullifier: N2 })];
    const next = [
      inv({ nullifier: N1, lender: '0xW', amount: 900n, rateBps: 400n }),
      inv({ nullifier: N2, lender: '0xW', amount: 800n, rateBps: 500n }),
    ];
    const found = detectNewlyFinanced(prev, next);
    expect(found.map((t) => t.nullifier).sort()).toEqual([N1, N2]);
  });

  it('ignores untouched/registered-only invoices', () => {
    const prev = [inv({ nullifier: N1 }), inv({ nullifier: N2 })];
    const next = [
      inv({ nullifier: N1 }),
      inv({ nullifier: N2, lender: '0xW', rateBps: 400n }),
      inv({ nullifier: N3 }),
    ];
    expect(detectNewlyFinanced(prev, next).map((t) => t.nullifier)).toEqual([N2]);
  });
});

describe('recordFor — durable local record', () => {
  it('stamps the observation wall-clock time and derives bands', () => {
    const record = recordFor(
      { nullifier: N1, rateBps: 450n, creditThreshold: 750n, reputationThreshold: 60n, financedAmount: 900n },
      1_700_000_000_000,
    );
    expect(record).toEqual({
      nullifier: N1,
      observedAtMs: 1_700_000_000_000,
      rateBps: 450n,
      creditThreshold: 750n,
      reputationThreshold: 60n,
      creditBand: '750–799',
      reputationBand: '50–100',
      financedAmount: 900n,
    });
  });
});

describe('aggregation — averages, band counts, buckets', () => {
  const base = {
    nullifier: N1,
    observedAtMs: 1_700_000_000_000,
    rateBps: 400n,
    creditThreshold: 700n,
    reputationThreshold: 50n,
    creditBand: '700–749' as const,
    reputationBand: '50–100' as const,
    financedAmount: 1000n,
  };

  it('averageRate floors the mean and returns null for nothing', () => {
    expect(averageRate([])).toBeNull();
    expect(averageRate([base, { ...base, nullifier: N2, rateBps: 500n }])).toBe(450n);
    expect(averageRate([{ ...base, rateBps: 401n }])).toBe(401n);
  });

  it('creditBandCounts lists present bands in canonical order', () => {
    const counts = creditBandCounts([
      base,
      { ...base, nullifier: N2, creditThreshold: 750n, creditBand: '750–799' as const },
      { ...base, nullifier: N3, creditThreshold: 650n, creditBand: '0–699' as const },
    ]);
    expect(counts).toEqual([
      { band: '0–699', count: 1 },
      { band: '700–749', count: 1 },
      { band: '750–799', count: 1 },
    ]);
  });

  it('bucketize groups into aligned, ordered buckets with averaging', () => {
    const hour = 3_600_000;
    const alignedStart = Math.floor(1_700_000_000_000 / hour) * hour;
    const records: RateTrendRecord[] = [
      { ...base, observedAtMs: 1_700_000_000_000 },
      { ...base, observedAtMs: 1_700_000_000_000 + 60_000, rateBps: 600n, nullifier: N2 },
      // One hour later (same aligned grid, next bucket).
      { ...base, observedAtMs: 1_700_000_000_000 + hour + 60_000, rateBps: 500n, nullifier: N3 },
    ];
    const buckets = bucketize(records, hour);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toEqual({ startMs: alignedStart, count: 2, avgRateBps: 500n });
    expect(buckets[1]).toEqual({ startMs: alignedStart + hour, count: 1, avgRateBps: 500n });
    expect(buckets[0].startMs % hour).toBe(0);
    expect(buckets[1].startMs % hour).toBe(0);
  });

  it('bucketMsFor adapts the bucket width to the record span', () => {
    const hour = 3_600_000;
    expect(bucketMsFor([])).toBe(hour);
    expect(bucketMsFor([base])).toBe(hour);
    // ~2 days span → hourly.
    const twoDays: RateTrendRecord[] = [base, { ...base, observedAtMs: base.observedAtMs + 2 * 86_400_000, nullifier: N2 }];
    expect(bucketMsFor(twoDays)).toBe(hour);
    // ~10 days → 6-hourly.
    const tenDays: RateTrendRecord[] = [base, { ...base, observedAtMs: base.observedAtMs + 10 * 86_400_000, nullifier: N2 }];
    expect(bucketMsFor(tenDays)).toBe(6 * hour);
    // ~30 days → daily.
    const thirtyDays: RateTrendRecord[] = [base, { ...base, observedAtMs: base.observedAtMs + 30 * 86_400_000, nullifier: N2 }];
    expect(bucketMsFor(thirtyDays)).toBe(86_400_000);
  });
});

describe('rate-trend-store — browser-local persistence', () => {
  const records: RateTrendRecord[] = [
    {
      nullifier: N1,
      observedAtMs: 1_700_000_000_000,
      rateBps: 400n,
      creditThreshold: 700n,
      reputationThreshold: 50n,
      creditBand: '700–749',
      reputationBand: '50–100',
      financedAmount: 1000n,
    },
  ];

  const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });

  afterEach(() => {
    if (originalLocalStorage === undefined) {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    } else {
      (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
    }
  });

  it('persists and round-trips records (bigint fields via strings)', () => {
    persistRateTrendRecords(records);
    expect(loadRateTrendRecords()).toEqual(records);
  });

  it('clears persisted records', () => {
    persistRateTrendRecords(records);
    clearRateTrendRecords();
    expect(loadRateTrendRecords()).toEqual([]);
  });

  it('is empty and never throws without storage', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(loadRateTrendRecords()).toEqual([]);
    expect(() => persistRateTrendRecords(records)).not.toThrow();
    expect(() => clearRateTrendRecords()).not.toThrow();
  });

  it('drops malformed stored entries instead of crashing', () => {
    localStorage.setItem(
      'shieldledger.rateTrend',
      JSON.stringify([
        { bogus: true },
        {
          nullifier: N1,
          observedAtMs: 1_700_000_000_000,
          rateBps: '400',
          creditThreshold: '700',
          reputationThreshold: '50',
          creditBand: '700–749',
          reputationBand: '50–100',
          financedAmount: '1000',
        },
      ]),
    );
    expect(loadRateTrendRecords()).toEqual(records);
  });
});