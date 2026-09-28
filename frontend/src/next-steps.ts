// Pure "what should I do next?" guidance per role, derived only from data the
// app already tracks (role, the public ledger view, the wallet+contract-scoped
// invoice registry, and this wallet's lender pseudonym). Kept as a pure
// function so the suggestions are trivially testable and share no logic with
// the pages themselves.

import type { Role } from './context.js';
import type { InvoiceView, SealedBidView } from './shield-ledger-types.js';
import type { RegisteredInvoice } from './invoice-registry.js';

export interface NextStep {
  readonly kind: string;
  readonly message: string;
  readonly hint: string;
  readonly cta: string;
  readonly path: string;
}

/**
 * Returns the single most useful next action for `role` given the wallet's
 * current state, or `null` when there is no clear one (or when the data needed
 * to decide is still resolving — callers should render nothing in that case).
 *
 * Invoice lifecycle uses the same public predicate as the rest of the app:
 * `lender === null` means still open for bidding, `lender !== null` means
 * financed/settled. A lender pseudonym only exists after a first sealed bid.
 */
export function computeNextStep(opts: {
  role: Role;
  invoices: InvoiceView[];
  bids: SealedBidView[];
  registeredInvoices: RegisteredInvoice[];
  myPseudonym: string | null | undefined;
}): NextStep | null {
  const { role, invoices, bids, registeredInvoices, myPseudonym } = opts;
  const openInvoices = invoices.filter((inv) => inv.lender === null);

  if (role === 'sme') {
    if (registeredInvoices.length === 0) {
      return {
        kind: 'sme-register',
        message: 'Get started: Register your first invoice',
        hint: 'Lenders compete on fresh invoices inside Invoice Financing.',
        cta: 'Register an invoice',
        path: '/finance',
      };
    }

    const onLedger = new Map(invoices.map((inv) => [inv.nullifier, inv]));
    const own = registeredInvoices
      .map((inv) => onLedger.get(inv.nullifier))
      .filter((inv): inv is InvoiceView => inv !== undefined);

    // Awaiting a winning bid beats a settled one as "the" next action.
    if (own.some((inv) => inv.lender === null)) {
      return {
        kind: 'sme-live',
        message: 'Your invoice is live — check Public Ledger for bid activity',
        hint: 'Sealed bids are landing on your open invoice.',
        cta: 'Open Public Ledger',
        path: '/ledger',
      };
    }
    if (own.some((inv) => inv.lender !== null)) {
      return {
        kind: 'sme-settled',
        message: 'Nice work — register another invoice, or check your reputation in Profile',
        hint: 'Your invoice was financed on-chain.',
        cta: 'Open Profile',
        path: '/profile',
      };
    }
    // Registered locally but not yet visible on the ledger stream — guessing
    // here would mislead, so show nothing until it settles in.
    return null;
  }

  if (role === 'lender') {
    // Undefined = pseudonym still resolving; wait rather than flash a hint.
    if (myPseudonym === undefined) return null;
    if (myPseudonym === null) {
      return {
        kind: 'lender-start',
        message: 'Get started: Browse open invoices and place a sealed bid',
        hint: 'Lowest-rate-wins sealed auction, backed by default insurance.',
        cta: 'Browse open invoices',
        path: '/finance',
      };
    }

    const mine = myPseudonym.toLowerCase();
    const openByNullifier = new Set(openInvoices.map((inv) => inv.nullifier));
    const hasOpenBidAwaitingReveal = bids.some(
      (bid) => bid.lender.toLowerCase() === mine && openByNullifier.has(bid.nullifier),
    );
    if (hasOpenBidAwaitingReveal) {
      return {
        kind: 'lender-reveal',
        message: 'You have a bid to reveal — go to Invoice Financing',
        hint: 'Reveal your sealed bid once its window closes to settle the auction.',
        cta: 'Go to Invoice Financing',
        path: '/finance',
      };
    }
    return null;
  }

  if (role === 'buyer') {
    if (openInvoices.some((inv) => !inv.buyerVerified)) {
      return {
        kind: 'buyer-confirm',
        message: 'You have invoices awaiting your confirmation',
        hint: 'Confirm genuine invoices in zero knowledge so lenders can fund them.',
        cta: 'Confirm an invoice',
        path: '/finance',
      };
    }
    return null;
  }

  return null;
}