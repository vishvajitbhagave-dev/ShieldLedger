import React, { useEffect, useState } from 'react';
import { useShieldLedger } from '../context.js';
import type { ShieldLedgerDerivedState } from '../shield-ledger-types.js';

const short = (hex: string): string => (hex.length > 16 ? `${hex.slice(0, 10)}…${hex.slice(-6)}` : hex);

const formatDate = (unixSeconds: bigint): string => {
  if (unixSeconds <= 0n) return '—';
  return new Date(Number(unixSeconds) * 1000).toLocaleString();
};

export const LedgerView: React.FC = () => {
  const { deployment } = useShieldLedger();
  const api = deployment.status === 'deployed' ? deployment.api : null;
  const [state, setState] = useState<ShieldLedgerDerivedState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api) return;
    const subscription = api.state$.subscribe({
      next: (s) => {
        setState(s);
        setError(null);
      },
      error: (e) => setError(e instanceof Error ? e.message : String(e)),
    });
    return () => subscription.unsubscribe();
  }, [api]);

  return (
    <div className="sl-panel">
      <h2>Public ledger</h2>
      {error && <div className="sl-error" style={{ marginBottom: 12 }}>Subscription error: {error}</div>}
      {!state && !error && <p className="sl-empty">Waiting for ledger state…</p>}
      {state && (
        <>
          <p className="sl-meta">
            invoiceCount = {state.invoiceCount.toString()} · {state.invoices.length} invoice(s) · {state.bids.length}{' '}
            bid(s)
          </p>

          <h3 style={{ fontSize: 14, margin: '14px 0 8px', color: '#93b4e4' }}>Invoices</h3>
          {state.invoices.length === 0 ? (
            <p className="sl-empty">No invoices registered yet.</p>
          ) : (
            <table className="sl-table">
              <thead>
                <tr>
                  <th>Nullifier</th>
                  <th>Commitment</th>
                  <th>Financed by</th>
                  <th>Amount</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {state.invoices.map((inv) => (
                  <tr key={inv.nullifier}>
                    <td className="sl-mono">{short(inv.nullifier)}</td>
                    <td className="sl-mono">{short(inv.smeCommitment)}</td>
                    <td className="sl-mono">{inv.lender ? short(inv.lender) : '— (bidding)'}</td>
                    <td>{inv.amount.toString()}</td>
                    <td>{formatDate(inv.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 style={{ fontSize: 14, margin: '18px 0 8px', color: '#93b4e4' }}>Bids</h3>
          {state.bids.length === 0 ? (
            <p className="sl-empty">No bids submitted yet.</p>
          ) : (
            <table className="sl-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Lender (pseudonym)</th>
                  <th>Amount</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {state.bids.map((bid) => (
                  <tr key={bid.bidKey}>
                    <td className="sl-mono">{short(bid.nullifier)}</td>
                    <td className="sl-mono">{short(bid.lender)}</td>
                    <td>{bid.amount.toString()}</td>
                    <td>{formatDate(bid.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
};
