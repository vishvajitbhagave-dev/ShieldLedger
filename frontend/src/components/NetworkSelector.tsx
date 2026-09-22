import React from 'react';
import { useShieldLedger } from '../context.js';
import { NETWORK_LABELS, RUNTIME_NETWORK_IDS, type RuntimeNetworkId } from '../network.js';

/** Segmented Preview / Preprod switch wired to the runtime network selection. */
export const NetworkSelector: React.FC = () => {
  const { networkId, setNetwork } = useShieldLedger();

  return (
    <div className="sl-network-selector" role="group" aria-label="Midnight network">
      {RUNTIME_NETWORK_IDS.map((network: RuntimeNetworkId) => {
        const active = networkId === network;
        return (
          <button
            key={network}
            type="button"
            className={active ? 'sl-network-option sl-network-option-active' : 'sl-network-option'}
            aria-pressed={active}
            onClick={() => setNetwork(network)}
          >
            {NETWORK_LABELS[network]}
          </button>
        );
      })}
    </div>
  );
};