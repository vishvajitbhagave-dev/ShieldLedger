import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
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
import { trackSessionStart } from './lib/usage-stats.js';
import { captureError } from './lib/monitoring.js';
import {
  loadStoredNetworkId,
  NETWORK_LABELS,
  storeNetworkId,
  type RuntimeNetworkId,
} from './network.js';
import {
  contractOverrideFromUrl,
  DEFAULT_LEDGER_ADDRESSES,
  isAdvancedMode,
  loadStoredContractAddress,
  storeStoredContractAddress,
} from './default-contracts.js';
import {
  demoRequestedFromUrl,
  readDemoModeActive,
  resetDemoLedger,
  writeDemoModeActive,
} from './lib/demo-ledger.js';

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
  readonly setNetwork: (network: RuntimeNetworkId) => void;
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
  /** True while a client-side simulated-Demo session is active. */
  readonly demo: boolean;
  /** Enters Demo Mode: tears down the live session first, then starts the simulated ledger. */
  readonly enterDemo: () => void;
  /** Leaves Demo Mode and resets the simulated ledger to its seed. */
  readonly exitDemo: () => void;
}

const ShieldLedgerContext = createContext<ShieldLedgerContextValue | null>(null);

export const useShieldLedger = (): ShieldLedgerContextValue => {
  const value = useContext(ShieldLedgerContext);
  if (!value) throw new Error('useShieldLedger must be used within <ShieldLedgerProvider>');
  return value;
};

/**
 * Non-throwing variant for components that may render outside the provider
 * (e.g. the wallet picker modal on the landing page, which has no
 * ShieldLedgerProvider). Returns null so callers can degrade gracefully.
 */
export const useOptionalShieldLedger = (): ShieldLedgerContextValue | null => useContext(ShieldLedgerContext);

