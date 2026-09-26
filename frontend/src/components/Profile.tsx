import React, { useEffect, useMemo, useState } from 'react';
import { useShieldLedger, type Role } from '../context.js';
import { useLedgerState } from '../use-ledger-state.js';
import { buildLenderPortfolio } from '../lender-portfolio.js';
import { loadRegisteredInvoices } from '../invoice-registry.js';
import { loadPoolPayouts } from '../pool-payouts.js';
import { demoLoadPoolPayouts, getDemoApi } from '../lib/demo-ledger.js';
import { ROLE_DEFS } from '../roles.js';
import { HexBadge } from './HexBadge.js';
import { PageHeader } from './PageHeader.js';
import { NetworkSelector } from './NetworkSelector.js';
import { EmptyState } from './EmptyState.js';
import { ConnectingState } from './LoadingPlaceholders.js';
import { unixSecondsToDmy } from '../time.js';
import { track } from '../lib/analytics.js';
import { describeError } from '../lib/errorMessages.js';
import { ErrorBanner } from './ErrorBanner.js';

const PAGE_TITLE = 'Profile';

const formatBigInt = (value: bigint): string => value.toLocaleString();

/**
 * Your own wallet's profile view. Every value shown here is either already
 * public on-chain (addresses, contract instance, winning terms) or stored
 * locally in this browser (role, network, registered-invoice records, lender
 * pseudonym) — the same privacy rules that govern the rest of the app are
 * respected: no credit/reputation scores, buyer identity, or bid secrets.
 */
