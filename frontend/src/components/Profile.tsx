import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useShieldLedger } from '../context.js';
import { loadRegisteredInvoices } from '../invoice-registry.js';
import type { WalletScope } from '../wallet-scope.js';
import { demoLoadRegisteredInvoices, getDemoApi } from '../lib/demo-ledger.js';
import { HexBadge } from './HexBadge.js';
import { PageHeader } from './PageHeader.js';
import { EmptyState } from './EmptyState.js';
import { unixSecondsToDmy } from '../time.js';

const PAGE_TITLE = 'Profile';

/**
 * Your own wallet's identity and browser-activity view: the wallet's lender
 * pseudonym and the invoices this browser registered. Wallet addresses and the
 * contract instance live on the Home page's Network &amp; Account block, and
 * financing positions live on the Lender Portfolio page (linked from here).
 * Nothing private is disclosed.
 */
export const Profile: React.FC = () => {
  const { walletInfo, role, demo, deployment } = useShieldLedger();
  const api = demo ? getDemoApi() : deployment.status === 'deployed' ? deployment.api : null;
  const [myPseudonym, setMyPseudonym] = useState<string | null | undefined>(undefined);

  // Registered invoices are wallet+contract scoped: only this wallet's own
  // records on the active contract are shown (never another wallet's, even in
  // the same browser).
  const scope: WalletScope = {
    shieldedAddress: walletInfo?.shieldedAddress ?? '',
    contractAddress: deployment.status === 'deployed' ? deployment.address : '',
  };

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

  const registeredInvoices = useMemo(
    () => (demo ? demoLoadRegisteredInvoices() : loadRegisteredInvoices(scope)),
    [demo, scope.shieldedAddress, scope.contractAddress],
  );

  return (
    <div className="sl-panel sl-panel-elevated">
      <PageHeader
        title={PAGE_TITLE}
        subtitle="Your wallet's identity and this browser's own activity — everything shown is local or already public on-chain."
      />

      <section className="sl-stage">
        <h3 className="sl-section-title">Wallet identity</h3>
        <div className="sl-status-group sl-header-details">
          <div className="sl-status-item">
            <span className="sl-status-label">Lender pseudonym</span>
            <span className="sl-status-value">
              {myPseudonym === undefined ? (
                <span className="sl-meta">—</span>
              ) : myPseudonym === null ? (
                <span className="sl-meta">No lender identity yet — submit a bid to create one</span>
              ) : (
                <HexBadge hex={myPseudonym} />
              )}
            </span>
          </div>
        </div>
        <p className="sl-note">
          Wallet addresses and the active contract instance are shown on the Home page&rsquo;s
          Network &amp; Account block.
        </p>
      </section>

      <section className="sl-stage">
        <h3 className="sl-section-title">Your activity</h3>

        <p className="sl-meta sl-section-tag">Invoices registered from this browser</p>
        {registeredInvoices.length === 0 ? (
          <EmptyState
            compact
            title="No invoices registered yet"
            description="Invoices you register on the Invoice financing page are recalled here."
          />
        ) : (
          <div className="u-scroll-x">
            <table className="sl-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Due</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {registeredInvoices
                  .slice()
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map((inv) => (
                    <tr key={inv.nullifier}>
                      <td className="sl-mono">{inv.reference}</td>
                      <td>{inv.amount}</td>
                      <td className="sl-mono">{unixSecondsToDmy(BigInt(inv.dueDate))}</td>
                      <td className="sl-mono">{new Date(inv.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="sl-meta sl-section-tag">Portfolio (Lender role)</p>
        {role !== 'lender' ? (
          <p className="sl-note">
            Financing-position summaries live on the Lender Portfolio page once you choose the
            Lender role.
          </p>
        ) : (
          <>
            <p className="sl-note">
              Issued exposure, contracted return, concentration, and per-position details —
              including pool-slot confidentiality rules — live on the Lender Portfolio page.
            </p>
            <Link className="sl-button" to="/portfolio">
              View Lender Portfolio →
            </Link>
          </>
        )}
      </section>
    </div>
  );
};