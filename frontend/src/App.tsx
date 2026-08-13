import React, { useEffect, useState } from 'react';
import { ShieldLedgerProvider, useShieldLedger } from './context.js';
import { WalletConnect } from './components/WalletConnect.js';
import { InvoiceFinancing } from './components/InvoiceFinancing.js';
import { LedgerView } from './components/LedgerView.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { useLedgerState } from './use-ledger-state.js';

const Body: React.FC = () => {
  const { networkId, connected, disconnect, deployment, error, clearError } = useShieldLedger();
  const { state: ledgerState, error: ledgerError } = useLedgerState();
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  useEffect(() => {
    if (ledgerState) setLastUpdate(Date.now());
  }, [ledgerState]);

  const streamStatus =
    ledgerError != null
      ? 'stream error'
      : ledgerState != null
        ? `● live · ${new Date(lastUpdate ?? Date.now()).toLocaleTimeString()}`
        : '● connecting…';

  return (
    <div className="sl-app">
      <header className="sl-header">
        <div className="sl-brand">
          <span className="sl-logo" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3Z" />
              <path d="m9 11.5 2 2 4-4" />
            </svg>
          </span>
          <div>
            <h1 className="sl-title">ShieldLedger</h1>
            <p className="sl-subtitle">
              Confidential invoice financing on the Midnight Network — commitments on-chain, invoice details private.
            </p>
          </div>
        </div>
        <div className="sl-header-actions">
          {deployment.status === 'deployed' && (
            <span className={ledgerError != null ? 'sl-network-badge' : 'sl-network-badge sl-live'}>{streamStatus}</span>
          )}
          <span className="sl-network-badge">network: {networkId}</span>
          {connected && (
            <button className="sl-button sl-button-secondary sl-header-action" onClick={disconnect}>
              Disconnect
            </button>
          )}
        </div>
      </header>

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

      {deployment.status === 'failed' && (
        <div className="sl-error">{deployment.error}</div>
      )}

      <WalletConnect />

      {deployment.status === 'deployed' && (
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
