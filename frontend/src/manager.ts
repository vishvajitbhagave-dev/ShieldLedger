// Browser wiring for ShieldLedger: discovers the Midnight Lace wallet (via
// the DApp Connector injected into `window.midnight`), assembles the typed
// provider stack, and offers deploy/join operations. Mirrors the
// example-bboard browser manager, adapted for the ShieldLedger contract.
import { type ContractAddress, fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { ConnectedAPI, type InitialAPI, type Configuration } from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { Binding, FinalizedTransaction, Proof, SignatureEnabled, Transaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import semver from 'semver';
import { catchError, concatMap, filter, firstValueFrom, interval, map, of, take, tap, throwError, timeout } from 'rxjs';

import { WALLET_DEFINITIONS, type WalletDefinition } from './wallets.js';
import { inMemoryPrivateStateProvider } from './in-memory-private-state-provider.js';
import { ShieldLedgerAPI } from './shield-ledger-api.js';
import { WalletBalanceError } from './lib/errorMessages.js';
import type { ShieldLedgerPrivateState } from '../../src/witnesses.js';
import {
  shieldLedgerPrivateStateKey,
  type ShieldLedgerCircuitKeys,
  type ShieldLedgerPrivateStateId,
  type ShieldLedgerProviders,
} from './shield-ledger-types.js';

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';

const LOCKED_RETRY_MS = 1_000;
const UNLOCK_WAIT_MS = 60_000;
const CONNECT_RESPONSE_MS = 60_000;

const isLockedError = (error: unknown): boolean =>
  error instanceof Error && /locked/i.test(error.message);

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls wallet.connect(networkId), retrying while the wallet reports that it is
 * locked. Wallets reject connect() with "Wallet is locked" instead of opening
 * an unlock prompt on their own, so the DApp keeps polling so that the
 * connection completes automatically once the user unlocks the extension.
 */
const connectWithUnlockRetry = async (
  wallet: InitialAPI,
  networkId: string,
  onLocked: () => void,
  signal?: AbortSignal,
): Promise<ConnectedAPI> => {
  const deadline = Date.now() + UNLOCK_WAIT_MS;
  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      return await wallet.connect(networkId);
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!isLockedError(error)) throw error;
      onLocked();
      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for ${wallet.name || 'the wallet'} to be unlocked. Unlock it via the extension icon and try again.`,
        );
      }
      await delay(LOCKED_RETRY_MS);
    }
  }
};

const getFirstCompatibleWallet = (): InitialAPI | undefined => {
  if (!window.midnight) return undefined;
  return Object.values(window.midnight).find(
    (wallet): wallet is InitialAPI =>
      !!wallet &&
      typeof wallet === 'object' &&
      'apiVersion' in wallet &&
      semver.satisfies(wallet.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );
};

const log = {
  info: (msg: string): void => console.log(`[shieldledger] ${msg}`),
  error: (msg: string, err?: unknown): void => console.error(`[shieldledger] ${msg}`, err),
};

export interface WalletOption {
  /** The registry entry this option came from. */
  readonly definition: WalletDefinition;
  /** Whether a compatible wallet extension is currently injected in this browser. */
  readonly installed: boolean;
  /** Display name — from the injected wallet when available, else the registry. */
  readonly name: string;
  /** Icon URL / data URL reported by the installed wallet (render via <img>). */
  readonly icon: string | null;
  /** The wallet's injected DApp Connector API, or null when not installed. */
  readonly api: InitialAPI | null;
}

const findWalletByDefinition = (definition: WalletDefinition): InitialAPI | undefined => {
  if (!window.midnight) return undefined;
  const entries = Object.entries(window.midnight);
  const matched = entries.find(([key, wallet]) => {
    if (!wallet || typeof wallet !== 'object' || !('apiVersion' in wallet)) return false;
    if (!semver.satisfies(wallet.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION)) return false;
    const byKey = definition.connectorKeys.some((k) => k === key);
    const byRdns =
      (definition.rdns ?? []).includes(wallet.rdns) ||
      definition.connectorKeys.includes(wallet.rdns);
    const byName = wallet.name?.toLowerCase() === definition.name.toLowerCase();
    return byKey || byRdns || byName;
  });
  return matched ? (matched[1] as InitialAPI) : undefined;
};

/**
 * Enumerates the configured wallets against what is injected under
 * `window.midnight`, in registry order (Lace first). Wallets whose extension
 * is missing are still returned, marked `installed: false`, so the picker can
 * grey them out with an install link instead of hiding them.
 */
export const listWalletOptions = (): WalletOption[] =>
  WALLET_DEFINITIONS.map((definition) => {
    const api = findWalletByDefinition(definition);
    return {
      definition,
      installed: api !== undefined,
      name: api?.name ?? definition.name,
      icon: api?.icon ?? null,
      api: api ?? null,
    };
  });

/**
 * Connects to the wallet's DApp Connector API on the given network.
 *
 * When `selectedWallet` is provided (picked from the wallet modal) it connects
 * to that wallet directly. Otherwise it polls for the first compatible
 * injected wallet — the pre-multi-wallet behavior, kept as a fallback.
 *
 * While the wallet is locked, reports 'wallet-locked' via onStatus and keeps
 * retrying until the user unlocks it (or the wait times out). Any connect
 * rejection, approval timeout, or network mismatch surfaces as a clear error.
 */
export const connectToWallet = (
  networkId: string,
  onStatus?: (status: 'wallet-locked') => void,
  selectedWallet?: InitialAPI,
  signal?: AbortSignal,
): Promise<ConnectedAPI> => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const source$ = selectedWallet
    ? of(selectedWallet)
    : interval(100).pipe(
        map(() => getFirstCompatibleWallet()),
        tap((connectorAPI) => log.info(connectorAPI ? 'Wallet connector API found.' : 'Waiting for wallet connector API...')),
        filter((connectorAPI): connectorAPI is InitialAPI => !!connectorAPI),
        take(1),
        timeout({
          first: 1_000,
          with: () =>
            throwError(() => new Error('Could not find a Midnight wallet extension. Install one to continue.')),
        }),
      );

  return firstValueFrom(
    source$.pipe(
      concatMap(async (initialAPI: InitialAPI) => {
        const connectedAPI = await connectWithUnlockRetry(initialAPI, networkId, () => onStatus?.('wallet-locked'), signal);
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const connectionStatus = await connectedAPI.getConnectionStatus();
        log.info(`Wallet connection status: ${JSON.stringify(connectionStatus)}`);
        if (connectionStatus.status !== 'connected') {
          throw new Error(
            `${initialAPI.name || 'The wallet'} reports a lost connection. Re-open the wallet and try again.`,
          );
        }
        if (connectionStatus.networkId.trim().toLowerCase() !== networkId.trim().toLowerCase()) {
          throw new Error(
            `${initialAPI.name || 'The wallet'} is connected to the "${connectionStatus.networkId}" network, but ShieldLedger expects "${networkId}". Switch networks in your wallet and try again.`,
          );
        }
        return connectedAPI;
      }),
      timeout({
        first: CONNECT_RESPONSE_MS,
        with: () => throwError(() => new Error('The wallet has failed to respond. Extension enabled?')),
      }),
      catchError((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return throwError(() => new DOMException('Cancelled', 'AbortError'));
        }
        log.error('Unable to enable connector API', error);
        return throwError(() =>
          error instanceof Error
            ? error
            : new Error('Application is not authorized: ' + String(error)),
        );
      }),
    ),
  );
};

export interface WalletInfo {
  readonly unshieldedAddress: string;
  readonly shieldedAddress: string;
  readonly coinPublicKey: string;
  readonly encryptionPublicKey: string;
}

export const getWalletInfo = async (connectedAPI: ConnectedAPI): Promise<WalletInfo> => {
  const [shielded, unshielded] = await Promise.all([
    connectedAPI.getShieldedAddresses(),
    connectedAPI.getUnshieldedAddress(),
  ]);
  return {
    unshieldedAddress: unshielded.unshieldedAddress,
    shieldedAddress: shielded.shieldedAddress,
    coinPublicKey: shielded.shieldedCoinPublicKey,
    encryptionPublicKey: shielded.shieldedEncryptionPublicKey,
  };
};

const effectiveConfiguration = (config: Configuration): Configuration => {
  const indexerUri = import.meta.env.VITE_INDEXER_URL || config.indexerUri;
  const indexerWsUri = import.meta.env.VITE_INDEXER_WS_URL || config.indexerWsUri;
  const proverServerUri = import.meta.env.VITE_PROOF_SERVER_URL || config.proverServerUri;
  return { ...config, indexerUri, indexerWsUri, proverServerUri };
};

/** Assembles the typed provider stack backed by the wallet's DApp Connector API. */
export const initializeProviders = async (connectedAPI: ConnectedAPI): Promise<ShieldLedgerProviders> => {
  const config = effectiveConfiguration(await connectedAPI.getConfiguration());
  const shieldedAddresses = await connectedAPI.getShieldedAddresses();
  const zkConfigPath = `${window.location.origin}${import.meta.env.BASE_URL}zk`;
  const zkConfigProvider = new FetchZkConfigProvider<ShieldLedgerCircuitKeys>(
    zkConfigPath,
    fetch.bind(window),
  );
  const privateStateProvider = inMemoryPrivateStateProvider<ShieldLedgerPrivateStateId, ShieldLedgerPrivateState>();

  return {
    privateStateProvider,
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proverServerUri!, zkConfigProvider, { timeout: 600_000 }),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey(): string {
        return shieldedAddresses.shieldedCoinPublicKey;
      },
      getEncryptionPublicKey(): string {
        return shieldedAddresses.shieldedEncryptionPublicKey;
      },
      balanceTx: async (tx: UnboundTransaction) => {
        try {
          log.info('Balancing transaction via wallet');
          const serializedTx = toHex(tx.serialize());
          const received = await connectedAPI.balanceUnsealedTransaction(serializedTx);
          return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
            'signature',
            'proof',
            'binding',
            fromHex(received.tx),
          );
        } catch (e) {
          // Tag the failure so the UI can show fee/balance guidance; the
          // original error stays attached (and logged) for technical details.
          log.error('Error balancing transaction via wallet', e);
          throw e instanceof WalletBalanceError ? e : new WalletBalanceError('Transaction balancing failed.', e);
        }
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction) => {
        await connectedAPI.submitTransaction(toHex(tx.serialize()));
        const txIdentifiers = tx.identifiers();
        log.info(`Submitted transaction via wallet (${txIdentifiers[0]})`);
        return txIdentifiers[0];
      },
    },
  };
};

export type DeploymentState =
  | { status: 'idle' }
  | { status: 'in-progress'; kind: 'deploy' | 'join' }
  | { status: 'deployed'; api: ShieldLedgerAPI; address: ContractAddress }
  | { status: 'failed'; error: string };

/** Deploys a brand-new ShieldLedger contract with the given providers. */
export const deployShieldLedger = async (providers: ShieldLedgerProviders): Promise<ShieldLedgerAPI> => {
  log.info('Deploying ShieldLedger contract');
  return ShieldLedgerAPI.deploy(providers);
};

/** Joins an existing ShieldLedger contract by address. */
export const joinShieldLedger = async (
  providers: ShieldLedgerProviders,
  contractAddress: string,
): Promise<ShieldLedgerAPI> => {
  log.info(`Joining ShieldLedger contract ${contractAddress}`);
  return ShieldLedgerAPI.join(providers, contractAddress as ContractAddress);
};

export { shieldLedgerPrivateStateKey };
