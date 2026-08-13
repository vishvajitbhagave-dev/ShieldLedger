import React, { useState } from 'react';
import { useShieldLedger } from '../context.js';
import { HexBadge } from './HexBadge.js';

export const WalletConnect: React.FC = () => {
  const { connecting, connected, walletLocked, walletInfo, deployment, connect, deploy, join } = useShieldLedger();
  const [joinAddress, setJoinAddress] = useState('');

  const busy = deployment.status === 'in-progress';

  // If not connected to wallet, show full connect view
  if (!connected) {
    return (
      <div className="sl-panel">
        <h2>Connect wallet</h2>
        <p className="sl-meta">
          Connect the Midnight Lace wallet to deploy or join a ShieldLedger contract. The wallet signs and balances
          every transaction in your browser — private state never leaves it.
        </p>
        {walletLocked && (
          <div className="sl-info">
            Lace is locked. Click the <strong>Lace extension icon</strong> in your browser toolbar to unlock it — the
            connection continues automatically as soon as you do.
          </div>
        )}
        <div className="sl-row">
          <button className="sl-button" onClick={() => void connect()} disabled={connecting}>
            {walletLocked
              ? 'Waiting for Lace to be unlocked…'
              : connecting
                ? 'Connecting…'
                : 'Connect Midnight Lace wallet'}
          </button>
        </div>
      </div>
    );
  }

  // If connected but contract not deployed/joined, show the Deploy/Join panel
  if (deployment.status !== 'deployed') {
    return (
      <div className="sl-panel">
        <h2>Wallet connected</h2>
        <div className="sl-row" style={{ gap: 'var(--sp-4)' }}>
          <div style={{ flex: '1 1 auto', minWidth: '200px' }}>
            <p className="sl-meta" style={{ margin: 0 }}>
              Unshielded: <HexBadge hex={walletInfo?.unshieldedAddress ?? ''} />
            </p>
          </div>
          <div style={{ flex: '1 1 auto', minWidth: '200px' }}>
            <p className="sl-meta" style={{ margin: 0 }}>
              Shielded: <HexBadge hex={walletInfo?.shieldedAddress ?? ''} />
            </p>
          </div>
        </div>

        <div className="sl-row" style={{ marginTop: 'var(--sp-5)' }}>
          <button className="sl-button" onClick={() => void deploy()} disabled={busy}>
            Deploy new contract
          </button>
          <span className="sl-or">or</span>
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
      </div>
    );
  }

  // If connected and contract is deployed, render a sleek shared dashboard status bar
  return (
    <div className="sl-status-bar">
      <div className="sl-status-group">
        <div className="sl-status-item">
          <span className="sl-status-label">Lace Wallet</span>
          <span className="sl-status-value">
            <span className="sl-live" style={{ marginRight: '6px' }} />
            Connected
          </span>
        </div>
        <div className="sl-status-item">
          <span className="sl-status-label">Unshielded Address</span>
          <span className="sl-status-value">
            <HexBadge hex={walletInfo?.unshieldedAddress ?? ''} />
          </span>
        </div>
        <div className="sl-status-item">
          <span className="sl-status-label">Shielded Address</span>
          <span className="sl-status-value">
            <HexBadge hex={walletInfo?.shieldedAddress ?? ''} />
          </span>
        </div>
        <div className="sl-status-item">
          <span className="sl-status-label">Contract Address</span>
          <span className="sl-status-value">
            <HexBadge hex={deployment.address} />
          </span>
        </div>
      </div>
    </div>
  );
};
