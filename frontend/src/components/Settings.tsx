import React, { useMemo, useState } from 'react';
import { useShieldLedger } from '../context.js';
import { loadRegisteredInvoices, clearRegisteredInvoices } from '../invoice-registry.js';
import { loadPoolPayouts, clearPoolPayouts } from '../pool-payouts.js';
import { loadRateTrendRecords, clearRateTrendRecords } from '../rate-trend-store.js';
import type { WalletScope } from '../wallet-scope.js';
import {
  clearPrivateStateCache,
  listPrivateStateCacheKeys,
} from '../private-state-cache.js';
import {
  clearStoredContractAddress,
  DEFAULT_LEDGER_ADDRESSES,
  loadStoredContractAddress,
} from '../default-contracts.js';
import { HexBadge } from './HexBadge.js';
import { PageHeader } from './PageHeader.js';

const PAGE_TITLE = 'Settings';

/**
 * App behavior + local-data control. Profile stays identity-focused (wallet,
 * role, network, activity); this page is about how ShieldLedger behaves in this
 * browser — what it stores locally and which contract instance it connects to.
 *
 * No theme/notification/default-role preferences: nothing in the codebase
 * tracks those, so they are intentionally not invented here.
 */
export const Settings: React.FC = () => {
  const { networkId, demo, deployment, walletInfo } = useShieldLedger();
  // Recomputes every snapshot read against localStorage after each clear.
  const [clearedTick, setClearedTick] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  // Wallet-owned local records (invoices, settlement payouts, private state)
  // are scoped per wallet + contract, so the counts below reflect the wallet
  // that is currently connected on the current network. Rate-trend records are
  // observational browser history and intentionally stay browser-wide.
  const scope: WalletScope = {
    shieldedAddress: walletInfo?.shieldedAddress ?? '',
    contractAddress: deployment.status === 'deployed' ? deployment.address : '',
  };

  const scopeIsSet = scope.contractAddress !== '';

  const reload = (): void => setClearedTick((t) => t + 1);

  const storageAvailable = typeof localStorage !== 'undefined';

  const unsetScopeNote = !scopeIsSet && (
    <p className="sl-note sl-note-accent">
      Connect a wallet and deploy or join a ledger to see and clear that wallet&rsquo;s local
      records — nothing is stored until there is a wallet + contract scope.
    </p>
  );

  const registeredInvoices = useMemo(
    () => loadRegisteredInvoices(scope),
    [clearedTick, scope.shieldedAddress, scope.contractAddress],
  );
  const poolPayouts = useMemo(
    () => loadPoolPayouts(scope),
    [clearedTick, scope.shieldedAddress, scope.contractAddress],
  );
  const rateTrendRecords = useMemo(() => loadRateTrendRecords(), [clearedTick]);
  const privateStateKeys = useMemo(() => listPrivateStateCacheKeys(), [clearedTick]);

  const contractInstances = useMemo(
    () =>
      Object.entries(DEFAULT_LEDGER_ADDRESSES).map(([id, address]) => ({
        networkId: id,
        defaultAddress: address,
        override: loadStoredContractAddress(id),
      })),
    [clearedTick],
  );

  const clearInvoices = (): void => {
    clearRegisteredInvoices(scope);
    reload();
    setMessage('Cleared this wallet\u2019s locally registered invoices.');
  };

  const clearPayouts = (): void => {
    clearPoolPayouts(scope);
    reload();
    setMessage('Cleared this wallet\u2019s locally stored pool settlement payouts.');
  };

  const clearRateTrend = (): void => {
    clearRateTrendRecords();
    reload();
    setMessage('Cleared local rate-trend records.');
  };

  const clearPrivateState = (): void => {
    if (
      !window.confirm(
        'Permanently delete ShieldLedger\u2019s cached private state for this browser?\n\n' +
          'This removes the locally cached private reputation score(s) and wallet secrets for ' +
          'every wallet that has connected from this browser. Nothing on-chain can restore it. ' +
          'Continue?',
      )
    ) {
      return;
    }
    const removed = clearPrivateStateCache();
    reload();
    setMessage(
      removed > 0
        ? `Removed ${removed} cached private-state entr${removed === 1 ? 'y' : 'ies'}.`
        : 'No cached private state was present.',
    );
  };

  const resetContractOverride = (id: string): void => {
    clearStoredContractAddress(id);
    reload();
    setMessage(`Reset the ${id} network back to its default ledger instance.`);
  };

  return (
    <div className="sl-panel sl-panel-elevated">
      <PageHeader
        title={PAGE_TITLE}
        subtitle="What ShieldLedger stores in this browser and which ledger instance it connects to — no data leaves this browser except what is already public on-chain."
      />

      {demo ? (
        <section className="sl-stage">
          <h3 className="sl-section-title">Simulation Sandbox</h3>
          <p className="sl-meta">
            Demo mode keeps everything in memory for this browser session &mdash; there is no local data
            to clear and no live ledger instance to connect to. The local-data and ledger-instance settings
            on this page apply only when a real ledger is deployed or joined.
          </p>
        </section>
      ) : (
        <>
      <section className="sl-stage">
        <h3 className="sl-section-title">Local data &amp; privacy</h3>
        <p className="sl-meta">
          Everything the browser DApp keeps locally lives in this browser&rsquo;s own storage. Wallet-owned
          records (invoices, settlement payouts, private data) are scoped per wallet shielded address +
          contract, so another wallet in the same browser never sees them; rate-trend history is browser-wide
          by nature. Private-mode / cleared-site-data sessions simply don&rsquo;t persist.
        </p>

        {unsetScopeNote}

        {!storageAvailable && (
          <p className="sl-note sl-note-accent">
            Browser storage is unavailable right now (private mode or a storage block). Clear
            buttons may appear to do nothing because there is nothing stored to clear.
          </p>
        )}

        <ul className="sl-settings-list">
          <li className="sl-settings-row">
            <div>
              <strong>Registered invoices</strong>
              <p className="sl-meta">
                The connected wallet&rsquo;s local record of the invoices it registered on the current
                contract, plus the private secret used to identify them, so the same invoice can be
                revealed and settled later. Scoped per wallet + contract.
              </p>
            </div>
            <div className="sl-settings-row-actions">
              <span className="sl-badge sl-badge-neutral">
                {registeredInvoices.length} record{registeredInvoices.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="sl-button sl-button-secondary"
                disabled={!storageAvailable || registeredInvoices.length === 0}
                onClick={clearInvoices}
              >
                Clear
              </button>
            </div>
          </li>

          <li className="sl-settings-row">
            <div>
              <strong>Pool settlement payouts</strong>
              <p className="sl-meta">
                This wallet&rsquo;s per-lender payout values for pool-financed invoices on the
                current contract. Only a fingerprint of each payout is committed on-chain &mdash;
                clearing this also forfeits this wallet&rsquo;s share of any future default-insurance
                payout for those invoices. Scoped per wallet + contract.
              </p>
            </div>
            <div className="sl-settings-row-actions">
              <span className="sl-badge sl-badge-neutral">
                {poolPayouts.length} record{poolPayouts.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="sl-button sl-button-secondary"
                disabled={!storageAvailable || poolPayouts.length === 0}
                onClick={clearPayouts}
              >
                Clear
              </button>
            </div>
          </li>

          <li className="sl-settings-row">
            <div>
              <strong>Rate-trend records</strong>
              <p className="sl-meta">
                Forward-only interest-rate history this browser has observed on the Finance page.
                Clearing just empties the local trend history; on-chain data is unaffected.
              </p>
            </div>
            <div className="sl-settings-row-actions">
              <span className="sl-badge sl-badge-neutral">
                {rateTrendRecords.length} record{rateTrendRecords.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="sl-button sl-button-secondary"
                disabled={!storageAvailable || rateTrendRecords.length === 0}
                onClick={clearRateTrend}
              >
                Clear
              </button>
            </div>
          </li>

          <li className="sl-settings-row sl-settings-row-danger">
            <div>
              <strong>Private-state / reputation cache</strong>
              <p className="sl-meta">
                The locally stored copy of this wallet&rsquo;s private data &mdash; including its private
                reputation score and the wallet secrets used to prove ownership &mdash; written after each
                settlement and scoped to the wallet&rsquo;s shielded address plus the contract. This cache
                is what keeps a wallet&rsquo;s reputation intact across reconnects.
              </p>
              <p className="sl-note sl-note-accent">
                Clearing this is meaningful: your locally cached reputation and secrets are gone
                until the next on-chain settlement re-derives them. Nothing on-chain restores them,
                and a currently connected session&rsquo;s in-memory copy stays until you reconnect.
              </p>
            </div>
            <div className="sl-settings-row-actions">
              <span className="sl-badge sl-badge-danger">
                {privateStateKeys.length} cached
              </span>
              <button
                type="button"
                className="sl-button sl-button-danger"
                disabled={!storageAvailable || privateStateKeys.length === 0}
                onClick={clearPrivateState}
              >
                Clear
              </button>
            </div>
          </li>
        </ul>

        {message && <p className="sl-note">{message}</p>}
      </section>

      <section className="sl-stage">
        <h3 className="sl-section-title">Contract instance</h3>
        <p className="sl-meta">
          The shared ledger this app auto-connects to per network. A contract address you deployed
          or joined manually is remembered per network and wins over the default until you reset it.
        </p>
        <div className="sl-settings-contracts">
          {contractInstances.map((instance) => (
            <div key={instance.networkId} className="sl-settings-contract">
              <div className="sl-settings-contract-head">
                <span className="sl-settings-contract-name">{instance.networkId}</span>
                {instance.networkId === networkId ? <span className="sl-badge">current</span> : null}
                {demo ? <span className="sl-badge sl-badge-warn">demo</span> : null}
              </div>
              <div className="sl-status-item">
                <span className="sl-status-label">Default</span>
                <span className="sl-status-value">
                  <HexBadge hex={instance.defaultAddress} />
                </span>
              </div>
              <div className="sl-status-item">
                <span className="sl-status-label">In use</span>
                <span className="sl-status-value">
                  {instance.override ? <HexBadge hex={instance.override} /> : 'default'}
                </span>
              </div>
              {instance.override && (
                <button
                  type="button"
                  className="sl-button sl-button-secondary"
                  disabled={!storageAvailable}
                  onClick={() => resetContractOverride(instance.networkId)}
                >
                  Reset to default
                </button>
              )}
              {!instance.override && <p className="sl-meta">No override — using the default instance.</p>}
            </div>
          ))}
        </div>
        </section>
        </>
      )}
    </div>
  );
};
