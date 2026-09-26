import React from 'react';
import { Link } from 'react-router-dom';
import { useLedgerState } from '../use-ledger-state.js';
import { computeDashboardMetrics } from '../dashboard-metrics.js';
import { computeCircuitBreakerStatus } from '../circuit-breaker.js';
import {
  generateAuditReport,
  auditReportBlob,
  auditReportFilename,
} from '../audit-export.js';
import { describeError } from '../lib/errorMessages.js';
import { ErrorBanner } from './ErrorBanner.js';
import { HealthBanner } from './HealthBanner.js';
import { PageHeader } from './PageHeader.js';
import { EmptyState } from './EmptyState.js';
import { ConnectingState, SkeletonRow } from './LoadingPlaceholders.js';
import { track } from '../lib/analytics.js';

const DASHBOARD_SUBTITLE =
  'Real-time platform health metrics computed from public on-chain ledger data. No private state is used.';

const formatPct = (value: number | null): string =>
  value === null ? '—' : `${value.toFixed(1)}%`;

const formatBigInt = (value: bigint): string => value.toLocaleString();

const liveCaption = (err: unknown): string =>
  err ? 'Live data unavailable' : 'Waiting for live data…';

export const Dashboard: React.FC = () => {
  const { state, error, retry } = useLedgerState();

  const m = state
    ? computeDashboardMetrics(state.invoices, state.insuranceClaims, state.insurancePool)
    : null;
  const cb = state
    ? computeCircuitBreakerStatus(state.invoices, state.insuranceClaims, state.insurancePool)
    : null;

  const noData = m !== null && m.totalInvoices === 0;

  const exportAuditTrail = (): void => {
    if (!state) return;
    const report = generateAuditReport(state);
    const url = URL.createObjectURL(auditReportBlob(report));
    const a = document.createElement('a');
    a.href = url;
    a.download = auditReportFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    track('audit_export', { invoices: report.summary.invoicesRegistered });
  };

  return (
    <div className="sl-panel sl-panel-elevated">
      <PageHeader
        title="Analytics Dashboard"
        subtitle={DASHBOARD_SUBTITLE}
        actions={
          <button
            type="button"
            className="sl-button"
            onClick={exportAuditTrail}
            disabled={!m || noData}
            title="Builds a compliance/audit trail from public on-chain state only — no private data is included."
          >
            Export Audit Trail (JSON)
          </button>
        }
      />

      {error && <ErrorBanner error={describeError('ledgerStream', error)} onRetry={retry} />}
      {!state && !error && (
        <ConnectingState
          label="Connecting to live ledger data…"
          hint="The dashboard layout is already here — metrics fill in as the live stream connects."
        />
      )}

      {noData && (
        <EmptyState
          title="No invoices on-chain yet"
          description="Health metrics and the summary table appear once the first invoice is registered — each registration also seeds the insurance pool."
          children={<Link className="sl-button" to="/finance">Register an invoice</Link>}
        />
      )}

      {m && !noData && <HealthBanner status={cb!} />}

      <div className="u-grid-fit">
        {/* ── Default Rate ── */}
        <div className="sl-stage sl-stage-compact">
          <h3 className="sl-section-title">Default Rate</h3>
          <div className="u-stat">{m ? formatPct(m.defaultRate) : '—'}</div>
          <p className="sl-meta u-mt-2">
            {m ? `${m.defaultedInvoices} defaulted / ${m.totalInvoices} total invoices` : liveCaption(error)}
          </p>
        </div>

        {/* ── Pool Utilization ── */}
        <div className="sl-stage sl-stage-compact">
          <h3 className="sl-section-title">Pool Utilization</h3>
          <div className="u-stat">{m ? formatPct(m.poolUtilization) : '—'}</div>
          <p className="sl-meta u-mt-2">
            {m ? `${formatBigInt(m.totalPayouts)} paid / ${formatBigInt(m.totalPremiums)} collected (tNight)` : liveCaption(error)}
          </p>
        </div>

        {/* ── Pool Balance ── */}
        <div className="sl-stage sl-stage-compact">
          <h3 className="sl-section-title">Pool Balance</h3>
          <div className="u-stat">
            {m ? (
              <>
                {formatBigInt(m.poolBalance)} <span className="u-stat-unit">tNight</span>
              </>
            ) : (
              '—'
            )}
          </div>
          <p className="sl-meta u-mt-2">
            Insurance pool reserves
          </p>
        </div>

        {/* ── Coverage Ratio ── */}
        <div className="sl-stage sl-stage-compact">
          <h3 className="sl-section-title">Coverage Ratio</h3>
          <div className="u-stat">
            {m ? (
              m.coverageRatio !== null ? (
                `${m.coverageRatio.toFixed(1)}%`
              ) : (
                m.totalExposure === 0n && m.settledInvoices === 0
                  ? <span className="u-stat-sub">No settled invoices yet</span>
                  : '—'
              )
            ) : (
              '—'
            )}
          </div>
          <p className="sl-meta u-mt-2">
            {m && m.totalExposure > 0n
              ? `Pool balance / ${formatBigInt(m.totalExposure)} total exposure`
              : 'Pool balance / total financed amount'}
          </p>
        </div>
      </div>

      {/* ── Summary table ── */}
      {m && !noData && (
        <table className="sl-table u-mt-4">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Total invoices</td>
              <td>{m.totalInvoices}</td>
            </tr>
            <tr>
              <td>Settled invoices</td>
              <td>{m.settledInvoices}</td>
            </tr>
            <tr>
              <td>Defaulted invoices</td>
              <td>{m.defaultedInvoices}</td>
            </tr>
            <tr>
              <td>Total premiums collected</td>
              <td>{formatBigInt(m.totalPremiums)} tNight</td>
            </tr>
            <tr>
              <td>Total payouts made</td>
              <td>{formatBigInt(m.totalPayouts)} tNight</td>
            </tr>
            <tr>
              <td>Total exposure (financed)</td>
              <td>{formatBigInt(m.totalExposure)} tNight</td>
            </tr>
          </tbody>
        </table>
      )}
      {!m && (
        <div className="u-scroll-x u-mt-4">
          <table className="sl-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <SkeletonRow columns={2} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};