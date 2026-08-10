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
} from './manager.js';
import type { ShieldLedgerProviders } from './shield-ledger-types.js';

export interface ShieldLedgerContextValue {
  readonly networkId: string;
  readonly connecting: boolean;
  readonly walletLocked: boolean;
  readonly connected: boolean;
  readonly walletInfo: WalletInfo | null;
  readonly deployment: DeploymentState;
  readonly connect: () => Promise<void>;
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
  const [providers, setProviders] = useState<ShieldLedgerProviders | null>(null);
  const [deployment, setDeployment] = useState<DeploymentState>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const connectedAPI = useRef<ConnectedAPI | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setWalletLocked(false);
    setError(null);
    try {
      const api = await connectToWallet(networkId, (status) => {
        if (status === 'wallet-locked') setWalletLocked(true);
      });
      connectedAPI.current = api;
      const info = await getWalletInfo(api);
      const ps = await initializeProviders(api);
      setWalletInfo(info);
      setProviders(ps);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    } catch (e) {
      setDeployment({ status: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  }, [providers]);

  const join = useCallback(async (contractAddress: string) => {
    if (!providers) return;
    setError(null);
    setDeployment({ status: 'in-progress', kind: 'join' });
    try {
      const api = await joinShieldLedger(providers, contractAddress.trim());
      setDeployment({ status: 'deployed', api, address: api.deployedContractAddress });
    } catch (e) {
      setDeployment({ status: 'failed', error: e instanceof Error ? e.message : String(e) });
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
      connect,
      disconnect,
      deploy,
      join,
      error,
      clearError,
    }),
    [networkId, connecting, walletLocked, walletInfo, deployment, connect, disconnect, deploy, join, error, clearError],
  );

  return <ShieldLedgerContext.Provider value={value}>{children}</ShieldLedgerContext.Provider>;
};
