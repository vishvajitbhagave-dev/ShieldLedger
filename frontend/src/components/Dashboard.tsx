import React from 'react';
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
import { track } from '../lib/analytics.js';

const formatPct = (value: number | null): string =>
  value === null ? '—' : `${value.toFixed(1)}%`;

const formatBigInt = (value: bigint): string => value.toLocaleString();

export const Dashboard: React.FC = () => {
  const { state, error } = useLedgerState();

  if (!state && !error) {
    return (
      <div className="sl-panel">
        <h2>Analytics Dashboard</h2>
        <p className="sl-empty">Waiting for ledger state…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sl-panel">
        <h2>Analytics Dashboard</h2>
        <ErrorBanner error={describeError('ledgerStream', error)} />
      </div>
    );
  }

  const m = computeDashboardMetrics(
    state!.invoices,
    state!.insuranceClaims,
    state!.insurancePool,
  );

  const cb = computeCircuitBreakerStatus(
    state!.invoices,
    state!.insuranceClaims,
    state!.insurancePool,
  );

  const noData = m.totalInvoices === 0;

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
    <div className="sl-panel">
      <h2>Analytics Dashboard</h2>
      <p className="sl-note">
        Real-time platform health metrics computed from public on-chain ledger data. No private
        state is used.
      </p>

      <div className="sl-stage sl-stage-tight u-mb-4">
        <div className="u-flex-between">
          <span className="sl-meta">
            Export a compliance/audit trail built entirely from public on-chain state — no
            private data is included.
          </span>
          <button type="button" className="sl-button" onClick={exportAuditTrail} disabled={noData}>
            Export Audit Trail (JSON)
          </button>
        </div>
      </div>

      {noData && (
        <p className="sl-empty">No invoices registered yet — metrics will appear once data is on-chain.</p>
      )}

      {!noData && (
        <>
          <HealthBanner status={cb} />
          <div className="u-grid-fit">
          {/* ── Default Rate ── */}
          <div className="sl-stage sl-stage-compact">
            <h3 className="sl-section-title">Default Rate</h3>
            <div className="u-stat">
              {formatPct(m.defaultRate)}
            </div>
            <p className="sl-meta u-mt-2">
              {m.defaultedInvoices} defaulted / {m.totalInvoices} total invoices
            </p>
          </div>

          {/* ── Pool Utilization ── */}
          <div className="sl-stage sl-stage-compact">
            <h3 className="sl-section-title">Pool Utilization</h3>
            <div className="u-stat">
              {formatPct(m.poolUtilization)}
            </div>
            <p className="sl-meta u-mt-2">
              {formatBigInt(m.totalPayouts)} paid / {formatBigInt(m.totalPremiums)} collected (tNight)
            </p>
          </div>

          {/* ── Pool Balance ── */}
          <div className="sl-stage sl-stage-compact">
            <h3 className="sl-section-title">Pool Balance</h3>
            <div className="u-stat">
              {formatBigInt(m.poolBalance)} <span className="u-stat-unit">tNight</span>
            </div>
            <p className="sl-meta u-mt-2">
              Insurance pool reserves
            </p>
          </div>

          {/* ── Coverage Ratio ── */}
          <div className="sl-stage sl-stage-compact">
            <h3 className="sl-section-title">Coverage Ratio</h3>
            <div className="u-stat">
              {m.coverageRatio !== null ? `${m.coverageRatio.toFixed(1)}%` : (
                m.totalExposure === 0n && m.settledInvoices === 0
                  ? <span className="u-stat-sub">No settled invoices yet</span>
                  : '—'
              )}
            </div>
            <p className="sl-meta u-mt-2">
              {m.totalExposure > 0n
                ? `Pool balance / ${formatBigInt(m.totalExposure)} total exposure`
                : 'Pool balance / total financed amount'}
            </p>
          </div>
          </div>
        </>
      )}

      {/* ── Summary table ── */}
      {!noData && (
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
    </div>
  );
};
