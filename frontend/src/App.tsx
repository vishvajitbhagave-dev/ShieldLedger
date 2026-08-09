import React from 'react';
import { ShieldLedgerProvider, useShieldLedger } from './context.js';
import { WalletConnect } from './components/WalletConnect.js';
import { InvoiceFinancing } from './components/InvoiceFinancing.js';
import { LedgerView } from './components/LedgerView.js';

const Body: React.FC = () => {
  const { networkId, deployment, error, clearError } = useShieldLedger();

  return (
    <div className="sl-app">
      <header className="sl-header">
        <div>
          <h1 className="sl-title">ShieldLedger</h1>
          <p className="sl-subtitle">
            Confidential invoice financing on the Midnight Network — commitments on-chain, invoice details private.
          </p>
        </div>
        <span className="sl-network-badge">network: {networkId}</span>
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
  <ShieldLedgerProvider networkId={networkId}>
    <Body />
  </ShieldLedgerProvider>
);

export default App;
