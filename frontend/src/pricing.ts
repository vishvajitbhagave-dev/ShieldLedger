// Dynamic Interest Rate Pricing Engine — off-chain, informational only.
//
// Suggests a fair interest-rate range for a lender before they bid, based on
// PUBLIC on-chain data: the SME's creditThreshold, reputationThreshold, and
// the invoice's face amount. No private state is read; no contract calls are
// made; the output is a non-binding suggestion — lenders may bid any rate.
//
// If a due-date estimate is available (local only, not on-chain), a small
// time-to-maturity adjustment is applied and the result is labelled
// "estimated". When no due-date is provided the adjustment is simply omitted.

export interface SuggestedRate {
  /** Mid-point of the suggested range, in basis points. */
  readonly midBps: number;
  /** Lower bound of the suggested range, in basis points (floor: 100 = 1%). */
  readonly lowBps: number;
  /** Upper bound of the suggested range, in basis points. */
  readonly highBps: number;
  /** True when a dueDateEstimate was used (label as "estimate" in UI). */
  readonly estimated: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────
const BASE_RATE_BPS = 500;          // 5.0%
const HALF_RANGE_BPS = 50;          // ±0.50% around mid
const FLOOR_BPS = 100;              // 1.0% minimum

// Per-point weights for each factor.
const CREDIT_BPS_PER_POINT = 1.0;   // 1 bps per point away from 750
const REPUTATION_BPS_PER_POINT = 2.0; // 2 bps per point away from 50
const INVOICE_LOG_FACTOR = 25;      // log2(amount / 10k) × 25 bps

// Time-to-maturity adjustment (only when dueDateEstimate is provided).
const TIME_LOG_FACTOR = 10;         // log2(days / 30) × 10 bps
const SECONDS_PER_DAY = 86_400;
const REFERENCE_DAYS = 30;          // 30 days = 0 adjustment

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute a suggested fair interest-rate range for an invoice.
 *
 * @param creditThreshold   The SME's public credit bound (e.g. 650–900).
 * @param reputationThreshold The SME's public reputation bound (0–100).
 * @param invoiceAmount     The invoice face amount (in smallest currency unit).
 * @param dueDateEstimate   Optional Unix-seconds due date (local, not on-chain).
 *                           When provided the result is labelled "estimated".
 * @returns Suggested rate range in basis points.
 */
export function getSuggestedRate(
  creditThreshold: number | bigint,
  reputationThreshold: number | bigint,
  invoiceAmount: number | bigint,
  dueDateEstimate?: number | bigint,
): SuggestedRate {
  const credit = Number(creditThreshold);
  const reputation = Number(reputationThreshold);
  const amount = Number(invoiceAmount);

  const creditAdj = (750 - credit) * CREDIT_BPS_PER_POINT;
  const reputationAdj = (50 - reputation) * REPUTATION_BPS_PER_POINT;

  // log2-based: doubling the reference (10k) adds 25 bps.
  let invoiceAdj = 0;
  if (amount > 0) {
    invoiceAdj = Math.log2(amount / 10_000) * INVOICE_LOG_FACTOR;
  }

  // Optional time-to-maturity adjustment (best-effort).
  let timeAdj = 0;
  let estimated = false;
  if (dueDateEstimate !== undefined && dueDateEstimate !== null) {
    const nowSec = Math.floor(Date.now() / 1000);
    const dueSec = Number(dueDateEstimate);
    const daysToDue = Math.max(0, (dueSec - nowSec) / SECONDS_PER_DAY);
    if (daysToDue > 0) {
      timeAdj = Math.log2(daysToDue / REFERENCE_DAYS) * TIME_LOG_FACTOR;
      // Only positive adjustments (longer tenor = more risk); negative means
      // already past due or very short — clamp to 0.
      timeAdj = Math.max(0, timeAdj);
    }
    estimated = true;
  }

  const midBps = BASE_RATE_BPS + creditAdj + reputationAdj + invoiceAdj + timeAdj;
  const lowBps = Math.max(Math.round(midBps - HALF_RANGE_BPS), FLOOR_BPS);
  const highBps = Math.round(midBps + HALF_RANGE_BPS);

  return { midBps: Math.round(midBps), lowBps, highBps, estimated };
}
