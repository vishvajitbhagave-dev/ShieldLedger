// Client-side Demo Mode for ShieldLedger.
//
// Everything in this module is SIMULATED: an in-memory ledger, an in-memory
// SME invoice registry and in-memory pool payouts. It deliberately never
// touches the real localStorage keys used by the live app
// ("shieldledger.registeredInvoices", "shieldledger.poolPayouts",
// "shieldledger.private-state.*", the rate-trend store) — demo activity is a
// throwaway of this browser session state only.
//
// The mock API mirrors the real ShieldLedgerAPI method signatures, applies the
// same payout/reputation formulas (imported from src/insurance.ts and
// src/reputation.ts) and mutates `demoState$`, a BehaviorSubject shaped like
// ShieldLedgerDerivedState, so useLedgerState/useRateTrend/InvoiceFinancing
// keep working without changes once they select this source instead of
// deployment.api.

import { BehaviorSubject } from 'rxjs';
import type {
  BestBidView,
  InsuranceClaimView,
  InsurancePoolView,
  InvoiceView,
  PayoutCommitmentView,
  PoolBidView,
  PoolClaimView,
  SealedBidView,
  ShieldLedgerDerivedState,
} from '../shield-ledger-types.js';
import type { Ledger } from '../../../contracts/managed/shield-ledger/contract/index.js';
import {
  bytesToHex,
  deriveInvoiceNullifier,
  generateInvoiceSecret,
  type RegisteredInvoice,
} from '../invoice-registry.js';
import type { ReputationView } from '../../../src/reputation.js';
import {
  REPUTATION_CAP,
  REPUTATION_FLOOR,
  REPUTATION_LATE_PENALTY,
  REPUTATION_ON_TIME_INCREMENT,
} from '../../../src/reputation.js';
import {
  fullInsurancePayout,
  insuranceContribution,
  insurancePayoutFor,
} from '../../../src/insurance.js';

export const DEMO_MODE_STORAGE_KEY = 'shieldledger.demo';

export function readDemoModeActive(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(DEMO_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeDemoModeActive(on: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (on) localStorage.setItem(DEMO_MODE_STORAGE_KEY, '1');
    else localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
  } catch {
    // Storage unavailable: demo mode applies for this session only.
  }
}

const DAY = 86400;

/** Deterministic pseudo-hash producing a fake 64-char hex value (display only). */
function fakeHex(seed: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  const s = `${seed}::shieldledger-demo`;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ ((c << 8) | i), 0x01000193) >>> 0;
  }
  const body = a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  return (body + body + body + body).slice(0, 64);
}

/** The facade demo lender pseudonym used for every bid/pool reveal in demo mode. */
const DEMO_LENDER_PSEUDONYM = fakeHex('demo-lender-me');
/** On-chain marker used to flag a pool-settled invoice (mirrors "shieldledger:pool"). */
const POOL_MARKER = fakeHex('insurance-pool-marker');

interface DemoPoolPayoutRecord {
  readonly nullifier: string;
  readonly slotIndex: string;
  readonly slotKey: string;
  readonly payout: string;
  readonly createdAt: number;
}

/** The mock mutates invoice records in memory only; the emitted public view is readonly. */
type MutableInvoice = { -readonly [K in keyof InvoiceView]: InvoiceView[K] };

interface DemoLedgerStore {
  invoices: MutableInvoice[];
  bids: SealedBidView[];
  bestBids: BestBidView[];
  insurancePoolBalance: bigint;
  insuranceClaims: InsuranceClaimView[];
  poolBids: PoolBidView[];
  payoutCommitments: PayoutCommitmentView[];
  poolClaims: PoolClaimView[];
  registered: RegisteredInvoice[];
  poolPayouts: DemoPoolPayoutRecord[];
  reputation: ReputationView;
  seq: number;
}

