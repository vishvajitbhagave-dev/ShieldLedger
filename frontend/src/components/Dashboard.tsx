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

      <div className="sl-stage" style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {/* ── Default Rate ── */}
          <div className="sl-stage" style={{ padding: '1rem' }}>
            <h3 className="sl-section-title" style={{ marginTop: 0 }}>Default Rate</h3>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent)' }}>
              {formatPct(m.defaultRate)}
            </div>
            <p className="sl-meta" style={{ margin: '0.5rem 0 0' }}>
              {m.defaultedInvoices} defaulted / {m.totalInvoices} total invoices
            </p>
          </div>

          {/* ── Pool Utilization ── */}
          <div className="sl-stage" style={{ padding: '1rem' }}>
            <h3 className="sl-section-title" style={{ marginTop: 0 }}>Pool Utilization</h3>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent)' }}>
              {formatPct(m.poolUtilization)}
            </div>
            <p className="sl-meta" style={{ margin: '0.5rem 0 0' }}>
              {formatBigInt(m.totalPayouts)} paid / {formatBigInt(m.totalPremiums)} collected (tNight)
            </p>
          </div>

          {/* ── Pool Balance ── */}
          <div className="sl-stage" style={{ padding: '1rem' }}>
            <h3 className="sl-section-title" style={{ marginTop: 0 }}>Pool Balance</h3>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent)' }}>
              {formatBigInt(m.poolBalance)} <span style={{ fontSize: '0.9rem', fontWeight: 'normal' }}>tNight</span>
            </div>
            <p className="sl-meta" style={{ margin: '0.5rem 0 0' }}>
              Insurance pool reserves
            </p>
          </div>

          {/* ── Coverage Ratio ── */}
          <div className="sl-stage" style={{ padding: '1rem' }}>
            <h3 className="sl-section-title" style={{ marginTop: 0 }}>Coverage Ratio</h3>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent)' }}>
              {m.coverageRatio !== null ? `${m.coverageRatio.toFixed(1)}%` : (
                m.totalExposure === 0n && m.settledInvoices === 0
                  ? <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>No settled invoices yet</span>
                  : '—'
              )}
            </div>
            <p className="sl-meta" style={{ margin: '0.5rem 0 0' }}>
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
        <table className="sl-table" style={{ marginTop: '1rem' }}>
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
