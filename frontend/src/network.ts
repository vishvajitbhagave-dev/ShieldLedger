// Runtime Midnight network selection for the DApp.
//
// The app is built against a `VITE_NETWORK_ID` default (see frontend/.env), but
// users can switch between the public test networks (Preview / Preprod) at
// runtime without a rebuild. The connection itself is still wallet-enforced:
// manager.ts calls `wallet.connect(networkId)` and validates the wallet's
// reported network id, and the indexer / proof-server endpoints are supplied by
// the wallet's `getConfiguration()` after a successful connect — so reconnecting
// on a different network automatically targets that network's services.

export const RUNTIME_NETWORK_IDS = ['preview', 'preprod'] as const;
export type RuntimeNetworkId = (typeof RUNTIME_NETWORK_IDS)[number];

export const NETWORK_STORAGE_KEY = 'shieldledger.network';

export const NETWORK_LABELS: Record<string, string> = {
  preview: 'Preview',
  preprod: 'Preprod',
};

export const isRuntimeNetworkId = (value: string | null): value is RuntimeNetworkId =>
  value !== null && (RUNTIME_NETWORK_IDS as readonly string[]).includes(value);

/** Last user-selected network when valid, else the build-time default. */
export const loadStoredNetworkId = (fallback: string): string => {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
    return isRuntimeNetworkId(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
};

export const storeNetworkId = (network: RuntimeNetworkId): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(NETWORK_STORAGE_KEY, network);
  } catch {
    // Storage unavailable — the choice applies for this session only.
  }
};

/** Faucet link for the given network; anything other than preprod falls back to the Preview faucet. */
export const faucetForNetwork = (networkId: string): string =>
  networkId === 'preprod'
    ? 'https://midnight-tmnight-preprod.nethermind.dev/'
    : 'https://faucet.preview.midnight.network/';