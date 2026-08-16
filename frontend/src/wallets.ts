/**
 * Registry of Midnight-compatible wallets supported by the ShieldLedger wallet
 * picker. Each entry describes how to detect the wallet's injected DApp
 * Connector API (window.midnight) and where a user can install it.
 *
 * The picker UI, detection, and connect flow all key off this single list, so
 * adding a new wallet later is a one-entry change here (id, name, icon glyph,
 * detection keys, install link) — no connection-logic rewrite.
 *
 * Verified against the Midnight docs community-wallet reference and each
 * wallet's own developer documentation:
 *   - Lace: official IOG wallet, injects at `window.midnight.mnLace`
 *   - 1AM:  community wallet, injects at `window.midnight['1am']`, apiVersion 4.0.0
 * Other names (SubWallet, NuFi, Gero, Vespr, ...) have only *announced* NIGHT
 * custody and do not implement the DApp Connector API, so they are
 * intentionally not listed here.
 */
export interface WalletDefinition {
  /** Stable unique id (used for selection and analytics). */
  readonly id: string;
  /** Display name shown in the wallet picker. */
  readonly name: string;
  /** One-line description shown under the name. */
  readonly description: string;
  /** Where to install the extension (official site or store). */
  readonly installUrl: string;
  /** Fixed keys the wallet may inject under `window.midnight`. */
  readonly connectorKeys: readonly string[];
  /** Stable reverse-DNS ids the wallet may report (v4 spec), matched as fallback. */
  readonly rdns?: readonly string[];
  /** Brand tint for the placeholder glyph shown when the extension is missing. */
  readonly accent: string;
  /** Initial(s) for the placeholder glyph shown when the extension is missing. */
  readonly monogram: string;
}

export const WALLET_DEFINITIONS: readonly WalletDefinition[] = [
  {
    id: 'lace',
    name: 'Lace',
    description: 'Official Midnight wallet by IOG — Chrome/Edge browser extension.',
    installUrl: 'https://www.lace.io',
    connectorKeys: ['mnLace'],
    accent: '#7c5ce0',
    monogram: 'L',
  },
  {
    id: '1am',
    name: '1AM',
    description: 'Community Midnight wallet with dust-free, sponsor-fee transactions.',
    installUrl:
      'https://chromewebstore.google.com/detail/1am/bphnkdkcnfhompoegfpgnkidcjfbojjp',
    connectorKeys: ['1am'],
    accent: '#0b7285',
    monogram: '1A',
  },
];
