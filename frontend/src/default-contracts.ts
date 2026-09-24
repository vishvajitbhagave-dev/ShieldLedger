// Default per-network ledger instances the DApp auto-connects to.
//
// These are the live, publicly documented contract addresses (README
// "Live Deployments" + ".midnight-state.json"); they must be kept in sync
// with any future re-deployment of the shared testnet instances. A user who
// previously joined/deployed their own instance is remembered per network and
// wins over these defaults (see storeStoredContractAddress).

export const DEFAULT_LEDGER_ADDRESSES: Readonly<Record<string, string>> = {
  preview: '18737084144f6482d529fdb8fa357966c9c2eb2c3734d1753f4b42648a4dc4a6',
  preprod: 'a503d5c086f8ab42f3a650fa0c4b67e31ac37c7eb997c8513c3dccf38de8c925',
};

const isHexAddress = (value: string): boolean => /^[0-9a-f]{64}$/i.test(value);

const CONTRACT_STORAGE_PREFIX = 'shieldledger.contract.';

/** A previously user-chosen (non-default) contract address for a network, if any. */
export function loadStoredContractAddress(networkId: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${CONTRACT_STORAGE_PREFIX}${networkId}`);
    return raw !== null && isHexAddress(raw) ? raw.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Persists a user-chosen contract address so that future connects reuse it
 * instead of the network default. Only called for explicit (non-default)
 * addresses; default auto-joins are never recorded.
 */
export function storeStoredContractAddress(networkId: string, address: string): void {
  if (typeof localStorage === 'undefined') return;
  if (!isHexAddress(address)) return;
  try {
    localStorage.setItem(`${CONTRACT_STORAGE_PREFIX}${networkId}`, address.toLowerCase());
  } catch {
    // Storage unavailable — the choice applies for this session only.
  }
}

const ADVANCED_QUERY_REGEX = /[?&]advanced=1/;
const CONTRACT_QUERY_REGEX = /[?&]contract=([0-9a-fA-F]{64})/;

/** ?advanced=1 in the URL hash keeps the manual Deploy/Join screen and skips auto-join. */
export function isAdvancedMode(): boolean {
  return typeof window !== 'undefined' && ADVANCED_QUERY_REGEX.test(window.location.hash);
}

/** ?contract=<hex64> in the URL hash joins a specific ledger instance one-off. */
export function contractOverrideFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.hash.match(CONTRACT_QUERY_REGEX);
  return match ? match[1].toLowerCase() : null;
}