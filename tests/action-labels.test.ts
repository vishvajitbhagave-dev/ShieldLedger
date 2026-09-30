import { describe, it, expect } from 'vitest';
import {
  ACTION_COMPLETED_LABELS,
  ACTION_PROGRESS_LABELS,
  actionCompletedLabel,
  actionProgressLabel,
} from '../frontend/src/action-labels';

describe('actionProgressLabel', () => {
  it('replaces every action key with friendly in-progress wording (no raw keys leak)', () => {
    for (const [key, label] of Object.entries(ACTION_PROGRESS_LABELS)) {
      expect(actionProgressLabel(key)).toBe(label);
      expect(actionProgressLabel(key)).not.toContain(key);
    }
  });

  it('covers the known action keys by name', () => {
    expect(actionProgressLabel('registerInvoice')).toBe('Registering your invoice');
    expect(actionProgressLabel('confirmInvoice')).toBe('Confirming the invoice');
    expect(actionProgressLabel('submitBid')).toBe('Submitting your bid');
    expect(actionProgressLabel('revealBid')).toBe('Revealing your bid');
    expect(actionProgressLabel('settleInvoice')).toBe('Settling the invoice');
    expect(actionProgressLabel('settleSplitInvoice')).toBe('Settling the pool invoice');
    expect(actionProgressLabel('revealPoolBid')).toBe('Revealing your pool bid');
    expect(actionProgressLabel('transferClaim')).toBe('Transferring your claim');
    expect(actionProgressLabel('transferPoolClaim')).toBe('Transferring your pool claim');
    expect(actionProgressLabel('checkClaim')).toBe('Checking your claim');
    expect(actionProgressLabel('claimInsurancePayout')).toBe('Claiming the insurance payout');
    expect(actionProgressLabel('claimPoolInsurancePayout')).toBe('Claiming the pool insurance payout');
  });

  it('falls back to a safe generic for unknown action keys', () => {
    expect(actionProgressLabel('someFutureAction')).toBe('Working');
  });

  it('returns the safe generic while no operation is running', () => {
    expect(actionProgressLabel(null)).toBe('Working');
  });
});

describe('actionCompletedLabel', () => {
  it('replaces every action key with friendly completed wording (no raw keys leak)', () => {
    for (const [key, label] of Object.entries(ACTION_COMPLETED_LABELS)) {
      expect(actionCompletedLabel(key)).toBe(label);
      expect(actionCompletedLabel(key)).not.toContain(key);
    }
  });

  it('covers the known success toasts by name', () => {
    expect(actionCompletedLabel('registerInvoice')).toBe('Invoice registered');
    expect(actionCompletedLabel('confirmInvoice')).toBe('Invoice confirmed');
    expect(actionCompletedLabel('submitBid')).toBe('Bid submitted');
    expect(actionCompletedLabel('revealBid')).toBe('Bid revealed');
    expect(actionCompletedLabel('settleInvoice')).toBe('Invoice settled');
    expect(actionCompletedLabel('settleSplitInvoice')).toBe('Pool invoice settled');
    expect(actionCompletedLabel('revealPoolBid')).toBe('Pool bid revealed');
    expect(actionCompletedLabel('transferClaim')).toBe('Claim transferred');
    expect(actionCompletedLabel('transferPoolClaim')).toBe('Pool claim transferred');
    expect(actionCompletedLabel('checkClaim')).toBe('Claim checked');
    expect(actionCompletedLabel('claimInsurancePayout')).toBe('Insurance payout claimed');
    expect(actionCompletedLabel('claimPoolInsurancePayout')).toBe('Pool insurance payout claimed');
  });

  it('falls back to a safe generic for unknown action keys', () => {
    expect(actionCompletedLabel('someFutureAction')).toBe('Task completed');
  });
});