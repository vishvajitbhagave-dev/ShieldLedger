// ShieldLedger witnesses + private-state shape.
//
// The contract declares five witness functions. An actor that drives the
// contract (SME, lender, or both from one wallet) must supply all five; the
// fields they are not acting as are simply never read by the circuits they
// call. This mirrors the bulletin-board pattern (a single WitnessContext<PS>
// with the private state flowing through, unchanged, on every call).

import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from '../contracts/managed/shield-ledger/contract/index.js';

export interface ShieldLedgerPrivateState {
  readonly smeSecret: Uint8Array;
  readonly smeCreditScore: bigint;
  readonly lenderSecret: Uint8Array;
  readonly lenderCreditScore: bigint;
  readonly lenderExposureCap: bigint;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export interface CreatePrivateStateOptions {
  smeSecret?: Uint8Array;
  smeCreditScore?: bigint;
  lenderSecret?: Uint8Array;
  lenderCreditScore?: bigint;
  lenderExposureCap?: bigint;
}

/** Fresh random secrets. Defaults: creditworthy SME (720) and lender (750) with a 1M-unit cap. */
export function createShieldLedgerPrivateState(
  opts: CreatePrivateStateOptions = {},
): ShieldLedgerPrivateState {
  return {
    smeSecret: opts.smeSecret ?? randomBytes(32),
    smeCreditScore: opts.smeCreditScore ?? 720n,
    lenderSecret: opts.lenderSecret ?? randomBytes(32),
    lenderCreditScore: opts.lenderCreditScore ?? 750n,
    lenderExposureCap: opts.lenderExposureCap ?? 1_000_000_000_000n,
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
};
