import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

import {
  clearPrivateStateCache,
  countPrivateStateCacheKeys,
  decodePrivateState,
  encodePrivateState,
  loadCachedPrivateState,
  persistPrivateState,
  privateStateCacheKey,
  PS_CACHE_PREFIX,
} from '../frontend/src/private-state-cache.js';
import { inMemoryPrivateStateProvider } from '../frontend/src/in-memory-private-state-provider.js';
import { shieldLedgerPrivateStateKey } from '../frontend/src/shield-ledger-types.js';
import type { ShieldLedgerPrivateStateId } from '../frontend/src/shield-ledger-types.js';
import {
  createShieldLedgerPrivateState,
  type ShieldLedgerPrivateState,
} from '../src/witnesses.js';

const WALLET_A = 'pzWalletAaaaa111111222222333333444444';
const WALLET_B = 'pzWalletBbbbb555555666666777777888888';
const CONTRACT = '2bce4c7dea4edcdf1465496efd2c0af97cc6986bbed016569fe5733813b94be3';

/** Minimal Storage shim; localStorage isn't guaranteed in node/vitest. */
const createStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length(): number {
      return map.size;
    },
    clear(): void {
      map.clear();
    },
    key(index: number): string | null {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(key: string): string | null {
      return map.get(key) ?? null;
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
  } as Storage;
};

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('private-state cache key scoping', () => {
  it('includes both the shielded address and the contract address', () => {
    expect(privateStateCacheKey(WALLET_A, CONTRACT)).toBe(
      `${PS_CACHE_PREFIX}${WALLET_A.toLowerCase()}.${CONTRACT}`,
    );
  });

  it('is case-/whitespace-insensitive on the wallet and contract address', () => {
    expect(privateStateCacheKey(`  ${WALLET_A.toUpperCase()}  `, CONTRACT.toUpperCase())).toBe(
      privateStateCacheKey(WALLET_A, CONTRACT),
    );
  });

  it('partitions wallets: wallet A and wallet B never share a key', () => {
    expect(privateStateCacheKey(WALLET_A, CONTRACT)).not.toBe(
      privateStateCacheKey(WALLET_B, CONTRACT),
    );
  });
});

describe('encodePrivateState / decodePrivateState round-trip', () => {
  it('preserves bigint fields (scores, caps, counters) exactly', () => {
    const original = createShieldLedgerPrivateState({
      smeReputationScore: 15n,
      smeCreditScore: 722n,
      smeOnTimeCount: 3n,
      smeLateCount: 1n,
      lenderMinReputation: 10n,
    });
    const decoded = decodePrivateState(encodePrivateState(original));
    expect(decoded.smeReputationScore).toBe(15n);
    expect(decoded.smeCreditScore).toBe(722n);
    expect(decoded.smeOnTimeCount).toBe(3n);
    expect(decoded.smeLateCount).toBe(1n);
    expect(decoded.lenderMinReputation).toBe(10n);
  });

  it('preserves Uint8Array secrets byte-for-byte', () => {
    const original = createShieldLedgerPrivateState();
    const decoded = decodePrivateState(encodePrivateState(original));
    for (const key of ['smeSecret', 'lenderSecret', 'buyerSecret', 'claimSecret'] as const) {
      expect(Array.from(decoded[key])).toEqual(Array.from(original[key]));
    }
  });
});

describe('persistPrivateState / loadCachedPrivateState round-trip', () => {
  it('persists under the wallet+contract key and restores an equal state', () => {
    const original = createShieldLedgerPrivateState({ smeReputationScore: 50n });
    expect(persistPrivateState(WALLET_A, CONTRACT, original)).toBe(true);
    const restored = loadCachedPrivateState(WALLET_A, CONTRACT);
    expect(restored).not.toBeNull();
    expect(restored!.smeReputationScore).toBe(50n);
    expect(Array.from(restored!.lenderSecret)).toEqual(Array.from(original.lenderSecret));
  });

  it('never writes under the old wallet-less legacy key (no cross-wallet leakage)', () => {
    persistPrivateState(WALLET_A, CONTRACT, createShieldLedgerPrivateState());
    expect(globalThis.localStorage.getItem(`${PS_CACHE_PREFIX}${CONTRACT}`)).toBeNull();
  });

  it('returns null when nothing has been cached for this wallet/contract', () => {
    expect(loadCachedPrivateState(WALLET_B, CONTRACT)).toBeNull();
  });

  it('hydrates a fresh in-memory provider from cache (the join() path)', async () => {
    const original = createShieldLedgerPrivateState({ smeReputationScore: 60n });
    persistPrivateState(WALLET_A, CONTRACT, original);

    const cached = loadCachedPrivateState(WALLET_A, CONTRACT);
    expect(cached).not.toBeNull();

    const provider = inMemoryPrivateStateProvider<ShieldLedgerPrivateStateId, ShieldLedgerPrivateState>();
    provider.setContractAddress(CONTRACT as ContractAddress);
    await provider.set(shieldLedgerPrivateStateKey, cached!);
    const hydrated = await provider.get(shieldLedgerPrivateStateKey);

    expect(hydrated).not.toBeNull();
    expect(hydrated!.smeReputationScore).toBe(60n);
    expect(hydrated!.smeCreditScore).toBe(original.smeCreditScore);
    expect(Array.from(hydrated!.smeSecret)).toEqual(Array.from(original.smeSecret));
  });
});

describe('clearPrivateStateCache', () => {
  it('lists and clears only private-state keys, leaving other app data alone', () => {
    persistPrivateState(WALLET_A, CONTRACT, createShieldLedgerPrivateState());
    persistPrivateState(
      WALLET_B,
      'anotherContractAddress0000111122223333444455556666777788889999',
      createShieldLedgerPrivateState(),
    );
    globalThis.localStorage.setItem('shieldledger.role', 'sme');

    expect(countPrivateStateCacheKeys()).toBe(2);
    expect(clearPrivateStateCache()).toBe(2);
    expect(countPrivateStateCacheKeys()).toBe(0);
    expect(globalThis.localStorage.getItem('shieldledger.role')).toBe('sme');
  });
});

describe('persistence failures are surfaced, not swallowed', () => {
  it('persistPrivateState logs a warning and reports failure when storage throws', () => {
    vi.stubGlobal(
      'localStorage',
      {
        ...createStorage(),
        setItem(): void {
          throw new Error('QuotaExceededError');
        },
      } as Storage,
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(persistPrivateState(WALLET_A, CONTRACT, createShieldLedgerPrivateState())).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(
      warn.mock.calls.some((args) => String(args[0]).includes('Failed to cache private state')),
    ).toBe(true);
    warn.mockRestore();
  });

  it('loadCachedPrivateState logs a warning and returns null when storage throws', () => {
    vi.stubGlobal(
      'localStorage',
      {
        ...createStorage(),
        getItem(): string | null {
          throw new Error('SecurityError');
        },
      } as Storage,
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(loadCachedPrivateState(WALLET_A, CONTRACT)).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(
      warn.mock.calls.some((args) => String(args[0]).includes('Failed to load cached private state')),
    ).toBe(true);
    warn.mockRestore();
  });
});