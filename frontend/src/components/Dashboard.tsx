import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLedgerState } from '../use-ledger-state.js';
import { computeDashboardMetrics } from '../dashboard-metrics.js';
import { computeCircuitBreakerStatus } from '../circuit-breaker.js';
import {
  generateAuditReport,
  auditReportBlob,
  auditReportFilename,
  invoicesCsvBlob,
  invoicesCsvFilename,
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

  const [exportNotice, setExportNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!exportNotice) return;
    const timer = window.setTimeout(() => setExportNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [exportNotice]);

  // Triggers a browser download of the given blob. Revoking the object URL is
  // deliberately deferred so a slow download isn't cancelled mid-flight, and
  // a failure inside the click path is rethrown for the caller to surface.
  const deliverBlobDownload = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('export failed:', e);
      throw e;
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  };

  const exportAuditTrail = (): void => {
    if (!state) return;
    try {
      const report = generateAuditReport(state);
      deliverBlobDownload(auditReportBlob(report), auditReportFilename());
      setExportNotice({ kind: 'ok', text: 'Audit trail exported (JSON).' });
      track('audit_export', { invoices: report.summary.invoicesRegistered });
    } catch (e) {
      console.error('audit export failed:', e);
      setExportNotice({ kind: 'error', text: 'Audit export failed — please try again.' });
    }
  };

  const exportCsvForAccounting = (): void => {
    if (!state) return;
    try {
      deliverBlobDownload(invoicesCsvBlob(state), invoicesCsvFilename());
      setExportNotice({ kind: 'ok', text: 'CSV exported for accounting.' });
      track('csv_export', { invoices: state.invoices.length });
    } catch (e) {
      console.error('csv export failed:', e);
      setExportNotice({ kind: 'error', text: 'CSV export failed — please try again.' });
    }
  };

  return (
    <div className="sl-panel sl-panel-elevated">
      <PageHeader
        title="Analytics Dashboard"
        subtitle={DASHBOARD_SUBTITLE}
        actions={
          <>
            <button
              type="button"
              className="sl-button"
              onClick={exportAuditTrail}
              disabled={!m || noData}
              title="Builds a compliance/audit trail from public on-chain state only — no private data is included."
            >
              Export Audit Trail (JSON)
            </button>
            <button
              type="button"
              className="sl-button"
              onClick={exportCsvForAccounting}
              disabled={!m || noData}
              title="Flat spreadsheet export of the public invoice ledger — one row per invoice, public fields only, for accounting."
            >
              Export CSV for Accounting
            </button>
          </>
        }
      />

      {exportNotice && (
        <p className={exportNotice.kind === 'ok' ? 'sl-success u-mb-0' : 'sl-error u-mb-0'} role="status">
          {exportNotice.text}
        </p>
      )}
      {noData && (
        <p className="sl-meta u-mb-0" role="note">
          The export buttons stay disabled until the first invoice is registered on-chain.
        </p>
      )}

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