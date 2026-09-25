import { beforeEach, describe, expect, it } from 'vitest';
import {
  demoLoadPoolPayouts,
  demoLoadRegisteredInvoices,
  demoRegisterInvoiceLocally,
  demoRequestedFromUrl,
  demoState$,
  getDemoApi,
  readDemoModeActive,
  resetDemoLedger,
  writeDemoModeActive,
} from '../frontend/src/lib/demo-ledger.js';
import { insuranceContribution, insurancePayoutFor } from '../src/insurance.js';

const DAY = 86400;
const nowSec = Math.floor(Date.now() / 1000);

describe('demo ledger', () => {
  beforeEach(() => {
    resetDemoLedger();
  });

  it('seeds a mixed-stage ledger', () => {
    const state = demoState$.value;
    expect(state.invoices.length).toBeGreaterThanOrEqual(5);
    expect(state.invoiceCount).toBe(BigInt(state.invoices.length));
    expect(state.insurancePool).not.toBeNull();
    expect(state.insurancePool!.balance).toBeGreaterThan(0n);
    expect(state.bestBids.length).toBeGreaterThan(0);
    expect(state.insuranceClaims.length).toBeGreaterThan(0);
    expect(state.invoices.some((i) => i.buyerVerified)).toBe(true);
    expect(state.invoices.some((i) => i.lender !== null)).toBe(true);
    expect(state.invoices.some((i) => i.splitCount > 0n)).toBe(true);
  });

  it('registers an invoice, credits the insurance premium and emits', async () => {
    const api = getDemoApi();
    const before = demoState$.value.invoiceCount;
    const balanceBefore = demoState$.value.insurancePool!.balance;
    const record = await demoRegisterInvoiceLocally({
      reference: 'INV-T',
      amount: 1000n,
      dueDate: BigInt(nowSec + 30 * DAY),
    });
    await api.registerInvoice(record.nullifier, 650n, 1000n, 0n, 0n);
    const after = demoState$.value;
    expect(after.invoiceCount).toBe(before + 1n);
    expect(after.insurancePool!.balance).toBe(balanceBefore + insuranceContribution(1000n));
    expect(after.invoices.some((i) => i.nullifier === record.nullifier)).toBe(true);
  });

  it('rejects duplicate registration', async () => {
    const api = getDemoApi();
    const record = await demoRegisterInvoiceLocally({
      reference: 'INV-DUP',
      amount: 1000n,
      dueDate: BigInt(nowSec + 30 * DAY),
    });
    await api.registerInvoice(record.nullifier, 650n, 1000n);
    await expect(api.registerInvoice(record.nullifier, 650n, 1000n)).rejects.toThrow(/already registered/i);
  });

  it('buyer-confirms an open invoice and rejects a mismatched amount', async () => {
    const api = getDemoApi();
    const unverified = demoState$.value.invoices.find((i) => !i.buyerVerified)!;
    await expect(api.confirmInvoice(unverified.nullifier, unverified.invoiceAmount - 1n)).rejects.toThrow(/match|amount/i);
    await api.confirmInvoice(unverified.nullifier, unverified.invoiceAmount);
    const updated = demoState$.value.invoices.find((i) => i.nullifier === unverified.nullifier)!;
    expect(updated.buyerVerified).toBe(true);
  });

  it('walks the bid → reveal → on-time settle cycle with +10 reputation', async () => {
    const api = getDemoApi();
    const bestCountBefore = demoState$.value.bestBids.length;
    const due = BigInt(nowSec + 30 * DAY);
    const record = await demoRegisterInvoiceLocally({ reference: 'INV-CYCLE', amount: 2000n, dueDate: due });
    await api.registerInvoice(record.nullifier, 650n, 2000n);
    await api.submitBid(record.nullifier, 1980n, due, 450n);
    await api.revealBid(record.nullifier, 1980n, due, 450n);
    expect(demoState$.value.bestBids.length).toBe(bestCountBefore + 1);

    const rep = await api.settleInvoice(record.nullifier, 1980n, due);
    expect(rep).not.toBeNull();
    expect(rep!.onTimeCount).toBe(1n);
    expect(rep!.lateCount).toBe(0n);
    expect(rep!.score).toBe(10n);

    const settled = demoState$.value.invoices.find((i) => i.nullifier === record.nullifier)!;
    expect(settled.lender).not.toBeNull();
    expect(settled.amount).toBe(1980n);
    expect(settled.rateBps).toBe(450n);

    await expect(api.settleInvoice(record.nullifier, 1980n, due)).rejects.toThrow(/already settled/i);
  });

  it('keeps the lowest-rate reveal as the winner', async () => {
    const api = getDemoApi();
    const due = BigInt(nowSec + 30 * DAY);
    const record = await demoRegisterInvoiceLocally({ reference: 'INV-2BID', amount: 3000n, dueDate: due });
    await api.registerInvoice(record.nullifier, 650n, 3000n);
    await api.revealBid(record.nullifier, 2950n, due, 500n);
    await api.revealBid(record.nullifier, 2950n, due, 480n);
    expect(demoState$.value.bestBids.find((b) => b.nullifier === record.nullifier)!.rateBps).toBe(480n);
    await api.revealBid(record.nullifier, 2950n, due, 520n);
    expect(demoState$.value.bestBids.find((b) => b.nullifier === record.nullifier)!.rateBps).toBe(480n);
  });

  it('penalizes late settlement (−20) and clamps reputation at its floor', async () => {
    const api = getDemoApi();
    const overdue = BigInt(nowSec - 5 * DAY);
    const record = await demoRegisterInvoiceLocally({ reference: 'INV-LATE', amount: 1000n, dueDate: overdue });
    await api.registerInvoice(record.nullifier, 650n, 1000n);
    await api.revealBid(record.nullifier, 990n, overdue, 400n);
    const rep = await api.settleInvoice(record.nullifier, 990n, overdue);
    expect(rep!.lateCount).toBe(1n);
    expect(rep!.onTimeCount).toBe(0n);
    expect(rep!.score).toBe(0n);
  });

  it('pays insurance on the seeded defaulted (unclaimed) invoice and drains the pool', async () => {
    const api = getDemoApi();
    const state = demoState$.value;
    const claimed = new Set(state.insuranceClaims.map((c) => c.nullifier));
    const best = state.bestBids.find(
      (b) => b.dueDate < BigInt(nowSec) && !claimed.has(b.nullifier),
    )!;
    const invoice = state.invoices.find((i) => i.nullifier === best.nullifier && i.lender === null)!;
    const balanceBefore = state.insurancePool!.balance;
    const payout = await api.claimInsurancePayout(invoice.nullifier);
    expect(payout).toBe(insurancePayoutFor(best.amount, balanceBefore));
    const after = demoState$.value;
    expect(after.insurancePool!.balance).toBe(balanceBefore - payout);
    expect(after.insuranceClaims.some((c) => c.nullifier === invoice.nullifier)).toBe(true);
  });

  it('refuses insurance before an invoice is past due', async () => {
    const api = getDemoApi();
    const best = demoState$.value.bestBids.find((b) => b.dueDate >= BigInt(nowSec))!;
    const invoice = demoState$.value.invoices.find(
      (i) => i.nullifier === best.nullifier && i.lender === null,
    )!;
    await expect(api.claimInsurancePayout(invoice.nullifier)).rejects.toThrow(/not defaulted yet/i);
  });

  it('rejects pool bids on single-lender invoices', async () => {
    const api = getDemoApi();
    const single = demoState$.value.invoices.find((i) => i.splitCount === 0n)!;
    await expect(
      api.revealPoolBid(single.nullifier, 0n, 100n, BigInt(nowSec + 5 * DAY), 400n),
    ).rejects.toThrow(/not a pool invoice/i);
  });

  it('runs a pool settle and a per-lender pool insurance claim', async () => {
    const api = getDemoApi();
    const pool = demoState$.value.invoices.find((i) => i.splitCount > 0n)!;
    const pseudonym = await api.getMyPseudonym();
    await api.revealPoolBid(pool.nullifier, 0n, 8000n, BigInt(nowSec + 30 * DAY), 450n);
    expect(demoState$.value.poolBids.length).toBe(1);
    expect(demoState$.value.poolBids[0].lender).toBe(pseudonym);

    const finDue = BigInt(nowSec - 3 * DAY);
    const contribs: [bigint, bigint, bigint, bigint] = [8000n, 8000n, 0n, 0n];
    const payouts: [bigint, bigint, bigint, bigint] = [7900n, 7900n, 0n, 0n];
    expect(await api.settleSplitInvoice(pool.nullifier, finDue, contribs, payouts, 16000n, 15800n)).toBe(false);
    const settled = demoState$.value;
    expect(settled.invoices.find((i) => i.nullifier === pool.nullifier)!.lender).not.toBeNull();
    expect(settled.payoutCommitments.length).toBe(4);
    expect(demoLoadPoolPayouts().length).toBe(4);

    const balanceBefore = settled.insurancePool!.balance;
    const slotPayout = await api.claimPoolInsurancePayout(pool.nullifier, 0n);
    expect(slotPayout).toBeGreaterThan(0n);
    expect(demoState$.value.insurancePool!.balance).toBeLessThanOrEqual(balanceBefore);
  });

  it('reflects secondary-market transfers in checkClaim', async () => {
    const api = getDemoApi();
    const record = await demoRegisterInvoiceLocally({
      reference: 'INV-SEC',
      amount: 1000n,
      dueDate: BigInt(nowSec + 30 * DAY),
    });
    await api.registerInvoice(record.nullifier, 650n, 1000n);
    expect(await api.checkClaim(record.nullifier, demoState$.value)).toBe('not-transferred');
    await api.transferClaim(record.nullifier, 'a'.repeat(64));
    expect(demoState$.value.invoices.find((i) => i.nullifier === record.nullifier)!.transferred).toBe(true);
    expect(await api.checkClaim(record.nullifier, demoState$.value)).toBe('other');
  });

  it('records pool secondary-market transfers', async () => {
    const api = getDemoApi();
    const pool = demoState$.value.invoices.find((i) => i.splitCount > 0n)!;
    await api.transferPoolClaim(pool.nullifier, 1n, 'b'.repeat(64));
    expect(demoState$.value.poolClaims.length).toBe(1);
    expect(demoState$.value.poolClaims[0].transferred).toBe(true);
    expect(demoState$.value.poolClaims[0].claimCommitment).toBe('b'.repeat(64));
  });

  it('offers a stable lender pseudonym and an empty reputation view', async () => {
    const api = getDemoApi();
    expect(await api.getMyPseudonym()).toMatch(/^[0-9a-f]{64}$/);
    const rep = await api.getReputation();
    expect(rep).not.toBeNull();
    expect(rep!.score).toBe(0n);
    expect(rep!.onTimeCount).toBe(0n);
    expect(rep!.lateCount).toBe(0n);
    expect(await api.getInsuranceContribution(1000n)).toBe(insuranceContribution(1000n));
  });

  it('reuses a nullifier for identical registry entries (idempotent)', async () => {
    const due = BigInt(nowSec + 30 * DAY);
    const a = await demoRegisterInvoiceLocally({ reference: 'INV-ID', amount: 500n, dueDate: due });
    const b = await demoRegisterInvoiceLocally({ reference: 'INV-ID', amount: 500n, dueDate: due });
    expect(a.nullifier).toBe(b.nullifier);
    expect(a.secret).toBe(b.secret);
    expect(demoLoadRegisteredInvoices().filter((r) => r.reference === 'INV-ID').length).toBe(1);
  });

  it('seeds at least one invoice in the SME tracker registry', () => {
    expect(demoLoadRegisteredInvoices().length).toBeGreaterThan(0);
    const seeded = demoLoadRegisteredInvoices()[0];
    expect(demoState$.value.invoices.some((i) => i.nullifier === seeded.nullifier)).toBe(true);
  });

  it('demo-mode flag helpers are safe without localStorage', () => {
    expect(readDemoModeActive()).toBe(false);
    expect(() => writeDemoModeActive(true)).not.toThrow();
    expect(() => writeDemoModeActive(false)).not.toThrow();
  });

  it('demoRequestedFromUrl() is safe in non-browser environments', () => {
    expect(demoRequestedFromUrl()).toBe(false);
  });
});