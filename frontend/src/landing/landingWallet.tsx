import React, { useState } from 'react';
import { WalletPickerModal } from '../components/WalletPickerModal.js';
import type { WalletOption } from '../manager.js';
import { writeChosenWallet } from '../lib/wallet-handoff.js';

/**
 * The shared WalletPickerModal host for the marketing page. The Connect
 * Wallet / Launch the app CTAs (handled in landing.ts) show a native loading
 * backdrop, dynamically import this module together with React, and mount the
 * controller with the modal already open — so NO React or wallet code ships in
 * the landing entry bundle. Selecting a DETECTED wallet only records the choice
 * and navigates to the app; the actual connect() call happens on index.html,
 * which triggers the extension's single approval prompt there.
 */
export const LandingWalletController: React.FC = () => {
  const [open, setOpen] = useState(true);

  const handleSelect = (option: WalletOption): void => {
    writeChosenWallet(option.definition.id);
    window.location.assign('./index.html');
  };

  if (!open) return null;
  return <WalletPickerModal open onClose={() => setOpen(false)} onSelect={handleSelect} />;
};