import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTourSteps, TOUR_STEPS_BY_ROLE, type TourStep } from '../frontend/src/tour';

const ROLES = ['sme', 'buyer', 'lender'] as const;

const srcFile = (rel: string): string =>
  fileURLToPath(new URL(`../frontend/src/${rel}`, import.meta.url));

// Every step target must map to a source file carrying the matching inert
// `data-tour="…"` attribute, so a CSS refactor can't silently break the tour.
const TARGET_SOURCES: Record<string, readonly string[]> = {
  'role-switch': ['App.tsx'],
  nav: ['App.tsx'],
  hero: ['App.tsx'],
  'quick-actions': ['App.tsx'],
  stepper: ['components/InvoiceFinancing.tsx'],
  'register-form': ['components/InvoiceFinancing.tsx'],
  'finance-actions': ['components/InvoiceFinancing.tsx'],
  ledger: ['components/LedgerView.tsx'],
  portfolio: ['components/LenderPortfolio.tsx'],
};

const shorthand = (steps: readonly TourStep[]): string[] =>
  steps.map((s) => `#${s.path}:${s.target}`);

describe('getTourSteps', () => {
  it('defines 4–8 fully fleshed-out steps for every role', () => {
    for (const role of ROLES) {
      const steps = getTourSteps(role);
      expect(steps.length).toBeGreaterThanOrEqual(4);
      expect(steps.length).toBeLessThanOrEqual(8);
      for (const s of steps) {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.body.length).toBeGreaterThan(10);
        expect(s.path).toMatch(/^\//);
        expect(s.target.length).toBeGreaterThan(0);
      }
    }
  });

  it('sizes each role\'s tour to its workflow (SME 6, Buyer 7, Lender 7)', () => {
    expect(getTourSteps('sme')).toHaveLength(6);
    expect(getTourSteps('buyer')).toHaveLength(7);
    expect(getTourSteps('lender')).toHaveLength(7);
  });

  it('starts every tour on the Home shell with the four shared stops', () => {
    for (const role of ROLES) {
      expect(shorthand(getTourSteps(role)).slice(0, 4)).toEqual([
        '#/:role-switch',
        '#/:nav',
        '#/:hero',
        '#/:quick-actions',
      ]);
    }
  });

  it('covers each role-specific workflow across the right routes', () => {
    const sme = shorthand(getTourSteps('sme'));
    const buyer = shorthand(getTourSteps('buyer'));
    const lender = shorthand(getTourSteps('lender'));

    expect(sme).toContain('#/finance:stepper');
    expect(sme).toContain('#/finance:register-form');

    expect(buyer).toContain('#/finance:stepper');
    expect(buyer).toContain('#/finance:finance-actions');
    expect(buyer).toContain('#/ledger:ledger');

    expect(lender).toContain('#/finance:stepper');
    expect(lender).toContain('#/finance:finance-actions');
    expect(lender).toContain('#/portfolio:portfolio');
  });

  it('keeps every target unique within a role\'s tour', () => {
    for (const role of ROLES) {
      const targets = getTourSteps(role).map((s) => s.target);
      expect(new Set(targets).size).toBe(targets.length);
    }
  });

  it('never exceeds the six Home-shell stops before moving to role pages', () => {
    // The first four steps always live on Home; anything beyond that is
    // role-specific and routes via the app's HashRouter.
    for (const role of ROLES) {
      const home = getTourSteps(role).filter((s) => s.path === '/');
      expect(home.length).toBe(4);
    }
  });
});

describe('tour step targets exist in source', () => {
  it('declares a stable data-tour attribute for every step target', () => {
    for (const role of ROLES) {
      for (const s of getTourSteps(role)) {
        const files = TARGET_SOURCES[s.target];
        expect(files, `no source declared for target "${s.target}"`).toBeDefined();
        const found = files.some((f) =>
          readFileSync(srcFile(f), 'utf8').includes(`data-tour="${s.target}"`),
        );
        expect(found, `missing data-tour="${s.target}" in ${files.join(', ')}`).toBe(true);
      }
    }
  });
});

describe('tour copy safety', () => {
  it('keeps copy free of internal jargon and wallet-derived data', () => {
    for (const role of ROLES) {
      const copy = getTourSteps(role)
        .map((s) => `${s.title} ${s.body}`)
        .join(' ');
      expect(copy).not.toMatch(/nullifier|bps|commitment|circuit|protected|shieldedaddress/i);
      expect(copy).not.toMatch(/[0-9a-f]{40}/i);
    }
  });

  it('never mentions analytics, tracking, or a wallet address', () => {
    for (const role of ROLES) {
      const copy = getTourSteps(role)
        .map((s) => s.body)
        .join(' ');
      expect(copy).not.toMatch(/analytics|tracking|wallet/i);
    }
  });
});

describe('TOUR_STEPS_BY_ROLE', () => {
  it('exposes the same steps through the accessor', () => {
    expect(TOUR_STEPS_BY_ROLE.sme).toEqual(getTourSteps('sme'));
    expect(TOUR_STEPS_BY_ROLE.buyer).toEqual(getTourSteps('buyer'));
    expect(TOUR_STEPS_BY_ROLE.lender).toEqual(getTourSteps('lender'));
  });
});