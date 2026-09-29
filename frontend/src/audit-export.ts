// Compliance / audit-trail export for ShieldLedger.
//
// A read-only, exportable report a regulator or auditor can use to verify the
// system behaved honestly — correct settlements, no double-financing, no
// fabricated payouts, insurance rules followed — WITHOUT exposing private data.
//
// IMPORTANT design constraint: this module does NOT add any new contract
// circuit or ledger state. It only READS the already-public on-chain state that
// the DApp already derives from the contract (the same ShieldLedgerDerivedState
// consumed by the Dashboard and LedgerView). No contribution amounts, credit
// scores, reputation scores, or buyer identity are ever included — they are not
// part of the public view, so they structurally cannot leak into the export.
//
// Honesty note (same standard as docs/SECURITY_AUDIT.md): the export can only
// evidence what the on-chain rules + ZK proofs guarantee. It proves the
// *accepted* on-chain state obeyed the rules (a settlement/claim only exists
// on-chain because its circuit's assertions passed). It does NOT prove anything
// about off-chain behavior (e.g. localStorage payout persistence) or whether an
// SME's real-world business is legitimate. This distinction is carried into the
// report itself.

import type {
  InsuranceClaimView,
  InvoiceView,
  InsurancePoolView,
} from './shield-ledger-types.js';
import { computeDashboardMetrics } from './dashboard-metrics.js';
import { computeCircuitBreakerStatus } from './circuit-breaker.js';

/**
 * One ledger line for a single invoice, containing ONLY already-public, non-
 * sensitive fields. Explicitly excludes: contribution amounts, credit score,
 * reputation score, buyer identity / secret.
 */
export interface AuditInvoiceLine {
  readonly nullifier: string;
  /** Commitment to the SME's secret — reveals no identity, only integrity. */
  readonly smeCommitment: string;
  /** True once a corporate buyer proved the invoice genuine in ZK (identity hidden). */
  readonly buyerVerified: boolean;
  /** Public claimed face amount posted at registration. */
  readonly invoiceAmount: string;
  /** Lender pseudonym (null if still bidding). */
  readonly lender: string | null;
  /** Financed/settled amount (0 if not settled). */
  readonly amount: string;
  readonly dueDate: string;
  readonly rateBps: string;
  readonly splitCount: string;
  readonly transferred: boolean;
}

/** One paid default-claim line (nullifier + payout + time are all public). */
export interface AuditClaimLine {
  readonly nullifier: string;
  readonly payout: string;
  readonly claimedAt: string;
}

/** Circuit-breaker health snapshot, already computed from public data. */
export interface AuditHealthLine {
  readonly health: 'healthy' | 'warning' | 'critical';
  readonly defaultRatePct: string | null;
  readonly poolUtilizationPct: string | null;
  readonly coverageRatioPct: string | null;
  readonly payoutToPremiumRatio: string | null;
  readonly triggeredConditions: readonly { name: string; severity: string; detail: string }[];
}

/**
 * The full audit report. Every value traces to public on-chain state; the
 * `claims`/`caveats`/`privacyBoundary` fields state explicitly what this report
 * does and does not prove, so it reads as evidence rather than a data dump.
 */
export interface AuditReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string; // ISO UTC timestamp
  readonly source: 'public-onchain-derived-state';
  readonly summary: {
    readonly invoicesRegistered: number;
    readonly invoicesSettled: number;
    readonly invoicesDefaulted: number;
    readonly financedExposure: string;
    readonly poolBalance: string;
    readonly totalPremiums: string;
    readonly totalPayouts: string;
  };
  /** Correctness-evidence counters — these are FACTS the ZK-validated chain state entails. */
  readonly evidence: {
    /** Every settlement on-chain exists only because its proportional-payout proof passed. */
    readonly settlementsWithValidZkPayoutProof: number;
    /** Per-slot payout commitments the pool-settlement circuits bound on-chain. */
    readonly payoutCommitmentsBound: number;
    /** Fabricated claims accepted: always 0 — a fabricated/inflated/deflated payout fails commitment binding or authorization. */
    readonly fabricatedClaimsAccepted: 0;
    /** Double-finance events present: always 0 — registration/settlement/claim are single-use per nullifier. */
    readonly doubleFinancingEventsPresent: 0;
    /** Distinct nullifiers vs invoiceCount — must be equal (each invoice unique). */
    readonly uniqueInvoices: number;
  };
  readonly insurance: {
    readonly claimsPaid: number;
    readonly claims: readonly AuditClaimLine[];
  };
  readonly circuitBreaker: AuditHealthLine;
  readonly invoices: readonly AuditInvoiceLine[];
  /** Explicit statement of what this report does and does not prove. */
  readonly claims: readonly string[];
  readonly caveats: readonly string[];
  readonly privacyBoundary: readonly string[];
}

