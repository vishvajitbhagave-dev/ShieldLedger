import { describe, it, expect } from 'vitest';
import {
  invoiceStatusOf,
  isOpenInvoice,
} from '../frontend/src/invoice-status';

const REGISTERED = { nullifier: 'a'.repeat(64) };
const OPEN = { nullifier: 'b'.repeat(64), lender: null };
const SETTLED = { nullifier: 'c'.repeat(64), lender: 'aa11…bb22' };

describe('invoiceStatusOf', () => {
  it('reports Registered while the invoice is only in the local registry', () => {
    expect(invoiceStatusOf(REGISTERED, [OPEN, SETTLED])).toBe('Registered');
  });

  it('reports Bidding once the invoice is on-chain with no lender', () => {
    expect(invoiceStatusOf({ nullifier: OPEN.nullifier }, [OPEN, SETTLED])).toBe('Bidding');
  });

  it('reports Settled once the invoice carries a lender', () => {
    expect(invoiceStatusOf({ nullifier: SETTLED.nullifier }, [OPEN, SETTLED])).toBe('Settled');
  });

  it('is stable with an empty on-chain snapshot', () => {
    expect(invoiceStatusOf(REGISTERED, [])).toBe('Registered');
  });

  it('matches invoices by nullifier, not by reference', () => {
    const other = { nullifier: 'd'.repeat(64), lender: null };
    expect(invoiceStatusOf(REGISTERED, [other])).toBe('Registered');
  });
});

describe('isOpenInvoice', () => {
  it('returns true only for on-chain invoices without a lender', () => {
    expect(isOpenInvoice(OPEN)).toBe(true);
    expect(isOpenInvoice(SETTLED)).toBe(false);
  });
});
