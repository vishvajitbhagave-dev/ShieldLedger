import { describe, it, expect } from 'vitest';

import {
  userFacingFailureMessage,
  describeError,
  WalletBalanceError,
  FAUCET_URL,
  NOT_CREDITWORTHY_MESSAGE,
  ALREADY_REGISTERED_MESSAGE,
  GENERIC_REGISTER_FAILURE_MESSAGE,
  INSUFFICIENT_REPUTATION_MESSAGE,
  GENERIC_SUBMIT_BID_FAILURE_MESSAGE,
  REPUTATION_BELOW_LENDER_MINIMUM_MESSAGE,
  CONFIRM_AMOUNT_MISMATCH_MESSAGE,
  ALREADY_BUYER_VERIFIED_MESSAGE,
  GENERIC_CONFIRM_FAILURE_MESSAGE,
  PROOF_SERVER_UNREACHABLE_MESSAGE,
  WALLET_NOT_RESPONDING_MESSAGE,
  WALLET_DISCONNECTED_MESSAGE,
  INSUFFICIENT_BALANCE_MESSAGE,
  INSUFFICIENT_DUST_MESSAGE,
  TIMEOUT_MESSAGE,
  NETWORK_REJECTED_TRANSACTION_MESSAGE,
  NO_WALLET_MESSAGE,
  GENERIC_TRANSACTION_FAILURE_MESSAGE,
  LEDGER_STREAM_STALL_MARKER,
  LEDGER_STREAM_STALL_MESSAGE,
} from '../frontend/src/lib/errorMessages.js';

describe('userFacingFailureMessage — network submission rejections', () => {
  it('maps the exact preprod 1010 / Custom error 182 / SubmissionError text', () => {
    const err = new Error(
      "Unexpected error submitting scoped transaction '<unnamed>': Error: Operation failed: 1010: Invalid Transaction: Custom error: 182: (FiberFailure) SubmissionError: Transaction submission error",
    );
    expect(userFacingFailureMessage('registerInvoice', err)).toBe(
      NETWORK_REJECTED_TRANSACTION_MESSAGE,
    );
  });

  it('is operation-agnostic (node rejections are not a DApp bug)', () => {
    for (const label of ['registerInvoice', 'submitBid', 'confirmInvoice', 'settleInvoice']) {
      expect(userFacingFailureMessage(label, new Error('Invalid Transaction: Custom error: 155'))).toBe(
        NETWORK_REJECTED_TRANSACTION_MESSAGE,
      );
    }
  });

  it('keeps the raw technical detail available via describeError', () => {
    const err = new Error(
      "Operation failed: 1010: Invalid Transaction: Custom error: 182: (FiberFailure) SubmissionError: Transaction submission error",
    );
    const mapped = describeError('registerInvoice', err);
    expect(mapped.message).toBe(NETWORK_REJECTED_TRANSACTION_MESSAGE);
    expect(mapped.technical).toContain('Custom error: 182');
    expect(mapped.action).toBeUndefined();
  });

  it('does not shadow proof-server or balancing failures wrapped in the same prefix', () => {
    const proofServer = new Error(
      "Unexpected error submitting scoped transaction '<unnamed>': Error: 'check' returned an error: TypeError: Failed to fetch",
    );
    expect(userFacingFailureMessage('registerInvoice', proofServer)).toBe(
      PROOF_SERVER_UNREACHABLE_MESSAGE,
    );
    const balance = new Error(
      "Unexpected error submitting scoped transaction '<unnamed>': WalletBalanceError: Transaction balancing failed.",
    );
    expect(describeError('registerInvoice', balance).message).toBe(INSUFFICIENT_BALANCE_MESSAGE);
  });
});

