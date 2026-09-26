import React from 'react';
import { useOptionalShieldLedger } from '../context.js';
import { NetworkSelector } from './NetworkSelector.js';
import { NETWORK_LABELS } from '../network.js';

/**
 * Pre-connect helper shown on the wallet gate / picker modal so testers never
 * hit the wallet's "Network mismatch" error blind: it names the network
 * ShieldLedger is about to connect on and — inside the app, where the
 * context lives — reuses the EXACT same NetworkSelector + setNetwork() that
 * the connected header uses (one source of truth in context/localStorage). On
 * the landing page (no provider), only the static default hint renders, since
 * switching there would have nothing to apply it to yet.
 */
export const WalletNetworkNotice: React.FC = () => {
  const ledger = useOptionalShieldLedger();

  if (ledger === null) {
    return (
      <p className="sl-network-hint">
        ShieldLedger targets the Midnight Preprod network — set your wallet to Preprod before connecting.
      </p>
    );
  }

  const label = NETWORK_LABELS[ledger.networkId] ?? ledger.networkId;
  return (
    <div className="sl-network-notice">
      <NetworkSelector />
      <p className="sl-network-hint">
        ShieldLedger targets the Midnight {label} network — set your wallet to {label} before connecting.
      </p>
    </div>
  );
};