export const ShieldLedgerProvider: React.FC<{ networkId: string; children: React.ReactNode }> = ({
  networkId: buildTimeNetwork,
  children,
}) => {
  const [networkId, setNetworkIdState] = useState<string>(() => loadStoredNetworkId(buildTimeNetwork));
  const [connecting, setConnecting] = useState(false);
  const [walletLocked, setWalletLocked] = useState(false);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [role, setRoleState] = useState<Role | null>(() => loadRole());
  const [providers, setProviders] = useState<ShieldLedgerProviders | null>(null);
  const [deployment, setDeployment] = useState<DeploymentState>({ status: 'idle' });
  const [error, setError] = useState<UserFacingError | null>(null);
  // Demo Mode starts active when the flag is set, or when the page was opened
  // via a ?demo=1 link (the landing page's "Simulation Sandbox" button). The
  // in-memory ledger is already at its seed on a fresh load, so this needs no
  // disconnect/reset — the same end state enterDemo() produces, with no flash.
  const [demo, setDemo] = useState<boolean>(() => readDemoModeActive() || demoRequestedFromUrl());
  const demoModeRef = useRef(demo);
  const connectedAPI = useRef<ConnectedAPI | null>(null);
  const connectGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the midnight-js global network id in lockstep with the runtime
  // selection so any downstream stack that reads it stays consistent.
  useEffect(() => {
    setNetworkId(networkId);
  }, [networkId]);

  // An entry via ?demo=1 persists the flag so a later refresh stays in the
  // sandbox, matching enterDemo(); Exit demo clears it again.
  useEffect(() => {
    if (demo && !readDemoModeActive()) {
      writeDemoModeActive(true);
    }
  }, [demo]);

  // Keep the demo flag in a ref so connect() can guard against being called
  // from a demo session without re-creating its useCallback.
  useEffect(() => {
    demoModeRef.current = demo;
  }, [demo]);

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
    // Demo Mode owns the UI: never start (or keep) a live wallet connection
    // from inside it — the live path is fully torn down on enterDemo().
    if (demoModeRef.current) return;
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
      // Anonymous, aggregate-only usage stat (see lib/usage-stats.ts). Carries
      // no role/outcome/invoice data — that stays in the Plausible sink above.
      trackSessionStart(networkId);

      // Auto-attach to the network's shared ledger so the Deploy/Join choice
      // stays hidden for normal users: a stored user-chosen address wins over
      // the configured default, and ?contract=<hex> targets a specific
      // instance one-off. ?advanced=1 skips auto-join (manual screen). Failures
      // surface via the existing error banner.
      if (!isAdvancedMode() && gen === connectGeneration.current) {
        const target =
          contractOverrideFromUrl() ??
          loadStoredContractAddress(networkId) ??
          DEFAULT_LEDGER_ADDRESSES[networkId];
        if (target) {
          setDeployment({ status: 'in-progress', kind: 'join' });
          try {
            const joined = await joinShieldLedger(ps, target);
            if (gen !== connectGeneration.current) return;
            setDeployment({ status: 'deployed', api: joined, address: joined.deployedContractAddress });
            track('contract_join', { outcome: 'success' });
          } catch (e) {
            if (gen !== connectGeneration.current) return;
            setDeployment({ status: 'failed', error: e instanceof Error ? e.message : String(e) });
            captureError(e, { step: 'auto-join' });
            track('contract_join', { outcome: 'error' });
          }
        }
      }
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

  /**
   * Enters client-side Demo Mode (simulated data, no wallet). Because the
   * demo replaces the ledger source, any live session MUST be fully torn down
   * first: void in-flight connect/join results (generation bump + abort), drop
   * providers and the wallet reference, and reset deployment to idle so
   * `deployment.api === null` — demo hooks select the simulated store instead.
   * Re-seeds the demo ledger so every entry starts from a clean walkthrough.
   */
  const enterDemo = useCallback(() => {
    abortRef.current?.abort();
    connectGeneration.current++;
    disconnect();
    resetDemoLedger();
    writeDemoModeActive(true);
    setDemo(true);
  }, [disconnect]);

  /** Leaves Demo Mode: resets the simulated ledger fully and clears the flag. */
  const exitDemo = useCallback(() => {
    resetDemoLedger();
    writeDemoModeActive(false);
    setDemo(false);
    setError(null);
  }, []);

  /**
   * Switches the target Midnight network at runtime. The selection is
   * persisted so it survives reloads. Because the indexer/proof-server
   * endpoints are wallet-reported per network, an active session must be
   * dropped: switching requires reconnecting the wallet on the new network.
   */
  const setNetwork = useCallback(
    (next: RuntimeNetworkId) => {
      if (next === networkId) return;
      setNetworkIdState(next);
      storeNetworkId(next);
      track('network_switch', { network: next });
      if (walletInfo !== null) {
        connectedAPI.current = null;
        setWalletInfo(null);
        setProviders(null);
        setDeployment({ status: 'idle' });
        setWalletLocked(false);
        setError({
          message: `Switched to the ${NETWORK_LABELS[next]} network. Reconnect your wallet to continue on ${NETWORK_LABELS[next]}.`,
          technical: '',
        });
      }
    },
    [networkId, walletInfo],
  );

  const deploy = useCallback(async () => {
    if (!providers) return;
    setError(null);
    setDeployment({ status: 'in-progress', kind: 'deploy' });
    try {
      const api = await deployShieldLedger(providers);
      setDeployment({ status: 'deployed', api, address: api.deployedContractAddress });
      storeStoredContractAddress(networkId, api.deployedContractAddress);
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
      if (api.deployedContractAddress !== DEFAULT_LEDGER_ADDRESSES[networkId]) {
        storeStoredContractAddress(networkId, api.deployedContractAddress);
      }
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
      setNetwork,
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
      demo,
      enterDemo,
      exitDemo,
    }),
    [networkId, setNetwork, connecting, walletLocked, walletInfo, deployment, role, setRole, clearRole, connect, disconnect, deploy, join, error, clearError, demo, enterDemo, exitDemo],
  );

  return <ShieldLedgerContext.Provider value={value}>{children}</ShieldLedgerContext.Provider>;
};
