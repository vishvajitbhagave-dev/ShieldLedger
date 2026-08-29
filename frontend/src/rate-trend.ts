// Forward-only, browser-local "winning rate over time" trend tracking.
//
// PURE transformations. This module does NOT read the chain directly - it
// turns a detected financing transition (supplied by the observer hook) into a
// durable local record, and turns records into chart-ready buckets.
//
// WHY THIS EXISTS / WHAT IT IS (honest framing):
//   - `bestBids` keeps only the CURRENT winning bid per invoice and carries no
//     reveal/settlement timestamp (`contracts/shield-ledger.compact:487`), so
//     the contract retains no public history of winning rates over time. An
//     indexer service could capture it, but that was explicitly declined in
//     docs/TRUST_AND_DATA_PROVENANCE.md §3 (introduces the app's only
//     off-chain trust boundary, category (c)).
//   - This module instead records a rate+timestamp ONLY when THIS browser
//     actually observes the on-chain transition of an invoice becoming
//     financed. It can never reconstruct the past: first observation is a
//     baseline that records nothing. The result is a labeled, forward-only
//     trend ("observed since these records began"), never a complete history.
//   - Only single-lender invoices are recorded: pool-settled invoices store
//     rateBps: 0 (`contracts/shield-ledger.compact:652`) - their rate is not
//     public, so including them would be fabricated.
//
// "Similar risk" is grouped by the PUBLIC creditThreshold/reputationThreshold
// (the attested lower bounds an SME proved in ZK, at registration). Same
// inputs the pricing engine already uses (`frontend/src/pricing.ts`) - the
// bands are honest proxies for risk profile, never the SME's true private
// score.

import type { InvoiceView } from './shield-ledger-types.js';

/** One forward-only observed financing, as recorded by this browser. */
export interface RateTrendRecord {
  readonly nullifier: string;
  /** Unix-ms wall-clock when THIS browser observed the financing transition. */
  readonly observedAtMs: number;
  /** Public financing rate in basis points (single-lender invoices only). */
  readonly rateBps: bigint;
  /** SME's public credit lower bound (attested in ZK at registration). */
  readonly creditThreshold: bigint;
  /** SME's public reputation lower bound (attested in ZK at registration). */
  readonly reputationThreshold: bigint;
  readonly creditBand: CreditBand;
  readonly reputationBand: ReputationBand;
  /** Invoice `amount` at financing (the financed amount, public). */
  readonly financedAmount: bigint;
}

/** Credit-threshold bands (attested lower bound → label). */
export type CreditBand = '0–699' | '700–749' | '750–799' | '800–900';
export const CREDIT_BANDS: readonly CreditBand[] = ['0–699', '700–749', '750–799', '800–900'];

/** Reputation-threshold bands (attested lower bound → label). */
export type ReputationBand = '0–49' | '50–100';

/** The financing transition detected between two consecutive observed states. */
export interface FinancedTransition {
  readonly nullifier: string;
  readonly rateBps: bigint;
  readonly creditThreshold: bigint;
  readonly reputationThreshold: bigint;
  readonly financedAmount: bigint;
}

export function creditBandOf(threshold: bigint): CreditBand {
  const n = Number(threshold);
  if (n < 700) return '0–699';
  if (n < 750) return '700–749';
  if (n < 800) return '750–799';
  return '800–900';
}

export function reputationBandOf(threshold: bigint): ReputationBand {
  return Number(threshold) < 50 ? '0–49' : '50–100';
}

/**
 * Detects invoices that went from unbiddable/unfinanced (lender == null) to
 * financed with a PUBLIC single-lender rate, between two consecutive observed
 * states.
 *
 * Deliberately conservative (forward-only):
 *   - An invoice already financed in `prev` is skipped (we did not observe the
 *     transition, so no timestamp exists for it).
 *   - An invoice absent from `prev` is skipped (same reason - cannot know when
 *     it was financed).
 *   - Pool-financed invoices (splitCount > 0, rateBps == 0) are skipped: their
 *     rate is not public.
 */
