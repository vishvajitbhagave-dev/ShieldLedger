import { describe, it, expect } from 'vitest';
import { computeDashboardMetrics } from '../frontend/src/dashboard-metrics.js';
import type { InvoiceView, InsuranceClaimView } from '../frontend/src/shield-ledger-types.js';

// Minimal InvoiceView factory — only fields the metrics module reads.
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

function claim(overrides: Partial<InsuranceClaimView> & { nullifier: string }): InsuranceClaimView {
  return {
    payout: 0n,
    claimedAt: 0n,
    ...overrides,
  };
}

describe('computeDashboardMetrics', () => {
  it('returns all-null metrics for empty data', () => {
    const m = computeDashboardMetrics([], [], null);
    expect(m.totalInvoices).toBe(0);
    expect(m.settledInvoices).toBe(0);
    expect(m.defaultedInvoices).toBe(0);
    expect(m.defaultRate).toBeNull();
    expect(m.poolBalance).toBe(0n);
    expect(m.totalPremiums).toBe(0n);
    expect(m.totalPayouts).toBe(0n);
    expect(m.poolUtilization).toBeNull();
    expect(m.totalExposure).toBe(0n);
    expect(m.coverageRatio).toBeNull();
  });

  it('computes default rate from mixed settled/defaulted invoices', () => {
    const invoices = [
      inv({ nullifier: 'a', lender: 'lender1', amount: 500n, invoiceAmount: 10_000n }),
      inv({ nullifier: 'b', lender: 'lender2', amount: 300n, invoiceAmount: 20_000n }),
      inv({ nullifier: 'c', invoiceAmount: 5000n }), // not settled
      inv({ nullifier: 'd', lender: 'lender3', amount: 700n, invoiceAmount: 15_000n }),
    ];
    const claims = [claim({ nullifier: 'c', payout: 2500n })]; // 1 default
    const m = computeDashboardMetrics(invoices, claims, { balance: 500n });

    expect(m.totalInvoices).toBe(4);
    expect(m.settledInvoices).toBe(3);
    expect(m.defaultedInvoices).toBe(1);
    expect(m.defaultRate).toBe(25); // 1/4 = 25%
  });

  it('handles all-settled (zero defaults)', () => {
    const invoices = [
      inv({ nullifier: 'a', lender: 'l1', amount: 1000n, invoiceAmount: 50_000n }),
      inv({ nullifier: 'b', lender: 'l2', amount: 2000n, invoiceAmount: 30_000n }),
    ];
    const m = computeDashboardMetrics(invoices, [], { balance: 1000n });
    expect(m.defaultRate).toBe(0);
    expect(m.defaultedInvoices).toBe(0);
  });

  it('handles all-defaulted (every invoice has a claim)', () => {
    const invoices = [
      inv({ nullifier: 'a', invoiceAmount: 10_000n }),
      inv({ nullifier: 'b', invoiceAmount: 20_000n }),
    ];
    const claims = [
      claim({ nullifier: 'a', payout: 5000n }),
      claim({ nullifier: 'b', payout: 10_000n }),
    ];
    const m = computeDashboardMetrics(invoices, claims, { balance: 0n });
    expect(m.defaultRate).toBe(100);
  });

  it('computes pool utilization correctly', () => {
    // 3 invoices: 10k, 20k, 30k → premiums: 200 + 400 + 600 = 1200
    const invoices = [
      inv({ nullifier: 'a', invoiceAmount: 10_000n }),
      inv({ nullifier: 'b', invoiceAmount: 20_000n }),
      inv({ nullifier: 'c', invoiceAmount: 30_000n }),
    ];
    const claims = [claim({ nullifier: 'a', payout: 200n })];
    const m = computeDashboardMetrics(invoices, claims, { balance: 1000n });

    expect(m.totalPremiums).toBe(1200n); // 200 + 400 + 600
    expect(m.totalPayouts).toBe(200n);
    expect(m.poolUtilization).toBeCloseTo(16.67, 1); // 200/1200 ≈ 16.67%
  });

  it('pool utilization is null when no premiums exist', () => {
    const m = computeDashboardMetrics([], [], { balance: 0n });
    expect(m.poolUtilization).toBeNull();
  });

  it('computes coverage ratio correctly', () => {
    const invoices = [
      inv({ nullifier: 'a', lender: 'l1', amount: 5000n, invoiceAmount: 10_000n }),
      inv({ nullifier: 'b', lender: 'l2', amount: 5000n, invoiceAmount: 10_000n }),
    ];
    const m = computeDashboardMetrics(invoices, [], { balance: 5000n });
    // totalExposure = 10000, poolBalance = 5000 → coverage = 50%
    expect(m.totalExposure).toBe(10_000n);
    expect(m.coverageRatio).toBe(50);
  });

  it('coverage ratio is null when no exposure exists', () => {
    const invoices = [inv({ nullifier: 'a', invoiceAmount: 10_000n })]; // not settled
    const m = computeDashboardMetrics(invoices, [], { balance: 1000n });
    expect(m.totalExposure).toBe(0n);
    expect(m.coverageRatio).toBeNull();
  });

  it('handles null insurance pool gracefully', () => {
    const invoices = [inv({ nullifier: 'a', invoiceAmount: 10_000n })];
    const m = computeDashboardMetrics(invoices, [], null);
    expect(m.poolBalance).toBe(0n);
    expect(m.totalPremiums).toBe(200n); // floor(10000/50)
  });

  it('pool utilization at 100% when all premiums paid out', () => {
    const invoices = [inv({ nullifier: 'a', invoiceAmount: 10_000n })];
    const claims = [claim({ nullifier: 'a', payout: 200n })]; // full premium
    const m = computeDashboardMetrics(invoices, claims, { balance: 0n });
    expect(m.poolUtilization).toBe(100);
  });
});
