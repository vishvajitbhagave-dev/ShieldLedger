// Browser-local persistence of per-lender pool settlement payouts.
//
// On-chain, a pool settlement stores only a *commitment hash* of
// (slotKey, payout) — never the payout value itself (see
// setup in settleSplitInvoice). Each lender therefore needs their own copy of
// their settlement payout in the browser so they can later pass it as the
// undisclosed witness to claimPoolInsurancePayout (the circuit re-derives the
// hash and requires it to match the on-chain commitment, so the value can't be
// fabricated). Keyed by poolSlotKey hex, matching the on-chain slot key.

const STORAGE_KEY = 'shieldledger.poolPayouts';

interface PoolPayoutRecord {
  readonly nullifier: string;
  readonly slotIndex: string;
  readonly slotKey: string;
  readonly payout: string;
  readonly createdAt: number;
}

export function loadPoolPayouts(): PoolPayoutRecord[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PoolPayoutRecord[]) : [];
  } catch {
    return [];
  }
}

function savePoolPayouts(records: PoolPayoutRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage unavailable (e.g. private mode): the payout still works for this
    // session only if the caller holds the value; it just can't be recalled later.
  }
}

/**
 * Persists the per-lender payout for a pool settlement slot so it can be
 * replayed as the undisclosed witness when the lender later claims default
 * insurance. Idempotent for a given slotKey.
 */
export function persistPoolPayout(params: {
  nullifier: string;
  slotIndex: bigint;
  slotKey: string;
  payout: bigint;
}): void {
  const records = loadPoolPayouts();
  const upserted: PoolPayoutRecord = {
    nullifier: params.nullifier,
    slotIndex: params.slotIndex.toString(),
    slotKey: params.slotKey,
    payout: params.payout.toString(),
    createdAt: Date.now(),
  };
  const next = records.filter((r) => r.slotKey !== params.slotKey);
  next.push(upserted);
  savePoolPayouts(next);
}

/** Looks up a previously persisted settlement payout for a slot key. */
export function lookupPoolPayout(slotKey: string): bigint | null {
  const found = loadPoolPayouts().find((r) => r.slotKey === slotKey);
  return found ? BigInt(found.payout) : null;
}

/** Whether this browser has a persisted settlement payout for a slot key. */
export function hasPoolPayout(slotKey: string): boolean {
  return loadPoolPayouts().some((r) => r.slotKey === slotKey);
}
