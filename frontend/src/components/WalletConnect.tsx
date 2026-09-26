import React, { useEffect, useState } from 'react';
import { useShieldLedger } from '../context.js';
import { listWalletOptions } from '../manager.js';
import { HexBadge } from './HexBadge.js';
import { WalletPickerModal } from './WalletPickerModal.js';
import { WalletNetworkNotice } from './WalletNetworkNotice.js';
import { clearChosenWallet, readChosenWallet } from '../lib/wallet-handoff.js';
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

export const WalletConnect: React.FC = () => {
  const { networkId, connecting, connected, walletInfo, deployment, connect, deploy, join, demo, enterDemo } = useShieldLedger();
  const [joinAddress, setJoinAddress] = useState('');
  const [joining, setJoining] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // The landing page's wallet modal hands off its choice through sessionStorage:
  // on arrival, connect to that wallet once — this is what opens the extension's
  // single approval prompt here. The flag is cleared before connecting so a
  // refresh of index.html (or indirect navigation) never re-triggers it.
  // connect() itself no-ops while a demo session is active (?demo=1 wins).
  useEffect(() => {
    const chosen = readChosenWallet();
    if (chosen === null) return;
    clearChosenWallet();
    const option = listWalletOptions().find((o) => o.definition.id === chosen);
    if (option?.installed) void connect(option);
  }, [connect]);

  const busy = deployment.status === 'in-progress';

  // Demo Mode takes over the whole shell — no wallet gate to render.
  if (demo) return null;

  // Not connected to a wallet: a one-line panel with a button that opens the
  // shared WalletPickerModal. Selecting a wallet here connects directly (we're
  // already on index.html), reusing the app's normal connect/auto-join path.
  if (!connected) {
    return (
      <div className="sl-panel sl-gate">
        <p>
          <strong>Connect your wallet to continue</strong>
        </p>
        <p className="sl-meta">
          ShieldLedger needs a Midnight wallet to sign for you on-chain. Private state never leaves your wallet.
        </p>
        <WalletNetworkNotice />
        <button type="button" className="sl-button" onClick={() => setPickerOpen(true)} disabled={connecting}>
          Choose a wallet
        </button>
        <button type="button" className="sl-button sl-button-secondary" onClick={enterDemo}>
          Try the Simulation Sandbox
        </button>
        <WalletPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(option) => void connect(option)}
          busy={connecting}
        />
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