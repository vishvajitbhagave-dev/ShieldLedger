/**
 * One-shot handoff between the landing page and the app: picking a wallet in
 * the landing page's WalletPickerModal stores its id here, then navigates to
 * index.html. The app reads+clears it on boot and connects to that wallet
 * exactly once — the extension's approval prompt opens on the app page and no
 * refresh re-triggers it.
 */
const CHOSEN_WALLET_KEY = 'shieldledger.chosenWallet';

export const writeChosenWallet = (walletId: string): void => {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(CHOSEN_WALLET_KEY, walletId);
};

export const readChosenWallet = (): string | null => {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(CHOSEN_WALLET_KEY);
};

export const clearChosenWallet = (): void => {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(CHOSEN_WALLET_KEY);
};