import React from 'react';

/**
 * Persistent, non-dismissible banner shown across the app while Demo Mode is
 * active. It keeps the walkthrough honest: every screen is simulated data and
 * nothing touches the blockchain. Exiting goes through the header action or
 * this button (both call the same context exitDemo()).
 */
export const DemoBanner: React.FC<{ onExit: () => void }> = ({ onExit }) => (
  <div className="sl-demo-banner" role="status" aria-label="Demo mode active">
    <div className="sl-demo-banner-body">
      <span className="sl-demo-banner-title">Demo mode</span>
      <span className="sl-demo-banner-text">
        You&apos;re exploring simulated data only — nothing here touches the blockchain and no wallet is
        required.
      </span>
    </div>
    <button type="button" className="sl-button sl-button-secondary sl-demo-banner-exit" onClick={onExit}>
      Exit demo
    </button>
  </div>
);