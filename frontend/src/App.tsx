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
        <div>
          <h1 className="sl-title">ShieldLedger</h1>
          <p className="sl-subtitle">
            Confidential invoice financing on the Midnight Network — commitments on-chain, invoice details private.
          </p>
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
