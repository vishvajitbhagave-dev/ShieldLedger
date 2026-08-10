// Pure view logic for the SME/Lender dashboards — kept outside the React
// components so it can be unit-tested without a DOM or a running contract.
// See tests/invoice-status.test.ts.

export type InvoiceStatus = 'Registered' | 'Bidding' | 'Settled';

/** Minimal serializable view of one public invoice (matches InvoiceView). */
export interface InvoiceSnapshot {
  readonly nullifier: string;
  readonly lender: string | null;
}

/** A registered-but-not-yet-registered-on-chain invoice is only local. */
export function invoiceStatusOf(
  registered: { readonly nullifier: string },
  onChainInvoices: ReadonlyArray<InvoiceSnapshot>,
): InvoiceStatus {
  const onLedger = onChainInvoices.find((i) => i.nullifier === registered.nullifier);
  if (!onLedger) return 'Registered';
  return onLedger.lender !== null ? 'Settled' : 'Bidding';
}

/** An invoice is open for bidding when it is on-chain with no lender yet. */
export function isOpenInvoice(invoice: InvoiceSnapshot): boolean {
  return invoice.lender === null;
}

/** Minimal view of one running best bid (matches BestBidView). */
export interface BestBidSnapshot {
  readonly nullifier: string;
}

/**
 * True when a lender has revealed a leading bid for this invoice — the
 * precondition for `settleInvoice`, which asserts "auction not resolved"
 * otherwise. The UI gates the Settle action on this instead of surfacing the
 * raw contract error.
 */
export function isAuctionResolved(
  nullifier: string,
  bestBids: ReadonlyArray<BestBidSnapshot>,
): boolean {
  return bestBids.some((b) => b.nullifier === nullifier);
}
