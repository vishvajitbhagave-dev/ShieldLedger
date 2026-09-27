// Wallet-and-contract scope shared by the browser-local stores
// (invoice-registry.ts, pool-payouts.ts).
//
// Browser-local data that belongs to a wallet's private identity must never
// leak into another wallet's session on the same browser, so every such store
// is keyed by BOTH the wallet's shielded address and the contract address —
// the same rule the private-state cache follows (private-state-cache.ts).

export interface WalletScope {
  /** The connected wallet's shielded address (privacy identity segment). */
  readonly shieldedAddress: string;
  /** The contract address the wallet is connected to. */
  readonly contractAddress: string;
}

/** Stable, lowercased composite identity used inside storage keys. */
export function scopeIdentity(scope: WalletScope): string {
  return `${scope.shieldedAddress.trim().toLowerCase()}.${scope.contractAddress.trim().toLowerCase()}`;
}

/** True only when both sides of the scope are present (connected wallet + deployed contract). */
export function isCompleteScope(scope: WalletScope): boolean {
  return scope.shieldedAddress.trim() !== '' && scope.contractAddress.trim() !== '';
}