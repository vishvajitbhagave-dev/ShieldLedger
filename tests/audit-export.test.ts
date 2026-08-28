import { describe, it, expect } from 'vitest';
import {
  generateAuditReport,
  serializeAuditReport,
} from '../frontend/src/audit-export.js';
import type { InvoiceView, InsuranceClaimView } from '../frontend/src/shield-ledger-types.js';

// Minimal InvoiceView factory — same pattern as dashboard-metrics.test.ts.
function inv(overrides: Partial<InvoiceView> & { nullifier: string }): InvoiceView {
  return {
    smeCommitment: '',
    creditThreshold: 0n,
    reputationThreshold: 0n,
    invoiceAmount: 1000n,
    buyerVerified: false,
    buyerCommitment: '',
    lender: null,
    amount: 0n,
    dueDate: 0n,
    rateBps: 0n,
    transferred: false,
    claimCommitment: '',
    splitCount: 0n,
    ...overrides,
  };
}

function claim(overrides: Partial<InsuranceClaimView> & { nullifier: string }): InsuranceClaimView {
  return { payout: 0n, claimedAt: 0n, ...overrides };
}

const PUBLIC_NF = '0x1a2b3c';
const LENDER_PSEUDONYM = '0x9f8e7d';

describe('audit trail — report generation with real data', () => {
  it('builds aggregate counts and correctness evidence from public state', () => {
    const source = {
      invoices: [
        inv({ nullifier: 'a', invoiceAmount: 10_000n, lender: LENDER_PSEUDONYM, amount: 5000n, dueDate: 100n, rateBps: 400n }),
        inv({ nullifier: 'b', invoiceAmount: 20_000n, lender: '0x1111', amount: 3000n }),
        inv({ nullifier: 'c', invoiceAmount: 5000n }), // not settled
      ],
      insuranceClaims: [claim({ nullifier: 'c', payout: 2500n, claimedAt: 200n })],
      insurancePool: { balance: 7500n },
      payoutCommitments: [{ slotKey: 's1', hash: '0xh1' }, { slotKey: 's2', hash: '0xh2' }],
    };

    const report = generateAuditReport(source);

    expect(report.summary.invoicesRegistered).toBe(3);
    expect(report.summary.invoicesSettled).toBe(2);
    expect(report.summary.invoicesDefaulted).toBe(1);
    expect(report.summary.financedExposure).toBe('8000'); // 5000 + 3000
    // premiums = 10000/50 + 20000/50 + 5000/50 = 200 + 400 + 100 = 700
    expect(report.summary.totalPremiums).toBe('700');
    expect(report.summary.totalPayouts).toBe('2500');
    expect(report.summary.poolBalance).toBe('7500');

    // Evidence counters reflect the ZK-validated chain state.
    expect(report.evidence.settlementsWithValidZkPayoutProof).toBe(2);
    expect(report.evidence.payoutCommitmentsBound).toBe(2);
    expect(report.evidence.fabricatedClaimsAccepted).toBe(0);
    expect(report.evidence.doubleFinancingEventsPresent).toBe(0);
    expect(report.evidence.uniqueInvoices).toBe(3);

    // Circuit-breaker health derived from the same public data.
    expect(report.circuitBreaker.health).toMatch(/^(healthy|warning|critical)$/);
    expect(report.circuitBreaker.defaultRatePct).toBe('33.33');

    // Insurance claim lines carry only public fields.
    expect(report.insurance.claimsPaid).toBe(1);
    expect(report.insurance.claims[0]).toEqual({ nullifier: 'c', payout: '2500', claimedAt: '200' });

    // Invoice ledger lines expose only public, non-sensitive fields.
    expect(report.invoices).toHaveLength(3);
    expect(report.invoices[0]).toMatchObject({
      nullifier: 'a',
      lender: LENDER_PSEUDONYM,
      amount: '5000',
      dueDate: '100',
      rateBps: '400',
    });
  });

  it('produces a JSON-serializable, deterministic export', () => {
    const source = {
      invoices: [inv({ nullifier: PUBLIC_NF, invoiceAmount: 10_000n, lender: LENDER_PSEUDONYM })],
      insuranceClaims: [],
      insurancePool: null,
      payoutCommitments: [],
    };
    const report = generateAuditReport(source);
    const json = serializeAuditReport(report);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.summary.invoicesRegistered).toBe(1);
    expect(parsed.invoices[0].nullifier).toBe(PUBLIC_NF);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe('audit trail — empty state', () => {
  it('handles no-invoices-yet without crashing and reports zero counts', () => {
    const report = generateAuditReport({
      invoices: [],
      insuranceClaims: [],
      insurancePool: null,
      payoutCommitments: [],
    });

    expect(report.summary.invoicesRegistered).toBe(0);
    expect(report.summary.invoicesSettled).toBe(0);
    expect(report.summary.invoicesDefaulted).toBe(0);
    expect(report.summary.financedExposure).toBe('0');
    expect(report.summary.poolBalance).toBe('0');
    expect(report.evidence.settlementsWithValidZkPayoutProof).toBe(0);
    expect(report.evidence.fabricatedClaimsAccepted).toBe(0);
    expect(report.insurance.claimsPaid).toBe(0);
    expect(report.invoices).toEqual([]);
    expect(report.circuitBreaker.health).toBe('healthy');
  });
});

describe('audit trail — NO PRIVATE FIELDS LEAK', () => {
  const PRIVATE_MARKERS = {
    smeCreditScore: 720,
    lenderCreditScore: 750,
    smeReputationScore: 40,
    contribution: 12345,
    buyerSecretHex: 'deadbeefcafe0001',
    lenderSecretHex: 'c0ffeeface0002',
    claimSecretHex: 'b00b1e5c0de0003',
  };

  it('exported JSON contains none of the private field names', () => {
    const source = {
      invoices: [inv({ nullifier: 'a', invoiceAmount: 10_000n, lender: LENDER_PSEUDONYM, amount: 5000n })],
      insuranceClaims: [claim({ nullifier: 'a', payout: 2500n, claimedAt: 100n })],
      insurancePool: { balance: 7500n },
      payoutCommitments: [{ slotKey: 's9', hash: '0xabc' }],
    };
    const json = serializeAuditReport(generateAuditReport(source));
    const parsed = JSON.parse(json) as Record<string, unknown>;

    // Walk every JSON object key. No private-bearing key may appear ANYWHERE
    // in the exported structure (data fields), regardless of any caveat prose.
    const forbiddenKeys = [
      'creditScore',
      'smeCreditScore',
      'lenderCreditScore',
      'smeReputationScore',
      'reputationScore',
      'contribution',
      'buyerSecret',
      'claimSecret',
      'lenderSecret',
      'score',
      'smeScore',
      'secret',
    ];
    const keys = new Set<string>();
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(visit);
      } else if (node !== null && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          keys.add(k);
          visit(v);
        }
      }
    };
    visit(parsed);

    const present = forbiddenKeys.filter((k) => keys.has(k));
    expect(present).toEqual([]);
  });

  it('exported JSON contains none of the private marker values', () => {
    const source = {
      invoices: [inv({ nullifier: 'a', invoiceAmount: 10_000n, lender: LENDER_PSEUDONYM, amount: 5000n })],
      insuranceClaims: [],
      insurancePool: { balance: 100n },
      payoutCommitments: [],
    };
    const json = serializeAuditReport(generateAuditReport(source));

    expect(json).not.toContain(String(PRIVATE_MARKERS.smeCreditScore));
    expect(json).not.toContain(String(PRIVATE_MARKERS.lenderCreditScore));
    expect(json).not.toContain(String(PRIVATE_MARKERS.smeReputationScore));
    expect(json).not.toContain(String(PRIVATE_MARKERS.contribution));
    expect(json).not.toContain(PRIVATE_MARKERS.buyerSecretHex);
    expect(json).not.toContain(PRIVATE_MARKERS.lenderSecretHex);
    expect(json).not.toContain(PRIVATE_MARKERS.claimSecretHex);
  });

  it('per-invoice ledger lines expose only public fields (no private keys in objects)', () => {
    const source = {
      invoices: [inv({ nullifier: 'a', invoiceAmount: 10_000n, lender: LENDER_PSEUDONYM, amount: 5000n })],
      insuranceClaims: [],
      insurancePool: null,
      payoutCommitments: [],
    };
    const report = generateAuditReport(source);
    const keys = Object.keys(report.invoices[0]);
    expect(keys.sort()).toEqual(
      [
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
      ].sort(),
    );
    // The exported line must not carry any private-bearing field.
    expect(keys.join(',')).not.toMatch(/credit|reputation|contribution|secret/i);
  });
});
