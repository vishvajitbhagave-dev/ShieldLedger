// User-facing error classification for the ShieldLedger DApp.
//
// Circuit assertion failures surface as raw engine errors, e.g.
// `Error: failed assert: not creditworthy`. This module maps the *specific*
// SME credit-threshold assertion at registration to a friendly message, while
// leaving every other failure (proof-server outages, network errors, other
// assertions) to its own distinct message.

export const REGISTER_CREDIT_THRESHOLD_MESSAGE =
  "This invoice doesn't meet the required credit threshold. Try a lower threshold value.";

/** True when `error` is the circuit's `not creditworthy` assertion. */
export function isNotCreditworthyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /failed assert:\s*not creditworthy/i.test(message);
}

/**
 * Map a failed operation to the message shown to the user. Only the SME
 * credit-threshold assertion at registration gets the friendly wording; all
 * other failures keep their raw text so distinct problems stay distinguishable.
 */
export function userFacingFailureMessage(label: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (label === 'registerInvoice' && isNotCreditworthyError(raw)) {
    return REGISTER_CREDIT_THRESHOLD_MESSAGE;
  }
  return `${label} failed: ${raw}`;
}
