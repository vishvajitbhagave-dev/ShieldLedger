import React, { useMemo, useState } from 'react';
import { useRateTrend } from '../use-rate-trend.js';
import {
  averageRate,
  bucketize,
  bucketMsFor,
  creditBandCounts,
  type CreditBand,
  type RateBucket,
} from '../rate-trend.js';
import { describeError } from '../lib/errorMessages.js';
import { ErrorBanner } from './ErrorBanner.js';

const GRID = 'var(--border, #e3e6ee)';
const TEXT = 'var(--text, #1c2333)';
const ACCENT = 'var(--accent, #4f8cff)';
const DOT = '#2bb673';

const W = 560;
const H = 220;
const PAD_L = 46;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 34;

const fmtBucket = (startMs: number, bucketMs: number): string => {
  const d = new Date(startMs);
  const mo = `${d.getMonth() + 1}/${d.getDate()}`;
  if (bucketMs >= 86_400_000) return mo;
  return `${mo} ${String(d.getHours()).padStart(2, '0')}:00`;
};

const fmtClock = (ms: number): string => new Date(ms).toLocaleString();

const chipClass = (active: boolean): string => `sl-chip${active ? ' sl-chip-active' : ''}`;

const TrendChart: React.FC<{ buckets: readonly RateBucket[]; bucketMs: number }> = ({
  buckets,
  bucketMs,
}) => {
  if (buckets.length === 0) return null;

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const rates = buckets.map((b) => Number(b.avgRateBps));
  let yMin = Math.min(...rates);
  let yMax = Math.max(...rates);
  if (yMax === yMin) {
    yMin -= 50;
    yMax += 50;
  }
  const spread = yMax - yMin;

  const xMin = buckets[0].startMs;
  const xMax = Math.max(buckets[buckets.length - 1].startMs, xMin + bucketMs);
  const xSpan = xMax - xMin;

  const x = (t: number): number => PAD_L + ((t - xMin) / xSpan) * innerW;
  const y = (v: number): number => PAD_T + innerH - ((v - yMin) / spread) * innerH;

  const pts = buckets
    .map((b) => `${x(b.startMs).toFixed(1)},${y(Number(b.avgRateBps)).toFixed(1)}`)
    .join(' ');

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = buckets.length > 12 ? Math.ceil(buckets.length / 3) : 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Average financing rate over time"
      className="u-chart"
      style={{ maxWidth: W }}
    >
      {yTicks.map((f) => {
        const yy = PAD_T + innerH - f * innerH;
        const v = Math.round(yMin + f * spread);
        return (
          <g key={f}>
            <line x1={PAD_L} y1={yy} x2={W - PAD_R} y2={yy} stroke={GRID} strokeWidth={1} />
            <text x={PAD_L - 6} y={yy + 4} textAnchor="end" fontSize={10} fill={TEXT}>
              {v}
            </text>
          </g>
        );
      })}

      {buckets.map((b, i) => {
        const bx = x(b.startMs);
        const by = y(Number(b.avgRateBps));
        return (
          <g key={i}>
            {i % labelEvery === 0 && (
              <line x1={bx} y1={PAD_T} x2={bx} y2={PAD_T + innerH} stroke={GRID} strokeWidth={1} strokeDasharray="2 3" />
            )}
            <circle cx={bx} cy={by} r={4} fill={DOT} />
            {b.count > 1 && (
              <text x={bx} y={Math.max(12, by - 8)} textAnchor="middle" fontSize={10} fill={TEXT}>
                ×{b.count}
              </text>
            )}
          </g>
        );
      })}

      {buckets.length > 1 && <polyline points={pts} fill="none" stroke={ACCENT} strokeWidth={2} />}

      <line x1={PAD_L} y1={PAD_T + innerH} x2={W - PAD_R} y2={PAD_T + innerH} stroke={TEXT} strokeWidth={1} />
      {buckets.map((b, i) =>
        i % labelEvery === 0 ? (
          <text key={i} x={x(b.startMs)} y={H - 12} textAnchor="middle" fontSize={10} fill={TEXT}>
            {fmtBucket(b.startMs, bucketMs)}
          </text>
        ) : null,
      )}
    </svg>
  );
};

