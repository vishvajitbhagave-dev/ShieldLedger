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
import { track } from './lib/analytics.js';
import { captureError } from './lib/monitoring.js';

/** User role in the invoice-financing workflow. */
export type Role = 'sme' | 'lender' | 'buyer';

const ROLE_STORAGE_KEY = 'shieldledger.role';

const loadRole = (): Role => {
  if (typeof localStorage === 'undefined') return 'sme';
  const stored = localStorage.getItem(ROLE_STORAGE_KEY);
  return stored === 'lender' || stored === 'buyer' ? stored : 'sme';
};

export interface ShieldLedgerContextValue {
  readonly networkId: string;
  readonly connecting: boolean;
  readonly walletLocked: boolean;
  readonly connected: boolean;
  readonly walletInfo: WalletInfo | null;
  readonly deployment: DeploymentState;
  readonly role: Role;
  readonly setRole: (role: Role) => void;
  readonly connect: (selected?: WalletOption) => Promise<void>;
  readonly disconnect: () => void;
  readonly deploy: () => Promise<void>;
  readonly join: (contractAddress: string) => Promise<void>;
  readonly error: string | null;
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
  const [role, setRoleState] = useState<Role>(() => loadRole());
  const [providers, setProviders] = useState<ShieldLedgerProviders | null>(null);
  const [deployment, setDeployment] = useState<DeploymentState>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const connectedAPI = useRef<ConnectedAPI | null>(null);

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

  const connect = useCallback(async (selected?: WalletOption) => {
    setConnecting(true);
    setWalletLocked(false);
    setError(null);
    try {
      const api = await connectToWallet(
        networkId,
        (status) => {
          if (status === 'wallet-locked') setWalletLocked(true);
        },
        selected?.api ?? undefined,
      );
      connectedAPI.current = api;
      const info = await getWalletInfo(api);
      const ps = await initializeProviders(api);
      setWalletInfo(info);
      setProviders(ps);
      track('wallet_connect', { outcome: 'success', network: networkId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      captureError(e, { step: 'connect' });
      track('wallet_connect', { outcome: 'error' });
    } finally {
      setConnecting(false);
      setWalletLocked(false);
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
      connect,
      disconnect,
      deploy,
      join,
      error,
      clearError,
    }),
    [networkId, connecting, walletLocked, walletInfo, deployment, role, setRole, connect, disconnect, deploy, join, error, clearError],
  );

  return <ShieldLedgerContext.Provider value={value}>{children}</ShieldLedgerContext.Provider>;
};
