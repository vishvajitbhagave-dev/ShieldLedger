// Shared wall-clock helpers.
//
// The contract's timestamps are UNIX *seconds* (the due dates in
// registerInvoice/revealBid/settleInvoice, and the settledAt argument that
// classify a settlement on-time vs late). Callers must never pass
// Date.now() (milliseconds) into the circuits, so this module is the single
// source of truth for "now" in contract-friendly units.

/** Current wall-clock time as a UNIX epoch in whole seconds (bigint). */
export function currentUnixSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}
