// Default insurance pool for ShieldLedger.
//
// Every invoice registration pays a premium of exactly 2% of the face amount
// into ONE shared public pool. When a financed invoice defaults (past its due
// date and never settled), the current claim holder collects 50% of the
// financed amount from that pool — partially if the pool cannot cover it in
// full. The defaulting SME's identity never becomes public.
//
// The CONTRACT enforces every number in zero knowledge: the premium and the
// payout are disclosed by the caller but proven correct inside the circuit
// (verifyUnitQuotient proves floor(total/unit) without a division operator,
// which Compact does not have). This module is the single source of truth for
// those formulas on the wallet side, shared by the CLI, the frontend and the
// tests.
//
//   premium = floor(invoiceAmount / 50)      (= 2%, floored)
//   payout  = min(floor(financed / 2), pool) (= 50% of the financed amount,
//                                             capped by the pool balance)

/** Premium unit: floor(amount / 50) == 2% of the invoice's face amount. */
export const INSURANCE_PREMIUM_UNIT = 50n;

/** Payout unit: floor(amount / 2) == 50% of the financed amount. */
export const INSURANCE_PAYOUT_UNIT = 2n;

/**
 * The exact premium an SME owes at registration for an invoice of the given
 * face amount (bigint division floors, matching verifyUnitQuotient).
 */
export function insuranceContribution(invoiceAmount: bigint): bigint {
  return invoiceAmount / INSURANCE_PREMIUM_UNIT;
}

/**
 * The full entitlement (before any cap) for a defaulted invoice financed at
 * the given amount.
 */
export function fullInsurancePayout(financedAmount: bigint): bigint {
  return financedAmount / INSURANCE_PAYOUT_UNIT;
}

/**
 * The payout actually granted for a default: the full entitlement capped by
 * the pool balance at claim time (a thin pool pays partially).
 */
export function insurancePayoutFor(financedAmount: bigint, poolBalance: bigint): bigint {
  const entitlement = fullInsurancePayout(financedAmount);
  return entitlement <= poolBalance ? entitlement : poolBalance;
}

/** The pool entry's public balance (mirrors contracts' InsurancePool struct). */
export interface InsurancePoolState {
  readonly balance: bigint;
}

/**
 * The fixed domain-separated key under which the single shared pool entry is
 * stored (mirrors pad(32, "shieldledger:pool") in the contract).
 */
export function insurancePoolKey(): Uint8Array {
  const key = new Uint8Array(32);
  const label = Buffer.from('shieldledger:pool', 'utf8');
  if (label.length > 32) throw new Error('insurance pool key label too long');
  key.set(label, 0);
  return key;
}

/** A paid default-insurance claim record (mirrors the contract's struct). */
export interface InsuranceClaimView {
  readonly payout: bigint;
  readonly claimedAt: bigint;
}