export const RateTrendChart: React.FC = () => {
  const { records, sessionCount, error, reset } = useRateTrend();
  const [band, setBand] = useState<'all' | CreditBand>('all');

  const bandCounts = useMemo(() => creditBandCounts(records), [records]);
  const filtered = useMemo(
    () => (band === 'all' ? records : records.filter((r) => r.creditBand === band)),
    [records, band],
  );
  const bucketMs = useMemo(() => bucketMsFor(filtered), [filtered]);
  const buckets = useMemo(() => bucketize(filtered, bucketMs), [filtered, bucketMs]);
  const avg = useMemo(() => averageRate(filtered), [filtered]);

  const rows = useMemo(() => [...filtered].sort((a, b) => b.observedAtMs - a.observedAtMs), [filtered]);

  const handleReset = (): void => {
    reset();
  };

  return (
    <div className="sl-panel">
      <div className="u-flex-between">
        <h2>Rate Trend (observed)</h2>
        <button type="button" className="sl-button sl-button-secondary" onClick={handleReset} disabled={records.length === 0}>
          Clear this browser's trend
        </button>
      </div>

      <p className="sl-note">
        Forward-only, browser-local record. A point is appended when THIS browser observes, live
        from contract state, an invoice becoming financed with a public single-lender rate. It is
        <strong> not</strong> a complete historical record: nothing predating these local records is
        reconstructed, pool-financed invoices are excluded (their rate is not public), and the data
        lives only in this browser{` `}(localStorage). An on-chain or indexer-sourced history was
        explicitly declined — see docs/TRUST_AND_DATA_PROVENANCE.md §3.
      </p>

      {error && <ErrorBanner error={describeError('ledgerStream', error)} />}

      {records.length === 0 && (
        <p className="sl-empty">
          No financing decisions observed yet. This chart starts empty and fills in as invoices are
          financed while this browser is connected — the first observed state is treated as the
          baseline (already-financed invoices are never back-filled).
        </p>
      )}

      {records.length > 0 && (
        <>
          <div className="u-grid-fit-sm u-mb-4">
            <div className="sl-stage sl-stage-tight">
              <div className="u-stat u-stat-sm">{records.length}</div>
              <p className="sl-meta u-mt-1">records observed in this browser</p>
            </div>
            <div className="sl-stage sl-stage-tight">
              <div className="u-stat u-stat-sm">{sessionCount}</div>
              <p className="sl-meta u-mt-1">observed this session</p>
            </div>
            <div className="sl-stage sl-stage-tight">
              <div className="u-stat u-stat-sm">
                {avg === null ? '—' : `${avg.toString()} bps`}
              </div>
              <p className="sl-meta u-mt-1">average rate{band !== 'all' ? ` (${band})` : ' (all bands)'}</p>
            </div>
            <div className="sl-stage sl-stage-tight">
              <div className="u-stat u-stat-sm">{buckets.length}</div>
              <p className="sl-meta u-mt-1">time buckets plotted</p>
            </div>
          </div>

          <div className="u-flex u-mb-4">
            <button type="button" className={chipClass(band === 'all')} onClick={() => setBand('all')}>
              All bands · {records.length}
            </button>
            {bandCounts.map(({ band: b, count }) => (
              <button key={b} type="button" className={chipClass(band === b)} onClick={() => setBand(b)}>
                {b} · {count}
              </button>
            ))}
          </div>

          {buckets.length === 0 ? (
            <p className="sl-empty">No records in the {band} credit band yet.</p>
          ) : (
            <>
              <TrendChart buckets={buckets} bucketMs={bucketMs} />
              <p className="sl-note u-mt-2">
                Each point is the average of the {band === 'all' ? 'observed' : band} financing
                rate(s) in its time bucket. Risk bands group by the public{' '}
                creditThreshold/reputationThreshold — the <em>attested lower bounds</em> an SME
                proved in ZK at registration, the same inputs the pricing engine uses — never the
                SME's true private score.
              </p>
            </>
          )}

          <div className="u-scroll-x">
            <table className="sl-table u-mt-4">
              <thead>
                <tr>
                  <th>Observed</th>
                  <th>Credit band</th>
                  <th>Reputation</th>
                  <th>Rate</th>
                  <th>Financed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.nullifier}>
                    <td className="sl-meta">{fmtClock(r.observedAtMs)}</td>
                    <td>{r.creditBand}</td>
                    <td>{r.reputationBand}</td>
                    <td>{r.rateBps.toString()} bps</td>
                    <td>{r.financedAmount.toLocaleString()} tNight</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="sl-meta">
            Records are stamped at observation time, not the on-chain block time; the chart is
            this browser's view (category (b)/(a) data only — no off-chain service is involved).
          </p>
        </>
      )}
    </div>
  );
};