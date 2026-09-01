// User-facing error mapping for the ShieldLedger DApp.
//
// Every error that reaches the UI flows through `describeError`, which maps
// known raw failure patterns (proof-server fetch failures, an unresponsive or
// disconnected wallet, transaction-balancing/fee failures, timeouts) to short,
// actionable messages — and falls back to a friendly generic message so a raw
// stack trace, wasm path or bare "Error" is never shown. The original technical
// text travels along in `technical` so it can be revealed behind a
// "Show technical details" expander.
//
// Circuit assertion failures surface as raw engine errors, e.g.
// `Error: failed assert: not creditworthy`; the specific assertions for
// `registerInvoice`, `submitBid` and `confirmInvoice` keep their dedicated
// wording below.

/** Preview-network faucet, linked from the insufficient-balance banner. */
export const FAUCET_URL = 'https://faucet.preview.midnight.network/';

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

export const PROOF_SERVER_UNREACHABLE_MESSAGE =
  "Can't reach the proof server. If you're running this locally, make sure Docker and the proof server are running, then try again.";

export const WALLET_NOT_RESPONDING_MESSAGE =
  "Your Lace wallet didn't respond. Make sure it's unlocked, then try connecting again.";

export const WALLET_DISCONNECTED_MESSAGE =
  'Your wallet got disconnected. Please reconnect your wallet and try again.';

export const INSUFFICIENT_BALANCE_MESSAGE =
  "Your wallet couldn't fund this transaction — you may not have enough DUST, the resource Midnight uses to pay transaction fees. Get free test tokens from the Preview faucet (holding NIGHT generates DUST) and make sure your wallet is synced, then try again.";

export const INSUFFICIENT_DUST_MESSAGE =
  "Your wallet ran out of DUST, the resource Midnight uses to pay transaction fees. DUST is generated over time from the NIGHT you hold: sync your wallet so it discovers its DUST, and try again once it has regenerated.";

export const TIMEOUT_MESSAGE =
  'This operation timed out before finishing. Proof generation can take 30–60 seconds — please try again.';

export const NO_WALLET_MESSAGE =
  'No Midnight wallet was detected in this browser. Install a Midnight-compatible wallet (such as Lace), then try connecting again.';

export const GENERIC_TRANSACTION_FAILURE_MESSAGE =
  'Something went wrong submitting this transaction. Please try again, and check your wallet connection and proof server status if it keeps failing.';

/**
 * Thrown by the wallet provider when balancing (funding) a transaction fails.
 * Carries the original error so the mapper can show the fee/balance guidance
 * while the technical cause stays available behind "Show technical details".
 */
export class WalletBalanceError extends Error {
  readonly raw: unknown;

  constructor(message: string, raw?: unknown) {
    super(message);
    this.name = 'WalletBalanceError';
    this.raw = raw;
  }
}

/** Extra action offered inside the error banner. */
export type UserFacingErrorAction =
  | { readonly kind: 'reconnect' }
  | { readonly kind: 'link'; readonly label: string; readonly href: string };

/** A mapped, display-ready error: friendly message + hidden technical text. */
export interface UserFacingError {
  readonly message: string;
  readonly technical: string;
  readonly action?: UserFacingErrorAction;
}

const BALANCE_PATTERNS: RegExp[] = [
  /balancing\s+transaction/i,
  /transaction\s+balancing\s+failed/i,
  /wallet\s*balance\s*error/i,
  /insufficient\s+(funds|balance)/i,
  /not\s+enough\s+(funds|tnight|balance)/i,
  /could\s+not\s+balance/i,
];

const DUST_PATTERNS: RegExp[] = [
  /(?:ran\s+out\s+of|out\s+of|low\s+on|insufficient)\s+dust/i,
  /dust\s*(?:failure|insufficient|overflow)/i,
  /could\s+not\s+balance\s+dust/i,
  /not\s+enough\s+dust/i,
];

const DISCONNECTED_PATTERNS: RegExp[] = [
  /no account is connected/i,
  /not connected for this dapp/i,
  /please reconnect/i,
  /reports a lost connection/i,
  /application is not authorized/i,
];

const WALLET_UNRESPONSIVE_PATTERNS: RegExp[] = [
  /failed to respond/i,
  /extension enabled/i,
  /wallet(\s+is)?\s+locked/i,
  /timed out waiting .*unlock/i,
];

const PROOF_SERVER_PATTERNS: RegExp[] = [
  /failed\s+to\s+fetch/i,
  /fetch\s+failed/i,
  /network\s*error|networkerror/i,
  /load\s+failed/i,
  /socket\s+hang\s+up/i,
  /econn(refused|reset|aborted)|enotfound|ehostunreach|enetunreach|etimedout/i,
  /proof\s*server/i,
  /proof\s+provider/i,
];

const TIMEOUT_PATTERNS: RegExp[] = [/\btimed?\s*-?\s*out\b/i, /\btimeout\b/i];

const NO_WALLET_PATTERN = /could not find a midnight wallet/i;

const NETWORK_MISMATCH_PATTERN = /switch networks in your wallet/i;

const matchesAny = (text: string, patterns: RegExp[]): boolean => patterns.some((p) => p.test(text));

/** Extract the assertion text after `failed assert:` (wrapped variants included), or null. */
function assertionDetail(message: string): string | null {
  const match = /failed\s+assert\s*:\s*([\s\S]*)/i.exec(message);
  return match ? match[1].trim() : null;
}

