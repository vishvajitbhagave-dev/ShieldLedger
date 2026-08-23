import React from 'react';
import type { UserFacingError } from '../lib/errorMessages.js';

interface ErrorBannerProps {
  error: UserFacingError | null;
  onDismiss?: () => void;
  onReconnect?: () => void;
}

/**
 * Renders a mapped user-facing error: the friendly message, an optional
 * action (faucet link / reconnect button), and the raw technical error tucked
 * behind a collapsed "Show technical details" expander.
 */
export const ErrorBanner: React.FC<ErrorBannerProps> = ({ error, onDismiss, onReconnect }) => {
  if (!error) return null;

  return (
    <div className="sl-error sl-error-banner" role="alert">
      {onDismiss && (
        <button type="button" className="sl-error-dismiss" onClick={onDismiss} aria-label="Dismiss error">
          ✕
        </button>
      )}
      <div className="sl-error-body">
        <span className="sl-error-message">{error.message}</span>
        {error.action && (
          <div className="sl-error-actions">
            {error.action?.kind === 'link' && (
              <a
                className="sl-error-action"
                href={error.action.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {error.action.label}
              </a>
            )}
            {error.action?.kind === 'reconnect' && onReconnect && (
              <button type="button" className="sl-error-action" onClick={onReconnect}>
                Reconnect wallet
              </button>
            )}
          </div>
        )}
      </div>
      <details className="sl-error-tech-details">
        <summary>Show technical details</summary>
        <pre className="sl-error-tech">{error.technical.length > 0 ? error.technical : '(the underlying error had no message)'}</pre>
      </details>
    </div>
  );
};