const unkeyedInvoice = (
  nullifier: string,
  invoiceAmount: bigint,
  creditThreshold: bigint,
  reputationThreshold: bigint,
  splitCount = 0n,
): MutableInvoice => ({
  nullifier,
  smeCommitment: fakeHex(`sme:${nullifier}`),
  creditThreshold,
  reputationThreshold,
  invoiceAmount,
  buyerVerified: false,
  buyerCommitment: fakeHex(`buyer-unset:${nullifier}`),
  lender: null,
  amount: 0n,
  dueDate: 0n,
  rateBps: 0n,
  transferred: false,
  claimCommitment: fakeHex(`claim:${nullifier}`),
  splitCount,
});

function buildSeedStore(): DemoLedgerStore {
  const now = Math.floor(Date.now() / 1000);
  const futureDue = BigInt(now + 30 * DAY);
  const nearDue = BigInt(now + 20 * DAY);
  const pastDue = BigInt(now - 5 * DAY);

  const invA = unkeyedInvoice(fakeHex('inv-a'), 5000n, 650n, 0n);
  const invC = { ...unkeyedInvoice(fakeHex('inv-c'), 8000n, 680n, 10n), buyerVerified: true, buyerCommitment: fakeHex('buyer-c') };
  const invD = {
    ...unkeyedInvoice(fakeHex('inv-d'), 12000n, 720n, 30n),
    buyerVerified: true,
    buyerCommitment: fakeHex('buyer-d'),
    lender: DEMO_LENDER_PSEUDONYM,
    amount: 11800n,
    dueDate: nearDue,
    rateBps: 420n,
  };
  const invE = { ...unkeyedInvoice(fakeHex('inv-e'), 16000n, 700n, 20n, 2n), buyerVerified: true, buyerCommitment: fakeHex('buyer-e') };
  const invF = { ...unkeyedInvoice(fakeHex('inv-f'), 9000n, 690n, 15n), buyerVerified: true, buyerCommitment: fakeHex('buyer-f') };
  const invH = { ...unkeyedInvoice(fakeHex('inv-h'), 6000n, 660n, 5n), buyerVerified: true, buyerCommitment: fakeHex('buyer-h') };

  // The SME-tracker seeded invoice: buyer-verified, open, already has a
  // leading (winning) revealed bid by the demo lender, so the walkthrough can
  // go straight to Reveal → Settle.
  const invB = {
    ...unkeyedInvoice(fakeHex('inv-b'), 10000n, 700n, 20n),
    buyerVerified: true,
    buyerCommitment: fakeHex('buyer-b'),
  };

  const bestF = { nullifier: invF.nullifier, lender: fakeHex('other-lender-2'), amount: 8800n, dueDate: pastDue, rateBps: 480n, willingToSplit: false };
  const bestH = { nullifier: invH.nullifier, lender: fakeHex('other-lender'), amount: 5900n, dueDate: pastDue, rateBps: 500n, willingToSplit: false };

  return {
    invoices: [invA, invB, invC, invD, invE, invF, invH],
    bids: [
      { bidKey: fakeHex('bid-1'), nullifier: invB.nullifier, lender: DEMO_LENDER_PSEUDONYM, commitment: fakeHex('bid-commit-1') },
      { bidKey: fakeHex('bid-2'), nullifier: invB.nullifier, lender: fakeHex('other-lender-2'), commitment: fakeHex('bid-commit-2') },
    ],
    bestBids: [
      { nullifier: invB.nullifier, lender: DEMO_LENDER_PSEUDONYM, amount: 9950n, dueDate: futureDue, rateBps: 400n, willingToSplit: false },
      bestF,
      bestH,
    ],
    // Premiums for the seeded invoices: floor(amount / 50). A round balance
    // keeps the insurance story easy to follow.
    insurancePoolBalance: 5000n,
    insuranceClaims: [{ nullifier: invH.nullifier, payout: insurancePayoutFor(bestH.amount, 5000n), claimedAt: pastDue + 1n }],
    poolBids: [],
    payoutCommitments: [],
    poolClaims: [],
    registered: [
      {
        reference: 'INV-1001',
        amount: '10000',
        dueDate: futureDue.toString(),
        secret: fakeHex('demo-sme-secret'),
        nullifier: invB.nullifier,
        createdAt: now,
      },
    ],
    poolPayouts: [],
    reputation: { score: 0n, onTimeCount: 0n, lateCount: 0n },
    seq: 3,
  };
}

