import React, { useState } from 'react';
import { useShieldLedger, type Role } from '../context.js';
import {
  loadRegisteredInvoices,
  registerInvoiceLocally,
  type RegisteredInvoice,
} from '../invoice-registry.js';
import { useLedgerState } from '../use-ledger-state.js';

type FormState = {
  registerReference: string;
  registerAmount: string;
  registerDue: string;
  bidNullifier: string;
  bidAmount: string;
  bidDue: string;
  bidRate: string;
  revealNullifier: string;
  revealAmount: string;
  revealDue: string;
  revealRate: string;
  settleNullifier: string;
  settleAmount: string;
  settleDue: string;
};

const initialForm: FormState = {
  registerReference: '',
  registerAmount: '',
  registerDue: '',
  bidNullifier: '',
  bidAmount: '',
  bidDue: '',
  bidRate: '',
  revealNullifier: '',
  revealAmount: '',
  revealDue: '',
  revealRate: '',
  settleNullifier: '',
  settleAmount: '',
  settleDue: '',
};

const SAMPLE_REFERENCE = 'Sample invoice';
const SAMPLE_NULLIFIER = 'aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66';
const SAMPLE_AMOUNT = '1000';
const SAMPLE_DUE = '4102444800';
const SAMPLE_RATE = '400';

const sampleForm: FormState = {
  registerReference: SAMPLE_REFERENCE,
  registerAmount: SAMPLE_AMOUNT,
  registerDue: SAMPLE_DUE,
  bidNullifier: SAMPLE_NULLIFIER,
  bidAmount: SAMPLE_AMOUNT,
  bidDue: SAMPLE_DUE,
  bidRate: SAMPLE_RATE,
  revealNullifier: SAMPLE_NULLIFIER,
  revealAmount: SAMPLE_AMOUNT,
  revealDue: SAMPLE_DUE,
  revealRate: SAMPLE_RATE,
  settleNullifier: SAMPLE_NULLIFIER,
  settleAmount: SAMPLE_AMOUNT,
  settleDue: SAMPLE_DUE,
};

const isDigits = (s: string): boolean => /^\d+$/.test(s.trim());

const short = (hex: string): string => (hex.length > 16 ? `${hex.slice(0, 10)}…${hex.slice(-6)}` : hex);

const formatDate = (unixSeconds: bigint): string => {
  if (unixSeconds <= 0n) return '—';
  return new Date(Number(unixSeconds) * 1000).toLocaleString();
};

const sectionHeading = (text: string, margin = '18px'): React.CSSProperties => ({
  fontSize: 14,
  margin: `${margin} 0 8px`,
  color: '#93b4e4',
});

const Field: React.FC<{ label: string; value: string; placeholder?: string; onChange: (v: string) => void; disabled?: boolean }> = ({
  label,
  value,
  placeholder,
  onChange,
  disabled,
}) => (
  <div className="sl-row">
    <label className="sl-meta" style={{ minWidth: 90 }}>
      {label}
    </label>
    <input
      className="sl-input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  </div>
);

const InvoicePicker: React.FC<{
  invoices: RegisteredInvoice[];
  disabled?: boolean;
  onPick: (inv: RegisteredInvoice) => void;
}> = ({ invoices, disabled, onPick }) => (
  <div className="sl-row">
    <label className="sl-meta" style={{ minWidth: 90 }}>
      Your invoice
    </label>
    <select
      className="sl-input"
      value=""
      disabled={disabled}
      onChange={(e) => {
        const inv = invoices.find((i) => i.nullifier === e.target.value);
        if (inv) onPick(inv);
      }}
    >
      <option value="" disabled>
        {invoices.length > 0 ? 'Pick a registered invoice…' : 'No invoices registered in this browser'}
      </option>
      {invoices.map((inv) => (
        <option key={inv.nullifier} value={inv.nullifier}>
          {inv.reference || '(no reference)'} · {inv.amount} tNight · {inv.nullifier.slice(0, 10)}…
        </option>
      ))}
    </select>
  </div>
);

const RoleTabs: React.FC<{ role: Role; disabled?: boolean; onChange: (role: Role) => void }> = ({
  role,
  disabled,
  onChange,
}) => (
  <div className="sl-tabs">
    <button
      className={role === 'sme' ? 'sl-tab sl-tab-active' : 'sl-tab'}
      type="button"
      onClick={() => onChange('sme')}
      disabled={disabled}
    >
      I'm an SME · sell invoices
    </button>
    <button
      className={role === 'lender' ? 'sl-tab sl-tab-active' : 'sl-tab'}
      type="button"
      onClick={() => onChange('lender')}
      disabled={disabled}
    >
      I'm a Lender · bid on invoices
    </button>
  </div>
);

