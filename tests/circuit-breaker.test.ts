import { describe, expect, it } from 'vitest';
import { computeCircuitBreakerStatus } from '../frontend/src/circuit-breaker.js';
import type { InvoiceView, InsuranceClaimView, InsurancePoolView } from '../frontend/src/shield-ledger-types.js';

function makeInvoice(overrides: Partial<InvoiceView> = {}): InvoiceView {
  return {
    nullifier: '00'.repeat(32),
    smeCommitment: '00'.repeat(32),
    creditThreshold: 650n,
    reputationThreshold: 0n,
    invoiceAmount: 1000n,
    buyerVerified: false,
    buyerCommitment: '00'.repeat(32),
    lender: null,
    amount: 0n,
    dueDate: 0n,
    rateBps: 500n,
    transferred: false,
    claimCommitment: '00'.repeat(32),
    splitCount: 0n,
    ...overrides,
  };
}

function makeClaim(overrides: Partial<InsuranceClaimView> = {}): InsuranceClaimView {
  return {
    nullifier: '01'.repeat(32),
    payout: 50n,
    claimedAt: 1000n,
    ...overrides,
  };
}

function makePool(balance: bigint): InsurancePoolView {
  return { balance };
}

function makeInvoices(count: number, invoiceAmount = 1000n): InvoiceView[] {
  return Array.from({ length: count }, (_, i) =>
    makeInvoice({
      nullifier: i.toString(16).padStart(64, '0'),
      invoiceAmount,
    }),
  );
}