describe('userFacingFailureMessage — registerInvoice circuit assertions', () => {
  it('maps the "not creditworthy" assert to the friendly credit message', () => {
    const err = new Error(
      "Unexpected error executing scoped transaction '<unnamed>': Error: failed assert: not creditworthy",
    );
    expect(userFacingFailureMessage('registerInvoice', err)).toBe(NOT_CREDITWORTHY_MESSAGE);
  });

  it('matches the exact engine wording the circuit produces', () => {
    const err = new Error('Error: failed assert: not creditworthy');
    expect(userFacingFailureMessage('registerInvoice', err)).toBe(NOT_CREDITWORTHY_MESSAGE);
  });

  it('maps the "invoice already registered" assert to the friendly duplicate message', () => {
    const err = new Error("failed assert: invoice already registered");
    expect(userFacingFailureMessage('registerInvoice', err)).toBe(ALREADY_REGISTERED_MESSAGE);
  });

  it('maps the "insufficient reputation" assert to the friendly reputation message', () => {
    const err = new Error("failed assert: insufficient reputation");
    expect(userFacingFailureMessage('registerInvoice', err)).toBe(INSUFFICIENT_REPUTATION_MESSAGE);
  });

  it('maps any other registerInvoice circuit assertion to the generic fallback', () => {
    const threshold = new Error("failed assert: threshold below minimum");
    const unknown = new Error("failed assert: some other invariant");
    expect(userFacingFailureMessage('registerInvoice', threshold)).toBe(
      GENERIC_REGISTER_FAILURE_MESSAGE,
    );
    expect(userFacingFailureMessage('registerInvoice', unknown)).toBe(
      GENERIC_REGISTER_FAILURE_MESSAGE,
    );
  });

  it('accepts a plain string error, not just an Error object', () => {
    expect(userFacingFailureMessage('registerInvoice', 'failed assert: not creditworthy')).toBe(
      NOT_CREDITWORTHY_MESSAGE,
    );
  });
});

describe('userFacingFailureMessage — submitBid circuit assertions', () => {
  it('maps the "reputation below lender minimum" assert to the friendly message', () => {
    const err = new Error("failed assert: reputation below lender minimum");
    expect(userFacingFailureMessage('submitBid', err)).toBe(REPUTATION_BELOW_LENDER_MINIMUM_MESSAGE);
  });

  it('maps any other submitBid circuit assertion to the generic fallback', () => {
    const err = new Error("failed assert: unknown invoice");
    expect(userFacingFailureMessage('submitBid', err)).toBe(GENERIC_SUBMIT_BID_FAILURE_MESSAGE);
  });

  it('maps submitBid credit assertion failures to the generic submit-bid fallback', () => {
    const err = new Error("failed assert: not creditworthy");
    expect(userFacingFailureMessage('submitBid', err)).toBe(GENERIC_SUBMIT_BID_FAILURE_MESSAGE);
  });
});

describe('userFacingFailureMessage — infrastructure failures stay friendly', () => {
  it('maps proof-server rejections to the proof-server guidance', () => {
    const err = new Error(
      'Failed Proof Server response: url="http://localhost:6300/check", code="400", status="Bad Request"',
    );
    expect(userFacingFailureMessage('registerInvoice', err)).toBe(PROOF_SERVER_UNREACHABLE_MESSAGE);
  });

  it('maps wrapped fetch failures (proof server unreachable) on registerInvoice', () => {
    const err = new Error(
      "Unexpected error submitting scoped transaction '<unnamed>': Error: 'check' returned an error: TypeError: Failed to fetch",
    );
    expect(userFacingFailureMessage('registerInvoice', err)).toBe(PROOF_SERVER_UNREACHABLE_MESSAGE);
  });

  it('maps a bare "Failed to fetch" on any operation to the proof-server guidance', () => {
    const err = new Error('Failed to fetch');
    expect(userFacingFailureMessage('confirmInvoice', err)).toBe(PROOF_SERVER_UNREACHABLE_MESSAGE);
    expect(userFacingFailureMessage('submitBid', new Error('TypeError: fetch failed'))).toBe(
      PROOF_SERVER_UNREACHABLE_MESSAGE,
    );
  });

  it('maps the unresponsive-wallet error to the unlock guidance', () => {
    const err = new Error('The wallet has failed to respond. Extension enabled?');
    expect(userFacingFailureMessage('connect', err)).toBe(WALLET_NOT_RESPONDING_MESSAGE);
  });

  it('maps the wallet-locked timeout to the same unlock guidance', () => {
    const err = new Error('Timed out waiting for Lace to be unlocked. Unlock it via the extension icon and try again.');
    expect(userFacingFailureMessage('connect', err)).toBe(WALLET_NOT_RESPONDING_MESSAGE);
  });

  it('keeps the raw message for other operations', () => {
    const err = new Error("failed assert: amount exceeds winning bid");
    const message = userFacingFailureMessage('settleInvoice', err);
    expect(message).toContain('amount exceeds winning bid');
    expect(message).not.toContain('failed assert:');
  });
});

