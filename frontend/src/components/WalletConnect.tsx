import React, { useState } from 'react';
import { useShieldLedger } from '../context.js';
import { HexBadge } from './HexBadge.js';

const SparklesIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    <circle cx="12" cy="12" r="3.5" />
  </svg>
);

const LinkIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
);

const ChevronRightIcon: React.FC = () => (
  <svg className="sl-row-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const WalletConnect: React.FC = () => {
  const { connecting, connected, walletLocked, walletInfo, deployment, connect, deploy, join } = useShieldLedger();
  const [joinAddress, setJoinAddress] = useState('');
  const [joining, setJoining] = useState(false);

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

  // If connected but contract not deployed/joined, show the Deploy/Join choice
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

        <div className="sl-list">
          <span className="sl-list-label">How do you want to start?</span>
          <button type="button" className="sl-row-item" disabled={busy} onClick={() => void deploy()}>
            <span className="sl-row-icon">
              <SparklesIcon />
            </span>
            <span className="sl-row-body">
              <span className="sl-row-title">Deploy a new contract</span>
              <span className="sl-row-sub">Create a fresh ShieldLedger auction on {deployment.status === 'idle' ? 'this network' : 'this network'}.</span>
            </span>
            <ChevronRightIcon />
          </button>
          <button
            type="button"
            className="sl-row-item"
            disabled={busy}
            onClick={() => {
              setJoining((v) => !v);
              if (joinAddress.trim().length > 0) void join(joinAddress);
            }}
          >
            <span className="sl-row-icon">
              <LinkIcon />
            </span>
            <span className="sl-row-body">
              <span className="sl-row-title">Join an existing contract</span>
              <span className="sl-row-sub">Connect to an already-deployed ShieldLedger address.</span>
            </span>
            <ChevronRightIcon />
          </button>
          {joining && (
            <div className="sl-row" style={{ marginTop: 'var(--sp-1)' }}>
              <input
                className="sl-input"
                placeholder="Existing contract address (hex)"
                value={joinAddress}
                onChange={(e) => setJoinAddress(e.target.value)}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && joinAddress.trim().length > 0 && !busy) {
                    e.preventDefault();
                    void join(joinAddress);
                  }
                }}
              />
              <button
                className="sl-button"
                onClick={() => void join(joinAddress)}
                disabled={busy || joinAddress.trim().length === 0}
              >
                {busy ? 'Joining…' : 'Join'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If connected and contract is deployed, render the identity status bar
  return (
    <div className="sl-status-bar">
      <div className="sl-status-group">
        <div className="sl-status-item">
          <span className="sl-status-label">Lace Wallet</span>
          <span className="sl-status-value">
            <span className="sl-live" aria-hidden="true" />
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
