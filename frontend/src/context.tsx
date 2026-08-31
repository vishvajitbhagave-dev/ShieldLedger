import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { ShieldLedgerAPI } from './shield-ledger-api.js';
import {
  connectToWallet,
  deployShieldLedger,
  getWalletInfo,
  initializeProviders,
  joinShieldLedger,
  type DeploymentState,
  type WalletInfo,
  type WalletOption,
} from './manager.js';
import type { ShieldLedgerProviders } from './shield-ledger-types.js';
import { describeError, type UserFacingError } from './lib/errorMessages.js';
import { track } from './lib/analytics.js';
import { captureError } from './lib/monitoring.js';

/** User role in the invoice-financing workflow. */
export type Role = 'sme' | 'lender' | 'buyer';

const ROLE_STORAGE_KEY = 'shieldledger.role';

const loadRole = (): Role | null => {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem(ROLE_STORAGE_KEY);
  return stored === 'sme' || stored === 'lender' || stored === 'buyer' ? stored : null;
};

export interface ShieldLedgerContextValue {
  readonly networkId: string;
  readonly connecting: boolean;
  readonly walletLocked: boolean;
  readonly connected: boolean;
  readonly walletInfo: WalletInfo | null;
  readonly deployment: DeploymentState;
  readonly role: Role | null;
  readonly setRole: (role: Role) => void;
  readonly clearRole: () => void;
  readonly connect: (selected?: WalletOption) => Promise<void>;
  readonly disconnect: () => void;
  readonly deploy: () => Promise<void>;
  readonly join: (contractAddress: string) => Promise<void>;
  readonly error: UserFacingError | null;
  readonly clearError: () => void;
}

const ShieldLedgerContext = createContext<ShieldLedgerContextValue | null>(null);

export const useShieldLedger = (): ShieldLedgerContextValue => {
  const value = useContext(ShieldLedgerContext);
  if (!value) throw new Error('useShieldLedger must be used within <ShieldLedgerProvider>');
  return value;
};

export const ShieldLedgerProvider: React.FC<{ networkId: string; children: React.ReactNode }> = ({
  networkId,
  children,
}) => {
  const [connecting, setConnecting] = useState(false);
  const [walletLocked, setWalletLocked] = useState(false);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [role, setRoleState] = useState<Role | null>(() => loadRole());
  const [providers, setProviders] = useState<ShieldLedgerProviders | null>(null);
  const [deployment, setDeployment] = useState<DeploymentState>({ status: 'idle' });
  const [error, setError] = useState<UserFacingError | null>(null);
  const connectedAPI = useRef<ConnectedAPI | null>(null);
  const connectGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(ROLE_STORAGE_KEY, next);
      } catch {
        // Storage unavailable: the role applies for this session only.
      }
    }
  }, []);

  const clearRole = useCallback(() => {
    setRoleState(null);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(ROLE_STORAGE_KEY);
      } catch {
        // Storage unavailable: nothing persisted to clear.
      }
    }
  }, []);

  const connect = useCallback(async (selected?: WalletOption) => {
    // Cancel any previous in-flight connect attempt.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = ++connectGeneration.current;

    setConnecting(true);
    setWalletLocked(false);
    setError(null);
    try {
      const api = await connectToWallet(
        networkId,
        (status) => {
          if (status === 'wallet-locked' && gen === connectGeneration.current) {
            setWalletLocked(true);
          }
        },
        selected?.api ?? undefined,
        controller.signal,
      );
      // Stale: a newer connect() has already started — discard this result.
      if (gen !== connectGeneration.current) return;
      connectedAPI.current = api;
      const info = await getWalletInfo(api);
      const ps = await initializeProviders(api);
      setWalletInfo(info);
      setProviders(ps);
      track('wallet_connect', { outcome: 'success', network: networkId });
    } catch (e) {
      // Stale: discard the error from a superseded attempt.
      if (gen !== connectGeneration.current) return;
      setError(describeError('connect', e));
      captureError(e, { step: 'connect' });
      track('wallet_connect', { outcome: 'error' });
    } finally {
      // Only clear the "connecting" flag if we are still the active attempt.
      if (gen === connectGeneration.current) {
        setConnecting(false);
        setWalletLocked(false);
      }
    }
  }, [networkId]);

  const disconnect = useCallback(() => {
    connectedAPI.current = null;
    setWalletInfo(null);
    setProviders(null);
    setDeployment({ status: 'idle' });
    setWalletLocked(false);
    setError(null);
  }, []);

  const deploy = useCallback(async () => {
    if (!providers) return;
    setError(null);
    setDeployment({ status: 'in-progress', kind: 'deploy' });
    try {
      const api = await deployShieldLedger(providers);
      setDeployment({ status: 'deployed', api, address: api.deployedContractAddress });
      track('contract_deploy', { outcome: 'success' });
    } catch (e) {
      setDeployment({ status: 'failed', error: e instanceof Error ? e.message : String(e) });
      captureError(e, { step: 'deploy' });
      track('contract_deploy', { outcome: 'error' });
    }
  }, [providers]);

  const join = useCallback(async (contractAddress: string) => {
    if (!providers) return;
    setError(null);
    setDeployment({ status: 'in-progress', kind: 'join' });
    try {
      const api = await joinShieldLedger(providers, contractAddress.trim());
      setDeployment({ status: 'deployed', api, address: api.deployedContractAddress });
      track('contract_join', { outcome: 'success' });
    } catch (e) {
      setDeployment({ status: 'failed', error: e instanceof Error ? e.message : String(e) });
      captureError(e, { step: 'join' });
      track('contract_join', { outcome: 'error' });
    }
  }, [providers]);

  const value = useMemo<ShieldLedgerContextValue>(
    () => ({
      networkId,
      connecting,
      walletLocked,
      connected: walletInfo !== null,
      walletInfo,
      deployment,
      role,
      setRole,
      clearRole,
      connect,
      disconnect,
      deploy,
      join,
      error,
      clearError,
    }),
    [networkId, connecting, walletLocked, walletInfo, deployment, role, setRole, clearRole, connect, disconnect, deploy, join, error, clearError],
  );

  return <ShieldLedgerContext.Provider value={value}>{children}</ShieldLedgerContext.Provider>;
};
