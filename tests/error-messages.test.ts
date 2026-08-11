import { describe, it, expect } from 'vitest';

import {
  userFacingFailureMessage,
  isNotCreditworthyError,
  REGISTER_CREDIT_THRESHOLD_MESSAGE,
} from '../src/error-messages.js';

describe('userFacingFailureMessage — SME credit-threshold assertion', () => {
  it('maps the registerInvoice "not creditworthy" assert to the friendly message', () => {
    const err = new Error(
      "Unexpected error executing scoped transaction '<unnamed>': Error: failed assert: not creditworthy",
    );
    expect(isNotCreditworthyError(err)).toBe(true);
    expect(userFacingFailureMessage('registerInvoice', err)).toBe(
      REGISTER_CREDIT_THRESHOLD_MESSAGE,
    );
  });

  it('matches the wrapped engine-error wording exactly as the circuit produces it', () => {
    const err = new Error("Error: failed assert: not creditworthy");
    expect(userFacingFailureMessage('registerInvoice', err)).toBe(
      REGISTER_CREDIT_THRESHOLD_MESSAGE,
    );
  });

  it('does not swallow proof-server / network errors into the friendly message', () => {
    const proofServer = new Error(
      'Failed Proof Server response: url="http://localhost:6300/check", code="400", status="Bad Request"',
    );
    const network = new Error('Failed to fetch');
    expect(userFacingFailureMessage('registerInvoice', proofServer)).toContain(
      'Failed Proof Server response',
    );
    expect(userFacingFailureMessage('registerInvoice', network)).toContain('Failed to fetch');
  });

  it('keeps the raw message for other circuit assertions', () => {
    const err = new Error("failed assert: amount exceeds winning bid");
    expect(userFacingFailureMessage('settleInvoice', err)).toContain('amount exceeds winning bid');
  });

  it('keeps the raw message for credit assertions on non-register operations', () => {
    const err = new Error("failed assert: not creditworthy");
    expect(userFacingFailureMessage('submitBid', err)).toContain('not creditworthy');
  });
});
