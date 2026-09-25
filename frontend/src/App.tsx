import React, { useCallback, useEffect, useState } from 'react';
import { HashRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ShieldLedgerProvider, useShieldLedger, type Role } from './context.js';
import { WalletConnect } from './components/WalletConnect.js';
import { DemoBanner } from './components/DemoBanner.js';
import { InvoiceFinancing } from './components/InvoiceFinancing.js';
import { LedgerView } from './components/LedgerView.js';
import { Dashboard } from './components/Dashboard.js';
import { HexBadge } from './components/HexBadge.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { ErrorBanner } from './components/ErrorBanner.js';
import { LenderPortfolio } from './components/LenderPortfolio.js';
import { RateTrendChart } from './components/RateTrendChart.js';
import { describeError } from './lib/errorMessages.js';
import { useLedgerState } from './use-ledger-state.js';
import { track } from './lib/analytics.js';
import { computeDashboardMetrics } from './dashboard-metrics.js';
import { computeCircuitBreakerStatus, type CircuitBreakerStatus } from './circuit-breaker.js';
import { HealthBanner } from './components/HealthBanner.js';
import { NetworkSelector } from './components/NetworkSelector.js';
import type { ShieldLedgerDerivedState } from './shield-ledger-types.js';
import { unixSecondsToDmy } from './time.js';

