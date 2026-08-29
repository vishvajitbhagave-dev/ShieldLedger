import React, { useEffect, useMemo, useState } from 'react';
import { useShieldLedger } from '../context.js';
import { useLedgerState } from '../use-ledger-state.js';
import { buildLenderPortfolio, type LenderPosition, type PositionStatus } from '../lender-portfolio.js';
import { loadPoolPayouts } from '../pool-payouts.js';
import { HexBadge } from './HexBadge.js';
import { describeError } from '../lib/errorMessages.js';
import { ErrorBanner } from './ErrorBanner.js';

const formatBigInt = (value: bigint): string => value.toLocaleString();

const shortNullifier = (hex: string): string =>
  hex.length > 14 ? `${hex.slice(0, 8)}…${hex.slice(-6)}` : hex;

const badgeStyle: Record<PositionStatus, React.CSSProperties> = {
  active: {
    background: 'var(--accent-soft)',
    color: 'var(--accent)',
    border: '1px solid rgba(0, 168, 255, 0.25)',
  },
  settled: {
    background: 'var(--success-soft)',
    color: 'var(--success)',
    border: '1px solid rgba(0, 191, 166, 0.25)',
  },
  defaulted: {
    background: 'var(--danger-soft)',
    color: 'var(--danger)',
    border: '1px solid rgba(220, 38, 38, 0.25)',
  },
};

const StatusBadge: React.FC<{ status: PositionStatus }> = ({ status }) => (
  <span className="sl-badge" style={badgeStyle[status]}>
    {status}
  </span>
);

const PoolShare: React.FC<{ position: LenderPosition }> = ({ position }) => {
  if (position.kind !== 'pool') return null;
  if (position.myPayout !== null) {
    return (
      <span>
        {formatBigInt(position.myPayout)}{' '}
        <span className="sl-meta">(local payout)</span>
      </span>
    );
  }
  return <span className="sl-badge sl-badge-warn">confidential</span>;
};

