import React, { useEffect, useState } from 'react';
import { ShieldLedgerProvider, useShieldLedger, type Role } from './context.js';
import { WalletConnect } from './components/WalletConnect.js';
import { InvoiceFinancing } from './components/InvoiceFinancing.js';
import { LedgerView } from './components/LedgerView.js';
import { HexBadge } from './components/HexBadge.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { useLedgerState } from './use-ledger-state.js';
import { track } from './lib/analytics.js';

const StoreIcon: React.FC = () => (
  <svg className="sl-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7 6 4h12l2 3v3a2 2 0 0 1-2 2 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-2-2V7Z" />
    <path d="M5 12v8h14v-8" />
  </svg>
);

const ShieldCheckIcon: React.FC = () => (
  <svg className="sl-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3Z" />
    <path d="m9 11.5 2 2 4-4" />
  </svg>
);

const TrendUpIcon: React.FC = () => (
  <svg className="sl-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);

const NAV_ITEMS: Array<{ role: Role; label: string; icon: React.FC }> = [
  { role: 'sme', label: "I'm an SME · sell invoices", icon: StoreIcon },
  { role: 'buyer', label: "I'm a Buyer · confirm invoices", icon: ShieldCheckIcon },
  { role: 'lender', label: "I'm a Lender · bid on invoices", icon: TrendUpIcon },
];

const initialOf = (address: string): string => {
  const first = address.replace(/^0x/, '').charAt(0);
  return /^[0-9a-fA-F]$/.test(first) ? first.toUpperCase() : 'S';
};

const Body: React.FC = () => {
  const { networkId, connected, disconnect, deployment, role, setRole, walletInfo, error, clearError } = useShieldLedger();
  const { state: ledgerState, error: ledgerError } = useLedgerState();
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  useEffect(() => {
    if (ledgerState) setLastUpdate(Date.now());
  }, [ledgerState]);

  const streamStatus =
    ledgerError != null
      ? 'stream error'
      : ledgerState != null
        ? `live · ${new Date(lastUpdate ?? Date.now()).toLocaleTimeString()}`
        : 'connecting…';

  const deployed = deployment.status === 'deployed';

  const changeRole = (next: Role) => {
    if (next === role) return;
    setRole(next);
    track('role_switch', { role: next });
  };

  return (
    <div className="sl-app">
      <header className="sl-header">
        <div className="sl-brand">
          <span className="sl-logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3Z" />
              <path d="m9 11.5 2 2 4-4" />
            </svg>
          </span>
          <div className="sl-brand-text">
            <h1 className="sl-title">ShieldLedger</h1>
            <p className="sl-subtitle">Confidential invoice financing on the Midnight Network — commitments on-chain, invoice details private.</p>
          </div>
        </div>
        <div className="sl-header-actions">
          <span className="sl-status-pill">
            <span className="sl-live-dot" aria-hidden="true" />
            {networkId}
          </span>
          {deployed && (
            <span className={ledgerError != null ? 'sl-status-pill sl-error' : 'sl-status-pill sl-live'}>{streamStatus}</span>
          )}
          {connected && (
            <>
              <span className="sl-avatar" aria-hidden="true">
                {initialOf(walletInfo?.unshieldedAddress ?? '')}
              </span>
              <div className="sl-identity">
                <HexBadge hex={walletInfo?.unshieldedAddress ?? ''} shortLength={12} />
                <span className="sl-verified">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3Z" />
                    <path d="m9 11.5 2 2 4-4" />
                  </svg>
                  Wallet Connected
                </span>
              </div>
              <div className="sl-top-metric">
                <span className="sl-top-metric-value">{ledgerState ? ledgerState.invoiceCount.toString() : '—'}</span>
                <span className="sl-top-metric-label">live invoices</span>
              </div>
              <button className="sl-button sl-button-secondary sl-header-action" onClick={disconnect}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </header>

      {deployed && (
        <nav className="sl-nav" aria-label="Role">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.role}
                type="button"
                className={role === item.role ? 'sl-nav-item sl-nav-active' : 'sl-nav-item'}
                onClick={() => changeRole(item.role)}
              >
                <Icon />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {error && (
        <div className="sl-error">
          <button className="sl-button sl-button-secondary" onClick={clearError} style={{ float: 'right', padding: '2px 8px' }}>
            dismiss
          </button>
          {error}
        </div>
      )}

      {deployment.status === 'in-progress' && (
        <div className="sl-panel">
          <p className="sl-meta">Working… (proving keys are large; first transaction may take a minute)</p>
        </div>
      )}

      {deployment.status === 'failed' && <div className="sl-error">{deployment.error}</div>}

      <WalletConnect />

      {deployed && (
        <div className="sl-grid">
          <InvoiceFinancing />
          <LedgerView />
        </div>
      )}
    </div>
  );
};

const App: React.FC<{ networkId: string }> = ({ networkId }) => (
  <ErrorBoundary>
    <ShieldLedgerProvider networkId={networkId}>
      <Body />
    </ShieldLedgerProvider>
  </ErrorBoundary>
);

export default App;
