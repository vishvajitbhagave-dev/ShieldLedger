// Friendly, human-readable labels for in-flight operation banners and their
// success toasts. Kept as a pure, testable module separate from the components
// so the raw internal action keys (registerInvoice, submitBid, …) never leak
// into the UI. Unknown or null keys fall back to a safe generic phrase.

/** In-progress wording per internal action key (the banner adds the ellipsis). */
export const ACTION_PROGRESS_LABELS: Readonly<Record<string, string>> = {
  registerInvoice: 'Registering your invoice',
  confirmInvoice: 'Confirming the invoice',
  submitBid: 'Submitting your bid',
  revealBid: 'Revealing your bid',
  settleInvoice: 'Settling the invoice',
  settleSplitInvoice: 'Settling the pool invoice',
  revealPoolBid: 'Revealing your pool bid',
  transferClaim: 'Transferring your claim',
  transferPoolClaim: 'Transferring your pool claim',
  checkClaim: 'Checking your claim',
  claimInsurancePayout: 'Claiming the insurance payout',
  claimPoolInsurancePayout: 'Claiming the pool insurance payout',
};

/** Completed wording shown on the success toast. */
export const ACTION_COMPLETED_LABELS: Readonly<Record<string, string>> = {
  registerInvoice: 'Invoice registered',
  confirmInvoice: 'Invoice confirmed',
  submitBid: 'Bid submitted',
  revealBid: 'Bid revealed',
  settleInvoice: 'Invoice settled',
  settleSplitInvoice: 'Pool invoice settled',
  revealPoolBid: 'Pool bid revealed',
  transferClaim: 'Claim transferred',
  transferPoolClaim: 'Pool claim transferred',
  checkClaim: 'Claim checked',
  claimInsurancePayout: 'Insurance payout claimed',
  claimPoolInsurancePayout: 'Pool insurance payout claimed',
};

/**
 * Humanized in-progress wording for the working banner. Null (no active
 * operation) and unknown keys map to the safe generic "Working".
 */
export function actionProgressLabel(action: string | null): string {
  if (action === null) return 'Working';
  return ACTION_PROGRESS_LABELS[action] ?? 'Working';
}

/**
 * Completed wording for the success toasts. Unknown keys never crash — they
 * fall back to the safe generic "Task completed".
 */
export function actionCompletedLabel(action: string): string {
  return ACTION_COMPLETED_LABELS[action] ?? 'Task completed';
}