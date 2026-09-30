// Step-by-step guided tour per role, launched from the "Take a tour" button on
// the HowItWorksCard (Home). Pure, testable module — no wallet data, no
// analytics, no persistence. Steps target elements marked with stable, inert
// `data-tour="…"` attributes so the tour survives CSS refactors. Copy stays in
// plain language and mirrors the onboarding card's verified sealed-bid facts.

import type { Role } from './context.js';

export interface TourStep {
  /** HashRouter route the step's element lives on. */
  readonly path: string;
  /** Value of the `data-tour` attribute on the highlighted element. */
  readonly target: string;
  readonly title: string;
  readonly body: string;
}

export const TOUR_STEPS_BY_ROLE: Record<Role, readonly TourStep[]> = {
  sme: [
    {
      path: '/',
      target: 'role-switch',
      title: 'Your role',
      body: "You're an SME here — you register invoices and lenders compete privately to fund them. Switch roles any time.",
    },
    {
      path: '/',
      target: 'nav',
      title: 'Where everything lives',
      body: "Home, Invoice Financing, the Public Ledger, the Dashboard, and Settings live in this nav. Lender-only pages appear when you switch to Lender.",
    },
    {
      path: '/',
      target: 'hero',
      title: 'Your starting point',
      body: 'This is your primary action: register an invoice to start the sealed-bid auction.',
    },
    {
      path: '/',
      target: 'quick-actions',
      title: 'Fast paths',
      body: "These jump straight to the screens you'll use most as an SME.",
    },
    {
      path: '/finance',
      target: 'stepper',
      title: "Your invoice's journey",
      body: 'Register → Confirmation → Bids → Settlement. Each step lights up as your invoice moves forward.',
    },
    {
      path: '/finance',
      target: 'register-form',
      title: 'Register an invoice',
      body: 'Prove your credit score in zero knowledge — your invoice details never leave your browser.',
    },
  ],
  buyer: [
    {
      path: '/',
      target: 'role-switch',
      title: 'Your role',
      body: "You're a corporate buyer here — you confirm invoices are genuine so lenders can fund them safely. Switch roles any time.",
    },
    {
      path: '/',
      target: 'nav',
      title: 'Where everything lives',
      body: "Home, Invoice Financing, the Public Ledger, the Dashboard, and Settings live in this nav. Lender-only pages appear when you switch to Lender.",
    },
    {
      path: '/',
      target: 'hero',
      title: 'Your starting point',
      body: 'This is your primary action: confirm the pending invoices waiting in your queue.',
    },
    {
      path: '/',
      target: 'quick-actions',
      title: 'Fast paths',
      body: "These jump straight to the screens you'll use most as a buyer.",
    },
    {
      path: '/finance',
      target: 'stepper',
      title: 'Verifying invoices',
      body: "Pending → Confirm → Buyer-verified. Everything stays private — the ledger only shows a verified flag.",
    },
    {
      path: '/finance',
      target: 'finance-actions',
      title: 'Confirm in zero knowledge',
      body: "'Confirm Invoice' proves an invoice's amount and due date without revealing who you are.",
    },
    {
      path: '/ledger',
      target: 'ledger',
      title: 'Your impact on the ledger',
      body: "Every invoice you confirm carries this 'Buyer-verified' flag — amounts are revealed, but the buyer stays private.",
    },
  ],
  lender: [
    {
      path: '/',
      target: 'role-switch',
      title: 'Your role',
      body: "You're a lender here — you bid privately in a sealed auction and earn from financing vetted SMEs. Switch roles any time.",
    },
    {
      path: '/',
      target: 'nav',
      title: 'Where everything lives',
      body: "Home, Invoice Financing, the Public Ledger, the Dashboard, and Settings live in this nav. Your portfolio pages appear here too.",
    },
    {
      path: '/',
      target: 'hero',
      title: 'Your starting point',
      body: 'This is your primary action: open your portfolio or finance invoices on the open market.',
    },
    {
      path: '/',
      target: 'quick-actions',
      title: 'Fast paths',
      body: "These jump straight to the screens you'll use most as a lender.",
    },
    {
      path: '/finance',
      target: 'stepper',
      title: 'The auction flow',
      body: 'Browse → Submit Sealed Bid → Reveal → Pool → Secondary Market → Default Insurance.',
    },
    {
      path: '/finance',
      target: 'finance-actions',
      title: 'Submit a sealed bid',
      body: "'Submit Bid' funds an invoice at a rate you choose — only proof of your bid is posted on-chain, so nobody can see or copy your terms before reveal.",
    },
    {
      path: '/portfolio',
      target: 'portfolio',
      title: 'Your positions',
      body: 'Wins, payouts, and guarantees you hold settle here — and if an invoice defaults, you can claim from the insurance pool.',
    },
  ],
};

export function getTourSteps(role: Role): readonly TourStep[] {
  return TOUR_STEPS_BY_ROLE[role];
}