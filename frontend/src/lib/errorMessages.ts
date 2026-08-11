// User-facing error mapping for the ShieldLedger DApp.
//
// Circuit assertion failures surface as raw engine errors, e.g.
// `Error: failed assert: not creditworthy`. This module maps the specific
// `registerInvoice`, `submitBid` and `confirmInvoice` assertions to friendly
// messages, maps any other circuit assertion on those operations to a generic
// fallback, and leaves genuinely different failures (proof-server outages,
// network errors) untouched so they keep their own distinct wording.

export const NOT_CREDITWORTHY_MESSAGE =
  "This invoice doesn't meet the lender's minimum credit threshold. Try a lower value.";

export const ALREADY_REGISTERED_MESSAGE =
  'This invoice has already been registered. Try changing the reference, amount, or due date.';

export const GENERIC_REGISTER_FAILURE_MESSAGE =
  'Something went wrong registering this invoice. Please try again.';

export const INSUFFICIENT_REPUTATION_MESSAGE =
  'Your private reputation score is below the threshold you entered. On-time settlements raise your score (+10); settle an invoice on time first, or lower the threshold.';

export const GENERIC_SUBMIT_BID_FAILURE_MESSAGE =
  'Something went wrong submitting this bid. Please try again.';

export const REPUTATION_BELOW_LENDER_MINIMUM_MESSAGE =
  'This invoice does not clear your minimum reputation requirement. Only invoices whose public reputation bound meets your bar are eligible.';

export const CONFIRM_AMOUNT_MISMATCH_MESSAGE =
  "The amount you entered doesn't match what the SME registered. The buyer can only confirm the exact claimed amount.";

export const ALREADY_BUYER_VERIFIED_MESSAGE = 'This invoice has already been buyer-verified.';

export const GENERIC_CONFIRM_FAILURE_MESSAGE =
  'Something went wrong confirming this invoice. Please try again.';

/** Extract the assertion text after `failed assert:` (wrapped variants included), or null. */
function assertionDetail(message: string): string | null {
  const match = /failed\s+assert\s*:\s*([\s\S]*)/i.exec(message);
  return match ? match[1].trim() : null;
}

/**
 * Map a failed operation to the message shown to the user.
 *
 * `registerInvoice`, `submitBid` and `confirmInvoice` get friendly wording. The
 * raw technical error should still be logged to the console by the caller; it
 * is never the only record.
 */
export function userFacingFailureMessage(label: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (label === 'registerInvoice') {
    const detail = assertionDetail(raw);
    if (detail !== null) {
      if (/not creditworthy/i.test(detail)) {
        return NOT_CREDITWORTHY_MESSAGE;
      }
      if (/already registered/i.test(detail)) {
        return ALREADY_REGISTERED_MESSAGE;
      }
      if (/insufficient reputation/i.test(detail)) {
        return INSUFFICIENT_REPUTATION_MESSAGE;
      }
      return GENERIC_REGISTER_FAILURE_MESSAGE;
    }
  }
  if (label === 'submitBid') {
    const detail = assertionDetail(raw);
    if (detail !== null) {
      if (/reputation below lender minimum/i.test(detail)) {
        return REPUTATION_BELOW_LENDER_MINIMUM_MESSAGE;
      }
      return GENERIC_SUBMIT_BID_FAILURE_MESSAGE;
    }
  }
  if (label === 'confirmInvoice') {
    const detail = assertionDetail(raw);
    if (detail !== null) {
      if (/amount mismatch/i.test(detail)) {
        return CONFIRM_AMOUNT_MISMATCH_MESSAGE;
      }
      if (/already buyer verified/i.test(detail)) {
        return ALREADY_BUYER_VERIFIED_MESSAGE;
      }
      return GENERIC_CONFIRM_FAILURE_MESSAGE;
    }
  }
  return `${label} failed: ${raw}`;
}