export const Profile: React.FC = () => {
  const { walletInfo, role, setRole, demo, deployment } = useShieldLedger();
  const { state, error, retry } = useLedgerState();
  const api = demo ? getDemoApi() : deployment.status === 'deployed' ? deployment.api : null;
  const [myPseudonym, setMyPseudonym] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!api) {
      setMyPseudonym(undefined);
      return;
    }
    let cancelled = false;
    api
      .getMyPseudonym()
      .then((p) => {
        if (!cancelled) setMyPseudonym(p);
      })
      .catch(() => {
        if (!cancelled) setMyPseudonym(null);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const localPayouts = useMemo(() => {
    const m = new Map<string, bigint>();
    const records = demo ? demoLoadPoolPayouts() : loadPoolPayouts();
    for (const record of records) {
      m.set(record.slotKey, BigInt(record.payout));
    }
    return m;
  }, [myPseudonym, demo]);

  const registeredInvoices = useMemo(() => loadRegisteredInvoices(), []);

  /** Summary only — the full positions table lives on the Lender Portfolio page. */
  const portfolio = state && myPseudonym ? buildLenderPortfolio(state, myPseudonym, localPayouts) : null;

  const switchRole = (next: Role): void => {
    if (next === role) return;
    setRole(next);
    if (!demo) track('role_switch', { role: next });
  };

  return (
    <div className="sl-panel sl-panel-elevated">
      <PageHeader
        title={PAGE_TITLE}
        subtitle="Your wallet, role, and network — plus this browser's own activity. Everything shown is local or already public on-chain."
      />

      <section className="sl-stage">
        <h3 className="sl-section-title">Wallet identity</h3>
        <div className="sl-status-group sl-header-details">
          <div className="sl-status-item">
            <span className="sl-status-label">Unshielded Address</span>
            <span className="sl-status-value">
              {demo ? 'demo (simulated)' : walletInfo ? <HexBadge hex={walletInfo.unshieldedAddress} /> : 'Not connected'}
            </span>
          </div>
          <div className="sl-status-item">
            <span className="sl-status-label">Shielded Address</span>
            <span className="sl-status-value">
              {demo ? 'demo (simulated)' : walletInfo ? <HexBadge hex={walletInfo.shieldedAddress} /> : 'Not connected'}
            </span>
          </div>
          {deployment.status === 'deployed' && (
            <div className="sl-status-item">
              <span className="sl-status-label">Contract Address</span>
              <span className="sl-status-value">
                <HexBadge hex={deployment.address ?? ''} />
              </span>
            </div>
          )}
          <div className="sl-status-item">
            <span className="sl-status-label">Lender pseudonym</span>
            <span className="sl-status-value">
              {myPseudonym === undefined ? (
                <span className="sl-meta">—</span>
              ) : myPseudonym === null ? (
                <span className="sl-meta">No lender identity yet — submit a bid to create one</span>
              ) : (
                <HexBadge hex={myPseudonym} />
              )}
            </span>
          </div>
        </div>
      </section>

      <section className="sl-stage">
        <h3 className="sl-section-title">Role</h3>
        <div className="sl-role-switch" role="group" aria-label="Your role">
          {ROLE_DEFS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={role === option.value ? 'sl-role-option sl-role-option-active' : 'sl-role-option'}
              aria-pressed={role === option.value}
              onClick={() => switchRole(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="sl-note">
          Your role drives what you can do and which pages you see — the Lender role unlocks the
          Lender Portfolio page and the portfolio summary below.
        </p>
      </section>

      <section className="sl-stage">
        <h3 className="sl-section-title">Network</h3>
        {demo ? (
          <p className="sl-meta">Demo mode runs on an in-memory simulated ledger — no network connection is needed.</p>
        ) : (
          <>
            <NetworkSelector />
            <p className="sl-note">
              The selection persists and is the single source of truth for connect and ledger lookups.
              Switching while connected reconnects your wallet on the new network.
            </p>
          </>
        )}
      </section>

      <section className="sl-stage">
        <h3 className="sl-section-title">Your activity</h3>

        <p className="sl-meta sl-section-tag">Invoices registered from this browser</p>
        {registeredInvoices.length === 0 ? (
          <EmptyState
            compact
            title="No invoices registered yet"
            description="Invoices you register on the Invoice financing page are recalled here."
          />
        ) : (
          <div className="u-scroll-x">
            <table className="sl-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Due</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {registeredInvoices
                  .slice()
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map((inv) => (
                    <tr key={inv.nullifier}>
                      <td className="sl-mono">{inv.reference}</td>
                      <td>{inv.amount}</td>
                      <td className="sl-mono">{unixSecondsToDmy(BigInt(inv.dueDate))}</td>
                      <td className="sl-mono">{new Date(inv.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="sl-meta sl-section-tag">Portfolio (Lender role)</p>
        {error && (
          <ErrorBanner
            error={describeError('ledgerStream', error)}
            onRetry={retry}
          />
        )}
        {role !== 'lender' ? (
          <p className="sl-note">
            Switch your role to <strong>Lender</strong> to see financing-position summaries here.
          </p>
        ) : myPseudonym === undefined ? (
          !error && <ConnectingState label="Resolving your lender pseudonym…" />
        ) : myPseudonym === null ? (
          !error && (
            <ConnectingState label="No lender identity yet — submit a bid once and positions will appear here." />
          )
        ) : portfolio === null ? (
          !error && (
            <ConnectingState
              label="Connecting to live ledger data…"
              hint="Position summaries fill in as the live stream connects."
            />
          )
        ) : portfolio.positions.length === 0 ? (
          <p className="sl-note">
            No positions yet — win a single-lender auction or reveal a pool slot to build a portfolio.
          </p>
        ) : (
          <>
            <div className="u-grid-fit">
              <div className="sl-stage sl-stage-compact">
                <h3 className="sl-section-title">Positions</h3>
                <div className="u-stat">
                  {portfolio.activeCount}
                  <span className="u-stat-suffix"> / {portfolio.positions.length}</span>
                </div>
                <p className="sl-meta u-mt-2">
                  {portfolio.settledCount} settled, {portfolio.defaultedCount} defaulted
                </p>
              </div>
              <div className="sl-stage sl-stage-compact">
                <h3 className="sl-section-title">Issued Exposure</h3>
                <div className="u-stat">
                  {formatBigInt(portfolio.issuedExposure)} <span className="u-stat-unit">tNight</span>
                </div>
                <p className="sl-meta u-mt-2">
                  {portfolio.singleCount} single-lender financing{portfolio.poolCount > 0 ? ` (${portfolio.poolCount} pool slot principal confidential)` : ''}
                </p>
              </div>
              <div className="sl-stage sl-stage-compact">
                <h3 className="sl-section-title">Contracted Return</h3>
                <div className="u-stat">
                  {formatBigInt(portfolio.contractedReturn)} <span className="u-stat-unit">tNight</span>
                </div>
                <p className="sl-meta u-mt-2">Expected if repaid on time — not guaranteed</p>
              </div>
              <div className="sl-stage sl-stage-compact">
                <h3 className="sl-section-title">Concentration</h3>
                <div className="u-stat">
                  {portfolio.concentrationRate === null
                    ? '—'
                    : `${(portfolio.concentrationRate * 100).toFixed(1)}%`}
                </div>
                <p className="sl-meta u-mt-2">
                  Largest position / disclosed exposure across {portfolio.invoiceCount} invoiced position{portfolio.invoiceCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <p className="sl-meta">
              Full per-position details — including pool-slot confidentiality rules — live on the
              Lender Portfolio page.
            </p>
          </>
        )}
      </section>
    </div>
  );
};