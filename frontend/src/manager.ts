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
import { catchError, concatMap, filter, firstValueFrom, interval, map, take, tap, throwError, timeout } from 'rxjs';

import { inMemoryPrivateStateProvider } from './in-memory-private-state-provider.js';
import { ShieldLedgerAPI } from './shield-ledger-api.js';
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
 * locked. Lace rejects connect() with "Wallet is locked" instead of opening an
 * unlock prompt on its own, so the DApp keeps polling so that the connection
 * completes automatically once the user unlocks the extension.
 */
const connectWithUnlockRetry = async (
  wallet: InitialAPI,
  networkId: string,
  onLocked: () => void,
): Promise<ConnectedAPI> => {
  const deadline = Date.now() + UNLOCK_WAIT_MS;
  for (;;) {
    try {
      return await wallet.connect(networkId);
    } catch (error) {
      if (!isLockedError(error)) throw error;
      onLocked();
      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for the Lace wallet to be unlocked. Unlock it via the extension icon and try again.');
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

/**
 * Polls for the Lace wallet connector API, then connects on the given network.
 * While the wallet is locked, reports 'wallet-locked' via onStatus and keeps
 * retrying until the user unlocks it (or the wait times out).
 */
export const connectToWallet = (
  networkId: string,
  onStatus?: (status: 'wallet-locked') => void,
): Promise<ConnectedAPI> => {
  return firstValueFrom(
    interval(100).pipe(
      map(() => getFirstCompatibleWallet()),
      tap((connectorAPI) => log.info(connectorAPI ? 'Wallet connector API found.' : 'Waiting for wallet connector API...')),
      filter((connectorAPI): connectorAPI is InitialAPI => !!connectorAPI),
      take(1),
      timeout({
        first: 1_000,
        with: () =>
          throwError(() => new Error('Could not find Midnight Lace wallet. Extension installed?')),
      }),
      concatMap(async (initialAPI: InitialAPI) => {
        const connectedAPI = await connectWithUnlockRetry(initialAPI, networkId, () => onStatus?.('wallet-locked'));
        const connectionStatus = await connectedAPI.getConnectionStatus();
        log.info(`Wallet connection status: ${JSON.stringify(connectionStatus)}`);
        return connectedAPI;
      }),
      timeout({
        first: CONNECT_RESPONSE_MS,
        with: () => throwError(() => new Error('Midnight Lace wallet has failed to respond. Extension enabled?')),
      }),
      catchError((error: unknown) => {
        log.error('Unable to enable connector API', error);
        // Surface the real cause (missing extension, wallet locked, network
        // mismatch, timed-out approval) instead of a generic message.
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
          log.error('Error balancing transaction via wallet', e);
          throw e;
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
