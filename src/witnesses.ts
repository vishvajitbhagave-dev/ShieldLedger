// ShieldLedger witnesses + private-state shape.
//
// The contract declares witness functions for every private input a circuit
// may read. An actor that drives the contract (SME, lender, buyer, or any
// combination from one wallet) must supply them all; the fields they are not
// acting as are simply never read by the circuits they call. This mirrors the
// bulletin-board pattern (a single WitnessContext<PS> with the private state
// flowing through, unchanged, on every call).
//
// The reputation fields (smeReputationScore, smeOnTimeCount, smeLateCount,
// lenderMinReputation) are part of the wallet's private state. Only the two
// the circuits actually read are declared as contract witnesses: the SME's
// score (checked against reputationThreshold at registration) and the
// lender's private minimum bar (checked against the invoice's public
// threshold at bidding). The on-time/late counts are purely for the SME's own
// dashboard and are read directly from private state, never from a circuit.

import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from '../contracts/managed/shield-ledger/contract/index.js';

export interface ShieldLedgerPrivateState {
  readonly smeSecret: Uint8Array;
  readonly smeCreditScore: bigint;
  readonly smeReputationScore: bigint;
  readonly smeOnTimeCount: bigint;
  readonly smeLateCount: bigint;
  readonly lenderSecret: Uint8Array;
  readonly lenderCreditScore: bigint;
  readonly lenderExposureCap: bigint;
  readonly lenderMinReputation: bigint;
  readonly buyerSecret: Uint8Array;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export interface CreatePrivateStateOptions {
  smeSecret?: Uint8Array;
  smeCreditScore?: bigint;
  smeReputationScore?: bigint;
  smeOnTimeCount?: bigint;
  smeLateCount?: bigint;
  lenderSecret?: Uint8Array;
  lenderCreditScore?: bigint;
  lenderExposureCap?: bigint;
  lenderMinReputation?: bigint;
  buyerSecret?: Uint8Array;
}

/** Fresh random secrets. Defaults: creditworthy SME (720) and lender (750) with a 1M-unit cap; reputation starts at 0 with no on-time/late history and no lender reputation requirement. */
export function createShieldLedgerPrivateState(
  opts: CreatePrivateStateOptions = {},
): ShieldLedgerPrivateState {
  return {
    smeSecret: opts.smeSecret ?? randomBytes(32),
    smeCreditScore: opts.smeCreditScore ?? 720n,
    smeReputationScore: opts.smeReputationScore ?? 0n,
    smeOnTimeCount: opts.smeOnTimeCount ?? 0n,
    smeLateCount: opts.smeLateCount ?? 0n,
    lenderSecret: opts.lenderSecret ?? randomBytes(32),
    lenderCreditScore: opts.lenderCreditScore ?? 750n,
    lenderExposureCap: opts.lenderExposureCap ?? 1_000_000_000_000n,
    lenderMinReputation: opts.lenderMinReputation ?? 0n,
    buyerSecret: opts.buyerSecret ?? randomBytes(32),
  };
}

export const witnesses = {
  smeSecret: ({
    privateState,
  }: WitnessContext<Ledger, ShieldLedgerPrivateState>): [
    ShieldLedgerPrivateState,
    Uint8Array,
  ] => [privateState, privateState.smeSecret],

  smeCreditScore: ({
    privateState,
  }: WitnessContext<Ledger, ShieldLedgerPrivateState>): [
    ShieldLedgerPrivateState,
    bigint,
  ] => [privateState, privateState.smeCreditScore],

  smeReputationScore: ({
    privateState,
  }: WitnessContext<Ledger, ShieldLedgerPrivateState>): [
    ShieldLedgerPrivateState,
    bigint,
  ] => [privateState, privateState.smeReputationScore],

  lenderSecret: ({
    privateState,
  }: WitnessContext<Ledger, ShieldLedgerPrivateState>): [
    ShieldLedgerPrivateState,
    Uint8Array,
  ] => [privateState, privateState.lenderSecret],

  lenderCreditScore: ({
    privateState,
  }: WitnessContext<Ledger, ShieldLedgerPrivateState>): [
    ShieldLedgerPrivateState,
    bigint,
  ] => [privateState, privateState.lenderCreditScore],

  lenderExposureCap: ({
    privateState,
  }: WitnessContext<Ledger, ShieldLedgerPrivateState>): [
    ShieldLedgerPrivateState,
    bigint,
  ] => [privateState, privateState.lenderExposureCap],

  lenderMinReputation: ({
    privateState,
  }: WitnessContext<Ledger, ShieldLedgerPrivateState>): [
    ShieldLedgerPrivateState,
    bigint,
  ] => [privateState, privateState.lenderMinReputation],

  buyerSecret: ({
    privateState,
  }: WitnessContext<Ledger, ShieldLedgerPrivateState>): [
    ShieldLedgerPrivateState,
    Uint8Array,
  ] => [privateState, privateState.buyerSecret],
};
