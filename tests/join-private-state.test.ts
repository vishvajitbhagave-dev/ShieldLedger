import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

import {
  decodePrivateState,
  privateStateCacheKey,
} from '../frontend/src/private-state-cache.js';
import { resolveInitialPrivateState } from '../frontend/src/shield-ledger-api.js';
import { inMemoryPrivateStateProvider } from '../frontend/src/in-memory-private-state-provider.js';
import type { ShieldLedgerPrivateStateId } from '../frontend/src/shield-ledger-types.js';
import type { ShieldLedgerProviders } from '../frontend/src/shield-ledger-types.js';
import type { ShieldLedgerPrivateState } from '../src/witnesses.js';
import { pureCircuits } from '../contracts/managed/shield-ledger/contract/index.js';

const WALLET_A = 'pzWalletAaaaa111111222222333333444444';
const WALLET_B = 'pzWalletBbbbb555555666666777777888888';
const CONTRACT_A = '2bce4c7dea4edcdf1465496efd2c0af97cc6986bbed016569fe5733813b94be3' as ContractAddress;
const CONTRACT_B = '7face40851b1b49c5de18488c3e25b3972387cee22e06d4af6f1b5eaf9c0d350' as ContractAddress;

function bytes32(value: number): Uint8Array {
  const out = new Uint8Array(32);
  out[31] = value;
  return out;
}

const NULLIFIER = bytes32(7);

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && Array.from(a).every((v, i) => v === b[i]);

/** A brand-new in-memory provider, what a page reload / wallet reconnect gets. */
const freshProviders = (): Pick<ShieldLedgerProviders, 'privateStateProvider'> => ({
  privateStateProvider: inMemoryPrivateStateProvider<ShieldLedgerPrivateStateId, ShieldLedgerPrivateState>(),
});

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

describe('ShieldLedgerAPI.join — SME identity durability on cache miss', () => {
  it('persists the freshly created private state to the cache on a first join', async () => {
    const ps = await resolveInitialPrivateState(freshProviders(), WALLET_A, CONTRACT_A);

    expect(ps.smeSecret.length).toBe(32);
    const key = privateStateCacheKey(WALLET_A, CONTRACT_A);
    const raw = localStorage.getItem(key);
    expect(raw).not.toBeNull();

    const cached = decodePrivateState(raw!);
    expect(sameBytes(cached.smeSecret, ps.smeSecret)).toBe(true);
    expect(sameBytes(cached.lenderSecret, ps.lenderSecret)).toBe(true);
  });

  it('a reload/reconnect restores the SAME identity instead of generating a fresh secret', async () => {
    // Simulates: connect+join (cache miss) -> page reload -> reconnect+join.
    const first = await resolveInitialPrivateState(freshProviders(), WALLET_A, CONTRACT_A);
    const second = await resolveInitialPrivateState(freshProviders(), WALLET_A, CONTRACT_A);

    for (const key of ['smeSecret', 'lenderSecret', 'buyerSecret', 'claimSecret'] as const) {
      expect(sameBytes(second[key], first[key])).toBe(true);
    }

    // Register-time vs settle-time SME check: pureCircuits.deriveCommitment
    // is exactly what the settleInvoice circuit's `assert(... == smeCommitment)`
    // compares (contracts/shield-ledger.compact ~line 381). With the restored
    // identity both derivations agree, so a fresh invoice both registers and
    // settles for the same wallet.
    const before = pureCircuits.deriveCommitment(first.smeSecret, NULLIFIER);
    const after = pureCircuits.deriveCommitment(second.smeSecret, NULLIFIER);
    expect(hex(after)).toBe(hex(before));
  });

  it('isolates identities per wallet on the same contract', async () => {
    const psA = await resolveInitialPrivateState(freshProviders(), WALLET_A, CONTRACT_A);
    const psB = await resolveInitialPrivateState(freshProviders(), WALLET_B, CONTRACT_A);

    expect(sameBytes(psB.smeSecret, psA.smeSecret)).toBe(false);
    expect(sameBytes(psB.lenderSecret, psA.lenderSecret)).toBe(false);

    expect(privateStateCacheKey(WALLET_B, CONTRACT_A)).not.toBe(privateStateCacheKey(WALLET_A, CONTRACT_A));
    expect(localStorage.getItem(privateStateCacheKey(WALLET_A, CONTRACT_A))).not.toBeNull();
    expect(localStorage.getItem(privateStateCacheKey(WALLET_B, CONTRACT_A))).not.toBeNull();
  });

  it('isolates identities per contract for the same wallet', async () => {
    const psA = await resolveInitialPrivateState(freshProviders(), WALLET_A, CONTRACT_A);
    const psBContract = await resolveInitialPrivateState(freshProviders(), WALLET_A, CONTRACT_B);

    expect(sameBytes(psBContract.smeSecret, psA.smeSecret)).toBe(false);
    expect(localStorage.getItem(privateStateCacheKey(WALLET_A, CONTRACT_B))).not.toBeNull();
  });

  it('does not throw when localStorage is unavailable', async () => {
    vi.unstubAllGlobals();
    const ps = await resolveInitialPrivateState(freshProviders(), WALLET_A, CONTRACT_A);
    expect(ps.smeSecret.length).toBe(32);
  });
});