describe('computeCircuitBreakerStatus', () => {
  it('returns healthy for empty data (no invoices)', () => {
    const status = computeCircuitBreakerStatus([], [], null);
    expect(status.health).toBe('healthy');
    expect(status.triggered).toHaveLength(0);
    expect(status.defaultRate).toBeNull();
    expect(status.poolUtilization).toBeNull();
    expect(status.coverageRatio).toBeNull();
    expect(status.payoutToPremiumRatio).toBeNull();
  });

  it('returns healthy when all metrics are within safe bounds', () => {
    // 10 invoices, 0 defaults → defaultRate = 0%
    // Premiums: 10 × 20 = 200 (invoiceAmount=1000 → premium = 20)
    // 0 claims → poolUtilization = 0%, payoutToPremiumRatio = 0
    // Pool: 500, Exposure: 500 (1 settled × amount=500) → coverage = 100%
    //   Wait, 500/500 = 100% which is ≤150% (warning!)
    // Pool: 2000, Exposure: 500 → coverage = 400% (>150%) ✓
    const invoices = [
      makeInvoice({
        nullifier: '00'.repeat(32),
        invoiceAmount: 1000n,
        lender: '0a'.repeat(32),
        amount: 500n,
      }),
      ...Array.from({ length: 9 }, (_, i) =>
        makeInvoice({ nullifier: (i + 1).toString(16).padStart(64, '0'), invoiceAmount: 1000n }),
      ),
    ];
    const pool = makePool(2000n);

    const status = computeCircuitBreakerStatus(invoices, [], pool);
    expect(status.health).toBe('healthy');
    expect(status.triggered).toHaveLength(0);
    expect(status.defaultRate).toBe(0);
  });

  // ── Default rate triggers ──

  it('triggers warning when default rate >= 15%', () => {
    // 20 invoices, 3 defaults = 15%
    const invoices = makeInvoices(20);
    const claims = Array.from({ length: 3 }, (_, i) =>
      makeClaim({ nullifier: (i + 100).toString(16).padStart(64, '0'), payout: 10n }),
    );

    const status = computeCircuitBreakerStatus(invoices, claims, null);
    expect(status.health).toBe('warning');
    expect(status.defaultRate).toBe(15);
    const names = status.triggered.map((t) => t.name);
    expect(names).toContain('defaultRate');
  });

  it('triggers critical when default rate >= 30%', () => {
    // 10 invoices, 3 defaults = 30%
    // Use small payouts so poolUtilization stays below warning threshold
    // Premiums: 10 × 20 = 200, Payouts: 3 × 10 = 30 → 15% utilization (safe)
    const invoices = makeInvoices(10);
    const claims = Array.from({ length: 3 }, (_, i) =>
      makeClaim({ nullifier: (i + 100).toString(16).padStart(64, '0'), payout: 10n }),
    );

    const status = computeCircuitBreakerStatus(invoices, claims, null);
    expect(status.health).toBe('critical');
    expect(status.defaultRate).toBe(30);
    const names = status.triggered.map((t) => t.name);
    expect(names).toContain('defaultRate');
    expect(status.triggered.find((t) => t.name === 'defaultRate')?.severity).toBe('critical');
  });

  // ── Pool utilization triggers ──

  it('triggers warning when pool utilization >= 60%', () => {
    // Premiums: 10 × 20 = 200, Payouts: 120 → 60%
    const invoices = makeInvoices(10);
    const claims = [makeClaim({ payout: 120n })];

    const status = computeCircuitBreakerStatus(invoices, claims, null);
    expect(status.health).toBe('warning');
    expect(status.poolUtilization).toBe(60);
    const names = status.triggered.map((t) => t.name);
    expect(names).toContain('poolUtilization');
  });

  it('triggers critical when pool utilization >= 85%', () => {
    // Premiums: 10 × 20 = 200, Payouts: 170 → 85%
    // payoutToPremiumRatio = 0.85 (below 0.9 critical, at warning 0.6 level)
    const invoices = makeInvoices(10);
    const claims = [makeClaim({ payout: 170n })];

    const status = computeCircuitBreakerStatus(invoices, claims, null);
    expect(status.health).toBe('critical');
    expect(status.poolUtilization).toBe(85);
    const names = status.triggered.map((t) => t.name);
    expect(names).toContain('poolUtilization');
  });

  // ── Coverage ratio triggers ──

  it('triggers warning when coverage ratio <= 150%', () => {
    // Pool: 150, Exposure: 100 (1 settled, amount=100) → coverage = 150%
    const invoices = [
      makeInvoice({
        nullifier: '00'.repeat(32),
        invoiceAmount: 1000n,
        lender: '0a'.repeat(32),
        amount: 100n,
      }),
    ];
    const pool = makePool(150n);

    const status = computeCircuitBreakerStatus(invoices, [], pool);
    expect(status.health).toBe('warning');
    expect(status.coverageRatio).toBe(150);
    expect(status.triggered[0].name).toBe('coverageRatio');
  });

  it('triggers critical when coverage ratio <= 100%', () => {
    // Pool: 80, Exposure: 100 → coverage = 80%
    const invoices = [
      makeInvoice({
        nullifier: '00'.repeat(32),
        invoiceAmount: 1000n,
        lender: '0a'.repeat(32),
        amount: 100n,
      }),
    ];
    const pool = makePool(80n);

    const status = computeCircuitBreakerStatus(invoices, [], pool);
    expect(status.health).toBe('critical');
    expect(status.coverageRatio).toBe(80);
    expect(status.triggered[0].name).toBe('coverageRatio');
    expect(status.triggered[0].severity).toBe('critical');
  });

  // ── Payout-to-premium ratio triggers ──

  it('triggers warning when payout-to-premium ratio >= 0.6', () => {
    // poolUtilization and payoutToPremiumRatio are the same underlying metric,
    // so both trigger at the same data point. Verify both are present.
    // Premiums: 10 × 20 = 200, Payouts: 120 → ratio = 0.60
    const invoices = makeInvoices(10);
    const claims = [makeClaim({ payout: 120n })];

    const status = computeCircuitBreakerStatus(invoices, claims, null);
    expect(status.health).toBe('warning');
    expect(status.payoutToPremiumRatio).toBe(0.6);
    const names = status.triggered.map((t) => t.name);
    expect(names).toContain('payoutToPremiumRatio');
    expect(names).toContain('poolUtilization');
  });

  it('triggers critical when payout-to-premium ratio >= 0.9', () => {
    // Premiums: 10 × 20 = 200, Payouts: 180 → ratio = 0.90
    // poolUtilization is also critical at 90% (≥85%)
    const invoices = makeInvoices(10);
    const claims = [makeClaim({ payout: 180n })];

    const status = computeCircuitBreakerStatus(invoices, claims, null);
    expect(status.health).toBe('critical');
    expect(status.payoutToPremiumRatio).toBe(0.9);
    const names = status.triggered.map((t) => t.name);
    expect(names).toContain('payoutToPremiumRatio');
  });

  // ── Worst-of logic ──

  it('picks the highest severity when multiple conditions trigger', () => {
    // Setup: default rate warning (15%) + pool utilization critical (85%)
    // 20 invoices, 3 defaults = 15% (warning)
    // Premiums: 20 × 20 = 400, Payouts: 340+10+10=360 → 90% (critical)
    const invoices = makeInvoices(20);
    const claims = [
      makeClaim({ nullifier: 'aa'.repeat(32), payout: 340n }),
      makeClaim({ nullifier: 'bb'.repeat(32), payout: 10n }),
      makeClaim({ nullifier: 'cc'.repeat(32), payout: 10n }),
    ];

    const status = computeCircuitBreakerStatus(invoices, claims, null);
    expect(status.health).toBe('critical');
    expect(status.triggered.length).toBeGreaterThanOrEqual(2);

    const severities = status.triggered.map((t) => t.severity);
    expect(severities).toContain('critical');
  });

  // ── Edge cases ──

  it('treats null metrics as healthy (insufficient data)', () => {
    const status = computeCircuitBreakerStatus([], [], null);
    expect(status.health).toBe('healthy');
    expect(status.defaultRate).toBeNull();
    expect(status.poolUtilization).toBeNull();
    expect(status.coverageRatio).toBeNull();
    expect(status.payoutToPremiumRatio).toBeNull();
  });

  it('handles pool not seeded but invoices exist', () => {
    // Pool is null → coverageRatio is null, poolUtilization is null
    // But premiums exist (non-null), so payoutToPremiumRatio = 0 (healthy)
    const invoices = makeInvoices(5);
    const status = computeCircuitBreakerStatus(invoices, [], null);
    expect(status.health).toBe('healthy');
    expect(status.poolUtilization).toBe(0);
    expect(status.coverageRatio).toBeNull();
    expect(status.payoutToPremiumRatio).toBe(0);
  });

  it('handles settled invoices with zero exposure (amount = 0)', () => {
    // Settled but amount=0 → totalExposure=0 → coverageRatio=null → healthy
    const invoices = [
      makeInvoice({
        nullifier: '00'.repeat(32),
        invoiceAmount: 1000n,
        lender: '0a'.repeat(32),
        amount: 0n,
      }),
    ];
    const pool = makePool(100n);
    const status = computeCircuitBreakerStatus(invoices, [], pool);
    expect(status.health).toBe('healthy');
    expect(status.coverageRatio).toBeNull();
  });

  it('returns exactly 0 triggered conditions when healthy', () => {
    // 10 invoices, no defaults, pool = 5000, 1 settled with amount=100
    // defaultRate = 0%, utilization = 0%, coverage = 5000/100×100 = 5000%
    const invoices = [
      makeInvoice({
        nullifier: '00'.repeat(32),
        invoiceAmount: 2000n,
        lender: '0a'.repeat(32),
        amount: 100n,
      }),
      ...Array.from({ length: 9 }, (_, i) =>
        makeInvoice({ nullifier: (i + 1).toString(16).padStart(64, '0'), invoiceAmount: 2000n }),
      ),
    ];
    const pool = makePool(5000n);
    const status = computeCircuitBreakerStatus(invoices, [], pool);
    expect(status.triggered).toHaveLength(0);
    expect(status.health).toBe('healthy');
  });
});
