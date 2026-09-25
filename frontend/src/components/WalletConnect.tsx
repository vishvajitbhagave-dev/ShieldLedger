import React, { useState } from 'react';
import { useShieldLedger } from '../context.js';
import { listWalletOptions, type WalletOption } from '../manager.js';
import { HexBadge } from './HexBadge.js';
import { DEFAULT_LEDGER_ADDRESSES, isAdvancedMode } from '../default-contracts.js';

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

/** Placeholder glyph used when a wallet extension is not installed. */
const WalletMonogram: React.FC<{ accent: string; monogram: string }> = ({ accent, monogram }) => (
  <span className="sl-wallet-monogram" style={{ backgroundColor: accent }} aria-hidden="true">
    {monogram}
  </span>
);

export const WalletConnect: React.FC = () => {
  const { networkId, connecting, connected, walletInfo, deployment, connect, deploy, join, demo, enterDemo } = useShieldLedger();
  const [joinAddress, setJoinAddress] = useState('');
  const [joining, setJoining] = useState(false);

  const busy = deployment.status === 'in-progress';

  // Demo Mode takes over the whole shell — no wallet gate to render.
  if (demo) return null;

  // Not connected to a wallet: a minimal gate replaces the old full connect
  // card. Every case requires an explicit click before any wallet extension
  // popup opens — one wallet → a single picker row, several → the same picker
  // with more rows, zero → install links. The Simulation Sandbox stays
  // reachable so a wallet-less visitor never hits a dead end.
  if (!connected) {
    const installed: WalletOption[] = listWalletOptions().filter((option) => option.installed);

    return (
      <div className="sl-panel sl-gate">
        {installed.length === 0 && (
          <>
            <p>
              <strong>No Midnight wallet detected</strong>
            </p>
            <p className="sl-meta">
              Install one of these extensions to sign on-chain, then refresh this page to connect.
            </p>
            <div className="sl-wallet-list">
              {listWalletOptions().map((option) => (
                <div key={option.definition.id} className="sl-wallet-option sl-wallet-option-unavailable" aria-disabled="true">
                  <WalletMonogram accent={option.definition.accent} monogram={option.definition.monogram} />
                  <span className="sl-wallet-body">
                    <span className="sl-wallet-name">{option.name}</span>
                    <span className="sl-wallet-desc">{option.definition.description}</span>
                  </span>
                  <span className="sl-wallet-install">
                    <a href={option.definition.installUrl} target="_blank" rel="noopener noreferrer">
                      Install
                    </a>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {installed.length > 0 && (
          <>
            <p>
              <strong>Choose a wallet</strong>
            </p>
            <p className="sl-meta">Pick a Midnight wallet to connect with — the extension will ask you to approve.</p>
            <div className="sl-wallet-list">
              {installed.map((option) => (
                <button
                  key={option.definition.id}
                  type="button"
                  className="sl-wallet-option"
                  onClick={() => void connect(option)}
                  disabled={connecting}
                >
                  {option.icon ? (
                    <img className="sl-wallet-icon" src={option.icon} alt="" />
                  ) : (
                    <WalletMonogram accent={option.definition.accent} monogram={option.definition.monogram} />
                  )}
                  <span className="sl-wallet-body">
                    <span className="sl-wallet-name">{option.name}</span>
                    <span className="sl-wallet-desc">{option.definition.description}</span>
                  </span>
                  <span className="sl-wallet-detected">Detected</span>
                </button>
              ))}
            </div>
          </>
        )}

        <button type="button" className="sl-button sl-button-secondary" onClick={enterDemo}>
          Try the Simulation Sandbox
        </button>
      </div>
    );
  }

  // Connected users normally auto-join the network's shared ledger after
  // connect, so the manual Deploy/Join choice only appears in advanced mode
  // (?advanced=1) or on networks without a configured default (e.g. the local
  // devnet). In-progress/failed deploy states are handled by App's global
  // "Working…" panel and error banner.
  const manualChoiceVisible =
    deployment.status === 'idle' && (isAdvancedMode() || !DEFAULT_LEDGER_ADDRESSES[networkId]);

  if (manualChoiceVisible) {
    return (
      <div className="sl-panel">
        <h2>Wallet connected</h2>
        <div className="sl-row">
          <div className="u-grow">
            <p className="sl-meta">
              Unshielded: <HexBadge hex={walletInfo?.unshieldedAddress ?? ''} />
            </p>
          </div>
          <div className="u-grow">
            <p className="sl-meta">
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
              <span className="sl-row-sub">
                Create a fresh ShieldLedger auction on {deployment.status === 'idle' ? 'this network' : 'this network'}.
              </span>
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
            <div className="sl-row u-mt-1">
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