// Cross-deal reputation scoring for the SME wallet.
//
// The reputation score lives in the SME's private state and is updated by the
// *wallet layer* (CLI, simulator, browser DApp) after each settlement, using
// the classification returned by the settleInvoice circuit. The contract
// itself never writes or reads the score: it only proves bounds over it
// (smeReputationScore >= reputationThreshold at registration, and the
// invoice's public reputationThreshold >= the lender's private minimum at
// bidding).
//
// Single source of truth for the scoring formula, shared by the CLI, the
// frontend and the tests.
//
//   on-time settlement (settledAt <= financedDueDate): score +10 (capped 100)
//   late/defaulted settlement (settledAt > financedDueDate): score -20 (floor 0)

import type { ShieldLedgerPrivateState } from './witnesses.js';

export const REPUTATION_CAP = 100n;
export const REPUTATION_FLOOR = 0n;
export const REPUTATION_ON_TIME_INCREMENT = 10n;
export const REPUTATION_LATE_PENALTY = 20n;

export type ReputationUpdate = {
  readonly onTime: boolean;
};

/**
 * Returns a new private state with the SME's reputation score and the
 * on-time/late counters updated for one settled invoice.
 */
export function applyReputationUpdate(
  privateState: ShieldLedgerPrivateState,
  onTime: boolean,
): ShieldLedgerPrivateState {
  const score = privateState.smeReputationScore;
  const nextScore = onTime
    ? (score + REPUTATION_ON_TIME_INCREMENT > REPUTATION_CAP
        ? REPUTATION_CAP
        : score + REPUTATION_ON_TIME_INCREMENT)
    : (score - REPUTATION_LATE_PENALTY < REPUTATION_FLOOR
        ? REPUTATION_FLOOR
        : score - REPUTATION_LATE_PENALTY);
  return {
    ...privateState,
    smeReputationScore: nextScore,
    smeOnTimeCount: privateState.smeOnTimeCount + (onTime ? 1n : 0n),
    smeLateCount: privateState.smeLateCount + (onTime ? 0n : 1n),
  };
}

export interface ReputationView {
  readonly score: bigint;
  readonly onTimeCount: bigint;
  readonly lateCount: bigint;
}

export function reputationView(privateState: ShieldLedgerPrivateState): ReputationView {
  return {
    score: privateState.smeReputationScore,
    onTimeCount: privateState.smeOnTimeCount,
    lateCount: privateState.smeLateCount,
  };
}
