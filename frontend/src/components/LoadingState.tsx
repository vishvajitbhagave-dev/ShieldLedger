import React from 'react';

interface LoadingStateProps {
  readonly label?: string;
  readonly hint?: string;
}

/**
 * Intentional full-block loading state for data-driven pages: emerald spinner
 * centered within the panel so content never jumps to a blank screen while a
 * stream connects or a derivation runs.
 */
export const LoadingState: React.FC<LoadingStateProps> = ({ label = 'Loading…', hint }) => (
  <div className="sl-loading" role="status" aria-live="polite">
    <span className="sl-loading-spinner" aria-hidden="true" />
    <p className="sl-loading-label">{label}</p>
    {hint != null && <p className="sl-loading-hint">{hint}</p>}
  </div>
);