function buildDerived(s: DemoLedgerStore): ShieldLedgerDerivedState {
  const insurancePool: InsurancePoolView = { balance: s.insurancePoolBalance };
  return {
    // The mock never inspects the raw contract Ledger — nothing in the UI does.
    ledger: null as unknown as Ledger,
    invoiceCount: BigInt(s.invoices.length),
    invoices: s.invoices,
    bids: s.bids,
    bestBids: s.bestBids,
    insurancePool,
    insuranceClaims: s.insuranceClaims,
    poolBids: s.poolBids,
    payoutCommitments: s.payoutCommitments,
    poolClaims: s.poolClaims,
  };
}

let activeStore: DemoLedgerStore = buildSeedStore();

export const demoState$ = new BehaviorSubject<ShieldLedgerDerivedState>(buildDerived(activeStore));

/** Rebuilds the demo ledger from seed and pushes a fresh emission. */
export function resetDemoLedger(): void {
  activeStore = buildSeedStore();
  demoState$.next(buildDerived(activeStore));
}

function store(): DemoLedgerStore {
  return activeStore;
}

function emit(): void {
  demoState$.next(buildDerived(store()));
}

const delay = (ms = 200): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const currentUnixSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

const lowerNullifier = (hex: string): string => hex.trim().toLowerCase();

function requireInvoice(nullifier: string): MutableInvoice {
  const invoice = store().invoices.find((i) => i.nullifier === nullifier);
  if (!invoice) throw new Error('Unknown invoice.');
  return invoice;
}

function poolSlotKey(nullifier: string, slotIndex: bigint | number): string {
  return fakeHex(`pool-slot:${nullifier}:${slotIndex}`);
}

function applyReputation(onTime: boolean): void {
  const r = store().reputation;
  const nextScore = onTime
    ? r.score + REPUTATION_ON_TIME_INCREMENT > REPUTATION_CAP
      ? REPUTATION_CAP
      : r.score + REPUTATION_ON_TIME_INCREMENT
    : r.score - REPUTATION_LATE_PENALTY < REPUTATION_FLOOR
      ? REPUTATION_FLOOR
      : r.score - REPUTATION_LATE_PENALTY;
  store().reputation = {
    score: nextScore,
    onTimeCount: r.onTimeCount + (onTime ? 1n : 0n),
    lateCount: r.lateCount + (onTime ? 0n : 1n),
  };
}

// ─── Demo SME registry (in-memory, mirrors invoice-registry.ts semantics) ─────

/** The SME's own registered invoices in demo mode (never persisted). */
export function demoLoadRegisteredInvoices(): RegisteredInvoice[] {
  return [...store().registered];
}

/** Registers an invoice in the demo's in-memory registry (idempotent). */
export async function demoRegisterInvoiceLocally(params: {
  reference: string;
  amount: bigint;
  dueDate: bigint;
}): Promise<RegisteredInvoice> {
  const existing = store().registered.find(
    (inv) =>
      inv.reference === params.reference &&
      inv.amount === params.amount.toString() &&
      inv.dueDate === params.dueDate.toString(),
  );
  if (existing) return existing;
  const secret = generateInvoiceSecret();
  const nullifier = await deriveInvoiceNullifier({
    reference: params.reference,
    amount: params.amount,
    dueDate: params.dueDate,
    secret,
  });
  const record: RegisteredInvoice = {
    reference: params.reference,
    amount: params.amount.toString(),
    dueDate: params.dueDate.toString(),
    secret: bytesToHex(secret),
    nullifier,
    createdAt: Date.now(),
  };
  store().registered.push(record);
  return record;
}

/** Pool settlement payouts held in memory only (for the lender portfolio). */
export function demoLoadPoolPayouts(): DemoPoolPayoutRecord[] {
  return [...store().poolPayouts];
}

