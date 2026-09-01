import React, { useEffect, useState } from 'react';
import { ShieldLedgerProvider, useShieldLedger, type Role } from './context.js';
import { WalletConnect } from './components/WalletConnect.js';
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
import type { ShieldLedgerDerivedState } from './shield-ledger-types.js';

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

const SECTION_DEFS: Array<{
  key: string;
  label: string;
  Icon: React.FC;
  Component: React.FC;
  roleOnly?: Role;
}> = [
  { key: 'financing', label: 'Invoice Financing', Icon: InvoiceIcon, Component: InvoiceFinancing },
  { key: 'ledger', label: 'Public Ledger', Icon: BookIcon, Component: LedgerView },
  { key: 'dashboard', label: 'Analytics Dashboard', Icon: ChartIcon, Component: Dashboard },
  { key: 'portfolio', label: 'Lender Portfolio', Icon: BriefcaseIcon, Component: LenderPortfolio, roleOnly: 'lender' },
  { key: 'rate-trend', label: 'Rate Trend', Icon: TrendIcon, Component: RateTrendChart },
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

const HomeDashboard: React.FC<{
  role: Role;
  clearRole: () => void;
  onNavigate: (section: string) => void;
  walletInfo: { unshieldedAddress: string; shieldedAddress: string } | null;
  deploymentAddress: string;
  deployed: boolean;
  streamStatus: string;
  ledgerError: string | null;
  invoiceCount: bigint | null;
}> = ({ role, clearRole, onNavigate, walletInfo, deploymentAddress, deployed, streamStatus, ledgerError, invoiceCount }) => {
  const { state, error } = useLedgerState();
  const heldRole = role;

  const switchRole = () => {
    if (!window.confirm('Switch role? Your current role selection will be cleared.')) return;
    clearRole();
    track('role_switch_clear', {});
  };

  const primaryAction =
    heldRole === 'lender'
      ? { label: 'View my portfolio', section: 'portfolio' }
      : { label: 'Continue to invoice financing', section: 'financing' };

  const roleTitle =
    heldRole === 'sme'
      ? 'continue as an SME'
      : heldRole === 'buyer'
        ? 'continue as a Buyer'
        : 'continue as a Lender';

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
        <button className="sl-button sl-button-secondary" type="button" onClick={switchRole}>
          ← Back / Switch Role
        </button>
      </div>

      <div className="sl-stage sl-stage-tight u-mb-4">
        <div className="u-flex-between">
          <span className="sl-meta">{primaryAction.label} to pick up where you left off.</span>
          <button type="button" className="sl-button" onClick={() => onNavigate(primaryAction.section)}>
            {primaryAction.label}
          </button>
        </div>
      </div>

      {error && (
        <ErrorBanner error={describeError('ledgerStream', error)} />
      )}

      {cb && <HealthBanner status={cb} />}

      {m && (
        <div className="u-grid-fit">
          <div className="sl-stage sl-stage-compact">
            <h3 className="sl-section-title">Live invoices</h3>
            <div className="u-stat">{m.totalInvoices}</div>
            <p className="sl-meta u-mt-2">{m.settledInvoices} settled on-chain</p>
          </div>
          <div className="sl-stage sl-stage-compact">
            <h3 className="sl-section-title">Default rate</h3>
            <div className="u-stat">{formatPct(m.defaultRate)}</div>
            <p className="sl-meta u-mt-2">{m.defaultedInvoices} defaulted</p>
          </div>
          <div className="sl-stage sl-stage-compact">
            <h3 className="sl-section-title">Pool balance</h3>
            <div className="u-stat">
              {formatBigInt(m.poolBalance)} <span className="u-stat-unit">tNight</span>
            </div>
          </div>
          <div className="sl-stage sl-stage-compact">
            <h3 className="sl-section-title">Coverage</h3>
            <div className="u-stat">{formatPct(m.coverageRatio)}</div>
          </div>
        </div>
      )}

      <div className="u-flex-between">
        <h3 className="sl-section-title">Recent platform activity</h3>
        <button type="button" className="sl-button sl-button-secondary" onClick={() => onNavigate('dashboard')}>
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
                  <strong>Invoice financed</strong> {formatBigInt(item.amount)} tNight · due {new Date(item.dueAt).toLocaleDateString()}
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
        deploymentAddress={deploymentAddress}
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
}> = ({ walletInfo, deploymentAddress, deployed, streamStatus, ledgerError, invoiceCount }) => {
  return (
    <>
      <h3 className="sl-section-title sl-section-tag">Network &amp; Account</h3>
      <div className="sl-status-group sl-header-details">
        <div className="sl-status-item">
          <span className="sl-status-label">Unshielded Address</span>
          <span className="sl-status-value">
            <HexBadge hex={walletInfo?.unshieldedAddress ?? ''} />
          </span>
        </div>
        <div className="sl-status-item">
          <span className="sl-status-label">Shielded Address</span>
          <span className="sl-status-value">
            <HexBadge hex={walletInfo?.shieldedAddress ?? ''} />
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
  const { networkId, connected, disconnect, connect, deployment, role, setRole, clearRole, walletInfo, error, clearError } =
    useShieldLedger();
  const { state: ledgerState, error: ledgerError } = useLedgerState();
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<string>('home');

  // Re-establish a dropped wallet session straight from the error banner.
  const reconnectWallet = () => {
    disconnect();
    void connect();
  };

  useEffect(() => {
    if (ledgerState) setLastUpdate(Date.now());
  }, [ledgerState]);

  const streamStatus =
    ledgerError != null
      ? 'stream error'
      : ledgerState != null
        ? `live · ${new Date(lastUpdate ?? Date.now()).toLocaleTimeString()}`
        : 'connecting…';

  const deployed = deployment.status === 'deployed';

  const changeRole = (next: Role) => {
    if (next === role) return;
    setRole(next);
    if (next !== 'lender' && activeSection === 'portfolio') {
      setActiveSection('home');
    }
    track('role_switch', { role: next });
  };

  const activeDef =
    activeSection !== 'home'
      ? SECTION_DEFS.find((s) => s.key === activeSection)
      : undefined;
  const ActiveComponent =
    activeDef && (!activeDef.roleOnly || activeDef.roleOnly === role)
      ? activeDef.Component
      : undefined;

  return (
    <div className="sl-app">
      {connected && (
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
              <div className="sl-wallet-group">
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
              </div>
            </div>
          </div>
        </header>
      )}

      {deployed && (
        <nav className="sl-nav" aria-label="Section">
          <button
            type="button"
            className={activeSection === 'home' ? 'sl-nav-item sl-nav-active' : 'sl-nav-item'}
            onClick={() => setActiveSection('home')}
          >
            <HomeIcon />
            <span>Home</span>
          </button>
          {SECTION_DEFS.filter((s) => !s.roleOnly || s.roleOnly === role).map((section) => {            const Icon = section.Icon;
            return (
              <button
                key={section.key}
                type="button"
                className={activeSection === section.key ? 'sl-nav-item sl-nav-active' : 'sl-nav-item'}
                onClick={() => setActiveSection(section.key)}
              >
                <Icon />
                <span>{section.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <ErrorBanner error={error} onDismiss={clearError} onReconnect={reconnectWallet} />

      {deployment.status === 'in-progress' && (
        <div className="sl-panel">
          <p className="sl-meta">Working… (proving keys are large; first transaction may take a minute)</p>
        </div>
      )}

      {deployment.status === 'failed' && (
        <ErrorBanner error={describeError('contractDeployment', deployment.error)} />
      )}

      <WalletConnect />

      {deployed && activeSection === 'home' && (
        <div className="sl-home">
          {role === null ? (
            <div className="sl-panel">
              <NetworkDetails
                walletInfo={walletInfo}
                deploymentAddress={deployment.address}
                deployed={deployed}
                streamStatus={streamStatus}
                ledgerError={ledgerError}
                invoiceCount={ledgerState ? ledgerState.invoiceCount : null}
              />
              <h2>Get invoices financed in hours, not weeks</h2>
              <p className="sl-meta">
                Without exposing your books — bids stay sealed and only the winning rate is ever revealed.
              </p>
              <button type="button" className="sl-button" onClick={() => setActiveSection('financing')}>
                Choose your role
              </button>
              <div className="u-flex-between u-mt-2">
                <span className="sl-status-pill">
                  <span className="sl-live-dot" aria-hidden="true" />
                  {networkId}
                </span>
                <button type="button" className="sl-button-ghost" onClick={() => setActiveSection('ledger')}>
                  Verify on-chain →
                </button>
              </div>
            </div>
          ) : (
            <HomeDashboard
              role={role}
              clearRole={clearRole}
              onNavigate={setActiveSection}
              walletInfo={walletInfo}
              deploymentAddress={deployment.address}
              deployed={deployed}
              streamStatus={streamStatus}
              ledgerError={ledgerError}
              invoiceCount={ledgerState ? ledgerState.invoiceCount : null}
            />
          )}
        </div>
      )}

      {deployed && ActiveComponent && <ActiveComponent />}
    </div>
  );
};

const App: React.FC<{ networkId: string }> = ({ networkId }) => (
  <ErrorBoundary>
    <ShieldLedgerProvider networkId={networkId}>
      <Body />
    </ShieldLedgerProvider>
  </ErrorBoundary>
);

export default App;
