// Wallet+contract-scoped browser-local persistence of per-lender pool
// settlement payouts.
//
// On-chain, a pool settlement stores only a *commitment hash* of
// (slotKey, payout) — never the payout value itself (see
// setup in settleSplitInvoice). Each lender therefore needs their own copy of
// their settlement payout in the browser so they can later pass it as the
// undisclosed witness to claimPoolInsurancePayout (the circuit re-derives the
// hash and requires it to match the on-chain commitment, so the value can't be
// fabricated). Keyed by poolSlotKey hex, matching the on-chain slot key — and
// scoped by wallet + contract so one lender's payout never shows up under
// another wallet in the same browser.

import { isCompleteScope, scopeIdentity, type WalletScope } from './wallet-scope.js';

const STORAGE_PREFIX = 'shieldledger.poolPayouts.';

const keyFor = (scope: WalletScope): string => `${STORAGE_PREFIX}${scopeIdentity(scope)}`;

interface PoolPayoutRecord {
  readonly nullifier: string;
  readonly slotIndex: string;
  readonly slotKey: string;
  readonly payout: string;
  readonly createdAt: number;
}

export function loadPoolPayouts(scope: WalletScope): PoolPayoutRecord[] {
  if (typeof localStorage === 'undefined') return [];
  if (!isCompleteScope(scope)) return [];
  const raw = localStorage.getItem(keyFor(scope));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PoolPayoutRecord[]) : [];
  } catch {
    return [];
  }
}

function savePoolPayouts(records: PoolPayoutRecord[], scope: WalletScope): void {
  if (typeof localStorage === 'undefined') return;
  if (!isCompleteScope(scope)) return;
  try {
    localStorage.setItem(keyFor(scope), JSON.stringify(records));
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
export function persistPoolPayout(
  params: {
    nullifier: string;
    slotIndex: bigint;
    slotKey: string;
    payout: bigint;
  },
  scope: WalletScope,
): void {
  const records = loadPoolPayouts(scope);
  const upserted: PoolPayoutRecord = {
    nullifier: params.nullifier,
    slotIndex: params.slotIndex.toString(),
    slotKey: params.slotKey,
    payout: params.payout.toString(),
    createdAt: Date.now(),
  };
  const next = records.filter((r) => r.slotKey !== params.slotKey);
  next.push(upserted);
  savePoolPayouts(next, scope);
}

/** Looks up a previously persisted settlement payout for a slot key. */
export function lookupPoolPayout(slotKey: string, scope: WalletScope): bigint | null {
  const found = loadPoolPayouts(scope).find((r) => r.slotKey === slotKey);
  return found ? BigInt(found.payout) : null;
}

/** Whether this browser has a persisted settlement payout for a slot key. */
export function hasPoolPayout(slotKey: string, scope: WalletScope): boolean {
  return loadPoolPayouts(scope).some((r) => r.slotKey === slotKey);
}

/** Clears the pool settlement payouts stored by a wallet on a specific contract. */
export function clearPoolPayouts(scope: WalletScope): void {
  if (typeof localStorage === 'undefined') return;
  if (!isCompleteScope(scope)) return;
  try {
    localStorage.removeItem(keyFor(scope));
  } catch {
    // Storage unavailable (e.g. private mode): nothing was persisted to clear.
  }
}
