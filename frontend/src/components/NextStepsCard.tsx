import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShieldLedger, type Role } from '../context.js';
import { loadRegisteredInvoices } from '../invoice-registry.js';
import { demoLoadRegisteredInvoices, getDemoApi } from '../lib/demo-ledger.js';
import type { WalletScope } from '../wallet-scope.js';
import type { ShieldLedgerDerivedState } from '../shield-ledger-types.js';
import { computeNextStep } from '../next-steps.js';

const DISMISS_PREFIX = 'shieldledger.nextstep.dismissed.';

const isDismissed = (role: Role, kind: string): boolean => {
  try {
    return sessionStorage.getItem(`${DISMISS_PREFIX}${role}.${kind}`) === '1';
  } catch {
    return false;
  }
};

/**
 * Small, dismissible "what should I do next?" card shown on the Home page.
 * Picks the single most relevant next action for the connected wallet's role
 * and state by reusing data the app already tracks (public ledger view, the
 * wallet+contract-scoped invoice registry, and this wallet's lender pseudonym).
 * Dismissal is per session only (survives navigation within the tab, not a
 * fresh visit) and is keyed per role + suggestion so switching roles surfaces
 * the right hint again.
 */
export const NextStepsCard: React.FC<{
  role: Role;
  ledgerState: ShieldLedgerDerivedState | null;
}> = ({ role, ledgerState }) => {
  const { walletInfo, demo, deployment } = useShieldLedger();
  const navigate = useNavigate();

  const scope: WalletScope = {
    shieldedAddress: walletInfo?.shieldedAddress ?? '',
    contractAddress: deployment.status === 'deployed' ? deployment.address : '',
  };

  const registeredInvoices = useMemo(
    () => (demo ? demoLoadRegisteredInvoices() : loadRegisteredInvoices(scope)),
    [demo, scope.shieldedAddress, scope.contractAddress],
  );

  const [myPseudonym, setMyPseudonym] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const api = demo ? getDemoApi() : deployment.status === 'deployed' ? deployment.api : null;
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
  }, [demo, deployment]);

  const step = useMemo(
    () =>
      ledgerState
        ? computeNextStep({
            role,
            invoices: ledgerState.invoices,
            bids: ledgerState.bids,
            registeredInvoices,
            myPseudonym,
          })
        : null,
    [role, ledgerState, registeredInvoices, myPseudonym],
  );

  const [dismissed, setDismissed] = useState<boolean>(() =>
    step ? isDismissed(role, step.kind) : true,
  );

  useEffect(() => {
    setDismissed(step ? isDismissed(role, step.kind) : true);
  }, [role, step]);

  if (!step || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(`${DISMISS_PREFIX}${role}.${step.kind}`, '1');
    } catch {
      // Storage unavailable (e.g. blocked third-party storage): just hide it
      // for this render of the page.
    }
  };

  return (
    <div className="sl-nextstep" role="status" aria-label="Suggested next step">
      <div className="sl-nextstep-body">
        <span className="sl-nextstep-eyebrow">Suggested next step</span>
        <p className="sl-nextstep-text">{step.message}</p>
        <p className="sl-nextstep-hint">{step.hint}</p>
      </div>
      <div className="sl-nextstep-actions">
        <button type="button" className="sl-button sl-button-secondary" onClick={() => navigate(step.path)}>
          {step.cta}
        </button>
        <button
          type="button"
          className="sl-nextstep-dismiss"
          aria-label="Dismiss next step"
          title="Dismiss"
          onClick={dismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
};