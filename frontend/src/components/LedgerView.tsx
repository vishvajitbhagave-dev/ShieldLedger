import React, { useState, useEffect } from 'react';
import { useLedgerState } from '../use-ledger-state.js';
import { describeError } from '../lib/errorMessages.js';
import { HexBadge } from './HexBadge.js';
import { ErrorBanner } from './ErrorBanner.js';
import * as ShieldLedger from '../../../contracts/managed/shield-ledger/contract/index.js';

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

// The opaque public payee the contract records when a transferred claim settles.
const SECONDARY_PAYEE = toHex(ShieldLedger.pureCircuits.deriveSecondaryPayee());

const formatDate = (unixSeconds: bigint): string => {
  if (unixSeconds <= 0n) return '—';
  return new Date(Number(unixSeconds) * 1000).toLocaleString();
};

const BuyerVerifiedBadge: React.FC = () => (
  <span className="sl-badge" title="The corporate buyer proved in zero knowledge that this invoice is genuine and that it owes the claimed amount.">
    Buyer-verified ✓
  </span>
);

const TransferredBadge: React.FC<{ settled?: boolean }> = ({ settled }) => (
  <span
    className="sl-badge"
    title={
      settled
        ? 'This claim was resold on the secondary market. Settlement names only an anonymous payee — the current holder proves their payout right in zero knowledge.'
        : 'The winning lender resold this claim on the secondary market. Only a commitment to the new owner went on-chain — their identity stays hidden.'
    }
  >
    Claim transferred{settled ? ' · settled anonymously' : ''}
  </span>
);

export const LedgerView: React.FC = () => {
  const { state, error } = useLedgerState();
  const [firstSeen, setFirstSeen] = useState<Record<string, number>>({});

  // Track when elements are first seen in ledger state to trigger flash highlight animation
  useEffect(() => {
    if (!state) return;
    const now = Date.now();
    setFirstSeen((prev) => {
      const next = { ...prev };
      let changed = false;

      // Invoices
      for (const inv of state.invoices) {
        if (!(inv.nullifier in next)) {
          next[inv.nullifier] = now;
          changed = true;
        }
        // Track state change triggers (buyer verification and lender financing)
        const buyerVerifyKey = `${inv.nullifier}-buyerVerified-${inv.buyerVerified}`;
        if (!(buyerVerifyKey in next)) {
          next[buyerVerifyKey] = now;
          changed = true;
        }
        const lenderKey = `${inv.nullifier}-lender-${inv.lender ?? ''}`;
        if (!(lenderKey in next)) {
          next[lenderKey] = now;
          changed = true;
        }
        const transferKey = `${inv.nullifier}-transferred-${inv.transferred}`;
        if (!(transferKey in next)) {
          next[transferKey] = now;
          changed = true;
        }
      }

      // Sealed bids
      for (const bid of state.bids) {
        if (!(bid.bidKey in next)) {
          next[bid.bidKey] = now;
          changed = true;
        }
      }

      // Leading bids (revealed)
      for (const best of state.bestBids) {
        const bestKey = `best-${best.nullifier}-${best.lender}-${best.rateBps}`;
        if (!(bestKey in next)) {
          next[bestKey] = now;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [state]);

  const isHighlighted = (key: string): boolean => {
    const time = firstSeen[key];
    if (!time) return false;
    // Highlight if first seen in the last 4 seconds
    return Date.now() - time < 4000;
  };

  return (
    <div className="sl-panel">
      <h2>Public ledger</h2>
      {error && <ErrorBanner error={describeError('ledgerStream', error)} />}
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
              ZK-proof bounds only — scores stay private; <strong>✓</strong> = a buyer verified it.
            </p>
            <details className="sl-details">
              <summary>Learn more</summary>
              <p>
                <strong>Credit (ZK-proof)</strong> and <strong>Reputation (ZK-proof)</strong> are the bounds the SME
                proved in zero knowledge — the actual scores are never revealed to anyone. A{' '}
                <strong>Buyer-verified ✓</strong> badge means a corporate buyer proved the invoice genuine; the buyer's
                identity and terms stay private. A <strong>Claim transferred</strong> badge means the financing claim
                was resold on the secondary market: only a commitment to the current holder went on-chain, and a
                settlement pays an anonymous payee — never a named investor.
              </p>
            </details>
            {state.invoices.length === 0 ? (
              <p className="sl-empty">No invoices registered yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
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
                    {state.invoices.map((inv) => {
                      const highlighted =
                        isHighlighted(inv.nullifier) ||
                        isHighlighted(`${inv.nullifier}-buyerVerified-${inv.buyerVerified}`) ||
                        isHighlighted(`${inv.nullifier}-lender-${inv.lender ?? ''}`) ||
                        isHighlighted(`${inv.nullifier}-transferred-${inv.transferred}`);
                      return (
                        <tr key={inv.nullifier} className={highlighted ? 'sl-row-highlight' : ''}>
                          <td><HexBadge hex={inv.nullifier} /></td>
                          <td><HexBadge hex={inv.smeCommitment} /></td>
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
                          <td>
                            {inv.lender ? (
                              inv.transferred && inv.lender === SECONDARY_PAYEE ? (
                                <TransferredBadge settled />
                              ) : (
                                <HexBadge hex={inv.lender} />
                              )
                            ) : inv.transferred ? (
                              <TransferredBadge />
                            ) : (
                              <span className="sl-meta">— (bidding)</span>
                            )}
                          </td>
                          <td style={{ fontWeight: 'bold' }}>{inv.amount.toString()}</td>
                          <td>{inv.rateBps > 0n ? `${inv.rateBps.toString()} bps` : '—'}</td>
                          <td>{formatDate(inv.dueDate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="sl-stage">
            <h3 className="sl-section-title">Sealed bids</h3>
            {state.bids.length === 0 ? (
              <p className="sl-empty">No bids submitted yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="sl-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Lender (pseudonym)</th>
                      <th>Commitment (terms hidden)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.bids.map((bid) => {
                      const highlighted = isHighlighted(bid.bidKey);
                      return (
                        <tr key={bid.bidKey} className={highlighted ? 'sl-row-highlight' : ''}>
                          <td><HexBadge hex={bid.nullifier} /></td>
                          <td><HexBadge hex={bid.lender} /></td>
                          <td><HexBadge hex={bid.commitment} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="sl-stage">
            <h3 className="sl-section-title">Leading bids (revealed)</h3>
            {state.bestBids.length === 0 ? (
              <p className="sl-empty">Nothing revealed yet — bids stay sealed until a lender reveals.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
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
                    {state.bestBids.map((best) => {
                      const bestKey = `best-${best.nullifier}-${best.lender}-${best.rateBps}`;
                      const highlighted = isHighlighted(bestKey);
                      return (
                        <tr key={best.nullifier} className={highlighted ? 'sl-row-highlight' : ''}>
                          <td><HexBadge hex={best.nullifier} /></td>
                          <td><HexBadge hex={best.lender} /></td>
                          <td style={{ fontWeight: 'bold' }}>{best.amount.toString()}</td>
                          <td style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{best.rateBps.toString()} bps</td>
                          <td>{formatDate(best.dueDate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
