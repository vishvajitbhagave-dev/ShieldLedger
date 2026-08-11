// User-facing error mapping for the ShieldLedger DApp.
//
// Circuit assertion failures surface as raw engine errors, e.g.
// `Error: failed assert: not creditworthy`. This module maps the specific
// `registerInvoice` assertions to friendly messages, maps any other circuit
// assertion at registration to a generic fallback, and leaves genuinely
// different failures (proof-server outages, network errors) untouched so they
// keep their own distinct wording.

export const NOT_CREDITWORTHY_MESSAGE =
  "This invoice doesn't meet the lender's minimum credit threshold. Try a lower value.";

export const ALREADY_REGISTERED_MESSAGE =
  'This invoice has already been registered. Try changing the reference, amount, or due date.';

export const GENERIC_REGISTER_FAILURE_MESSAGE =
  'Something went wrong registering this invoice. Please try again.';

/** Extract the assertion text after `failed assert:` (wrapped variants included), or null. */
function assertionDetail(message: string): string | null {
  const match = /failed\s+assert\s*:\s*([\s\S]*)/i.exec(message);
  return match ? match[1].trim() : null;
}

/**
 * Map a failed operation to the message shown to the user.
 *
 * Only `registerInvoice` gets friendly wording. The raw technical error should
 * still be logged to the console by the caller; it is never the only record.
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
      return GENERIC_REGISTER_FAILURE_MESSAGE;
    }
  }
  return `${label} failed: ${raw}`;
}
