import React, { useState } from 'react';
import { useShieldLedger } from '../context.js';

export const WalletConnect: React.FC = () => {
  const { connecting, connected, walletInfo, deployment, connect, deploy, join } = useShieldLedger();
  const [joinAddress, setJoinAddress] = useState('');

  const busy = deployment.status === 'in-progress';

  if (!connected) {
    return (
      <div className="sl-panel">
        <h2>Connect wallet</h2>
        <p className="sl-meta">
          Connect the Midnight Lace wallet to deploy or join a ShieldLedger contract. The wallet signs and balances
          every transaction in your browser — private state never leaves it.
        </p>
        <div className="sl-row">
          <button className="sl-button" onClick={() => void connect()} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect Midnight Lace wallet'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sl-panel">
      <h2>Wallet connected</h2>
      <p className="sl-meta">
        Unshielded address: <span className="sl-mono">{walletInfo?.unshieldedAddress}</span>
      </p>
      <p className="sl-meta">
        Shielded address: <span className="sl-mono">{walletInfo?.shieldedAddress}</span>
      </p>

      <div className="sl-row" style={{ marginTop: 14 }}>
        <button className="sl-button" onClick={() => void deploy()} disabled={busy}>
          Deploy new contract
        </button>
        <span style={{ color: '#64748b' }}>or</span>
        <input
          className="sl-input"
          placeholder="Existing contract address (hex)"
          value={joinAddress}
          onChange={(e) => setJoinAddress(e.target.value)}
          disabled={busy}
        />
        <button
          className="sl-button sl-button-secondary"
          onClick={() => void join(joinAddress)}
          disabled={busy || joinAddress.trim().length === 0}
        >
          Join
        </button>
      </div>

      {deployment.status === 'deployed' && (
        <p className="sl-meta" style={{ marginTop: 12 }}>
          Contract: <span className="sl-mono">{deployment.address}</span>
        </p>
      )}
    </div>
  );
};
