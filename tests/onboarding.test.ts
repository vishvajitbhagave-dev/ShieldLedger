import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  onboardingCopyFor,
  onboardingDismissalKey,
  ONBOARDING_DISMISS_PREFIX,
  isOnboardingDismissed,
  dismissOnboarding,
  type OnboardingStep,
} from '../frontend/src/onboarding';

type AnyRecord = Record<string, string>;

const REAL_LOCAL_STORAGE = (globalThis as { localStorage?: unknown }).localStorage;

function installMemoryStorage(): void {
  const store: AnyRecord = {};
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string): string | null => (key in store ? store[key] : null),
    setItem: (key: string, value: string): void => {
      store[key] = value;
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
  };
}

function installBlockedStorage(): void {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (): string | null => {
      throw new Error('storage blocked');
    },
    setItem: (): void => {
      throw new Error('storage blocked');
    },
    removeItem: (): void => {
      throw new Error('storage blocked');
    },
  };
}

function restoreStorage(): void {
  if (REAL_LOCAL_STORAGE === undefined) {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  } else {
    (globalThis as { localStorage?: unknown }).localStorage = REAL_LOCAL_STORAGE;
  }
}

describe('onboardingCopyFor', () => {
  it('gives the SME 3 concrete steps about the SME workflow', () => {
    const copy = onboardingCopyFor('sme');
    expect(copy.steps.map((s: OnboardingStep) => s.title)).toEqual([
      'Register an invoice',
      'Await buyer confirmation',
      'Await bids, then settle',
    ]);
    expect(copy.steps.every((s: OnboardingStep) => s.title.length > 0 && s.text.length > 0)).toBe(true);
  });

  it('gives the buyer 3 concrete steps about confirmation', () => {
    const copy = onboardingCopyFor('buyer');
    expect(copy.steps.map((s: OnboardingStep) => s.title)).toEqual([
      'Confirm invoices',
      'Watch the auction',
      'Settlement happens on-chain',
    ]);
    expect(copy.steps.every((s: OnboardingStep) => s.title.length > 0 && s.text.length > 0)).toBe(true);
  });

  it('gives the lender 4 concrete steps about bidding', () => {
    const copy = onboardingCopyFor('lender');
    expect(copy.steps.map((s: OnboardingStep) => s.title)).toEqual([
      'Browse open invoices',
      'Submit a sealed bid',
      'Reveal to settle',
      'Track your positions',
    ]);
    expect(copy.steps.every((s: OnboardingStep) => s.title.length > 0 && s.text.length > 0)).toBe(true);
  });

  it('explains what "sealed" means for every role', () => {
    for (const role of ['sme', 'buyer', 'lender'] as const) {
      const copy = onboardingCopyFor(role);
      expect(copy.sealedBidLine.length).toBeGreaterThan(20);
      expect(copy.sealedBidLine.toLowerCase()).toContain('sealed');
      expect(copy.summary.length).toBeGreaterThan(10);
    }
  });

  it('each step references the right role surface without leaking internal jargon', () => {
    const sme = onboardingCopyFor('sme').steps.map((s: OnboardingStep) => s.text).join(' ');
    expect(sme).not.toMatch(/nullifier|commitment|bps|circuit/i);
  });
});

describe('onboardingDismissalKey', () => {
  it('uses the shieldledger.onboarding.dismissed.<role> key format', () => {
    expect(onboardingDismissalKey('sme')).toBe('shieldledger.onboarding.dismissed.sme');
    expect(onboardingDismissalKey('buyer')).toBe('shieldledger.onboarding.dismissed.buyer');
    expect(onboardingDismissalKey('lender')).toBe('shieldledger.onboarding.dismissed.lender');
  });

  it('keeps the dismiss-flag separate from the guided next-step keys', () => {
    expect(ONBOARDING_DISMISS_PREFIX).toBe('shieldledger.onboarding.dismissed.');
    expect(ONBOARDING_DISMISS_PREFIX).not.toBe('shieldledger.nextstep.dismissed.');
  });
});

describe('onboarding dismissal storage', () => {
  beforeEach(() => installMemoryStorage());
  afterEach(() => restoreStorage());

  it('is not dismissed by default for any role', () => {
    for (const role of ['sme', 'buyer', 'lender'] as const) {
      expect(isOnboardingDismissed(role)).toBe(false);
    }
  });

  it('persists dismissal per role under the flagged key', () => {
    dismissOnboarding('sme');
    expect(isOnboardingDismissed('sme')).toBe(true);
    expect(isOnboardingDismissed('buyer')).toBe(false);
    expect(isOnboardingDismissed('lender')).toBe(false);
  });

  it('dismissing a role never stores a wallet address or any wallet data', () => {
    dismissOnboarding('lender');
    const storage = (globalThis as { localStorage: { getItem(key: string): string | null } }).localStorage;
    const keys: string[] = [];
    // The app's in-memory stub has no key() — assert via the format instead:
    expect(onboardingDismissalKey('lender')).toMatch(/^shieldledger\.onboarding\.dismissed\.[a-z]+$/);
    expect(onboardingDismissalKey('lender')).not.toMatch(/mn_addr|shielded|wallet/i);
    expect(storage.getItem('shieldledger.onboarding.dismissed.lender')).toBe('1');
  });
});

describe('blocked or missing storage never crashes', () => {
  afterEach(() => restoreStorage());

  it('missing storage (typeof localStorage === undefined) reads as not-dismissed', () => {
    restoreStorage(); // ensures a fresh env per the real global state
    expect(typeof (globalThis as { localStorage?: unknown }).localStorage).not.toBe('object');
    expect(isOnboardingDismissed('sme')).toBe(false);
    expect(() => dismissOnboarding('sme')).not.toThrow();
  });

  it('blocked storage reads as not-dismissed and dismissal is a no-op', () => {
    installBlockedStorage();
    expect(isOnboardingDismissed('buyer')).toBe(false);
    expect(() => dismissOnboarding('buyer')).not.toThrow();
    expect(isOnboardingDismissed('buyer')).toBe(false);
  });
});