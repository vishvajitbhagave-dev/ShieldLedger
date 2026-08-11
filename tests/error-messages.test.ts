import { describe, it, expect } from 'vitest';

import {
  userFacingFailureMessage,
  NOT_CREDITWORTHY_MESSAGE,
  ALREADY_REGISTERED_MESSAGE,
  GENERIC_REGISTER_FAILURE_MESSAGE,
  CONFIRM_AMOUNT_MISMATCH_MESSAGE,
  ALREADY_BUYER_VERIFIED_MESSAGE,
  GENERIC_CONFIRM_FAILURE_MESSAGE,
} from '../frontend/src/lib/errorMessages.js';

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

describe('userFacingFailureMessage — distinct errors are not swallowed', () => {
  it('keeps proof-server failures on their own wording', () => {
    const err = new Error(
      'Failed Proof Server response: url="http://localhost:6300/check", code="400", status="Bad Request"',
    );
    expect(userFacingFailureMessage('registerInvoice', err)).toContain(
      'Failed Proof Server response',
    );
  });

  it('keeps network failures on their own wording', () => {
    const err = new Error('Failed to fetch');
    expect(userFacingFailureMessage('registerInvoice', err)).toContain('Failed to fetch');
  });

  it('keeps the raw message for credit assertions on non-register operations', () => {
    const err = new Error("failed assert: not creditworthy");
    expect(userFacingFailureMessage('submitBid', err)).toContain('not creditworthy');
  });

  it('keeps the raw message for other operations', () => {
    const err = new Error("failed assert: amount exceeds winning bid");
    expect(userFacingFailureMessage('settleInvoice', err)).toContain('amount exceeds winning bid');
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
    expect(userFacingFailureMessage('confirmInvoice', err)).toContain('Failed Proof Server response');
  });
});
