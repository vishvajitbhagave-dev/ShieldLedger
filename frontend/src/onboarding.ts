// First-visit "How it works in this app" guidance per role. Kept as a pure,
// testable module separate from the guided next-steps card (which is a
// per-session "what should I do next?" hint). This card explains the basics of
// the workflow for a chosen role; dismissal is persisted per role in
// localStorage and stays purely local to this browser — no wallet data, no
// analytics, no tracking.

import type { Role } from './context.js';

export interface OnboardingStep {
  readonly title: string;
  readonly text: string;
}

export interface OnboardingCopy {
  /** One plain-language line summarizing what this role does. */
  readonly summary: string;
  /** 3–4 short steps a user of this role actually performs in the app. */
  readonly steps: readonly OnboardingStep[];
  /** A short line explaining why bids are sealed (hidden until reveal). */
  readonly sealedBidLine: string;
}

export const ONBOARDING_DISMISS_PREFIX = 'shieldledger.onboarding.dismissed.';

/**
 * Storage key for a role's dismissal flag, e.g.
 * `shieldledger.onboarding.dismissed.sme`. Never wallet-linked — role only.
 */
export function onboardingDismissalKey(role: Role): string {
  return `${ONBOARDING_DISMISS_PREFIX}${role}`;
}

/**
 * True when the onboarding card has been dismissed for this role in this
 * browser. Missing or blocked storage is treated as "not dismissed" (the card
 * may show again, but the app never crashes).
 */
export function isOnboardingDismissed(role: Role): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(onboardingDismissalKey(role)) === '1';
  } catch {
    // Storage blocked (privacy mode / third-party storage denied): show the
    // card this session; closing it simply won't persist.
    return false;
  }
}

/**
 * Marks the onboarding card as dismissed for `role` in this browser. Swallows
 * storage errors so a blocked storage never breaks the app.
 */
export function dismissOnboarding(role: Role): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(onboardingDismissalKey(role), '1');
  } catch {
    // Storage full or blocked — best effort only.
  }
}

export function onboardingCopyFor(role: Role): OnboardingCopy {
  switch (role) {
    case 'sme':
      return {
        summary: 'You register invoices and lenders compete privately to fund them.',
        steps: [
          {
            title: 'Register an invoice',
            text: 'Prove your credit score and reputation in zero knowledge — your invoice details never leave your browser.',
          },
          {
            title: 'Await buyer confirmation',
            text: 'Your corporate buyer verifies the invoice is genuine and owed before lenders can bid.',
          },
          {
            title: 'Await bids, then settle',
            text: 'Lenders compete on rate; once the winning rate is revealed, the contract pays and your reputation updates.',
          },
        ],
        sealedBidLine:
          'Bids are sealed: lenders commit privately, and only the winning rate is ever revealed — so no lender is influenced by the others.',
      };
    case 'buyer':
      return {
        summary: 'You confirm invoices are genuine so lenders can safely fund them.',
        steps: [
          {
            title: 'Confirm invoices',
            text: 'Open the pending invoice and confirm its amount and due date in zero knowledge.',
          },
          {
            title: 'Watch the auction',
            text: 'Once verified, lenders can bid — the lowest revealed rate wins.',
          },
          {
            title: 'Settlement happens on-chain',
            text: 'The contract pays the winning lender automatically when the invoice is due.',
          },
        ],
        sealedBidLine:
          'Sealed means hidden until reveal: lenders can’t see each other’s terms during the auction, and only the winning rate is published.',
      };
    case 'lender':
      return {
        summary: 'You bid privately in a sealed auction and earn from financing vetted SMEs.',
        steps: [
          {
            title: 'Browse open invoices',
            text: 'See buyer-verified invoices with the SME’s proven credit and reputation bounds.',
          },
          {
            title: 'Submit a sealed bid',
            text: 'Commit a rate and funded amount privately — only a commitment is posted on-chain.',
          },
          {
            title: 'Reveal to settle',
            text: 'Once the bid window closes, reveal to settle; the lowest rate wins and the contract pays you.',
          },
          {
            title: 'Track your positions',
            text: 'Manage your portfolio and claim from the insurance pool if an invoice defaults.',
          },
        ],
        sealedBidLine:
          'Sealed means hidden until reveal: no lender can copy or change another’s commitment, so nobody tips the auction.',
      };
  }
}