export const InvoiceFinancing: React.FC = () => {
  const { deployment, connected, role, setRole } = useShieldLedger();
  const api = deployment.status === 'deployed' ? deployment.api : null;
  const busy = deployment.status === 'in-progress' || !connected || api === null;

  const { state: ledgerState } = useLedgerState();

  const [form, setForm] = useState<FormState>(initialForm);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [invoices, setInvoices] = useState<RegisteredInvoice[]>(() => loadRegisteredInvoices());

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const pick = (kind: 'bid' | 'reveal' | 'settle') => (inv: RegisteredInvoice) => {
    setForm((f) => {
      const prefix = kind === 'bid' ? 'bid' : kind === 'reveal' ? 'reveal' : 'settle';
      return { ...f, [`${prefix}Nullifier`]: inv.nullifier, [`${prefix}Amount`]: inv.amount, [`${prefix}Due`]: inv.dueDate } as FormState;
    });
  };

  const run = async (label: string, op: () => Promise<void>) => {
    if (!api) return;
    setMessage(null);
    setWorking(true);
    try {
      await op();
      setMessage({ ok: true, text: `${label} succeeded` });
    } catch (e) {
      setMessage({ ok: false, text: `${label} failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setWorking(false);
    }
  };

  const openInvoices = ledgerState?.invoices.filter((inv) => !inv.lender) ?? [];

  const statusOf = (inv: RegisteredInvoice): string => {
    const onLedger = ledgerState?.invoices.find((i) => i.nullifier === inv.nullifier);
    if (!onLedger) return 'Registered';
    return onLedger.lender ? 'Settled' : 'Bidding';
  };

  return (
    <div className="sl-panel">
      <h2>Invoice financing</h2>
      <p className="sl-meta">
        A sealed-bid auction: lenders post only a <em>commitment</em> to their terms, so no lender can see any other
        bid. Whoever reveals the lowest interest rate wins — the contract enforces it, the SME cannot play favorites.
      </p>
      <div className="sl-row">
        <button className="sl-button sl-button-secondary" type="button" onClick={() => setForm(sampleForm)} disabled={busy || working}>
          Use sample values
        </button>
        <span className="sl-meta">Fills the forms with sample values.</span>
      </div>

      <RoleTabs role={role} disabled={busy || working} onChange={setRole} />

      {role === 'sme' ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!api) return;
              const a = api;
              const reference = form.registerReference.trim();
              const amount = BigInt(form.registerAmount.trim());
              const dueDate = BigInt(form.registerDue.trim());
              void run('registerInvoice', async () => {
                const record = await registerInvoiceLocally({ reference, amount, dueDate });
                setInvoices(loadRegisteredInvoices());
                await a.registerInvoice(record.nullifier);
              });
            }}
          >
            <h3 style={sectionHeading('1 · Register an invoice', '14px')}>1 · Register an invoice</h3>
            <Field label="Reference" value={form.registerReference} placeholder="optional, private — e.g. INV-001" onChange={set('registerReference')} disabled={busy || working} />
            <Field label="Amount" value={form.registerAmount} placeholder="tNight units" onChange={set('registerAmount')} disabled={busy || working} />
            <Field label="Due date" value={form.registerDue} placeholder="unix seconds" onChange={set('registerDue')} disabled={busy || working} />
            <p className="sl-meta" style={{ marginBottom: 0 }}>
              Only a <em>nullifier</em> — a blinded hash of these details plus a random secret — is posted on-chain.
              The invoice details never leave this browser; the nullifier is saved locally so you can reuse it later.
            </p>
            <button
              className="sl-button"
              type="submit"
              disabled={busy || working || !isDigits(form.registerAmount) || !isDigits(form.registerDue)}
            >
              {working ? 'Working…' : 'Register invoice'}
            </button>
          </form>

          <h3 style={sectionHeading('2 · Your invoices')}>2 · Your invoices</h3>
          {invoices.length === 0 ? (
            <p className="sl-empty">No invoices registered in this browser yet.</p>
          ) : (
            <table className="sl-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Nullifier</th>
                  <th>Amount</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.nullifier}>
                    <td>{inv.reference || '—'}</td>
                    <td className="sl-mono">{short(inv.nullifier)}</td>
                    <td>{inv.amount} tNight</td>
                    <td>{formatDate(BigInt(inv.dueDate))}</td>
                    <td>{statusOf(inv)}</td>
                    <td>
                      {statusOf(inv) === 'Bidding' && (
                        <button
                          className="sl-button sl-button-secondary"
                          type="button"
                          disabled={busy || working}
                          onClick={() => {
                            setForm((f) => ({
                              ...f,
                              settleNullifier: inv.nullifier,
                              settleAmount: inv.amount,
                              settleDue: inv.dueDate,
                            }));
                          }}
                        >
                          Settle ↓
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!api) return;
              const a = api;
              void run('settleInvoice', () =>
                a.settleInvoice(form.settleNullifier, BigInt(form.settleAmount.trim()), BigInt(form.settleDue.trim())),
              );
            }}
          >
            <h3 style={sectionHeading('3 · Settle invoice')}>3 · Settle invoice</h3>
            <InvoicePicker invoices={invoices} disabled={busy || working} onPick={pick('settle')} />
            <Field label="Nullifier" value={form.settleNullifier} placeholder="64 hex chars" onChange={set('settleNullifier')} disabled={busy || working} />
            <Field label="Amount" value={form.settleAmount} placeholder="financed amount (≤ winning bid)" onChange={set('settleAmount')} disabled={busy || working} />
            <Field label="Due date" value={form.settleDue} placeholder="unix seconds" onChange={set('settleDue')} disabled={busy || working} />
            <p className="sl-meta" style={{ marginBottom: 0 }}>
              The contract pays the lowest-rate winner automatically — you cannot pick a different lender. You can
              settle as soon as a lender has revealed a winning bid.
            </p>
            <button
              className="sl-button"
              type="submit"
              disabled={busy || working || form.settleNullifier.trim().length === 0 || form.settleAmount.trim().length === 0 || form.settleDue.trim().length === 0}
            >
              {working ? 'Working…' : 'Settle'}
            </button>
          </form>
        </>
      ) : (
        <>
          <h3 style={sectionHeading('1 · Open invoices', '14px')}>1 · Open invoices available for financing</h3>
          {openInvoices.length === 0 ? (
            <p className="sl-empty">No invoices are currently open for bidding.</p>
          ) : (
            <table className="sl-table">
              <thead>
                <tr>
                  <th>Invoice (nullifier)</th>
                  <th>Commitment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {openInvoices.map((inv) => (
                  <tr key={inv.nullifier}>
                    <td className="sl-mono">{short(inv.nullifier)}</td>
                    <td className="sl-mono">{short(inv.smeCommitment)}</td>
                    <td>
                      <button
                        className="sl-button sl-button-secondary"
                        type="button"
                        disabled={busy || working}
                        onClick={() => setForm((f) => ({ ...f, bidNullifier: inv.nullifier }))}
                      >
                        Bid on this ↓
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!api) return;
              const a = api;
              void run('submitBid', () =>
                a.submitBid(form.bidNullifier, BigInt(form.bidAmount.trim()), BigInt(form.bidDue.trim()), BigInt(form.bidRate.trim())),
              );
            }}
          >
            <h3 style={sectionHeading('2 · Submit sealed bid')}>2 · Submit sealed bid</h3>
            <InvoicePicker invoices={invoices} disabled={busy || working} onPick={pick('bid')} />
            <Field label="Nullifier" value={form.bidNullifier} placeholder="64 hex chars" onChange={set('bidNullifier')} disabled={busy || working} />
            <Field label="Amount" value={form.bidAmount} placeholder="tNight units" onChange={set('bidAmount')} disabled={busy || working} />
            <Field label="Due date" value={form.bidDue} placeholder="unix seconds" onChange={set('bidDue')} disabled={busy || working} />
            <Field label="Rate" value={form.bidRate} placeholder="basis points, e.g. 400 = 4%" onChange={set('bidRate')} disabled={busy || working} />
            <p className="sl-meta" style={{ marginBottom: 0 }}>
              Your bid is sealed on-chain — other lenders only see a commitment.
            </p>
            <button
              className="sl-button"
              type="submit"
              disabled={busy || working || form.bidNullifier.trim().length === 0 || form.bidAmount.trim().length === 0 || form.bidDue.trim().length === 0 || form.bidRate.trim().length === 0}
            >
              {working ? 'Working…' : 'Submit sealed bid'}
            </button>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!api) return;
              const a = api;
              void run('revealBid', () =>
                a.revealBid(form.revealNullifier, BigInt(form.revealAmount.trim()), BigInt(form.revealDue.trim()), BigInt(form.revealRate.trim())),
              );
            }}
          >
            <h3 style={sectionHeading('3 · Reveal your bid')}>3 · Reveal your bid</h3>
            <InvoicePicker invoices={invoices} disabled={busy || working} onPick={pick('reveal')} />
            <Field label="Nullifier" value={form.revealNullifier} placeholder="64 hex chars" onChange={set('revealNullifier')} disabled={busy || working} />
            <Field label="Amount" value={form.revealAmount} placeholder="must match your sealed bid" onChange={set('revealAmount')} disabled={busy || working} />
            <Field label="Due date" value={form.revealDue} placeholder="must match your sealed bid" onChange={set('revealDue')} disabled={busy || working} />
            <Field label="Rate" value={form.revealRate} placeholder="must match your sealed bid" onChange={set('revealRate')} disabled={busy || working} />
            <p className="sl-meta" style={{ marginBottom: 0 }}>
              The contract verifies these terms against your commitment and, if they beat the running best, you take
              the lead. The lowest rate wins.
            </p>
            <button
              className="sl-button"
              type="submit"
              disabled={busy || working || form.revealNullifier.trim().length === 0 || form.revealAmount.trim().length === 0 || form.revealDue.trim().length === 0 || form.revealRate.trim().length === 0}
            >
              {working ? 'Working…' : 'Reveal bid'}
            </button>
          </form>
        </>
      )}

      {working && (
        <div className="sl-meta" style={{ marginBottom: 0 }}>
          Working… (proof generation can take 30–60s) — when ready, approve in Lace.
        </div>
      )}

      {message && (
        <div className={message.ok ? 'sl-success' : 'sl-error'} style={{ marginBottom: 0 }}>
          {message.text}
        </div>
      )}
    </div>
  );
};