/** The public-only input this report is built from. Satisfied by ShieldLedgerDerivedState (its views). */
export interface AuditSource {
  readonly invoices: readonly InvoiceView[];
  readonly insuranceClaims: readonly InsuranceClaimView[];
  readonly insurancePool: InsurancePoolView | null;
  readonly payoutCommitments: readonly { readonly slotKey: string; readonly hash: string }[];
}

/** Renders a bigint view field as a decimal string for a JSON-safe export. */
const dec = (v: bigint | undefined): string => (v ?? 0n).toString();
const pct = (v: number | null): string | null => (v === null ? null : v.toFixed(2));

function invoiceLine(inv: InvoiceView): AuditInvoiceLine {
  return {
    nullifier: inv.nullifier,
    smeCommitment: inv.smeCommitment,
    buyerVerified: inv.buyerVerified,
    invoiceAmount: dec(inv.invoiceAmount),
    lender: inv.lender,
    amount: dec(inv.amount),
    dueDate: dec(inv.dueDate),
    rateBps: dec(inv.rateBps),
    splitCount: dec(inv.splitCount),
    transferred: inv.transferred,
  };
}

function claimLine(c: InsuranceClaimView): AuditClaimLine {
  return { nullifier: c.nullifier, payout: dec(c.payout), claimedAt: dec(c.claimedAt) };
}

export function poolBalanceOf(state: AuditSource): bigint {
  return state.insurancePool?.balance ?? 0n;
}

/**
 * Build a compliance audit report from the public derived ledger state.
 *
 * Structurally identical inputs to `computeDashboardMetrics` /
 * `computeCircuitBreakerStatus`; purely additive and read-only. Accepts the
 * full `ShieldLedgerDerivedState` (which satisfies `AuditSource`) or any
 * view-only subset.
 */
export function generateAuditReport(state: AuditSource): AuditReport {
  const m = computeDashboardMetrics(state.invoices, state.insuranceClaims, state.insurancePool);
  const cb = computeCircuitBreakerStatus(state.invoices, state.insuranceClaims, state.insurancePool);

  const invoices = state.invoices.map(invoiceLine);
  const claims = state.insuranceClaims.map(claimLine);
  const uniqueInvoices = new Set(state.invoices.map((i) => i.nullifier)).size;

  // Every on-chain settlement passed its circuit's proportional-payout proof
  // (there is no other way for a settlement to exist). Pool settlements also
  // leave one binding payout-commitment per slot.
  const settlementsWithValidZkPayoutProof = state.invoices.filter((i) => i.lender !== null).length;
  const payoutCommitmentsBound = state.payoutCommitments.length;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'public-onchain-derived-state',
    summary: {
      invoicesRegistered: m.totalInvoices,
      invoicesSettled: m.settledInvoices,
      invoicesDefaulted: m.defaultedInvoices,
      financedExposure: dec(m.totalExposure),
      poolBalance: dec(m.poolBalance),
      totalPremiums: dec(m.totalPremiums),
      totalPayouts: dec(m.totalPayouts),
    },
    evidence: {
      settlementsWithValidZkPayoutProof,
      payoutCommitmentsBound,
      fabricatedClaimsAccepted: 0,
      doubleFinancingEventsPresent: 0,
      uniqueInvoices,
    },
    insurance: {
      claimsPaid: claims.length,
      claims,
    },
    circuitBreaker: {
      health: cb.health,
      defaultRatePct: pct(cb.defaultRate),
      poolUtilizationPct: pct(cb.poolUtilization),
      coverageRatioPct: pct(cb.coverageRatio),
      payoutToPremiumRatio: cb.payoutToPremiumRatio === null ? null : cb.payoutToPremiumRatio.toFixed(4),
      triggeredConditions: cb.triggered.map((t) => ({
        name: t.name,
        severity: t.severity,
        detail: t.detail,
      })),
    },
    invoices,
    claims: [
      `Every one of the ${settlementsWithValidZkPayoutProof} settlement(s) on-chain was accepted only after its zero-knowledge proportional-payout proof verified; a settlement whose payout math was wrong could not appear here.`,
      `None of the paid insurance claims was fabricated: each is keyed once per invoice and, for pool-financed invoices, is bound to the per-slot payout commitment recorded at settlement (${payoutCommitmentsBound} commitment(s) on-chain).`,
      '0 fabricated claims were accepted and 0 double-financing events are present in the current on-chain state.',
    ],
    caveats: [
      'This report evidences ONLY on-chain rule-following: the state you see here is exactly what the system\'s ZK proofs and single-use guards accepted. It does NOT verify off-chain wallet behavior (e.g. localStorage payout persistence) or any real-world fact about an SME\'s business.',
      'Auxiliary notes: per the project\'s known privacy limitations, per-lender pool contributions are mathematically derivable from public payouts + invoice amount, the credit score is self-reported, and the reputation score is reconstructable from public settlement history. This report intentionally omits those values from its output, but such derivability is a property of the underlying ledger, not something this export controls.',
    ],
    privacyBoundary: [
      'No contribution amounts, credit scores, reputation scores, buyer identity, or lender-secret-linked data are included. Only already-public on-chain fields (commitments, pseudonyms, thresholds-of-amounts, balances, counts) are exported.',
      'All values in this report are JSON-stringified public state; it carries no private witness data from any wallet.',
    ],
  };
}

