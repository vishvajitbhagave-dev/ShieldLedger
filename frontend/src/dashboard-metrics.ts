// Real-time analytics dashboard metrics — pure, off-chain calculations.
//
// Reads raw ledger data (InvoiceView[], InsuranceClaimView[], pool balance)
// and computes platform health metrics. Every function is side-effect-free
// and designed for easy unit testing. Zero-denominator cases return null
// (meaning "not enough data yet") instead of NaN, Infinity, or a crash.

import type { InvoiceView, InsuranceClaimView, InsurancePoolView } from './shield-ledger-types.js';
import { insuranceContribution } from '../../src/insurance.js';

export interface DashboardMetrics {
  /** Total invoices registered on-chain. */
  readonly totalInvoices: number;
  /** Invoices that were settled (lender recorded). */
  readonly settledInvoices: number;
  /** Invoices that defaulted (insurance claim filed). */
  readonly defaultedInvoices: number;
  /** Default rate as a percentage (0–100), or null if no invoices exist. */
  readonly defaultRate: number | null;

  /** Current insurance pool balance. */
  readonly poolBalance: bigint;
  /** Total premiums collected (Σ invoiceAmount / 50). */
  readonly totalPremiums: bigint;
  /** Total payouts made to claimants. */
  readonly totalPayouts: bigint;
  /** Pool utilization: totalPayouts / totalPremiums × 100, or null if no premiums. */
  readonly poolUtilization: number | null;

  /** Total financed amount across settled invoices. */
  readonly totalExposure: bigint;
  /** Coverage ratio: poolBalance / totalExposure × 100, or null if no exposure. */
  readonly coverageRatio: number | null;
}

/**
 * Compute all dashboard metrics from raw ledger data.
 *
 * @param invoices        All invoice entries from the ledger.
 * @param insuranceClaims All insurance claim entries from the ledger.
 * @param insurancePool   The current pool state (null if pool not yet seeded).
 */
export function computeDashboardMetrics(
  invoices: readonly InvoiceView[],
  insuranceClaims: readonly InsuranceClaimView[],
  insurancePool: InsurancePoolView | null,
): DashboardMetrics {
  const totalInvoices = invoices.length;
  const defaultedInvoices = insuranceClaims.length;
  const settledInvoices = invoices.filter((inv) => inv.lender !== null).length;

  // Default rate
  const defaultRate: number | null =
    totalInvoices > 0 ? (defaultedInvoices / totalInvoices) * 100 : null;

  // Pool data
  const poolBalance = insurancePool?.balance ?? 0n;
  const totalPremiums = invoices.reduce(
    (sum, inv) => sum + insuranceContribution(inv.invoiceAmount),
    0n,
  );
  const totalPayouts = insuranceClaims.reduce((sum, c) => sum + c.payout, 0n);

  // Pool utilization
  const poolUtilization: number | null =
    totalPremiums > 0n ? Number((totalPayouts * 10000n) / totalPremiums) / 100 : null;

  // Exposure and coverage
  const totalExposure = invoices
    .filter((inv) => inv.lender !== null)
    .reduce((sum, inv) => sum + inv.amount, 0n);

  const coverageRatio: number | null =
    totalExposure > 0n ? Number((poolBalance * 10000n) / totalExposure) / 100 : null;

  return {
    totalInvoices,
    settledInvoices,
    defaultedInvoices,
    defaultRate,
    poolBalance,
    totalPremiums,
    totalPayouts,
    poolUtilization,
    totalExposure,
    coverageRatio,
  };
}
