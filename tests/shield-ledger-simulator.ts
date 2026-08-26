import {
  type CircuitContext,
  sampleContractAddress,
  createConstructorContext,
  createCircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  type Ledger,
  ledger,
  pureCircuits,
} from '../contracts/managed/shield-ledger/contract/index.js';
import {
  type ShieldLedgerPrivateState,
  witnesses,
} from '../src/witnesses.js';
import { applyReputationUpdate } from '../src/reputation.js';
import {
  insuranceContribution,
  insurancePayoutFor,
  fullInsurancePayout,
  insurancePoolKey,
} from '../src/insurance.js';

/**
 * Headless simulator for the ShieldLedger contract.
 *
 * Runs the circuits through the compact-runtime VM (no network, no proof
 * generation). A single simulator holds one private state; use
 * switchIdentity() to emulate a different actor (different SME secret, credit
 * profile, lender secret, ...) acting on the same ledger.
 */
// Mirrors the floor inlined in contracts/shield-ledger.compact (registerInvoice).
export const MIN_CREDIT_SCORE = 650n;

export class ShieldLedgerSimulator {
  readonly contract: Contract<ShieldLedgerPrivateState>;
  circuitContext: CircuitContext<ShieldLedgerPrivateState>;

  constructor(privateState: ShieldLedgerPrivateState) {
    this.contract = new Contract<ShieldLedgerPrivateState>(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      createConstructorContext(privateState, '0'.repeat(64)),
    );
    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  /** Emulate a different actor on the same ledger (like bboard's switchUser). */
  switchIdentity(partial: Partial<ShieldLedgerPrivateState>): void {
    this.circuitContext.currentPrivateState = {
      ...this.circuitContext.currentPrivateState,
      ...partial,
    };
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  getPrivateState(): ShieldLedgerPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  registerInvoice(
    nullifier: Uint8Array,
    creditThreshold: bigint = MIN_CREDIT_SCORE,
    invoiceAmount: bigint = 0n,
    reputationThreshold: bigint = 0n,
    splitCount: bigint = 0n,
  ): Ledger {
    // Default insurance: the wallet computes the exact 2% premium and the
    // resulting pool balance; the circuit proves both are correct.
    const contribution = insuranceContribution(invoiceAmount);
    const poolKey = insurancePoolKey();
    const before = this.getLedger();
    const currentBalance = before.insurancePools.member(poolKey)
      ? before.insurancePools.lookup(poolKey).balance
      : 0n;
    this.circuitContext = this.contract.impureCircuits.registerInvoice(
      this.circuitContext,
      nullifier,
      creditThreshold,
      invoiceAmount,
      reputationThreshold,
      contribution,
      currentBalance + contribution,
      splitCount,
    ).context;
    return this.getLedger();
  }

  confirmInvoice(nullifier: Uint8Array, confirmedAmount: bigint): Ledger {
    this.circuitContext = this.contract.impureCircuits.confirmInvoice(
      this.circuitContext,
      nullifier,
      confirmedAmount,
    ).context;
    return this.getLedger();
  }

  submitBid(nullifier: Uint8Array, commitment: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.submitBid(
      this.circuitContext,
      nullifier,
      commitment,
    ).context;
    return this.getLedger();
  }

  revealBid(
    nullifier: Uint8Array,
    amount: bigint,
    dueDate: bigint,
    rateBps: bigint,
    willingToSplit: boolean = false,
  ): Ledger {
    this.circuitContext = this.contract.impureCircuits.revealBid(
      this.circuitContext,
      nullifier,
      amount,
      dueDate,
      rateBps,
      willingToSplit,
    ).context;
    return this.getLedger();
  }

  revealPoolBid(
    nullifier: Uint8Array,
    slotIndex: bigint,
    commitment: Uint8Array,
  ): Ledger {
    this.circuitContext = this.contract.impureCircuits.revealPoolBid(
      this.circuitContext,
      nullifier,
      slotIndex,
      commitment,
    ).context;
    return this.getLedger();
  }

  settleInvoice(
    nullifier: Uint8Array,
    financedAmount: bigint,
    financedDueDate: bigint,
    settledAt: bigint = financedDueDate,
  ): Ledger {
    const results = this.contract.impureCircuits.settleInvoice(
      this.circuitContext,
      nullifier,
      financedAmount,
      financedDueDate,
      settledAt,
    );
    this.circuitContext = results.context;
    // The circuit returns the on-time/late classification (settledAt <=
    // financedDueDate). The wallet layer applies it to the SME's private
    // reputation score; the ledger itself never records the classification.
    const onTime = results.result;
    this.circuitContext.currentPrivateState = applyReputationUpdate(
      this.circuitContext.currentPrivateState,
      onTime,
    );
    return this.getLedger();
  }

  /**
   * Secondary market: the current claim holder resells their claim. The
   * caller passes a commitment to the NEW owner's secret (deriveClaimCommit-
   * ment(newOwnerSecret, nullifier)). Authorization is in-circuit: the first
   * hand-over must come from the auction leader (lenderSecret), later ones
   * from whoever holds claimSecret matching the stored commitment.
   */
  transferClaim(nullifier: Uint8Array, newOwnerCommitment: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.transferClaim(
      this.circuitContext,
      nullifier,
      newOwnerCommitment,
    ).context;
    return this.getLedger();
  }

  /**
   * Holder-only, local ownership check: does THIS wallet's claimSecret match
   * the invoice's on-chain commitment? Pure computation against public state
   * plus private state — nothing is disclosed to anyone else.
   */
  holdsClaim(nullifier: Uint8Array): boolean {
    const invoice = this.getLedger().invoices.lookup(nullifier);
    if (!invoice.transferred) return false;
    const mine = pureCircuits.deriveClaimCommitment(
      this.circuitContext.currentPrivateState.claimSecret,
      nullifier,
    );
    return mine.length === invoice.claimCommitment.length && mine.every((v, i) => v === invoice.claimCommitment[i]);
  }

  /**
   * Default insurance: the current claim holder collects 50% of the financed
   * amount from the shared pool for an unsettled, past-due invoice (a thin
   * pool pays partially). The wallet computes the entitlement, the payout and
   * the new pool balance; the circuit proves all of them against the public
   * state. Returns the payout actually granted.
   */
  claimInsurancePayout(nullifier: Uint8Array, claimedAt: bigint): bigint {
    const current = this.getLedger();
    if (!current.bestBids.member(nullifier)) throw new Error('auction not resolved');
    const best = current.bestBids.lookup(nullifier);
    const maxEntitlement = fullInsurancePayout(best.amount);
    const balance = current.insurancePools.lookup(insurancePoolKey()).balance;
    const payout = insurancePayoutFor(best.amount, balance);
    const results = this.contract.impureCircuits.claimInsurancePayout(
      this.circuitContext,
      nullifier,
      maxEntitlement,
      payout,
      balance - payout,
      claimedAt,
    );
    this.circuitContext = results.context;
    return results.result;
  }

  settleSplitInvoice(
    nullifier: Uint8Array,
    financedDueDate: bigint,
    settledAt: bigint,
    contributions: [bigint, bigint, bigint, bigint],
    payouts: [bigint, bigint, bigint, bigint],
    explicitTotalContribution?: bigint,
    explicitTotalPayout?: bigint,
  ): boolean {
    const totalContribution = explicitTotalContribution ?? contributions[0] + contributions[1] + contributions[2] + contributions[3];
    const totalPayout = explicitTotalPayout ?? payouts[0] + payouts[1] + payouts[2] + payouts[3];
    // Compute the floor-rounding remainder and the resulting insurance pool balance.
    // The remainder = totalPayout - sum(payouts) is routed to the shared insurance pool
    // (modeled on Uniswap V3's fee-rounding-to-protocol pattern).
    const sumPayouts = payouts[0] + payouts[1] + payouts[2] + payouts[3];
    const remainder = totalPayout - sumPayouts;
    const poolKey = insurancePoolKey();
    const currentPoolBalance = this.getLedger().insurancePools.member(poolKey)
      ? this.getLedger().insurancePools.lookup(poolKey).balance
      : 0n;
    const newPoolBalance = currentPoolBalance + remainder;
    const results = this.contract.impureCircuits.settleSplitInvoice(
      this.circuitContext,
      nullifier,
      financedDueDate,
      settledAt,
      contributions[0],
      contributions[1],
      contributions[2],
      contributions[3],
      payouts[0],
      payouts[1],
      payouts[2],
      payouts[3],
      totalContribution,
      totalPayout,
      newPoolBalance,
    );
    this.circuitContext = results.context;
    const onTime = results.result;
    this.circuitContext.currentPrivateState = applyReputationUpdate(
      this.circuitContext.currentPrivateState,
      onTime,
    );
    return onTime;
  }

  transferPoolClaim(
    nullifier: Uint8Array,
    slotIndex: bigint,
    newOwnerCommitment: Uint8Array,
  ): void {
    this.circuitContext = this.contract.impureCircuits.transferPoolClaim(
      this.circuitContext,
      nullifier,
      slotIndex,
      newOwnerCommitment,
    ).context;
  }

  claimPoolInsurancePayout(
    nullifier: Uint8Array,
    slotIndex: bigint,
    claimedAt: bigint,
  ): bigint {
    const current = this.getLedger();
    if (!current.invoices.member(nullifier)) throw new Error('unknown invoice');
    const invoice = current.invoices.lookup(nullifier);

    const slotKey = pureCircuits.poolSlotKey(nullifier, slotIndex);
    if (!current.poolSettlements.member(slotKey)) throw new Error('pool slot not settled');
    const settlementPayout = current.poolSettlements.lookup(slotKey).payout;

    const totalInsurance = invoice.amount / 2n;

    const poolKey = insurancePoolKey();
    const pool = current.insurancePools.lookup(poolKey);

    const insurancePayout = totalInsurance <= pool.balance
      ? (settlementPayout * totalInsurance) / invoice.amount
      : (settlementPayout * pool.balance) / invoice.amount;
    const newPoolBalance = pool.balance - insurancePayout;

    const results = this.contract.impureCircuits.claimPoolInsurancePayout(
      this.circuitContext,
      nullifier,
      slotIndex,
      totalInsurance,
      insurancePayout,
      newPoolBalance,
      claimedAt,
    );
    this.circuitContext = results.context;
    return results.result;
  }
}

export function deriveCommitment(secret: Uint8Array, nullifier: Uint8Array): Uint8Array {
  return pureCircuits.deriveCommitment(secret, nullifier);
}

export function deriveBuyerCommitment(secret: Uint8Array, nullifier: Uint8Array): Uint8Array {
  return pureCircuits.deriveBuyerCommitment(secret, nullifier);
}

export function derivePseudonym(secret: Uint8Array): Uint8Array {
  return pureCircuits.derivePseudonym(secret);
}

export function deriveBidKey(nullifier: Uint8Array, pseudonym: Uint8Array): Uint8Array {
  return pureCircuits.deriveBidKey(nullifier, pseudonym);
}

export function deriveBidCommitment(
  secret: Uint8Array,
  nullifier: Uint8Array,
  amount: bigint,
  dueDate: bigint,
  rateBps: bigint,
  willingToSplit: boolean = false,
): Uint8Array {
  return pureCircuits.deriveBidCommitment(secret, nullifier, amount, dueDate, rateBps, willingToSplit);
}

export function deriveClaimCommitment(ownerSecret: Uint8Array, nullifier: Uint8Array): Uint8Array {
  return pureCircuits.deriveClaimCommitment(ownerSecret, nullifier);
}

/** The opaque public payee recorded when a transferred claim settles. */
export function deriveSecondaryPayee(): Uint8Array {
  return pureCircuits.deriveSecondaryPayee();
}

/** Derive the pool slot key for a given nullifier and slot index. */
export function derivePoolSlotKey(nullifier: Uint8Array, slotIndex: bigint): Uint8Array {
  return pureCircuits.poolSlotKey(nullifier, slotIndex);
}