describe('describeError — stalled live ledger stream', () => {
  it('maps the stall marker to the friendly message with a retry action', () => {
    const err = new Error(
      `${LEDGER_STREAM_STALL_MARKER} The live ledger stream stopped updating: no ledger state arrived in time`,
    );
    const mapped = describeError('ledgerStream', err);
    expect(mapped.message).toBe(LEDGER_STREAM_STALL_MESSAGE);
    expect(mapped.action).toEqual({ kind: 'retry' });
    expect(mapped.technical).toContain(LEDGER_STREAM_STALL_MARKER);
  });

  it('accepts the stall marker as a plain string too', () => {
    expect(userFacingFailureMessage('ledgerStream', `${LEDGER_STREAM_STALL_MARKER} stalled`)).toBe(
      LEDGER_STREAM_STALL_MESSAGE,
    );
  });

  it('keeps other ledger labels from being shadowed by real assert/infrastructure errors', () => {
    const proofServer = new Error('Failed Proof Server response: url="http://localhost:6300/check", code="400", status="Bad Request"');
    expect(userFacingFailureMessage('ledgerStream', proofServer)).toBe(
      PROOF_SERVER_UNREACHABLE_MESSAGE,
    );
    const assert = new Error('failed assert: amount exceeds winning bid');
    expect(userFacingFailureMessage('ledgerStream', assert)).toContain(
      'amount exceeds winning bid',
    );
  });
});

