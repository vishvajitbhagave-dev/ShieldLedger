import { describe, it, expect } from 'vitest';
import {
  generateAuditReport,
  serializeAuditReport,
  generateInvoicesCsv,
  statusOfInvoice,
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
    const parsed = JSON.parse(json) as unknown;

    // Walk the parsed structure and collect every scalar VALUE. Assert the
    // private marker values never occur as an exact value anywhere — rather than
    // raw-substring matching on the JSON text, which falsely trips whenever an
    // unrelated field (e.g. the generatedAt timestamp) merely contains the
    // marker's digits as a substring.
    const values = new Set<string>();
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(visit);
      } else if (node !== null && typeof node === 'object') {
        for (const v of Object.values(node)) visit(v);
      } else if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
        values.add(String(node));
      }
    };
    visit(parsed);

    const markerValues = [
      String(PRIVATE_MARKERS.smeCreditScore),
      String(PRIVATE_MARKERS.lenderCreditScore),
      String(PRIVATE_MARKERS.smeReputationScore),
      String(PRIVATE_MARKERS.contribution),
      PRIVATE_MARKERS.buyerSecretHex,
      PRIVATE_MARKERS.lenderSecretHex,
      PRIVATE_MARKERS.claimSecretHex,
    ];
    const present = markerValues.filter((m) => values.has(m));
    expect(present).toEqual([]);
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

describe('invoices CSV — accounting export', () => {
  const CSV_HEADER =
    'nullifier,smeCommitment,buyerVerified,invoiceAmount,lender,amount,dueDate,rateBps,splitCount,transferred,status';

  it('emits the exact header row and nothing else for an empty ledger', () => {
    const csv = generateInvoicesCsv({ invoices: [] });
    expect(csv).toBe(CSV_HEADER);
    expect(csv.split('\n')).toHaveLength(1);
  });

  it('writes one row per invoice and derives status from public fields only', () => {
    const source = {
      invoices: [
        inv({ nullifier: 'a', invoiceAmount: 10_000n, lender: LENDER_PSEUDONYM, amount: 5000n, buyerVerified: true }),
        inv({ nullifier: 'b', invoiceAmount: 20_000n }),
        inv({ nullifier: 'c', invoiceAmount: 5000n, lender: LENDER_PSEUDONYM, amount: 2500n, transferred: true }),
      ],
      insuranceClaims: [],
      insurancePool: null,
      payoutCommitments: [],
    };
    const csv = generateInvoicesCsv(source);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(4); // header + 3 invoices
    expect(lines[0]).toBe(CSV_HEADER);

    // Financed (lender set, not transferred).
    expect(lines[1]).toBe('a,,true,10000,0x9f8e7d,5000,0,0,0,false,financed');
    // Still bidding (no lender yet).
    expect(lines[2]).toBe('b,,false,20000,,0,0,0,0,false,bidding');
    // Transferred wins over financed.
    expect(lines[3]).toBe('c,,false,5000,0x9f8e7d,2500,0,0,0,true,transferred');
  });

  it('statusOfInvoice follows the transferred > financed > bidding rule', () => {
    expect(statusOfInvoice({ lender: null, transferred: false })).toBe('bidding');
    expect(statusOfInvoice({ lender: '0x1', transferred: false })).toBe('financed');
    expect(statusOfInvoice({ lender: '0x1', transferred: true })).toBe('transferred');
    expect(statusOfInvoice({ lender: null, transferred: true })).toBe('transferred');
  });

  it('escapes commas and double quotes in cell values', () => {
    const source = {
      invoices: [
        inv({ nullifier: 'a', lender: 'Bob, "The" Lender' }),
      ],
      insuranceClaims: [],
      insurancePool: null,
      payoutCommitments: [],
    };
    const csv = generateInvoicesCsv(source);
    const row = csv.split('\n')[1];
    // The lender cell must be quoted (it contains a comma) with quotes doubled.
    expect(row).toBe('a,,false,1000,"Bob, ""The"" Lender",0,0,0,0,false,financed');
    expect(csv).not.toContain('Bob, "The" Lender,0'); // never appears unquoted
  });

  it('neutralises spreadsheet formula injection in cells', () => {
    const source = {
      invoices: [
        inv({ nullifier: '-2+3', lender: '=HYPERLINK("http://evil")', smeCommitment: '@SUM(1,2)' }),
      ],
      insuranceClaims: [],
      insurancePool: null,
      payoutCommitments: [],
    };
    const csv = generateInvoicesCsv(source);
    // Neutralised cells must not begin a formula: a leading `'` turns them into text.
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain("'@SUM(");
    // A cell value that starts with =, +, -, @ or tab must never appear unquoted/prefixed.
    for (const marker of ['=HYPERLINK', '-2+3', '@SUM']) {
      const atCellStart = csv.split('\n').slice(1).some((line) =>
        line.split(',').some((cell) => cell.startsWith(marker)),
      );
      expect(atCellStart).toBe(false);
    }
  });

  it('never serialises private-field names or sealed-bid / non-invoice data', () => {
    const source = {
      invoices: [inv({ nullifier: 'a', invoiceAmount: 10_000n, lender: LENDER_PSEUDONYM })],
      // Non-invoice public data must stay out of the invoices CSV.
      insuranceClaims: [{ nullifier: 'zzz', payout: 424_242_424n, claimedAt: 42n }],
      insurancePool: { balance: 777n },
      payoutCommitments: [{ slotKey: 's0', hash: '0xsecretlooking' }],
    };
    const csv = generateInvoicesCsv(source);

    expect(csv).not.toContain('424242424');
    expect(csv).not.toContain('777');
    expect(csv).not.toContain('0xsecretlooking');
    expect(csv).not.toContain('zzz');

    for (const forbidden of [
      'creditScore',
      'smeCreditScore',
      'lenderCreditScore',
      'reputationScore',
      'contribution',
      'buyerSecret',
      'claimSecret',
      'lenderSecret',
      'secret',
    ]) {
      expect(csv).not.toContain(forbidden);
    }

    // Header exposes only the 10 public fields + the derived status column.
    expect(csv.split('\n')[0]).toBe(CSV_HEADER);
  });
});
