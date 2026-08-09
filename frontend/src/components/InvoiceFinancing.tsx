import React, { useState } from 'react';
import { useShieldLedger } from '../context.js';

type FormState = {
  registerNullifier: string;
  bidNullifier: string;
  bidAmount: string;
  bidDue: string;
  settleNullifier: string;
  settleLender: string;
  settleAmount: string;
  settleDue: string;
};

const initialForm: FormState = {
  registerNullifier: '',
  bidNullifier: '',
  bidAmount: '',
  bidDue: '',
  settleNullifier: '',
  settleLender: '',
  settleAmount: '',
  settleDue: '',
};

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

export const InvoiceFinancing: React.FC = () => {
  const { deployment, connected } = useShieldLedger();
  const api = deployment.status === 'deployed' ? deployment.api : null;
  const busy = deployment.status === 'in-progress' || !connected || api === null;

  const [form, setForm] = useState<FormState>(initialForm);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const run = async (label: string, op: () => Promise<void>) => {
    if (!api) return;
    setMessage(null);
    try {
      await op();
      setMessage({ ok: true, text: `${label} succeeded` });
    } catch (e) {
      setMessage({ ok: false, text: `${label} failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  return (
    <div className="sl-panel">
      <h2>Invoice financing</h2>
      <p className="sl-meta">
        All three operations run the contract circuit locally, prove it in zero knowledge, then balance and sign the
        transaction with your wallet. Private inputs never appear in this UI.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!api) return;
          const a = api;
          void run('registerInvoice', () => a.registerInvoice(form.registerNullifier));
        }}
      >
        <h3 style={{ fontSize: 14, margin: '14px 0 8px', color: '#93b4e4' }}>1 · Register invoice (SME)</h3>
        <Field label="Nullifier" value={form.registerNullifier} placeholder="64 hex chars" onChange={set('registerNullifier')} disabled={busy} />
        <button className="sl-button" type="submit" disabled={busy || form.registerNullifier.trim().length === 0}>
          Register
        </button>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!api) return;
          const a = api;
          void run('submitBid', () => a.submitBid(form.bidNullifier, BigInt(form.bidAmount.trim()), BigInt(form.bidDue.trim())));
        }}
      >
        <h3 style={{ fontSize: 14, margin: '18px 0 8px', color: '#93b4e4' }}>2 · Submit bid (Lender)</h3>
        <Field label="Nullifier" value={form.bidNullifier} placeholder="64 hex chars" onChange={set('bidNullifier')} disabled={busy} />
        <Field label="Amount" value={form.bidAmount} placeholder="tNight units" onChange={set('bidAmount')} disabled={busy} />
        <Field label="Due date" value={form.bidDue} placeholder="unix seconds" onChange={set('bidDue')} disabled={busy} />
        <button
          className="sl-button"
          type="submit"
          disabled={busy || form.bidNullifier.trim().length === 0 || form.bidAmount.trim().length === 0 || form.bidDue.trim().length === 0}
        >
          Submit bid
        </button>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!api) return;
          const a = api;
          void run('settleInvoice', () =>
            a.settleInvoice(form.settleNullifier, form.settleLender, BigInt(form.settleAmount.trim()), BigInt(form.settleDue.trim())),
          );
        }}
      >
        <h3 style={{ fontSize: 14, margin: '18px 0 8px', color: '#93b4e4' }}>3 · Settle invoice (SME)</h3>
        <Field label="Nullifier" value={form.settleNullifier} placeholder="64 hex chars" onChange={set('settleNullifier')} disabled={busy} />
        <Field label="Lender" value={form.settleLender} placeholder="winning lender pseudonym (64 hex)" onChange={set('settleLender')} disabled={busy} />
        <Field label="Amount" value={form.settleAmount} placeholder="tNight units" onChange={set('settleAmount')} disabled={busy} />
        <Field label="Due date" value={form.settleDue} placeholder="unix seconds" onChange={set('settleDue')} disabled={busy} />
        <button
          className="sl-button"
          type="submit"
          disabled={
            busy ||
            form.settleNullifier.trim().length === 0 ||
            form.settleLender.trim().length === 0 ||
            form.settleAmount.trim().length === 0 ||
            form.settleDue.trim().length === 0
          }
        >
          Settle
        </button>
      </form>

      {message && (
        <div className={message.ok ? 'sl-success' : 'sl-error'} style={{ marginBottom: 0 }}>
          {message.text}
        </div>
      )}
    </div>
  );
};