export const LenderPortfolio: React.FC = () => {
  const { deployment } = useShieldLedger();
  const { state, error } = useLedgerState();
  const api = deployment.status === 'deployed' ? deployment.api : null;
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
    for (const record of loadPoolPayouts()) {
      m.set(record.slotKey, BigInt(record.payout));
    }
    return m;
  }, [myPseudonym]);

  if (!state && !error) {
    return (
      <div className="sl-panel">
        <h2>My Lender Portfolio</h2>
        <p className="sl-empty">Waiting for ledger state…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sl-panel">
        <h2>My Lender Portfolio</h2>
        <ErrorBanner error={describeError('ledgerStream', error)} />
      </div>
    );
  }

  if (myPseudonym === undefined) {
    return (
      <div className="sl-panel">
        <h2>My Lender Portfolio</h2>
        <p className="sl-empty">Resolving your lender pseudonym…</p>
      </div>
    );
  }

  if (myPseudonym === null) {
    return (
      <div className="sl-panel">
        <h2>My Lender Portfolio</h2>
        <p className="sl-empty">
          No lender secret in this wallet's private state — submit a bid once to create one.
        </p>
      </div>
    );
  }

  const portfolio = buildLenderPortfolio(state!, myPseudonym, localPayouts);
  const singles = portfolio.positions.filter((p) => p.kind === 'single');
  const pools = portfolio.positions.filter((p) => p.kind === 'pool');

  return (
    <div className="sl-panel">
      <h2>My Lender Portfolio</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
        <span className="sl-meta">Pseudonym</span>
        <HexBadge hex={myPseudonym} />
      </div>
      <p className="sl-note">
        Positions belonging to this wallet only, read from public ledger state. Single-lender
        winning terms are disclosed; pool-slot contributions are private witnesses and are marked
        confidential. Comparisons use only your own pseudonym — nothing is newly disclosed.
      </p>

      {portfolio.positions.length === 0 && (
        <p className="sl-empty">
          No positions yet. Win a single-lender auction or reveal a pool slot to appear here.
        </p>
      )}

      {portfolio.positions.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div className="sl-stage" style={{ padding: '1rem' }}>
              <h3 className="sl-section-title" style={{ marginTop: 0 }}>Issued Exposure</h3>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                {formatBigInt(portfolio.issuedExposure)}{' '}
                <span style={{ fontSize: '0.9rem', fontWeight: 'normal' }}>tNight</span>
              </div>
              <p className="sl-meta" style={{ margin: '0.5rem 0 0' }}>
                {portfolio.singleCount} single-lender financing{pools.length > 0 && ` (${pools.length} pool slot principal confidential)`}
              </p>
            </div>

            <div className="sl-stage" style={{ padding: '1rem' }}>
              <h3 className="sl-section-title" style={{ marginTop: 0 }}>Contracted Return</h3>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                {formatBigInt(portfolio.contractedReturn)}{' '}
                <span style={{ fontSize: '0.9rem', fontWeight: 'normal' }}>tNight</span>
              </div>
              <p className="sl-meta" style={{ margin: '0.5rem 0 0' }}>
                Expected if repaid on time — not guaranteed
              </p>
            </div>

            <div className="sl-stage" style={{ padding: '1rem' }}>
              <h3 className="sl-section-title" style={{ marginTop: 0 }}>Positions</h3>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                {portfolio.activeCount}
                <span style={{ fontSize: '1rem', fontWeight: 'normal' }}> / {portfolio.positions.length}</span>
              </div>
              <p className="sl-meta" style={{ margin: '0.5rem 0 0' }}>
                {portfolio.settledCount} settled, {portfolio.defaultedCount} defaulted
              </p>
            </div>

            <div className="sl-stage" style={{ padding: '1rem' }}>
              <h3 className="sl-section-title" style={{ marginTop: 0 }}>Concentration</h3>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                {portfolio.concentrationRate === null
                  ? '—'
                  : `${(portfolio.concentrationRate * 100).toFixed(1)}%`}
              </div>
              <p className="sl-meta" style={{ margin: '0.5rem 0 0' }}>
                Largest position / disclosed exposure, across {portfolio.invoiceCount} invoiced position{portfolio.invoiceCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <table className="sl-table" style={{ marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Type</th>
                <th>Status</th>
                <th>Face amount</th>
                <th>Financed</th>
                <th>Rate</th>
                <th>Due</th>
                <th>Expected return</th>
                <th>My share</th>
              </tr>
            </thead>
            <tbody>
              {singles.map((p) => (
                <tr key={`single-${p.nullifier}`}>
                  <td className="sl-mono">{shortNullifier(p.nullifier)}</td>
                  <td>Single{!p.willingToSplit && ' (whole)'}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>{formatBigInt(p.faceAmount)}</td>
                  <td>{formatBigInt(p.financedAmount)}</td>
                  <td>{p.rateBps.toString()} bps</td>
                  <td className="sl-mono">{new Date(Number(p.dueDate) * 1000).toLocaleDateString()}</td>
                  <td>{p.status === 'defaulted' ? '—' : `${formatBigInt(p.expectedReturn)}`}</td>
                  <td>—</td>
                </tr>
              ))}
              {pools.map((p) => (
                <tr key={`pool-${p.slotKey}`}>
                  <td className="sl-mono">{shortNullifier(p.nullifier)}</td>
                  <td>Pool slot {p.slotIndex + 1}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>{formatBigInt(p.faceAmount)}</td>
                  <td>—</td>
                  <td>—</td>
                  <td className="sl-mono">{new Date(Number(p.dueDate) * 1000).toLocaleDateString()}</td>
                  <td>—</td>
                  <td><PoolShare position={p} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="sl-meta">
            Pool positions: the invoice face, total pool payout and due date are public
            ({pools.length > 0 ? formatBigInt(pools[0].totalPayout) : 0}… per pool invoice); the per-slot
            contribution is a private witness and the pool rate is not stored ({'"'}shieldledger:pool{'"'}
            markers set rateBps to 0). Your own payout appears only if this browser settled that pool.
          </p>
        </>
      )}
    </div>
  );
};