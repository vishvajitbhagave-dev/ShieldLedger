import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPoolPayouts,
  hasPoolPayout,
  loadPoolPayouts,
  lookupPoolPayout,
  persistPoolPayout,
} from '../frontend/src/pool-payouts';

const SCOPE_A = { shieldedAddress: '0xwallet-lender-a', contractAddress: '0xcontract-pool' };
const SCOPE_B = { shieldedAddress: '0xwallet-lender-b', contractAddress: '0xcontract-pool' };

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe('pool-interests', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists and reads a payout within the same wallet+contract scope', () => {
    persistPoolPayout(
      { nullifier: '0xinv', slotIndex: 1n, slotKey: '0xs1', payout: 2500n },
      SCOPE_A,
    );
    expect(lookupPoolPayout('0xs1', SCOPE_A)).toBe(2500n);
    expect(hasPoolPayout('0xs1', SCOPE_A)).toBe(true);
    expect(loadPoolPayouts(SCOPE_A)).toHaveLength(1);
  });

  it('isolates payouts per wallet on the same contract', () => {
    persistPoolPayout({ nullifier: '0xinv', slotIndex: 1n, slotKey: '0xs1', payout: 2500n }, SCOPE_A);
    persistPoolPayout({ nullifier: '0xinv', slotIndex: 1n, slotKey: '0xs1', payout: 4800n }, SCOPE_B);

    expect(lookupPoolPayout('0xs1', SCOPE_A)).toBe(2500n);
    expect(lookupPoolPayout('0xs1', SCOPE_B)).toBe(4800n);
  });

  it('returns null when nothing was stored for the slot in this scope', () => {
    persistPoolPayout({ nullifier: '0xinv', slotIndex: 0n, slotKey: '0xs0', payout: 900n }, SCOPE_A);
    expect(lookupPoolPayout('0xmissing', SCOPE_A)).toBeNull();
    expect(lookupPoolPayout('0xs0', SCOPE_B)).toBeNull();
  });

  it('clears only the given wallet+contract scope', () => {
    persistPoolPayout({ nullifier: '0xinv', slotIndex: 1n, slotKey: '0xs1', payout: 2500n }, SCOPE_A);
    persistPoolPayout({ nullifier: '0xinv', slotIndex: 1n, slotKey: '0xs1', payout: 4800n }, SCOPE_B);

    clearPoolPayouts(SCOPE_A);

    expect(loadPoolPayouts(SCOPE_A)).toHaveLength(0);
    expect(lookupPoolPayout('0xs1', SCOPE_B)).toBe(4800n);
  });

  it('is idempotent for a given slot key', () => {
    persistPoolPayout({ nullifier: '0xinv', slotIndex: 1n, slotKey: '0xs1', payout: 2500n }, SCOPE_A);
    persistPoolPayout({ nullifier: '0xinv', slotIndex: 1n, slotKey: '0xs1', payout: 2500n }, SCOPE_A);
    expect(loadPoolPayouts(SCOPE_A)).toHaveLength(1);
  });

  it('returns an empty list when the scope is incomplete', () => {
    persistPoolPayout({ nullifier: '0xinv', slotIndex: 1n, slotKey: '0xs1', payout: 2500n }, SCOPE_A);
    expect(loadPoolPayouts({ shieldedAddress: '', contractAddress: '' })).toEqual([]);
    expect(lookupPoolPayout('0xs1', { shieldedAddress: '0xwallet-lender-a', contractAddress: '' })).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    vi.unstubAllGlobals();
    const otherScope = { shieldedAddress: '0xother', contractAddress: '0xother-contract' };
    expect(() => persistPoolPayout({ nullifier: '0xinv', slotIndex: 0n, slotKey: '0xns', payout: 1n }, otherScope)).not.toThrow();
    expect(lookupPoolPayout('0xns', otherScope)).toBeNull();
    expect(hasPoolPayout('0xns', otherScope)).toBe(false);
  });
});