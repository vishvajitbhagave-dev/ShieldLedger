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

const WalletIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
    <path d="M3 5v14a2 2 0 0 0 2 2h15" />
  </svg>
);

const StoreIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7 6 4h12l2 3v3a2 2 0 0 1-2 2 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-2-2V7Z" />
    <path d="M5 12v8h14v-8" />
  </svg>
);

const ShieldCheckIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3Z" />
    <path d="m9 11.5 2 2 4-4" />
  </svg>
);

const TrendUpIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);

export const WalletConnect: React.FC = () => {
  const { networkId, connecting, connected, walletLocked, walletInfo, deployment, connect, deploy, join } = useShieldLedger();
  const [joinAddress, setJoinAddress] = useState('');
  const [joining, setJoining] = useState(false);

  const busy = deployment.status === 'in-progress';

  // If not connected to wallet, show full connect view
  if (!connected) {
    return (
      <div className="sl-panel sl-connect">
        <div className="sl-connect-brand">
          <span className="sl-connect-logo" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3Z" />
              <path d="m9 11.5 2 2 4-4" />
            </svg>
          </span>
          <div className="sl-connect-brand-text">
            <span className="sl-connect-brand-title">ShieldLedger</span>
            <p className="sl-connect-brand-tagline">
              Confidential invoice financing on the Midnight Network — commitments on-chain, invoice details private.
            </p>
          </div>
        </div>

        <span className="sl-status-pill">
          <span className="sl-live-dot" aria-hidden="true" />
          {networkId}
        </span>

        <div className="sl-connect-head">
          <h2>Connect wallet</h2>
          <p className="sl-meta">
            Your wallet signs every transaction in the browser — private state never leaves Lace.
          </p>
        </div>

        {walletLocked && (
          <div className="sl-info">
            Lace is locked — click the <strong>Lace icon</strong> to unlock; the connection resumes automatically.
          </div>
        )}

        <button className="sl-button sl-connect-cta" onClick={() => void connect()} disabled={connecting}>
          <WalletIcon />
          {walletLocked
            ? 'Waiting for Lace to be unlocked…'
            : connecting
              ? 'Connecting…'
              : 'Connect Midnight Lace wallet'}
        </button>

        <div className="sl-connect-divider" role="separator">
          <span>What happens next</span>
        </div>

        <ol className="sl-connect-steps">
          <li>
            <span className="sl-connect-step-num">1</span>
            Connect wallet
          </li>
          <li>
            <span className="sl-connect-step-num">2</span>
            Choose your role
          </li>
          <li>
            <span className="sl-connect-step-num">3</span>
            Start financing · confirming · bidding
          </li>
        </ol>

        <div className="sl-connect-roles">
          <div className="sl-connect-role">
            <span className="sl-connect-role-icon" aria-hidden="true">
              <StoreIcon />
            </span>
            <span className="sl-connect-role-title">SME</span>
            <span className="sl-connect-role-sub">sell invoices</span>
          </div>
          <div className="sl-connect-role">
            <span className="sl-connect-role-icon" aria-hidden="true">
              <ShieldCheckIcon />
            </span>
            <span className="sl-connect-role-title">Buyer</span>
            <span className="sl-connect-role-sub">confirm invoices</span>
          </div>
          <div className="sl-connect-role">
            <span className="sl-connect-role-icon" aria-hidden="true">
              <TrendUpIcon />
            </span>
            <span className="sl-connect-role-title">Lender</span>
            <span className="sl-connect-role-sub">bid on invoices</span>
          </div>
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

  // When connected with a deployed contract, the wallet/contract details are
  // shown in the app header, so nothing else is rendered here.
  return null;
};