// ─── Mock API (signature-compatible with the real ShieldLedgerAPI) ───────────

export interface DemoApi {
  readonly state$: BehaviorSubject<ShieldLedgerDerivedState>;
  getInsuranceContribution(invoiceAmount: bigint): Promise<bigint>;
  registerInvoice(
    nullifierHex: string,
    creditThreshold: bigint,
    invoiceAmount: bigint,
    reputationThreshold?: bigint,
    splitCount?: bigint,
  ): Promise<void>;
  confirmInvoice(nullifierHex: string, confirmedAmount: bigint): Promise<void>;
  submitBid(nullifierHex: string, amount: bigint, dueDate: bigint, rateBps: bigint, willingToSplit?: boolean): Promise<void>;
  revealBid(nullifierHex: string, amount: bigint, dueDate: bigint, rateBps: bigint, willingToSplit?: boolean): Promise<void>;
  settleInvoice(nullifierHex: string, amount: bigint, dueDate: bigint): Promise<ReputationView | null>;
  getReputation(): Promise<ReputationView | null>;
  getMyPseudonym(): Promise<string | null>;
  transferClaim(nullifierHex: string, newOwnerSecretHex: string): Promise<void>;
  checkClaim(
    nullifierHex: string,
    state: ShieldLedgerDerivedState,
  ): Promise<'not-transferred' | 'mine' | 'other'>;
  claimInsurancePayout(nullifierHex: string): Promise<bigint>;
  revealPoolBid(
    nullifierHex: string,
    slotIndex: bigint,
    amount: bigint,
    dueDate: bigint,
    rateBps: bigint,
  ): Promise<void>;
  settleSplitInvoice(
    nullifierHex: string,
    financedDueDate: bigint,
    contributions: [bigint, bigint, bigint, bigint],
    payouts: [bigint, bigint, bigint, bigint],
    totalContribution: bigint,
    totalPayout: bigint,
  ): Promise<boolean>;
  transferPoolClaim(nullifierHex: string, slotIndex: bigint, newOwnerCommitmentHex: string): Promise<void>;
  claimPoolInsurancePayout(nullifierHex: string, slotIndex: bigint): Promise<bigint>;
}

