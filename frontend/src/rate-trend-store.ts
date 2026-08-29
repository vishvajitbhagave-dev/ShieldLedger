// Browser-local persistence of forward-only rate-trend records.
//
// Same pattern as `pool-payouts.ts`: localStorage keyed JSON, guarded against
// missing/unavailable storage (node tests, private mode). bigint fields are
// stored as strings because JSON cannot serialize BigInt.

import type { CreditBand, RateTrendRecord, ReputationBand } from './rate-trend.js';

const STORAGE_KEY = 'shieldledger.rateTrend';

interface StoredRecord {
  readonly nullifier: string;
  readonly observedAtMs: number;
  readonly rateBps: string;
  readonly creditThreshold: string;
  readonly reputationThreshold: string;
  readonly creditBand: CreditBand;
  readonly reputationBand: ReputationBand;
  readonly financedAmount: string;
}

const isBigIntString = (x: unknown): x is string => typeof x === 'string' && /^-?[0-9]+$/.test(x);

function toStored(record: RateTrendRecord): StoredRecord {
  return {
    nullifier: record.nullifier,
    observedAtMs: record.observedAtMs,
    rateBps: record.rateBps.toString(),
    creditThreshold: record.creditThreshold.toString(),
    reputationThreshold: record.reputationThreshold.toString(),
    creditBand: record.creditBand,
    reputationBand: record.reputationBand,
    financedAmount: record.financedAmount.toString(),
  };
}

function fromStored(raw: unknown): RateTrendRecord | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const nullifier = r['nullifier'];
  const observedAtMs = r['observedAtMs'];
  const rateBps = r['rateBps'];
  const creditThreshold = r['creditThreshold'];
  const reputationThreshold = r['reputationThreshold'];
  const financedAmount = r['financedAmount'];
  const creditBand = r['creditBand'];
  const reputationBand = r['reputationBand'];
  if (
    typeof nullifier !== 'string' ||
    typeof observedAtMs !== 'number' ||
    !isBigIntString(rateBps) ||
    !isBigIntString(creditThreshold) ||
    !isBigIntString(reputationThreshold) ||
    !isBigIntString(financedAmount) ||
    typeof creditBand !== 'string' ||
    typeof reputationBand !== 'string'
  ) {
    return null;
  }
  return {
    nullifier,
    observedAtMs,
    rateBps: BigInt(rateBps),
    creditThreshold: BigInt(creditThreshold),
    reputationThreshold: BigInt(reputationThreshold),
    creditBand: creditBand as CreditBand,
    reputationBand: reputationBand as ReputationBand,
    financedAmount: BigInt(financedAmount),
  };
}

/** Loads all records this browser has observed (empty when storage is absent). */
export function loadRateTrendRecords(): RateTrendRecord[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(fromStored).filter((r): r is RateTrendRecord => r !== null);
  } catch {
    return [];
  }
}

/** Persists the full record list (overwrites). No-op when storage is absent. */
export function persistRateTrendRecords(records: readonly RateTrendRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.map(toStored)));
  } catch {
    // Storage unavailable (e.g. private mode): the records live for this
    // session only, matching the feature's forward-only nature.
  }
}

/** Clears this browser's local trend records. */
export function clearRateTrendRecords(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore: nothing to clear in unavailable storage.
  }
}