const HomeIcon: React.FC = () => (
  <svg className="sl-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const InvoiceIcon: React.FC = () => (
  <svg className="sl-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const BookIcon: React.FC = () => (
  <svg className="sl-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const ChartIcon: React.FC = () => (
  <svg className="sl-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const BriefcaseIcon: React.FC = () => (
  <svg className="sl-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

const TrendIcon: React.FC = () => (
  <svg className="sl-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

/* Home quick-nav action-card icons (visual language matches the finance-page
   `.sl-action-card` band; existing stroke/currentColor look, no new styles). */
const FilePlusIcon: React.FC = () => (
  <svg className="sl-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);

const ShieldConfirmIcon: React.FC = () => (
  <svg className="sl-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3Z" />
    <path d="m9 11.5 2 2 4-4" />
  </svg>
);

const BookIconCard: React.FC = () => (
  <svg className="sl-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const ChartIconCard: React.FC = () => (
  <svg className="sl-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const BriefcaseIconCard: React.FC = () => (
  <svg className="sl-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

const TrendIconCard: React.FC = () => (
  <svg className="sl-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const SECTION_DEFS: Array<{
  key: string;
  path: string;
  label: string;
  Icon: React.FC;
  Component: React.FC;
  roleOnly?: Role;
}> = [
  { key: 'financing', path: '/finance', label: 'Invoice Financing', Icon: InvoiceIcon, Component: InvoiceFinancing },
  { key: 'ledger', path: '/ledger', label: 'Public Ledger', Icon: BookIcon, Component: LedgerView },
  { key: 'dashboard', path: '/dashboard', label: 'Analytics Dashboard', Icon: ChartIcon, Component: Dashboard },
  { key: 'portfolio', path: '/portfolio', label: 'Lender Portfolio', Icon: BriefcaseIcon, Component: LenderPortfolio, roleOnly: 'lender' },
  { key: 'rate-trend', path: '/rate-trend', label: 'Rate Trend', Icon: TrendIcon, Component: RateTrendChart },
];

const ROLE_DEFS: Array<{ value: Role; label: string }> = [
  { value: 'sme', label: 'SME' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'lender', label: 'Lender' },
];

const formatPct = (value: number | null): string =>
  value === null ? '—' : `${value.toFixed(1)}%`;

const formatBigInt = (value: bigint): string => value.toLocaleString();

const shortNullifier = (hex: string): string => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return clean.length > 12 ? `${clean.slice(0, 6)}…${clean.slice(-6)}` : clean;
};

// Builds the platform status mini-feed from real on-chain data only.
// - Insurance payouts carry a genuine `claimedAt` timestamp.
// - Financings (resolved auctions with a disclosed winner) have no on-chain
//   settlement timestamp, so they are listed newest-first by due date and
//   shown WITH their due date (never a fabricated "settled at" time).
const buildPlatformFeed = (state: ShieldLedgerDerivedState) => {
  const payouts = state.insuranceClaims
    .map((c) => ({
      kind: 'payout' as const,
      id: `payout-${c.nullifier}`,
      at: Number(c.claimedAt) * 1000,
      amount: c.payout,
      nullifier: c.nullifier,
    }))
    .sort((a, b) => b.at - a.at);

  const financings = state.bestBids
    .filter((b) => {
      const inv = state.invoices.find((i) => i.nullifier === b.nullifier);
      return inv !== undefined && inv.lender !== null && inv.splitCount === 0n;
    })
    .map((b) => {
      const inv = state.invoices.find((i) => i.nullifier === b.nullifier)!;
      return {
        kind: 'financing' as const,
        id: `financing-${b.nullifier}`,
        dueAt: Number(inv.dueDate) * 1000,
        amount: inv.amount,
        nullifier: b.nullifier,
      };
    })
    .sort((a, b) => b.dueAt - a.dueAt);

  return { payouts, financings };
};

/** Redirects a non-lender off /portfolio and flags the shell to show the reason. */
const RoleGateNotice: React.FC<{ notify: () => void }> = ({ notify }) => {
  useEffect(() => {
    notify();
  }, [notify]);
  return <Navigate to="/" replace />;
};

const HomeDashboard: React.FC<{
  role: Role;
  clearRole: () => void;
  walletInfo: { unshieldedAddress: string; shieldedAddress: string } | null;
  deploymentAddress: string;
  deployed: boolean;
  streamStatus: string;
  ledgerError: string | null;
  invoiceCount: bigint | null;
  demo: boolean;
  enterDemo: () => void;
}> = ({ role, clearRole, walletInfo, deploymentAddress, deployed, streamStatus, ledgerError, invoiceCount, demo, enterDemo }) => {
  const { state, error, retry } = useLedgerState();
  const navigate = useNavigate();
  const heldRole = role;

  const switchRole = () => {
    if (!window.confirm('Switch role? Your current role selection will be cleared.')) return;
    clearRole();
    if (!demo) track('role_switch_clear', {});
  };

  const primaryAction =
    heldRole === 'lender'
      ? { label: 'View my portfolio', path: '/portfolio' }
      : { label: 'Continue to invoice financing', path: '/finance' };

  const roleTitle =
    heldRole === 'sme'
      ? 'continue as an SME'
      : heldRole === 'buyer'
        ? 'continue as a Buyer'
        : 'continue as a Lender';

  const heroLabel =
    heldRole === 'sme'
      ? 'For SMEs'
      : heldRole === 'buyer'
        ? 'For corporate buyers'
        : 'For lenders';

  const heroSub =
    heldRole === 'sme'
      ? 'Register invoices privately and let lenders compete on rate — bids stay sealed and only the winning rate is ever revealed.'
      : heldRole === 'buyer'
        ? 'Confirm invoices in zero knowledge — prove an invoice is genuine and priced correctly without exposing your identity or supply chain.'
        : 'Bid privately in a sealed, lowest-rate-wins auction and earn from financing vetted SMEs, backed by built-in default insurance.';

  type QuickAction = { key: string; label: string; path: string; Icon: React.FC };

  const quickActions: QuickAction[] =
    heldRole === 'sme'
      ? [
          { key: 'register', label: 'Register an invoice', path: '/finance', Icon: FilePlusIcon },
          { key: 'analytics', label: 'Analytics', path: '/dashboard', Icon: ChartIconCard },
          { key: 'trend', label: 'Rate trend', path: '/rate-trend', Icon: TrendIconCard },
        ]
      : heldRole === 'buyer'
        ? [
            { key: 'confirm', label: 'Confirm an invoice', path: '/finance', Icon: ShieldConfirmIcon },
            { key: 'ledger', label: 'Public ledger', path: '/ledger', Icon: BookIconCard },
            { key: 'analytics', label: 'Analytics', path: '/dashboard', Icon: ChartIconCard },
          ]
        : [
            { key: 'bid', label: 'Submit a bid', path: '/finance', Icon: TrendIconCard },
            { key: 'portfolio', label: 'My portfolio', path: '/portfolio', Icon: BriefcaseIconCard },
            { key: 'trend', label: 'Rate trend', path: '/rate-trend', Icon: TrendIconCard },
          ];

  const m = state
    ? computeDashboardMetrics(state.invoices, state.insuranceClaims, state.insurancePool)
    : null;
  const cb: CircuitBreakerStatus | null = state
    ? computeCircuitBreakerStatus(state.invoices, state.insuranceClaims, state.insurancePool)
    : null;

  const feed = state ? buildPlatformFeed(state) : { payouts: [], financings: [] };
  const feedItems = [...feed.payouts, ...feed.financings].slice(0, 5);
  const hasFeed = feedItems.length > 0;

  return (
    <div className="sl-panel">
      <div className="sl-row u-flex-between">
        <div className="u-flex-1">
          <h2>Welcome back</h2>
          <p className="sl-meta">{roleTitle} — here's the current state of the platform.</p>
        </div>
        <div className="u-flex">
          {!demo && (
            <button type="button" className="sl-button sl-button-secondary" onClick={enterDemo}>
              Simulation Sandbox
            </button>
          )}
          <button className="sl-button sl-button-secondary" type="button" onClick={switchRole}>
            ← Back / Switch Role
          </button>
        </div>
      </div>

      <div className="sl-hero">
        <div className="sl-hero-content">
          <span className="sl-hero-label">{heroLabel}</span>
          <div className="sl-hero-number-line">
            <span className="sl-hero-number">{m ? m.totalInvoices.toLocaleString() : '—'}</span>
            <span className="sl-hero-unit">live invoices</span>
          </div>
          <span className="sl-hero-sub">{heroSub}</span>
        </div>
        <button type="button" className="sl-hero-action" onClick={() => navigate(primaryAction.path)}>
          {primaryAction.label}
        </button>
      </div>

      <h3 className="sl-section-title">Quick actions</h3>
      <div className="sl-actions">
        {quickActions.map((qa) => {
          const Icon = qa.Icon;
          return (
            <button key={qa.key} type="button" className="sl-action-card" onClick={() => navigate(qa.path)}>
              <Icon />
              <span className="sl-action-label">{qa.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <ErrorBanner error={describeError('ledgerStream', error)} onRetry={retry} />
      )}

      {cb && <HealthBanner status={cb} />}

      {m && (
        <>
          <h3 className="sl-section-title">Platform highlights</h3>
          <div className="u-grid-fit">
            <div className="sl-stage sl-stage-compact">
              <h3 className="sl-section-title">Default Rate</h3>
              <div className="u-stat">{formatPct(m.defaultRate)}</div>
              <p className="sl-meta u-mt-2">{m.defaultedInvoices} defaulted / {m.totalInvoices} total invoices</p>
            </div>
            <div className="sl-stage sl-stage-compact">
              <h3 className="sl-section-title">Pool Utilization</h3>
              <div className="u-stat">{formatPct(m.poolUtilization)}</div>
              <p className="sl-meta u-mt-2">{formatBigInt(m.totalPayouts)} paid / {formatBigInt(m.totalPremiums)} collected (tNight)</p>
            </div>
            <div className="sl-stage sl-stage-compact">
              <h3 className="sl-section-title">Pool Balance</h3>
              <div className="u-stat">
                {formatBigInt(m.poolBalance)} <span className="u-stat-unit">tNight</span>
              </div>
              <p className="sl-meta u-mt-2">Insurance pool reserves</p>
            </div>
            <div className="sl-stage sl-stage-compact">
              <h3 className="sl-section-title">Coverage Ratio</h3>
              <div className="u-stat">
                {m.coverageRatio !== null ? formatPct(m.coverageRatio) : '—'}
              </div>
              <p className="sl-meta u-mt-2">Pool balance / total financed exposure</p>
            </div>
          </div>
        </>
      )}

      <div className="u-flex-between">
        <h3 className="sl-section-title">Recent platform activity</h3>
        <button type="button" className="sl-button sl-button-secondary" onClick={() => navigate('/dashboard')}>
          Full analytics →
        </button>
      </div>

      {hasFeed ? (
        <ul className="sl-activity-feed">
          {feedItems.map((item) =>
            item.kind === 'payout' ? (
              <li key={item.id} className="sl-activity-item">
                <span className="sl-activity-text">
                  <strong>Insurance payout</strong> {formatBigInt(item.amount)} tNight · invoice {shortNullifier(item.nullifier)}
                </span>
                <span className="sl-activity-time">{new Date(item.at).toLocaleString()}</span>
              </li>
            ) : (
              <li key={item.id} className="sl-activity-item">
                <span className="sl-activity-text">
                  <strong>Invoice financed</strong> {formatBigInt(item.amount)} tNight · due {unixSecondsToDmy(item.dueAt / 1000)}
                </span>
                <span className="sl-activity-time">{shortNullifier(item.nullifier)}</span>
              </li>
            )
          )}
        </ul>
      ) : (
        <p className="sl-empty">
          No recent platform activity yet — financings and insurance payouts will appear here once
          invoices are financed or claims are paid on-chain.
        </p>
      )}

      <NetworkDetails
        walletInfo={walletInfo}
deploymentAddress={deploymentAddress ?? ''}
        deployed={deployed}
        streamStatus={streamStatus}
        ledgerError={ledgerError}
        invoiceCount={invoiceCount}
      />
    </div>
  );
};

const NetworkDetails: React.FC<{
  walletInfo: { unshieldedAddress: string; shieldedAddress: string } | null;
  deploymentAddress: string;
  deployed: boolean;
  streamStatus: string;
  ledgerError: string | null;
  invoiceCount: bigint | null;
  demo?: boolean;
}> = ({ walletInfo, deploymentAddress, deployed, streamStatus, ledgerError, invoiceCount, demo = false }) => {
  return (
    <>
      <h3 className="sl-section-title sl-section-tag">Network &amp; Account</h3>
      <div className="sl-status-group sl-header-details">
        <div className="sl-status-item">
          <span className="sl-status-label">Unshielded Address</span>
          <span className="sl-status-value">
            {demo ? 'demo (simulated)' : <HexBadge hex={walletInfo?.unshieldedAddress ?? ''} />}
          </span>
        </div>
        <div className="sl-status-item">
          <span className="sl-status-label">Shielded Address</span>
          <span className="sl-status-value">
            {demo ? 'demo (simulated)' : <HexBadge hex={walletInfo?.shieldedAddress ?? ''} />}
          </span>
        </div>
        {deployed && (
          <div className="sl-status-item">
            <span className="sl-status-label">Contract Address</span>
            <span className="sl-status-value">
              <HexBadge hex={deploymentAddress} />
            </span>
          </div>
        )}
        <div className="sl-header-details-right">
          {deployed && (
            <span
              className={ledgerError != null ? 'sl-status-pill sl-error' : 'sl-status-pill sl-live-pill'}
              title={ledgerError != null ? describeError('ledgerStream', ledgerError).message : undefined}
            >
              {streamStatus}
            </span>
          )}
          {demo && (
            <span className="sl-status-pill sl-live-pill" title="Simulated data — nothing is on-chain">
              demo · simulated
            </span>
          )}
          <div className="sl-top-metric">
            <span className="sl-top-metric-value">{invoiceCount !== null ? invoiceCount.toString() : '—'}</span>
            <span className="sl-top-metric-label">live invoices</span>
          </div>
        </div>
      </div>
    </>
  );
};

const Body: React.FC = () => {
  const { networkId, connected, disconnect, connect, deployment, role, setRole, clearRole, walletInfo, error, clearError, demo, enterDemo, exitDemo } =
    useShieldLedger();
  const { state: ledgerState, error: ledgerError } = useLedgerState();
  const location = useLocation();
  const navigate = useNavigate();
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [roleGate, setRoleGate] = useState(false);

  // Re-establish a dropped wallet session straight from the error banner.
  const reconnectWallet = () => {
    disconnect();
    void connect();
  };

  const dismissRoleGate = useCallback(() => setRoleGate(false), []);

  useEffect(() => {
    if (ledgerState) setLastUpdate(Date.now());
  }, [ledgerState]);

  const streamStatus =
    ledgerError != null
      ? 'stream error'
      : ledgerState != null
        ? `live · ${new Date(lastUpdate ?? Date.now()).toLocaleTimeString()}`
        : 'connecting…';

  const changeRole = (next: Role) => {
    if (next === role) return;
    setRole(next);
    if (next !== 'lender' && location.pathname === '/portfolio') {
      navigate('/', { replace: true });
    }
    if (!demo) track('role_switch', { role: next });
  };

  // The shell is available in Demo Mode too: the simulated ledger replaces the
  // connected wallet as the data source, and nothing network/wallet-related
  // is rendered.
  const deployed = deployment.status === 'deployed';
  const showApp = deployed || demo;
  const deploymentAddress = deployment.status === 'deployed' ? deployment.address : undefined;

  return (
    <div className="sl-app">
      {demo && <DemoBanner onExit={exitDemo} />}
      {(connected || demo) && (
        <header className="sl-header">
          <div className="sl-header-top">
            <div className="sl-brand">
              <span className="sl-logo" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3Z" />
                  <path d="m9 11.5 2 2 4-4" />
                </svg>
              </span>
              <div className="sl-brand-text">
                <h1 className="sl-title">ShieldLedger</h1>
                <p className="sl-subtitle">Confidential invoice financing on the Midnight Network — commitments on-chain, invoice details private.</p>
              </div>
            </div>
            <div className="sl-header-actions">
              {(deployed || demo) && role != null && (
                <div className="sl-role-switch" role="group" aria-label="Your role">
                  {ROLE_DEFS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={role === option.value ? 'sl-role-option sl-role-option-active' : 'sl-role-option'}
                      aria-pressed={role === option.value}
                      onClick={() => changeRole(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              {deployed && !demo && <NetworkSelector />}
              <div className="sl-wallet-group">
                {demo ? (
                  <>
                    <span className="sl-status-pill">
                      <span className="sl-live-dot" aria-hidden="true" />
                      Demo wallet
                    </span>
                    <button className="sl-button sl-button-secondary sl-header-action" onClick={exitDemo}>
                      Exit demo
                    </button>
                  </>
                ) : (
                  <>
                    <span className="sl-verified">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3Z" />
                        <path d="m9 11.5 2 2 4-4" />
                      </svg>
                      Wallet Connected
                    </span>
                    <button className="sl-button sl-button-secondary sl-header-action" onClick={disconnect}>
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {(deployed || demo) && (
            <nav className="sl-nav" aria-label="Section">
              <Link
                className={location.pathname === '/' ? 'sl-nav-item sl-nav-active' : 'sl-nav-item'}
                to="/"
                aria-current={location.pathname === '/' ? 'page' : undefined}
              >
                <HomeIcon />
                <span>Home</span>
              </Link>
              {SECTION_DEFS.filter((s) => !s.roleOnly || s.roleOnly === role).map((section) => {
                const Icon = section.Icon;
                return (
                  <Link
                    key={section.key}
                    className={location.pathname === section.path ? 'sl-nav-item sl-nav-active' : 'sl-nav-item'}
                    to={section.path}
                    aria-current={location.pathname === section.path ? 'page' : undefined}
                  >
                    <Icon />
                    <span>{section.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
        </header>
      )}

      <ErrorBanner error={error} onDismiss={clearError} onReconnect={reconnectWallet} />

      {roleGate && (
        <div className="sl-info sl-role-gate">
          <p>
            The Lender Portfolio is only available to Lender accounts. Use the role switcher above to
            continue as a Lender.
          </p>
          <button type="button" className="sl-role-gate-close" onClick={dismissRoleGate} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {deployment.status === 'in-progress' && (
        <div className="sl-panel">
          <p className="sl-meta">Working… (proving keys are large; first transaction may take a minute)</p>
        </div>
      )}

      {deployment.status === 'failed' && (
        <ErrorBanner error={describeError('contractDeployment', deployment.error)} />
      )}

      <WalletConnect />

      {showApp && (
        <Routes>
          <Route
            path="/"
            element={
              <div className="sl-home">
                {role === null ? (
                  <div className="sl-panel">
<NetworkDetails
                      walletInfo={walletInfo}
                      deploymentAddress={deploymentAddress ?? ''}
                      deployed={deployed}
                      streamStatus={streamStatus}
                      ledgerError={ledgerError}
                      invoiceCount={ledgerState ? ledgerState.invoiceCount : null}
                      demo={demo}
                    />
                    <h2>Get invoices financed in hours, not weeks</h2>
                    <p className="sl-meta">
                      Without exposing your books — bids stay sealed and only the winning rate is ever revealed.
                    </p>
                    <button type="button" className="sl-button" onClick={() => navigate('/finance')}>
                      Choose your role
                    </button>
                    <div className="u-flex-between u-mt-2">
                      <span className="u-flex">
                        <span className="sl-status-pill">
                          <span className="sl-live-dot" aria-hidden="true" />
                          {demo ? 'demo (simulated)' : networkId}
                        </span>
                        {!demo && <NetworkSelector />}
                      </span>
                      <button type="button" className="sl-button-ghost" onClick={() => navigate('/ledger')}>
                        Verify on-chain →
                      </button>
                    </div>
                  </div>
                ) : (
                  <HomeDashboard
                    role={role}
                    clearRole={clearRole}
                    walletInfo={walletInfo}
deploymentAddress={deploymentAddress ?? ''}
                    deployed={deployed}
                    streamStatus={streamStatus}
                    ledgerError={ledgerError}
                    invoiceCount={ledgerState ? ledgerState.invoiceCount : null}
                    demo={demo}
                    enterDemo={enterDemo}
                  />
                )}
              </div>
            }
          />
          <Route path="/finance" element={<InvoiceFinancing />} />
          <Route path="/ledger" element={<LedgerView />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route
            path="/portfolio"
            element={
              role === 'lender' ? (
                <LenderPortfolio />
              ) : (
                <RoleGateNotice notify={() => setRoleGate(true)} />
              )
            }
          />
          <Route path="/rate-trend" element={<RateTrendChart />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </div>
  );
};

const App: React.FC<{ networkId: string }> = ({ networkId }) => (
  <ErrorBoundary>
    <ShieldLedgerProvider networkId={networkId}>
      <HashRouter>
        <Body />
      </HashRouter>
    </ShieldLedgerProvider>
  </ErrorBoundary>
);

export default App;