const demoApiInstance: DemoApi = {
  state$: demoState$,

  async getInsuranceContribution(invoiceAmount: bigint): Promise<bigint> {
    await delay();
    return insuranceContribution(invoiceAmount);
  },

  async registerInvoice(
    nullifierHex: string,
    creditThreshold: bigint,
    invoiceAmount: bigint,
    reputationThreshold = 0n,
    splitCount = 0n,
  ): Promise<void> {
    await delay();
    const nullifier = lowerNullifier(nullifierHex);
    if (store().invoices.some((i) => i.nullifier === nullifier)) {
      throw new Error('Invoice already registered.');
    }
    store().invoices.push(unkeyedInvoice(nullifier, invoiceAmount, creditThreshold, reputationThreshold, splitCount));
    store().insurancePoolBalance += insuranceContribution(invoiceAmount);
    emit();
  },

  async confirmInvoice(nullifierHex: string, confirmedAmount: bigint): Promise<void> {
    await delay();
    const invoice = requireInvoice(lowerNullifier(nullifierHex));
    if (confirmedAmount !== invoice.invoiceAmount) {
      throw new Error("Confirmed amount must match the SME's claimed amount.");
    }
    invoice.buyerVerified = true;
    invoice.buyerCommitment = fakeHex(`buyer:${invoice.nullifier}:${store().seq++}`);
    emit();
  },

  async submitBid(nullifierHex: string, amount: bigint, dueDate: bigint, rateBps: bigint, willingToSplit = false): Promise<void> {
    await delay();
    const nullifier = lowerNullifier(nullifierHex);
    const invoice = requireInvoice(nullifier);
    if (invoice.lender !== null) throw new Error('Invoice is not open for bids.');
    store().bids.push({
      bidKey: fakeHex(`bid:${store().seq++}`),
      nullifier,
      lender: DEMO_LENDER_PSEUDONYM,
      commitment: fakeHex(`bid-commit:${store().seq++}`),
    });
    emit();
  },

  async revealBid(nullifierHex: string, amount: bigint, dueDate: bigint, rateBps: bigint, willingToSplit = false): Promise<void> {
    await delay();
    const nullifier = lowerNullifier(nullifierHex);
    const invoice = requireInvoice(nullifier);
    if (invoice.lender !== null) throw new Error('Invoice is not open for bids.');
    const existing = store().bestBids.find((b) => b.nullifier === nullifier);
    if (!existing || rateBps < existing.rateBps) {
      store().bestBids = store().bestBids.filter((b) => b.nullifier !== nullifier);
      store().bestBids.push({ nullifier, lender: DEMO_LENDER_PSEUDONYM, amount, dueDate, rateBps, willingToSplit });
      emit();
    }
  },

  async settleInvoice(nullifierHex: string, amount: bigint, dueDate: bigint): Promise<ReputationView | null> {
    await delay();
    const invoice = requireInvoice(lowerNullifier(nullifierHex));
    if (invoice.lender !== null) throw new Error('Invoice already settled.');
    const best = store().bestBids.find((b) => b.nullifier === invoice.nullifier);
    if (!best) throw new Error('Auction not resolved.');
    invoice.lender = best.lender;
    invoice.amount = best.amount;
    invoice.dueDate = best.dueDate;
    invoice.rateBps = best.rateBps;
    const onTime = currentUnixSeconds() <= best.dueDate;
    applyReputation(onTime);
    emit();
    return { ...store().reputation };
  },

  async getReputation(): Promise<ReputationView | null> {
    await delay();
    return { ...store().reputation };
  },

  async getMyPseudonym(): Promise<string | null> {
    await delay();
    return DEMO_LENDER_PSEUDONYM;
  },

  async transferClaim(nullifierHex: string, newOwnerSecretHex: string): Promise<void> {
    await delay();
    const invoice = requireInvoice(lowerNullifier(nullifierHex));
    invoice.transferred = true;
    invoice.claimCommitment = fakeHex(`claim:${newOwnerSecretHex.slice(0, 16)}:${store().seq++}`);
    emit();
  },

  async checkClaim(
    nullifierHex: string,
    state: ShieldLedgerDerivedState,
  ): Promise<'not-transferred' | 'mine' | 'other'> {
    await delay();
    const invoice = state.invoices.find((i) => i.nullifier === lowerNullifier(nullifierHex));
    if (!invoice || !invoice.transferred) return 'not-transferred';
    // Demo data never transfers claims to the demo wallet, so any transferred
    // claim belongs to someone else — matching the live holder-check verdict.
    return 'other';
  },

  async claimInsurancePayout(nullifierHex: string): Promise<bigint> {
    await delay();
    const invoice = requireInvoice(lowerNullifier(nullifierHex));
    if (invoice.lender !== null) throw new Error('Invoice already settled.');
    const best = store().bestBids.find((b) => b.nullifier === invoice.nullifier);
    if (!best) throw new Error('Auction not resolved.');
    const claimedAt = currentUnixSeconds();
    if (claimedAt <= best.dueDate) {
      throw new Error(`Invoice not defaulted yet (due ${new Date(Number(best.dueDate) * 1000).toISOString()}).`);
    }
    const payout = insurancePayoutFor(best.amount, store().insurancePoolBalance);
    store().insurancePoolBalance -= payout;
    store().insuranceClaims.push({ nullifier: invoice.nullifier, payout, claimedAt });
    emit();
    return payout;
  },

  async revealPoolBid(
    nullifierHex: string,
    slotIndex: bigint,
    amount: bigint,
    dueDate: bigint,
    rateBps: bigint,
  ): Promise<void> {
    await delay();
    const invoice = requireInvoice(lowerNullifier(nullifierHex));
    if (invoice.splitCount === 0n) throw new Error('Invoice is not a pool invoice.');
    const slotKey = poolSlotKey(invoice.nullifier, slotIndex);
    store().poolBids = store().poolBids.filter((b) => b.slotKey !== slotKey);
    store().poolBids.push({ slotKey, lender: DEMO_LENDER_PSEUDONYM, commitment: fakeHex(`pool-bid:${store().seq++}`) });
    emit();
  },

  async settleSplitInvoice(
    nullifierHex: string,
    financedDueDate: bigint,
    contributions: [bigint, bigint, bigint, bigint],
    payouts: [bigint, bigint, bigint, bigint],
    totalContribution: bigint,
    totalPayout: bigint,
  ): Promise<boolean> {
    await delay();
    const invoice = requireInvoice(lowerNullifier(nullifierHex));
    if (invoice.splitCount === 0n) throw new Error('Not a pool invoice.');
    invoice.lender = POOL_MARKER;
    invoice.amount = totalPayout;
    invoice.dueDate = financedDueDate;
    invoice.rateBps = 0n;
    const remainder = totalPayout - payouts[0] - payouts[1] - payouts[2] - payouts[3];
    store().insurancePoolBalance += remainder;
    for (let i = 0; i < 4; i++) {
      const slotKey = poolSlotKey(invoice.nullifier, BigInt(i));
      store().payoutCommitments.push({ slotKey, hash: fakeHex(`payout-commit:${slotKey}:${store().seq++}`) });
      store().poolPayouts = store().poolPayouts.filter((r) => r.slotKey !== slotKey);
      store().poolPayouts.push({
        nullifier: invoice.nullifier,
        slotIndex: String(i),
        slotKey,
        payout: payouts[i].toString(),
        createdAt: Date.now(),
      });
    }
    const onTime = currentUnixSeconds() <= financedDueDate;
    applyReputation(onTime);
    emit();
    return onTime;
  },

  async transferPoolClaim(nullifierHex: string, slotIndex: bigint, newOwnerCommitmentHex: string): Promise<void> {
    await delay();
    const nullifier = lowerNullifier(nullifierHex);
    const slotKey = poolSlotKey(nullifier, slotIndex);
    store().poolClaims = store().poolClaims.filter((c) => c.slotKey !== slotKey);
    store().poolClaims.push({ slotKey, claimCommitment: newOwnerCommitmentHex, transferred: true });
    emit();
  },

  async claimPoolInsurancePayout(nullifierHex: string, slotIndex: bigint): Promise<bigint> {
    await delay();
    const invoice = requireInvoice(lowerNullifier(nullifierHex));
    if (invoice.lender !== POOL_MARKER) throw new Error('Not a pool-settled invoice.');
    if (invoice.splitCount === 0n) throw new Error('Not a pool invoice.');
    const slotKey = poolSlotKey(invoice.nullifier, slotIndex);
    if (!store().payoutCommitments.some((c) => c.slotKey === slotKey)) {
      throw new Error('Pool slot not settled.');
    }
    const record = store().poolPayouts.find((r) => r.slotKey === slotKey);
    if (!record) {
      throw new Error(
        'No locally stored payout for this slot. The pool invoice must be settled from this wallet first.',
      );
    }
    const claimedAt = currentUnixSeconds();
    if (claimedAt <= invoice.dueDate) {
      throw new Error(`Invoice not defaulted yet (due ${new Date(Number(invoice.dueDate) * 1000).toISOString()}).`);
    }
    const settlementPayout = BigInt(record.payout);
    const totalInsurance = fullInsurancePayout(invoice.amount);
    const insurancePayout =
      totalInsurance <= store().insurancePoolBalance
        ? (settlementPayout * totalInsurance) / invoice.amount
        : (settlementPayout * store().insurancePoolBalance) / invoice.amount;
    store().insurancePoolBalance -= insurancePayout;
    emit();
    return insurancePayout;
  },
};

export const getDemoApi = (): DemoApi => demoApiInstance;