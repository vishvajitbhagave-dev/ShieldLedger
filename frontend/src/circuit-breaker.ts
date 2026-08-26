// Automated Market Health Monitoring — off-chain anomaly detection.
//
// Reads raw ledger data (InvoiceView[], InsuranceClaimView[], pool balance)
// and computes a platform health status: healthy, warning, or critical.
// Pure, side-effect-free functions with the same zero-denominator handling
// as dashboard-metrics.ts (null = "not enough data" = treated as healthy).
//
// Thresholds:
//   Default rate:         warning >= 15%, critical >= 30%
//   Pool utilization:     warning >= 60%, critical >= 85%
//   Coverage ratio:       warning <= 150%, critical <= 100%
//   Payout-to-premium:    warning >= 0.6,  critical >= 0.9
//
// Health status = worst-of across all triggered conditions.

import type { InvoiceView, InsuranceClaimView, InsurancePoolView } from './shield-ledger-types.js';
import { insuranceContribution } from '../../src/insurance.js';

export type Severity = 'healthy' | 'warning' | 'critical';

export interface TriggeredCondition {
  readonly name: string;
  readonly severity: Severity;
  readonly detail: string;
}

export interface CircuitBreakerStatus {
  readonly health: Severity;
  readonly defaultRate: number | null;
  readonly poolUtilization: number | null;
  readonly coverageRatio: number | null;
  readonly payoutToPremiumRatio: number | null;
  readonly triggered: TriggeredCondition[];
}

function maxSeverity(a: Severity, b: Severity): Severity {
  if (a === 'critical' || b === 'critical') return 'critical';
  if (a === 'warning' || b === 'warning') return 'warning';
  return 'healthy';
}

/**
 * Compute the circuit-breaker health status from raw ledger data.
 *
 * @param invoices        All invoice entries from the ledger.
 * @param insuranceClaims All insurance claim entries from the ledger.
 * @param insurancePool   The current pool state (null if pool not yet seeded).
 */
export function computeCircuitBreakerStatus(
  invoices: readonly InvoiceView[],
  insuranceClaims: readonly InsuranceClaimView[],
  insurancePool: InsurancePoolView | null,
): CircuitBreakerStatus {
  const totalInvoices = invoices.length;
  const defaultedInvoices = insuranceClaims.length;
  const settledInvoices = invoices.filter((inv) => inv.lender !== null).length;

  // Derived metrics (same computation as dashboard-metrics.ts)
  const poolBalance = insurancePool?.balance ?? 0n;
  const totalPremiums = invoices.reduce(
    (sum, inv) => sum + insuranceContribution(inv.invoiceAmount),
    0n,
  );
  const totalPayouts = insuranceClaims.reduce((sum, c) => sum + c.payout, 0n);
  const totalExposure = invoices
    .filter((inv) => inv.lender !== null)
    .reduce((sum, inv) => sum + inv.amount, 0n);

  // Compute raw ratios (null = insufficient data)
  const defaultRate: number | null =
    totalInvoices > 0 ? (defaultedInvoices / totalInvoices) * 100 : null;

  const poolUtilization: number | null =
    totalPremiums > 0n ? Number((totalPayouts * 10000n) / totalPremiums) / 100 : null;

  const coverageRatio: number | null =
    totalExposure > 0n ? Number((poolBalance * 10000n) / totalExposure) / 100 : null;

  const payoutToPremiumRatio: number | null =
    totalPremiums > 0n ? Number((totalPayouts * 10000n) / totalPremiums) / 10000 : null;

  // Evaluate each condition
  const triggered: TriggeredCondition[] = [];
  let health: Severity = 'healthy';

  // 1. Default rate
  if (defaultRate !== null) {
    if (defaultRate >= 30) {
      const cond: TriggeredCondition = {
        name: 'defaultRate',
        severity: 'critical',
        detail: `Default rate ${defaultRate.toFixed(1)}% exceeds critical threshold (30%)`,
      };
      triggered.push(cond);
      health = maxSeverity(health, cond.severity);
    } else if (defaultRate >= 15) {
      const cond: TriggeredCondition = {
        name: 'defaultRate',
        severity: 'warning',
        detail: `Default rate ${defaultRate.toFixed(1)}% exceeds warning threshold (15%)`,
      };
      triggered.push(cond);
      health = maxSeverity(health, cond.severity);
    }
  }

  // 2. Pool utilization
  if (poolUtilization !== null) {
    if (poolUtilization >= 85) {
      const cond: TriggeredCondition = {
        name: 'poolUtilization',
        severity: 'critical',
        detail: `Pool utilization ${poolUtilization.toFixed(1)}% exceeds critical threshold (85%)`,
      };
      triggered.push(cond);
      health = maxSeverity(health, cond.severity);
    } else if (poolUtilization >= 60) {
      const cond: TriggeredCondition = {
        name: 'poolUtilization',
        severity: 'warning',
        detail: `Pool utilization ${poolUtilization.toFixed(1)}% exceeds warning threshold (60%)`,
      };
      triggered.push(cond);
      health = maxSeverity(health, cond.severity);
    }
  }

  // 3. Coverage ratio (lower is worse)
  if (coverageRatio !== null) {
    if (coverageRatio <= 100) {
      const cond: TriggeredCondition = {
        name: 'coverageRatio',
        severity: 'critical',
        detail: `Coverage ratio ${coverageRatio.toFixed(1)}% below critical threshold (100%)`,
      };
      triggered.push(cond);
      health = maxSeverity(health, cond.severity);
    } else if (coverageRatio <= 150) {
      const cond: TriggeredCondition = {
        name: 'coverageRatio',
        severity: 'warning',
        detail: `Coverage ratio ${coverageRatio.toFixed(1)}% below warning threshold (150%)`,
      };
      triggered.push(cond);
      health = maxSeverity(health, cond.severity);
    }
  }

  // 4. Payout-to-premium ratio
  if (payoutToPremiumRatio !== null) {
    if (payoutToPremiumRatio >= 0.9) {
      const cond: TriggeredCondition = {
        name: 'payoutToPremiumRatio',
        severity: 'critical',
        detail: `Payout-to-premium ratio ${payoutToPremiumRatio.toFixed(2)} exceeds critical threshold (0.90)`,
      };
      triggered.push(cond);
      health = maxSeverity(health, cond.severity);
    } else if (payoutToPremiumRatio >= 0.6) {
      const cond: TriggeredCondition = {
        name: 'payoutToPremiumRatio',
        severity: 'warning',
        detail: `Payout-to-premium ratio ${payoutToPremiumRatio.toFixed(2)} exceeds warning threshold (0.60)`,
      };
      triggered.push(cond);
      health = maxSeverity(health, cond.severity);
    }
  }

  return {
    health,
    defaultRate,
    poolUtilization,
    coverageRatio,
    payoutToPremiumRatio,
    triggered,
  };
}
