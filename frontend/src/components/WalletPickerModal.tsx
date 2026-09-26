import React, { useEffect } from 'react';
import { listWalletOptions, type WalletOption } from '../manager.js';
import { WalletNetworkNotice } from './WalletNetworkNotice.js';

export interface WalletPickerModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called when the user clicks a DETECTED wallet row (after any close logic). */
  readonly onSelect: (option: WalletOption) => void;
  /** Disables the detect rows while a connection is in flight. */
  readonly busy?: boolean;
}

const CloseIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

/** Brand square shown instead of a wallet icon: purple L for Lace, teal 1A for 1AM. */
const WalletMonogram: React.FC<{ accent: string; monogram: string }> = ({ accent, monogram }) => (
  <span className="sl-wallet-monogram" style={{ backgroundColor: accent }} aria-hidden="true">
    {monogram}
  </span>
);

/**
 * The single wallet picker used everywhere (landing page and app shell): a
 * centered card over a blurred backdrop listing compatible Midnight wallets
 * (Lace first, then 1AM — registry order in wallets.ts). Detected wallets are
 * clickable; missing ones show an Install link instead. Closing via the X,
 * clicking the backdrop, or pressing Escape never triggers a connection. The
 * component performs no connection logic itself — it reports the chosen wallet
 * to the caller, which decides to navigate (landing) or connect (app).
 */
export const WalletPickerModal: React.FC<WalletPickerModalProps> = ({ open, onClose, onSelect, busy }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const options = listWalletOptions();

  return (
    <div className="sl-modal-backdrop" onClick={onClose}>
      <div
        className="sl-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Select a wallet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sl-modal-head">
          <div>
            <h3>Select a wallet</h3>
            <p className="sl-meta">Choose which Midnight wallet to connect with.</p>
          </div>
          <button type="button" className="sl-modal-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <WalletNetworkNotice />

        <div className="sl-wallet-list">
          {options.map((option) =>
            option.installed ? (
              <button
                key={option.definition.id}
                type="button"
                className="sl-wallet-option"
                onClick={() => onSelect(option)}
                disabled={busy}
              >
                <WalletMonogram accent={option.definition.accent} monogram={option.definition.monogram} />
                <span className="sl-wallet-body">
                  <span className="sl-wallet-name">{option.name}</span>
                  <span className="sl-wallet-desc">{option.definition.description}</span>
                </span>
                <span className="sl-wallet-detected">Detected</span>
              </button>
            ) : (
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
            ),
          )}
        </div>
      </div>
    </div>
  );
};