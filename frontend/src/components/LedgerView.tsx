import React from 'react';
import { useLedgerState } from '../use-ledger-state.js';

const short = (hex: string): string => (hex.length > 16 ? `${hex.slice(0, 10)}…${hex.slice(-6)}` : hex);

const formatDate = (unixSeconds: bigint): string => {
  if (unixSeconds <= 0n) return '—';
  return new Date(Number(unixSeconds) * 1000).toLocaleString();
};

const BuyerVerifiedBadge: React.FC = () => (
  <span className="sl-badge" title="The corporate buyer proved in zero knowledge that this invoice is genuine and that it owes the claimed amount.">
    Buyer-verified ✓
  </span>
);

export const LedgerView: React.FC = () => {
  const { state, error } = useLedgerState();

  return (
    <div className="sl-panel">
      <h2>Public ledger</h2>
      {error && <div className="sl-error">Subscription error: {error}</div>}
      {!state && !error && <p className="sl-empty">Waiting for ledger state…</p>}
      {state && (
        <>
          <p className="sl-meta">
            invoiceCount = {state.invoiceCount.toString()} · {state.invoices.length} invoice(s) · {state.bids.length}{' '}
            sealed bid(s) · {state.bestBids.length} leading bid(s)
          </p>

          <section className="sl-stage">
            <h3 className="sl-section-title">Invoices</h3>
            <p className="sl-note">
              <strong>Credit (ZK-proof)</strong> and <strong>Reputation (ZK-proof)</strong> are the bounds the SME
              proved in zero knowledge — the actual scores are never revealed to anyone. A{' '}
              <strong>Buyer-verified ✓</strong> badge means a corporate buyer proved the invoice genuine; the buyer's
              identity and terms stay private.
            </p>
            {state.invoices.length === 0 ? (
              <p className="sl-empty">No invoices registered yet.</p>
            ) : (
              <table className="sl-table">
                <thead>
                  <tr>
                    <th>Nullifier</th>
                    <th>Commitment</th>
                    <th>Credit (ZK-proof)</th>
                    <th>Reputation (ZK-proof)</th>
                    <th>Claimed</th>
                    <th>Buyer-verified</th>
                    <th>Financed by</th>
                    <th>Amount</th>
                    <th>Rate</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {state.invoices.map((inv) => (
                    <tr key={inv.nullifier}>
                      <td className="sl-mono">{short(inv.nullifier)}</td>
                      <td className="sl-mono">{short(inv.smeCommitment)}</td>
                      <td title="The SME proved this bound in zero knowledge; the score itself is never revealed.">
                        score ≥ {inv.creditThreshold.toString()}
                      </td>
                      <td title="The SME proved its reputation is at least this bound; the actual score is never revealed.">
                        {inv.reputationThreshold > 0n ? (
                          `score ≥ ${inv.reputationThreshold.toString()}`
                        ) : (
                          <span className="sl-meta">any</span>
                        )}
                      </td>
                      <td>{inv.invoiceAmount.toString()}</td>
                      <td>{inv.buyerVerified ? <BuyerVerifiedBadge /> : <span className="sl-meta">—</span>}</td>
                      <td className="sl-mono">{inv.lender ? short(inv.lender) : '— (bidding)'}</td>
                      <td>{inv.amount.toString()}</td>
                      <td>{inv.rateBps > 0n ? `${inv.rateBps.toString()} bps` : '—'}</td>
                      <td>{formatDate(inv.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="sl-stage">
            <h3 className="sl-section-title">Sealed bids</h3>
            {state.bids.length === 0 ? (
              <p className="sl-empty">No bids submitted yet.</p>
            ) : (
              <table className="sl-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Lender (pseudonym)</th>
                    <th>Commitment (terms hidden)</th>
                  </tr>
                </thead>
                <tbody>
                  {state.bids.map((bid) => (
                    <tr key={bid.bidKey}>
                      <td className="sl-mono">{short(bid.nullifier)}</td>
                      <td className="sl-mono">{short(bid.lender)}</td>
                      <td className="sl-mono">{short(bid.commitment)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="sl-stage">
            <h3 className="sl-section-title">Leading bids (revealed)</h3>
            {state.bestBids.length === 0 ? (
              <p className="sl-empty">Nothing revealed yet — bids stay sealed until a lender reveals.</p>
            ) : (
              <table className="sl-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Lender (pseudonym)</th>
                    <th>Amount</th>
                    <th>Rate</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {state.bestBids.map((best) => (
                    <tr key={best.nullifier}>
                      <td className="sl-mono">{short(best.nullifier)}</td>
                      <td className="sl-mono">{short(best.lender)}</td>
                      <td>{best.amount.toString()}</td>
                      <td>{best.rateBps.toString()} bps</td>
                      <td>{formatDate(best.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
};
