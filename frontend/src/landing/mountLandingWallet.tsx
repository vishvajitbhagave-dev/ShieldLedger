import React from 'react';
import { createRoot } from 'react-dom/client';
import { LandingWalletController } from './landingWallet.js';

/**
 * Entry point of the lazily loaded landing bundle: replaces the native loading
 * backdrop (inserted by landing.ts) with the React-rendered wallet picker.
 * This module — and therefore React, the modal and the wallet manager — is only
 * fetched when a "Connect Wallet" CTA is first clicked.
 */
export const mountLandingWallet = (rootEl: HTMLElement): void => {
  rootEl.replaceChildren();
  createRoot(rootEl).render(React.createElement(LandingWalletController));
};