export function detectNewlyFinanced(
  prev: readonly InvoiceView[],
  next: readonly InvoiceView[],
): FinancedTransition[] {
  const prevByNullifier = new Map(prev.map((i) => [i.nullifier, i]));
  const transitions: FinancedTransition[] = [];
  for (const invoice of next) {
    if (invoice.lender === null) continue;
    if (invoice.splitCount > 0n) continue;
    if (invoice.rateBps <= 0n) continue;
    const prior = prevByNullifier.get(invoice.nullifier);
    if (!prior) continue;
    if (prior.lender !== null) continue;
    transitions.push({
      nullifier: invoice.nullifier,
      rateBps: invoice.rateBps,
      creditThreshold: invoice.creditThreshold,
      reputationThreshold: invoice.reputationThreshold,
      financedAmount: invoice.amount,
    });
  }
  return transitions;
}

/** Assembles a durable local record from a detected transition. */
export function recordFor(transition: FinancedTransition, observedAtMs: number): RateTrendRecord {
  return {
    nullifier: transition.nullifier,
    observedAtMs,
    rateBps: transition.rateBps,
    creditThreshold: transition.creditThreshold,
    reputationThreshold: transition.reputationThreshold,
    creditBand: creditBandOf(transition.creditThreshold),
    reputationBand: reputationBandOf(transition.reputationThreshold),
    financedAmount: transition.financedAmount,
  };
}

/** Average (floor) rate over records, or null when empty. */
export function averageRate(records: readonly RateTrendRecord[]): bigint | null {
  if (records.length === 0) return null;
  return records.reduce((sum, r) => sum + r.rateBps, 0n) / BigInt(records.length);
}

/** Distinct credit bands present, in canonical order, with record counts. */
export function creditBandCounts(
  records: readonly RateTrendRecord[],
): Array<{ band: CreditBand; count: number }> {
  const counts = new Map<CreditBand, number>();
  for (const r of records) {
    counts.set(r.creditBand, (counts.get(r.creditBand) ?? 0) + 1);
  }
  return CREDIT_BANDS.filter((b) => counts.has(b)).map((b) => ({
    band: b,
    count: counts.get(b) ?? 0,
  }));
}

/**
 * Chooses a time-bucket size from the span of the records: hourly inside 3
 * days, 6-hourly inside 14 days, daily beyond.
 */
export function bucketMsFor(records: readonly RateTrendRecord[]): number {
  if (records.length < 2) return 3_600_000;
  let min = records[0].observedAtMs;
  let max = records[0].observedAtMs;
  for (const r of records) {
    if (r.observedAtMs < min) min = r.observedAtMs;
    if (r.observedAtMs > max) max = r.observedAtMs;
  }
  const span = max - min;
  if (span <= 3 * 86_400_000) return 3_600_000;
  if (span <= 14 * 86_400_000) return 6 * 3_600_000;
  return 86_400_000;
}

/** A time bucket with the average observed rate for that window. */
export interface RateBucket {
  readonly startMs: number;
  readonly count: number;
  readonly avgRateBps: bigint;
}

/**
 * Groups records into fixed time buckets (aligned to the bucket width, so
 * buckets stay stable across browser restarts) and averages the rate per
 * bucket. Buckets are returned ascending, with every bucket holding ≥ 1 record.
 */
export function bucketize(
  records: readonly RateTrendRecord[],
  bucketMs: number,
): RateBucket[] {
  const byBucket = new Map<number, { count: number; sum: bigint }>();
  for (const r of records) {
    const start = Math.floor(r.observedAtMs / bucketMs) * bucketMs;
    const cur = byBucket.get(start) ?? { count: 0, sum: 0n };
    cur.count += 1;
    cur.sum += r.rateBps;
    byBucket.set(start, cur);
  }
  return Array.from(byBucket.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([startMs, { count, sum }]) => ({
      startMs,
      count,
      avgRateBps: count > 0 ? sum / BigInt(count) : 0n,
    }));
}