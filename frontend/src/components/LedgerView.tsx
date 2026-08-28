import React, { useState, useEffect } from 'react';
import { useLedgerState } from '../use-ledger-state.js';
import { describeError } from '../lib/errorMessages.js';
import { HexBadge } from './HexBadge.js';
import { ErrorBanner } from './ErrorBanner.js';
import { BidDepthChart } from './BidDepthChart.js';
import { buildMarketDepth } from '../bid-depth.js';
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

      // Insurance pool + paid claims
      const poolKey = `insurancePool-${state.insurancePool?.balance.toString() ?? 'none'}`;
      if (!(poolKey in next)) {
        next[poolKey] = now;
        changed = true;
      }
      for (const claim of state.insuranceClaims) {
        const claimKey = `insuranceClaim-${claim.nullifier}`;
        if (!(claimKey in next)) {
          next[claimKey] = now;
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
            sealed bid(s) · {state.bestBids.length} leading bid(s) · insurance pool ={' '}
            {state.insurancePool ? state.insurancePool.balance.toString() : '0'} tNight
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
                      <th>Whole</th>
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
                          <td>{best.willingToSplit ? 'Split' : 'Whole'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="sl-stage">
            <h3 className="sl-section-title">Bid depth (order book)</h3>
            <p className="sl-note">
              Revealed winning bids across resolved auctions, grouped by rate. Shows disclosed
              winner terms only — non-winning bids' terms and pool bid rates are never published.
            </p>
            <details className="sl-details">
              <summary>Learn more</summary>
              <p>
                The on-chain design discloses the rate/amount of only the <em>single winning</em>{' '}
                bid per single-lender auction; competing bids' terms are discarded at reveal and
                pool-bid rates are committed (private). This chart therefore plots exactly what is
                public — an order-book-style view of who is winning at each rate, not a bid ladder
                of every competitor. Lowest rate = best offer.
              </p>
            </details>
            <div style={{ overflowX: 'auto' }}>
              <BidDepthChart depth={buildMarketDepth(state.bestBids, state.poolBids)} />
            </div>
          </section>

          <section className="sl-stage">
            <h3 className="sl-section-title">Default insurance pool</h3>
            <p className="sl-note">
              Every invoice registration pays in 2% of its face amount; a proven default pays out 50% of the financed
              amount — partially if the pool is thin.
            </p>
            <details className="sl-details">
              <summary>Learn more</summary>
              <p>
                The pool is one shared public balance. The premium and each payout are proven inside the circuit (the
                exact percentages cannot be faked), but observers only ever see totals: which SME funded the pool and
                why a specific claim was paid stays private. A paid claim is recorded solely under the invoice's
                already-public nullifier, so every default can only ever pay out once.
              </p>
            </details>
            {state.insurancePool === null ? (
              <p className="sl-empty">Not seeded yet — it fills with the first invoice registration.</p>
            ) : (
              <>
                <p
                  className={isHighlighted(`insurancePool-${state.insurancePool.balance.toString()}`) ? 'sl-row-highlight' : ''}
                  style={{ fontSize: '1.3em', fontWeight: 'bold', margin: '0.5rem 0' }}
                >
                  Balance: {state.insurancePool.balance.toString()} tNight
                </p>
                {state.insuranceClaims.length === 0 ? (
                  <p className="sl-empty">No default claims paid yet.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="sl-table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Paid out</th>
                          <th>Claimed at</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.insuranceClaims.map((claim) => {
                          const highlighted = isHighlighted(`insuranceClaim-${claim.nullifier}`);
                          return (
                            <tr key={claim.nullifier} className={highlighted ? 'sl-row-highlight' : ''}>
                              <td><HexBadge hex={claim.nullifier} /></td>
                              <td style={{ fontWeight: 'bold' }}>{claim.payout.toString()} tNight</td>
                              <td>{formatDate(claim.claimedAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>

          {state.poolBids.length > 0 && (
            <section className="sl-stage">
              <h3 className="sl-section-title">Pool bids (bestPools)</h3>
              <p className="sl-note">Revealed bids for pool-financed invoices — lender pseudonym and commitment only.</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="sl-table">
                  <thead>
                    <tr>
                      <th>Slot key</th>
                      <th>Lender pseudonym</th>
                      <th>Bid commitment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.poolBids.map((bid) => (
                      <tr key={bid.slotKey}>
                        <td><HexBadge hex={bid.slotKey} /></td>
                        <td><HexBadge hex={bid.lender} /></td>
                        <td><HexBadge hex={bid.commitment} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {state.payoutCommitments.length > 0 && (
            <section className="sl-stage">
              <h3 className="sl-section-title">Pool settlement commitments</h3>
              <p className="sl-note">
                Per-lender payout commitment hashes for pool-financed invoices. Individual payout <em>values</em> are
                private — each commitment binds a slot to its payout (verified at insurance-claim time), without ever
                publishing the amount.
              </p>
              <details className="sl-details">
                <summary>Learn more</summary>
                <p>
                  At settlement the SME proves each payout is proportional to its contribution in zero knowledge, then
                  writes <code>hash(slotKey, payout)</code> on-chain. Every lender keeps their payout in their own wallet;
                  when default insurance is claimed, the circuit re-derives that hash from the undisclosed payout and
                  requires it to match this ledger entry — so nobody can fabricate a payout to inflate their claim.
                </p>
              </details>
              <div style={{ overflowX: 'auto' }}>
                <table className="sl-table">
                  <thead>
                    <tr>
                      <th>Slot key</th>
                      <th>Payout commitment (hash)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.payoutCommitments.map((c) => (
                      <tr key={c.slotKey}>
                        <td><HexBadge hex={c.slotKey} /></td>
                        <td><HexBadge hex={c.hash} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {state.poolClaims.length > 0 && (
            <section className="sl-stage">
              <h3 className="sl-section-title">Pool claim commitments</h3>
              <p className="sl-note">Per-lender secondary-market claim ownership for pool invoices.</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="sl-table">
                  <thead>
                    <tr>
                      <th>Slot key</th>
                      <th>Claim commitment</th>
                      <th>Transferred</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.poolClaims.map((c) => (
                      <tr key={c.slotKey}>
                        <td><HexBadge hex={c.slotKey} /></td>
                        <td><HexBadge hex={c.claimCommitment} /></td>
                        <td>{c.transferred ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
