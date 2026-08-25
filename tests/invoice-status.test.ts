import { describe, it, expect } from 'vitest';
import {
  invoiceStatusOf,
  isAuctionResolved,
  isOpenInvoice,
  isInsuranceClaimed,
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

describe('isAuctionResolved', () => {
  const bestBids = [
    { nullifier: 'b'.repeat(64) },
    { nullifier: 'c'.repeat(64) },
  ];

  it('is true when a leading bid exists for the invoice', () => {
    expect(isAuctionResolved('b'.repeat(64), bestBids)).toBe(true);
  });

  it('is false when no leading bid exists for the invoice', () => {
    expect(isAuctionResolved('a'.repeat(64), bestBids)).toBe(false);
  });

  it('is false when there are no best bids at all', () => {
    expect(isAuctionResolved('b'.repeat(64), [])).toBe(false);
  });
});

describe('isInsuranceClaimed', () => {
  const claims = [{ nullifier: 'b'.repeat(64) }];

  it('is true when the pool already paid this invoice', () => {
    expect(isInsuranceClaimed('b'.repeat(64), claims)).toBe(true);
  });

  it('is false for invoices with no paid claim', () => {
    expect(isInsuranceClaimed('a'.repeat(64), claims)).toBe(false);
  });

  it('is false when no claim was paid at all', () => {
    expect(isInsuranceClaimed('b'.repeat(64), [])).toBe(false);
  });
});