describe('describeError — structured results with actions and technical details', () => {
  it('offers a reconnect action when the wallet session dropped', () => {
    const err = new Error('APIError: No account is connected for this dApp. Please reconnect.');
    const mapped = describeError('settleInvoice', err);
    expect(mapped.message).toBe(WALLET_DISCONNECTED_MESSAGE);
    expect(mapped.action).toEqual({ kind: 'reconnect' });
    expect(mapped.technical).toContain('No account is connected');
  });

  it('offers the faucet link when balancing the transaction fails', () => {
    const cause = new Error('');
    const err = new WalletBalanceError('Transaction balancing failed.', cause);
    const mapped = describeError('submitBid', err);
    expect(mapped.message).toBe(INSUFFICIENT_BALANCE_MESSAGE);
    expect(mapped.action).toEqual({ kind: 'link', label: 'Get free test tokens', href: FAUCET_URL });
    expect(mapped.technical).toContain('Transaction balancing failed');
  });

  it('detects insufficient-funds wording without the tagged error class', () => {
    const mapped = describeError('revealBid', new Error('insufficient funds to cover the fee'));
    expect(mapped.message).toBe(INSUFFICIENT_BALANCE_MESSAGE);
    expect(mapped.action?.kind).toBe('link');
  });

  it('maps the SDK-wrapped "Transaction balancing failed" (loses the WalletBalanceError class) to the balance guidance', () => {
    const err = new Error(
      "Unexpected error submitting scoped transaction '<unnamed>': WalletBalanceError: Transaction balancing failed.",
    );
    const mapped = describeError('registerInvoice', err);
    expect(mapped.message).toBe(INSUFFICIENT_BALANCE_MESSAGE);
    expect(mapped.action).toEqual({ kind: 'link', label: 'Get free test tokens', href: FAUCET_URL });
    expect(mapped.technical).toContain('Transaction balancing failed');
  });

  it('maps DUST-exhaustion wording to the DUST-specific guidance with a faucet action', () => {
    const mapped = describeError('registerInvoice', new Error("Insufficient Funds: could not balance dust"));
    expect(mapped.message).toBe(INSUFFICIENT_DUST_MESSAGE);
    expect(mapped.action?.kind).toBe('link');
  });

  it('falls back to the generic transaction message for empty/bare errors', () => {
    expect(describeError('registerInvoice', new Error('')).message).toBe(GENERIC_TRANSACTION_FAILURE_MESSAGE);
    expect(describeError('submitBid', undefined).message).toBe(GENERIC_TRANSACTION_FAILURE_MESSAGE);
    expect(describeError('settleInvoice', new Error('Error')).message).toBe(GENERIC_TRANSACTION_FAILURE_MESSAGE);
  });

  it('never leaks wasm paths or stack traces in the friendly message', () => {
    const err = new Error(
      "RuntimeError: unreachable\n    at compact_runtime_wasm_bg.wasm:0x1a2b3c",
    );
    const mapped = describeError('revealBid', err);
    expect(mapped.message).toBe(GENERIC_TRANSACTION_FAILURE_MESSAGE);
    expect(mapped.technical).toContain('wasm');
  });

  it('maps generic timeouts to the retry guidance', () => {
    expect(describeError('registerInvoice', new Error('operation timed out')).message).toBe(TIMEOUT_MESSAGE);
  });

  it('surfaces contract rejections on settle/reveal with a clean sentence', () => {
    const err = new Error("Unexpected error executing scoped transaction '<unnamed>': failed assert: amount exceeds winning bid");
    expect(describeError('settleInvoice', err).message).toBe(
      'The contract rejected this settlement: amount exceeds winning bid',
    );
    expect(describeError('revealBid', new Error('failed assert: bid does not match commitment')).message).toBe(
      'The contract rejected this bid reveal: bid does not match commitment',
    );
  });

  it('passes through already-friendly specific connect messages', () => {
    const noWallet = describeError('connect', new Error('Could not find a Midnight wallet extension. Install one to continue.'));
    expect(noWallet.message).toBe(NO_WALLET_MESSAGE);

    const mismatch = describeError(
      'connect',
      new Error('Lace is connected to the "mainnet" network, but ShieldLedger expects "preview". Switch networks in your wallet and try again.'),
    );
    expect(mismatch.message).toContain('Switch networks in your wallet');
    expect(mismatch.action).toBeUndefined();
  });

  it('keeps userFacingFailureMessage in sync with describeError', () => {
    expect(userFacingFailureMessage('connect', new Error('The wallet has failed to respond.'))).toBe(
      describeError('connect', new Error('The wallet has failed to respond.')).message,
    );
  });
});

describe('userFacingFailureMessage — confirmInvoice circuit assertions', () => {
  it('maps the "amount mismatch" assert to the friendly confirmation message', () => {
    const err = new Error("Unexpected error executing scoped transaction '<unnamed>': Error: failed assert: amount mismatch");
    expect(userFacingFailureMessage('confirmInvoice', err)).toBe(CONFIRM_AMOUNT_MISMATCH_MESSAGE);
  });

  it('maps the "already buyer verified" assert to the friendly message', () => {
    const err = new Error("failed assert: already buyer verified");
    expect(userFacingFailureMessage('confirmInvoice', err)).toBe(ALREADY_BUYER_VERIFIED_MESSAGE);
  });

  it('maps any other confirmInvoice circuit assertion to the generic fallback', () => {
    const err = new Error("failed assert: unknown invoice");
    expect(userFacingFailureMessage('confirmInvoice', err)).toBe(GENERIC_CONFIRM_FAILURE_MESSAGE);
  });

  it('does not swallow proof-server failures on confirmation', () => {
    const err = new Error('Failed Proof Server response: url="http://localhost:6300/check", code="400", status="Bad Request"');
    expect(userFacingFailureMessage('confirmInvoice', err)).toBe(PROOF_SERVER_UNREACHABLE_MESSAGE);
  });
});