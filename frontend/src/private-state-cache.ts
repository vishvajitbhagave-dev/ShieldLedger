// Browser-local persistence of the wallet's private state across sessions.
//
// The in-memory private-state provider drops everything on disconnect, so after
// each mutation the DApp caches the full private state to localStorage
// (see shield-ledger-api.ts). The cache is scoped by BOTH the wallet's shielded
// address and the contract address, so one wallet's reputation/secrets never
// bleed into another wallet's session on the same browser.
//
// Failures are never fatal (there is no on-chain copy to fall back to) but they
// are logged clearly and reported through the return values so the Settings
// page can surface them instead of silently losing data.
import type { ShieldLedgerPrivateState } from '../../src/witnesses.js';

export const PS_CACHE_PREFIX = 'shieldledger.private-state.';

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function cacheIdentityFor(shieldedAddress: string): string {
  return shieldedAddress.trim().toLowerCase() || 'anonymous';
}

/** Storage key scoping a wallet's private-state cache to a specific contract. */
export function privateStateCacheKey(shieldedAddress: string, contractAddress: string): string {
  return `${PS_CACHE_PREFIX}${cacheIdentityFor(shieldedAddress)}.${contractAddress.trim().toLowerCase()}`;
}

export function encodePrivateState(state: ShieldLedgerPrivateState): string {
  return JSON.stringify(state, (_key, value) => {
    if (value instanceof Uint8Array) return { __bytes: toHex(value) };
    if (typeof value === 'bigint') return { __bigint: value.toString() };
    return value;
  });
}

export function decodePrivateState(json: string): ShieldLedgerPrivateState {
  return JSON.parse(json, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if (typeof obj.__bytes === 'string') {
        const hex = obj.__bytes;
        const out = new Uint8Array(hex.length / 2);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        return out;
      }
      if (typeof obj.__bigint === 'string') return BigInt(obj.__bigint);
    }
    return value;
  }) as ShieldLedgerPrivateState;
}

/** Persists the wallet+contract scoped cache. Returns whether it saved. */
export function persistPrivateState(
  shieldedAddress: string,
  contractAddress: string,
  state: ShieldLedgerPrivateState,
): boolean {
  const key = privateStateCacheKey(shieldedAddress, contractAddress);
  if (typeof localStorage === 'undefined') {
    console.warn(`[shieldledger] Private state not cached for ${key}: localStorage is unavailable (private mode?).`);
    return false;
  }
  try {
    localStorage.setItem(key, encodePrivateState(state));
    return true;
  } catch (error) {
    console.warn(`[shieldledger] Failed to cache private state for ${key}:`, error);
    return false;
  }
}

/** Loads the wallet+contract scoped cache, if any. */
export function loadCachedPrivateState(
  shieldedAddress: string,
  contractAddress: string,
): ShieldLedgerPrivateState | null {
  const key = privateStateCacheKey(shieldedAddress, contractAddress);
  if (typeof localStorage === 'undefined') {
    console.warn(`[shieldledger] Cannot read cached private state for ${key}: localStorage is unavailable (private mode?).`);
    return null;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? decodePrivateState(raw) : null;
  } catch (error) {
    console.warn(`[shieldledger] Failed to load cached private state for ${key}:`, error);
    return null;
  }
}

/** All private-state cache keys currently stored in this browser. */
export function listPrivateStateCacheKeys(): string[] {
  if (typeof localStorage === 'undefined') return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PS_CACHE_PREFIX)) keys.push(key);
    }
  } catch {
    // Storage unavailable — nothing to list.
  }
  return keys;
}

/** Number of private-state cache entries stored in this browser. */
export function countPrivateStateCacheKeys(): number {
  return listPrivateStateCacheKeys().length;
}

/**
 * Removes every private-state cache entry in this browser. Returns how many
 * were actually deleted so the caller can confirm the outcome to the user.
 */
export function clearPrivateStateCache(): number {
  const keys = listPrivateStateCacheKeys();
  const removed = keys.filter((key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  });
  return removed.length;
}