function rawErrorText(error: unknown): string {
  if (error instanceof WalletBalanceError) {
    const inner = error.raw === undefined ? '' : rawErrorText(error.raw);
    // Skip bare/empty causes ("Error") so the technical text stays readable.
    if (inner.length > 0 && inner !== 'Error' && inner !== error.message) {
      return `${error.message}: ${inner}`;
    }
    return error.message;
  }
  if (typeof error === 'string') return error;
  if (error == null) return '';
  if (error instanceof Error) {
    return error.message || String(error);
  }
  const maybeMessage = (error as { message?: unknown } | null)?.message;
  if (typeof maybeMessage === 'string' && maybeMessage.length > 0) return maybeMessage;
  try {
    return String(error);
  } catch {
    return '';
  }
}

/** True when an error carries no usable information beyond "Error". */
function isBareError(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length === 0 || trimmed === 'Error';
}

/** Noun used when surfacing a contract rejection for operations without a dedicated table. */
const ASSERTION_NOUNS: Record<string, string> = {
  settleInvoice: 'settlement',
  revealBid: 'bid reveal',
};

/**
 * Map any caught error from a wallet/proof-server/contract call to the
 * structured error shown in the UI. Known infrastructure patterns get their
 * friendly message (and, where useful, an action); circuit assertions keep
 * their per-operation wording; anything else gets the generic fallback so raw
 * stack traces and wasm paths never reach the user.
 *
 * Callers should still log the original error to the console for debugging.
 */
export function describeError(label: string, error: unknown): UserFacingError {
  const raw = rawErrorText(error);

  // A bare "Error" with no message tells the user nothing — go straight to
  // the generic, still-actionable fallback.
  if (isBareError(raw)) {
    return { message: GENERIC_TRANSACTION_FAILURE_MESSAGE, technical: raw };
  }

  // Already-friendly, specific connect-time messages from manager.ts.
  if (NO_WALLET_PATTERN.test(raw)) {
    return { message: NO_WALLET_MESSAGE, technical: raw };
  }
  if (NETWORK_MISMATCH_PATTERN.test(raw)) {
    return { message: raw, technical: raw };
  }

  if (matchesAny(raw, DUST_PATTERNS)) {
    return {
      message: INSUFFICIENT_DUST_MESSAGE,
      technical: raw,
      action: { kind: 'link', label: 'Get free test tokens', href: FAUCET_URL },
    };
  }

  if (error instanceof WalletBalanceError || matchesAny(raw, BALANCE_PATTERNS)) {
    return {
      message: INSUFFICIENT_BALANCE_MESSAGE,
      technical: raw,
      action: { kind: 'link', label: 'Get free test tokens', href: FAUCET_URL },
    };
  }

  if (matchesAny(raw, DISCONNECTED_PATTERNS)) {
    return { message: WALLET_DISCONNECTED_MESSAGE, technical: raw, action: { kind: 'reconnect' } };
  }

  if (matchesAny(raw, WALLET_UNRESPONSIVE_PATTERNS)) {
    return { message: WALLET_NOT_RESPONDING_MESSAGE, technical: raw };
  }

  if (matchesAny(raw, PROOF_SERVER_PATTERNS)) {
    return { message: PROOF_SERVER_UNREACHABLE_MESSAGE, technical: raw };
  }

  if (matchesAny(raw, TIMEOUT_PATTERNS)) {
    return { message: TIMEOUT_MESSAGE, technical: raw };
  }

  const detail = assertionDetail(raw);
  if (detail !== null) {
    if (label === 'registerInvoice') {
      if (/not creditworthy/i.test(detail)) return { message: NOT_CREDITWORTHY_MESSAGE, technical: raw };
      if (/already registered/i.test(detail)) return { message: ALREADY_REGISTERED_MESSAGE, technical: raw };
      if (/insufficient reputation/i.test(detail))
        return { message: INSUFFICIENT_REPUTATION_MESSAGE, technical: raw };
      return { message: GENERIC_REGISTER_FAILURE_MESSAGE, technical: raw };
    }
    if (label === 'submitBid') {
      if (/reputation below lender minimum/i.test(detail))
        return { message: REPUTATION_BELOW_LENDER_MINIMUM_MESSAGE, technical: raw };
      return { message: GENERIC_SUBMIT_BID_FAILURE_MESSAGE, technical: raw };
    }
    if (label === 'confirmInvoice') {
      if (/amount mismatch/i.test(detail)) return { message: CONFIRM_AMOUNT_MISMATCH_MESSAGE, technical: raw };
      if (/already buyer verified/i.test(detail))
        return { message: ALREADY_BUYER_VERIFIED_MESSAGE, technical: raw };
      return { message: GENERIC_CONFIRM_FAILURE_MESSAGE, technical: raw };
    }
    const noun = ASSERTION_NOUNS[label] ?? 'transaction';
    return {
      message: `The contract rejected this ${noun}: ${detail}`,
      technical: raw,
    };
  }

  if (label === 'registerInvoice') return { message: GENERIC_REGISTER_FAILURE_MESSAGE, technical: raw };
  if (label === 'submitBid') return { message: GENERIC_SUBMIT_BID_FAILURE_MESSAGE, technical: raw };
  if (label === 'confirmInvoice') return { message: GENERIC_CONFIRM_FAILURE_MESSAGE, technical: raw };

  return { message: GENERIC_TRANSACTION_FAILURE_MESSAGE, technical: raw };
}

/**
 * Map a failed operation to just the friendly message string.
 *
 * `registerInvoice`, `submitBid` and `confirmInvoice` get friendly wording. The
 * raw technical error should still be logged to the console by the caller; it
 * is never the only record.
 */
export function userFacingFailureMessage(label: string, error: unknown): string {
  return describeError(label, error).message;
}