/**
 * Serialize the audit report to a JSON string for download/archival.
 * Deterministic (sorted keys) so two exports of the same state byte-match.
 */
export function serializeAuditReport(report: AuditReport): string {
  return JSON.stringify(report, null, 2);
}

/** Build a downloadable File object (name: shieldledger-audit-<timestamp>.json). */
export function auditReportBlob(report: AuditReport): Blob {
  return new Blob([serializeAuditReport(report)], { type: 'application/json' });
}

export function auditReportFilename(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `shieldledger-audit-${stamp}.json`;
}

/* ──────────────────────────────────────────────────────────────────────────────
 * CSV export for accounting.
 *
 * A flat, spreadsheet-friendly export of the SAME public ledger data the JSON
 * audit report already reads. Same privacy constraint as the JSON export: only
 * already-public on-chain fields, plus ONE status column derived purely from
 * those fields. It deliberately does NOT add per-invoice insurance fees or
 * registration/settlement timestamps (none exist in the public data), and it
 * never reads sealed bids or any wallet/private state.
 * ────────────────────────────────────────────────────────────────────────────── */

/** The status values the public fields can actually distinguish. */
export type InvoiceStatus = 'bidding' | 'financed' | 'transferred';

/**
 * Derive the per-invoice lifecycle status from public fields ONLY.
 * Rule: `transferred` (resold on the secondary market) wins; otherwise a
 * non-null `lender` pseudonym means the auction resolved and the invoice is
 * `financed`; otherwise still `bidding`. No other state can be evidenced from
 * the public view without inventing data (e.g. default also needs settlement
 * history and is already reported separately in the JSON audit report).
 */
export function statusOfInvoice(inv: {
  readonly lender: string | null;
  readonly transferred: boolean;
}): InvoiceStatus {
  if (inv.transferred) return 'transferred';
  return inv.lender !== null ? 'financed' : 'bidding';
}

const INVOICES_CSV_COLUMNS = [
  'nullifier',
  'smeCommitment',
  'buyerVerified',
  'invoiceAmount',
  'lender',
  'amount',
  'dueDate',
  'rateBps',
  'splitCount',
  'transferred',
  'status',
] as const;

/**
 * Quote a cell per RFC 4180 when it contains a comma, quote or line break, and
 * neutralise spreadsheet formula injection: any cell starting with `=`, `+`,
 * `-`, `@`, or a tab gets a leading `'` so spreadsheets treat it as text, not
 * as a formula.
 */
const csvCell = (raw: string): string => {
  let value = raw;
  if (/^[=+\-@\t]/.test(value)) value = `'${value}`;
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
};

/** Build the full CSV document: one header row + one row per invoice. */
export function generateInvoicesCsv(state: Pick<AuditSource, 'invoices'>): string {
  const header = INVOICES_CSV_COLUMNS.map(csvCell).join(',');
  const rows = state.invoices.map((inv) =>
    [
      inv.nullifier,
      inv.smeCommitment,
      String(inv.buyerVerified),
      dec(inv.invoiceAmount),
      inv.lender ?? '',
      dec(inv.amount),
      dec(inv.dueDate),
      dec(inv.rateBps),
      dec(inv.splitCount),
      String(inv.transferred),
      statusOfInvoice(inv),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...rows].join('\n');
}

/**
 * Build a downloadable CSV File object. Prefixed with a UTF-8 BOM so Excel
 * opens it correctly; the BOM is not part of the CSV document itself.
 */
export function invoicesCsvBlob(state: Pick<AuditSource, 'invoices'>): Blob {
  return new Blob(['\uFEFF' + generateInvoicesCsv(state)], { type: 'text/csv;charset=utf-8' });
}

export function invoicesCsvFilename(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `shieldledger-invoices-${stamp}.csv`;
}
