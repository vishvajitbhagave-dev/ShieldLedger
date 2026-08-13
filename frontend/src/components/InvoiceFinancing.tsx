import React, { useState } from 'react';
import { useShieldLedger, type Role } from '../context.js';
import {
  loadRegisteredInvoices,
  registerInvoiceLocally,
  type RegisteredInvoice,
} from '../invoice-registry.js';
import { useLedgerState } from '../use-ledger-state.js';
import { invoiceStatusOf, isAuctionResolved, isOpenInvoice } from '../invoice-status.js';
import type { InvoiceView } from '../shield-ledger-types.js';
import type { ReputationView } from '../../../src/reputation.js';
import { userFacingFailureMessage } from '../lib/errorMessages.js';
import { HexBadge } from './HexBadge.js';

type FormState = {
  registerReference: string;
  registerAmount: string;
  registerDue: string;
  registerThreshold: string;
  registerReputation: string;
  confirmNullifier: string;
  confirmAmount: string;
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
  registerThreshold: '650',
  registerReputation: '0',
  confirmNullifier: '',
  confirmAmount: '',
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
  registerThreshold: '650',
  registerReputation: '0',
  confirmNullifier: SAMPLE_NULLIFIER,
  confirmAmount: SAMPLE_AMOUNT,
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

const formatDate = (unixSeconds: bigint): string => {
  if (unixSeconds <= 0n) return '—';
  return new Date(Number(unixSeconds) * 1000).toLocaleString();
};

const sectionHeading = 'sl-section-title';

const Field: React.FC<{ label: string; value: string; placeholder?: string; onChange: (v: string) => void; disabled?: boolean }> = ({
  label,
  value,
  placeholder,
  onChange,
  disabled,
}) => (
  <div className="sl-field">
    <label className="sl-field-label">{label}</label>
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
  <div className="sl-field">
    <label className="sl-field-label">Your invoice</label>
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
      className={role === 'buyer' ? 'sl-tab sl-tab-active' : 'sl-tab'}
      type="button"
      onClick={() => onChange('buyer')}
      disabled={disabled}
    >
      I'm a Buyer · confirm invoices
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

const BuyerVerifiedBadge: React.FC = () => (
  <span className="sl-badge" title="The corporate buyer proved in zero knowledge that this invoice is genuine and that it owes the claimed amount.">
    Buyer-verified ✓
  </span>
);

export const InvoiceFinancing: React.FC = () => {
  const { deployment, connected, role, setRole } = useShieldLedger();
  const api = deployment.status === 'deployed' ? deployment.api : null;
  const busy = deployment.status === 'in-progress' || !connected || api === null;

  const { state: ledgerState } = useLedgerState();

  const [form, setForm] = useState<FormState>(initialForm);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<RegisteredInvoice[]>(() => loadRegisteredInvoices());
  const [reputation, setReputation] = useState<ReputationView | null>(null);

  // Sub-tabs navigation state per role
  const [smeTab, setSmeTab] = useState<'register' | 'track' | 'settle'>('register');
  const [buyerTab, setBuyerTab] = useState<'pending' | 'confirm' | 'confirmed'>('pending');
  const [lenderTab, setLenderTab] = useState<'browse' | 'bid' | 'reveal'>('browse');

  const refreshReputation = async () => {
    if (!api) return;
    try {
      setReputation(await api.getReputation());
    } catch {
      setReputation(null);
    }
  };

  React.useEffect(() => {
    if (deployment.status === 'deployed') void refreshReputation();
  }, [deployment.status, connected]);

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const pick = (kind: 'bid' | 'reveal' | 'settle') => (inv: RegisteredInvoice) => {
    setForm((f) => {
      const prefix = kind === 'bid' ? 'bid' : kind === 'reveal' ? 'reveal' : 'settle';
      return { ...f, [`${prefix}Nullifier`]: inv.nullifier, [`${prefix}Amount`]: inv.amount, [`${prefix}Due`]: inv.dueDate } as FormState;
    });
  };

  const pickForConfirm = (inv: InvoiceView) => {
    setForm((f) => ({ ...f, confirmNullifier: inv.nullifier, confirmAmount: inv.invoiceAmount.toString() }));
  };

  const run = async (label: string, op: () => Promise<void>) => {
    if (!api) return;
    setMessage(null);
    setWorking(label);
    try {
      await op();
      setMessage({ ok: true, text: `${label} succeeded` });
    } catch (e) {
      console.error(`${label} failed:`, e);
      setMessage({ ok: false, text: userFacingFailureMessage(label, e) });
    } finally {
      setWorking(null);
    }
  };

  const openInvoices = (ledgerState?.invoices ?? []).filter(isOpenInvoice);
  const stateBuyerVerified = (ledgerState?.invoices ?? []).filter((inv) => inv.buyerVerified);

  const statusOf = (inv: RegisteredInvoice): string => invoiceStatusOf(inv, ledgerState?.invoices ?? []);

  const bestBids = ledgerState?.bestBids ?? [];
  const resolved = (nullifier: string): boolean => isAuctionResolved(nullifier, bestBids);

  const settleNullifier = form.settleNullifier.trim();
  const settleReady = settleNullifier !== '' && resolved(settleNullifier);

  // Stepper steps configuration
  const smeSteps = [
    { key: 'register', label: 'Register' },
    { key: 'verify', label: 'Await Confirmation' },
    { key: 'bid', label: 'Await Bids' },
    { key: 'settle', label: 'Settle' },
  ];

  let activeSmeStep = 'register';
  if (smeTab === 'settle') {
    activeSmeStep = 'settle';
  } else if (smeTab === 'track') {
    const hasBidding = invoices.some((i) => statusOf(i) === 'Bidding');
    activeSmeStep = hasBidding ? 'bid' : 'verify';
  }

  const buyerSteps = [
    { key: 'pending', label: 'Pending Invoices' },
    { key: 'confirm', label: 'Confirm Invoice' },
    { key: 'confirmed', label: 'Buyer-verified' },
  ];

  let activeBuyerStep = 'pending';
  if (buyerTab === 'confirm') activeBuyerStep = 'confirm';
  else if (buyerTab === 'confirmed') activeBuyerStep = 'confirmed';

  const lenderSteps = [
    { key: 'browse', label: 'Browse Invoices' },
    { key: 'bid', label: 'Submit Sealed Bid' },
    { key: 'reveal', label: 'Reveal Bid' },
  ];

  let activeLenderStep = 'browse';
  if (lenderTab === 'bid') activeLenderStep = 'bid';
  else if (lenderTab === 'reveal') activeLenderStep = 'reveal';

  return (
    <div className="sl-panel">
      <h2>Invoice financing</h2>
      <p className="sl-meta">
        A sealed-bid auction: lenders post only a <em>commitment</em> to their terms, so no lender can see any other
        bid. Whoever reveals the lowest interest rate wins — the contract enforces it, the SME cannot play favorites.
      </p>
      <div className="sl-row" style={{ marginBottom: 'var(--sp-5)' }}>
        <button className="sl-button sl-button-secondary" type="button" onClick={() => setForm(sampleForm)} disabled={busy || working !== null}>
          Use sample values
        </button>
        <span className="sl-meta">Fills the forms with sample values.</span>
      </div>

      <RoleTabs role={role} disabled={busy || working !== null} onChange={setRole} />

      {/* SME Workflow */}
      {role === 'sme' && (
        <>
          {/* Stepper Progress Indicator */}
          <div className="sl-stepper">
            <div className="sl-stepper-track" />
            {smeSteps.map((step, idx) => {
              const isCompleted =
                (step.key === 'register' && invoices.length > 0) ||
                (step.key === 'verify' && invoices.some((i) => statusOf(i) !== 'Unconfirmed')) ||
                (step.key === 'bid' && invoices.some((i) => resolved(i.nullifier)));
              const isActive = activeSmeStep === step.key;
              return (
                <div key={step.key} className={`sl-stepper-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                  <div className="sl-stepper-node">{idx + 1}</div>
                  <div className="sl-stepper-label">{step.label}</div>
                </div>
              );
            })}
          </div>

          {/* Sub Navigation Tabs */}
          <div className="sl-sub-tabs">
            <button
              type="button"
              className={`sl-sub-tab ${smeTab === 'register' ? 'active' : ''}`}
              onClick={() => setSmeTab('register')}
              disabled={busy || working !== null}
            >
              Register Invoice
            </button>
            <button
              type="button"
              className={`sl-sub-tab ${smeTab === 'track' ? 'active' : ''}`}
              onClick={() => setSmeTab('track')}
              disabled={busy || working !== null}
            >
              Track Invoices ({invoices.length})
            </button>
            <button
              type="button"
              className={`sl-sub-tab ${smeTab === 'settle' ? 'active' : ''}`}
              onClick={() => setSmeTab('settle')}
              disabled={busy || working !== null}
            >
              Settle Invoice {settleNullifier && `(${settleNullifier.slice(0, 8)}…)`}
            </button>
          </div>

          {/* Sme Tab Content */}
          {smeTab === 'register' && (
            <>
              <form
                className="sl-stage"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!api) return;
                  const a = api;
                  const reference = form.registerReference.trim();
                  const amount = BigInt(form.registerAmount.trim());
                  const dueDate = BigInt(form.registerDue.trim());
                  const creditThreshold = BigInt(form.registerThreshold.trim());
                  const reputationThreshold = BigInt(form.registerReputation.trim());
                  void run('registerInvoice', async () => {
                    const record = await registerInvoiceLocally({ reference, amount, dueDate });
                    setInvoices(loadRegisteredInvoices());
                    await a.registerInvoice(record.nullifier, creditThreshold, amount, reputationThreshold);
                    await refreshReputation();
                    setSmeTab('track');
                  });
                }}
              >
                <h3 className={sectionHeading}>1 · Register an invoice</h3>
                <Field label="Reference" value={form.registerReference} placeholder="optional, private — e.g. INV-001" onChange={set('registerReference')} disabled={busy || working !== null} />
                <Field label="Amount" value={form.registerAmount} placeholder="tNight units" onChange={set('registerAmount')} disabled={busy || working !== null} />
                <Field label="Due date" value={form.registerDue} placeholder="unix seconds" onChange={set('registerDue')} disabled={busy || working !== null} />
                <Field label="Credit check" value={form.registerThreshold} placeholder="e.g. 650 — your score stays private" onChange={set('registerThreshold')} disabled={busy || working !== null} />
                <Field label="Reputation check" value={form.registerReputation} placeholder="e.g. 30 — proven in zero knowledge" onChange={set('registerReputation')} disabled={busy || working !== null} />
                <p className="sl-note">
                  Only a <em>nullifier</em> — a blinded hash of these details plus a random secret — is posted on-chain.
                  The invoice details never leave this browser; the nullifier is saved locally so you can reuse it later.
                  The <em>credit check</em> proves "my credit score is at least {form.registerThreshold.trim() || '…'}" in zero
                  knowledge — the score itself is never revealed, only the proven bound. The <em>reputation check</em>
                  proves "my reputation is at least {form.registerReputation.trim() || '…'}" (set 0 for no requirement) — the
                  current score is read from your private wallet state and never disclosed. The <em>claimed amount</em> is
                  posted publicly so your corporate buyer can later vouch for it in zero knowledge; your reference, due
                  date and secret stay private.
                </p>
                <button
                  className="sl-button"
                  type="submit"
                  disabled={
                    busy ||
                    working !== null ||
                    !isDigits(form.registerAmount) ||
                    !isDigits(form.registerDue) ||
                    !isDigits(form.registerThreshold) ||
                    !isDigits(form.registerReputation) ||
                    BigInt(form.registerThreshold.trim() || '0') < 650n
                  }
                >
                  {working === 'registerInvoice' ? 'Working…' : 'Register invoice'}
                </button>
              </form>

              <section className="sl-stage">
                <h3 className={sectionHeading}>2 · Your private reputation</h3>
                <p className="sl-note">
                  Stored only in this browser session. Settling <em>on or before</em> the due date earns you{' '}
                  <strong>+10</strong>; a late settlement costs <strong>−20</strong> (clamped to 0–100). Every
                  registration proves "score ≥ threshold" in zero knowledge, so lenders are bound to what you really
                  have — without ever seeing the score.
                </p>
                {reputation === null ? (
                  <p className="sl-empty">No private reputation available in this browser session.</p>
                ) : (
                  <table className="sl-table">
                    <thead>
                      <tr>
                        <th>Score</th>
                        <th>On-time settlements</th>
                        <th>Late settlements</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <span className={reputation.score >= 50n ? 'sl-badge' : 'sl-badge sl-badge-warn'}>
                            {reputation.score.toString()} / 100
                          </span>
                        </td>
                        <td>{reputation.onTimeCount.toString()}</td>
                        <td>{reputation.lateCount.toString()}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}

          {smeTab === 'track' && (
            <section className="sl-stage">
              <h3 className={sectionHeading}>Your invoices</h3>
              {invoices.length === 0 ? (
                <p className="sl-empty">No invoices registered in this browser yet.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
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
                          <td><HexBadge hex={inv.nullifier} /></td>
                          <td style={{ fontWeight: 'bold' }}>{inv.amount} tNight</td>
                          <td>{formatDate(BigInt(inv.dueDate))}</td>
                          <td>
                            <span className={`sl-badge ${statusOf(inv) === 'Financed' ? '' : 'sl-badge-warn'}`}>
                              {statusOf(inv)}
                            </span>
                          </td>
                          <td>
                            {statusOf(inv) === 'Bidding' &&
                              (resolved(inv.nullifier) ? (
                                <button
                                  className="sl-button sl-button-secondary"
                                  type="button"
                                  disabled={busy || working !== null}
                                  onClick={() => {
                                    setForm((f) => ({
                                      ...f,
                                      settleNullifier: inv.nullifier,
                                      settleAmount: inv.amount,
                                      settleDue: inv.dueDate,
                                    }));
                                    setSmeTab('settle');
                                  }}
                                >
                                  Settle ↓
                                </button>
                              ) : (
                                <span className="sl-meta">awaiting winning bid</span>
                              ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {smeTab === 'settle' && (
            <form
              className="sl-stage"
              onSubmit={(e) => {
                e.preventDefault();
                if (!api) return;
                const a = api;
                void run('settleInvoice', async () => {
                  const updated = await a.settleInvoice(
                    form.settleNullifier,
                    BigInt(form.settleAmount.trim()),
                    BigInt(form.settleDue.trim()),
                  );
                  setReputation(updated ?? (await a.getReputation()));
                  setSmeTab('track');
                });
              }}
            >
              <h3 className={sectionHeading}>Settle invoice</h3>
              <InvoicePicker invoices={invoices} disabled={busy || working !== null} onPick={pick('settle')} />
              <Field label="Nullifier" value={form.settleNullifier} placeholder="64 hex chars" onChange={set('settleNullifier')} disabled={busy || working !== null} />
              <Field label="Amount" value={form.settleAmount} placeholder="financed amount (≤ winning bid)" onChange={set('settleAmount')} disabled={busy || working !== null} />
              <Field label="Due date" value={form.settleDue} placeholder="unix seconds" onChange={set('settleDue')} disabled={busy || working !== null} />
              <p className="sl-note">
                The contract pays the lowest-rate winner automatically — you cannot pick a different lender. You can
                settle as soon as a lender has revealed a winning bid.
              </p>
              {settleNullifier !== '' && !settleReady && (
                <p className="sl-info" style={{ marginBottom: 0 }}>
                  No winning bid yet for this invoice — the auction is still open. Settlement is possible only once a
                  lender has revealed the lowest-rate bid (see <strong>Public ledger → Leading bids</strong>).
                </p>
              )}
              <button
                className="sl-button"
                type="submit"
                disabled={busy || working !== null || form.settleNullifier.trim().length === 0 || form.settleAmount.trim().length === 0 || form.settleDue.trim().length === 0 || !settleReady}
              >
                {working === 'settleInvoice' ? 'Working…' : settleNullifier !== '' && !settleReady ? 'Awaiting winning bid' : 'Settle'}
              </button>
            </form>
          )}
        </>
      )}

      {/* Buyer Workflow */}
      {role === 'buyer' && (
        <>
          {/* Stepper Progress Indicator */}
          <div className="sl-stepper">
            <div className="sl-stepper-track" />
            {buyerSteps.map((step, idx) => {
              const isCompleted =
                (step.key === 'pending' && openInvoices.length === 0 && stateBuyerVerified.length > 0) ||
                (step.key === 'confirm' && stateBuyerVerified.length > 0);
              const isActive = activeBuyerStep === step.key;
              return (
                <div key={step.key} className={`sl-stepper-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                  <div className="sl-stepper-node">{idx + 1}</div>
                  <div className="sl-stepper-label">{step.label}</div>
                </div>
              );
            })}
          </div>

          {/* Sub Navigation Tabs */}
          <div className="sl-sub-tabs">
            <button
              type="button"
              className={`sl-sub-tab ${buyerTab === 'pending' ? 'active' : ''}`}
              onClick={() => setBuyerTab('pending')}
              disabled={busy || working !== null}
            >
              Pending Invoices ({openInvoices.length})
            </button>
            <button
              type="button"
              className={`sl-sub-tab ${buyerTab === 'confirm' ? 'active' : ''}`}
              onClick={() => setBuyerTab('confirm')}
              disabled={busy || working !== null}
            >
              Confirm Invoice {form.confirmNullifier && `(${form.confirmNullifier.slice(0, 8)}…)`}
            </button>
            <button
              type="button"
              className={`sl-sub-tab ${buyerTab === 'confirmed' ? 'active' : ''}`}
              onClick={() => setBuyerTab('confirmed')}
              disabled={busy || working !== null}
            >
              Confirmed Invoices ({stateBuyerVerified.length})
            </button>
          </div>

          {/* Buyer Tab Content */}
          {buyerTab === 'pending' && (
            <section className="sl-stage">
              <h3 className={sectionHeading}>Pending invoices (open for bidding)</h3>
              <p className="sl-note">
                As the <strong>corporate buyer</strong> you can cryptographically confirm that an invoice is genuine and
                that you owe its claimed amount. Only a <strong>Buyer-verified ✓</strong> flag and an opaque per-invoice
                commitment go on-chain — your identity, your other supplier relationships and the full contract terms
                never do.
              </p>
              {openInvoices.length === 0 ? (
                <p className="sl-empty">No pending invoices on the ledger to confirm.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="sl-table">
                    <thead>
                      <tr>
                        <th>Invoice (nullifier)</th>
                        <th>Claimed amount</th>
                        <th>Credit (ZK-proof)</th>
                        <th>Buyer status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {openInvoices.map((inv) => (
                        <tr key={inv.nullifier}>
                          <td><HexBadge hex={inv.nullifier} /></td>
                          <td style={{ fontWeight: 'bold' }}>{inv.invoiceAmount.toString()} tNight</td>
                          <td>score ≥ {inv.creditThreshold.toString()}</td>
                          <td>{inv.buyerVerified ? <BuyerVerifiedBadge /> : <span className="sl-meta">not verified</span>}</td>
                          <td>
                            {inv.buyerVerified ? (
                              <span className="sl-meta">confirmed</span>
                            ) : (
                              <button
                                className="sl-button sl-button-secondary"
                                type="button"
                                disabled={busy || working !== null}
                                onClick={() => {
                                  pickForConfirm(inv);
                                  setBuyerTab('confirm');
                                }}
                              >
                                Confirm ↓
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {buyerTab === 'confirm' && (
            <form
              className="sl-stage"
              onSubmit={(e) => {
                e.preventDefault();
                if (!api) return;
                const a = api;
                void run('confirmInvoice', async () => {
                  await a.confirmInvoice(form.confirmNullifier, BigInt(form.confirmAmount.trim()));
                  setBuyerTab('confirmed');
                });
              }}
            >
              <h3 className={sectionHeading}>Confirm an invoice</h3>
              <Field label="Nullifier" value={form.confirmNullifier} placeholder="64 hex chars" onChange={set('confirmNullifier')} disabled={busy || working !== null} />
              <Field label="Amount owed" value={form.confirmAmount} placeholder="must match the SME's claimed amount" onChange={set('confirmAmount')} disabled={busy || working !== null} />
              <p className="sl-note">
                The circuit verifies the amount you enter matches the SME's on-chain claim exactly — a mismatch fails
                the proof. Only a boolean flag and an opaque per-invoice commitment become public; nobody learns who you
                are or what the invoice is.
              </p>
              <button
                className="sl-button"
                type="submit"
                disabled={busy || working !== null || form.confirmNullifier.trim().length === 0 || !isDigits(form.confirmAmount)}
              >
                {working === 'confirmInvoice' ? 'Working…' : 'Confirm invoice'}
              </button>
            </form>
          )}

          {buyerTab === 'confirmed' && (
            <section className="sl-stage">
              <h3 className={sectionHeading}>Already buyer-verified</h3>
              {stateBuyerVerified.length === 0 ? (
                <p className="sl-empty">No invoices confirmed yet.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="sl-table">
                    <thead>
                      <tr>
                        <th>Invoice (nullifier)</th>
                        <th>Claimed amount</th>
                        <th>Buyer status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stateBuyerVerified.map((inv) => (
                        <tr key={inv.nullifier}>
                          <td><HexBadge hex={inv.nullifier} /></td>
                          <td style={{ fontWeight: 'bold' }}>{inv.invoiceAmount.toString()} tNight</td>
                          <td><BuyerVerifiedBadge /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* Lender Workflow */}
      {role === 'lender' && (
        <>
          {/* Stepper Progress Indicator */}
          <div className="sl-stepper">
            <div className="sl-stepper-track" />
            {lenderSteps.map((step, idx) => {
              const isCompleted =
                (step.key === 'browse' && openInvoices.length === 0) ||
                (step.key === 'bid' && bestBids.length > 0);
              const isActive = activeLenderStep === step.key;
              return (
                <div key={step.key} className={`sl-stepper-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                  <div className="sl-stepper-node">{idx + 1}</div>
                  <div className="sl-stepper-label">{step.label}</div>
                </div>
              );
            })}
          </div>

          {/* Sub Navigation Tabs */}
          <div className="sl-sub-tabs">
            <button
              type="button"
              className={`sl-sub-tab ${lenderTab === 'browse' ? 'active' : ''}`}
              onClick={() => setLenderTab('browse')}
              disabled={busy || working !== null}
            >
              Browse Invoices ({openInvoices.length})
            </button>
            <button
              type="button"
              className={`sl-sub-tab ${lenderTab === 'bid' ? 'active' : ''}`}
              onClick={() => setLenderTab('bid')}
              disabled={busy || working !== null}
            >
              Submit Sealed Bid
            </button>
            <button
              type="button"
              className={`sl-sub-tab ${lenderTab === 'reveal' ? 'active' : ''}`}
              onClick={() => setLenderTab('reveal')}
              disabled={busy || working !== null}
            >
              Reveal Bid
            </button>
          </div>

          {/* Lender Tab Content */}
          {lenderTab === 'browse' && (
            <section className="sl-stage">
              <h3 className={sectionHeading}>Open invoices available for financing</h3>
              <p className="sl-note">
                The <strong>Credit</strong> column shows the <em>proven bound</em> the SME attested in zero knowledge at
                registration (e.g. "score ≥ 650"). The <strong>Reputation</strong> column shows the <em>proven
                reputation bound</em> ("score ≥ N"; <strong>any</strong> means no minimum). Neither the credit score nor
                the reputation score is ever revealed — only the proven lower bound. The{' '}
                <strong>Buyer-verified ✓</strong> badge means the corporate buyer proved in zero knowledge that the
                invoice is genuine — its identity and the terms never appear.
              </p>
              {openInvoices.length === 0 ? (
                <p className="sl-empty">No invoices are currently open for bidding.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="sl-table">
                    <thead>
                      <tr>
                        <th>Invoice (nullifier)</th>
                        <th>Credit (ZK-proof)</th>
                        <th>Reputation (ZK-proof)</th>
                        <th>Buyer-verified</th>
                        <th>Commitment</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {openInvoices.map((inv) => (
                        <tr key={inv.nullifier}>
                          <td><HexBadge hex={inv.nullifier} /></td>
                          <td>score ≥ {inv.creditThreshold.toString()}</td>
                          <td title="The SME proved its reputation is at least this bound; the actual score is never revealed.">
                            {inv.reputationThreshold > 0n ? (
                              `score ≥ ${inv.reputationThreshold.toString()}`
                            ) : (
                              <span className="sl-meta">any</span>
                            )}
                          </td>
                          <td>{inv.buyerVerified ? <BuyerVerifiedBadge /> : <span className="sl-meta">—</span>}</td>
                          <td><HexBadge hex={inv.smeCommitment} /></td>
                          <td>
                            <button
                              className="sl-button sl-button-secondary"
                              type="button"
                              disabled={busy || working !== null}
                              onClick={() => {
                                setForm((f) => ({ ...f, bidNullifier: inv.nullifier }));
                                setLenderTab('bid');
                              }}
                            >
                              Bid on this ↓
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {lenderTab === 'bid' && (
            <form
              className="sl-stage"
              onSubmit={(e) => {
                e.preventDefault();
                if (!api) return;
                const a = api;
                void run('submitBid', async () => {
                  await a.submitBid(form.bidNullifier, BigInt(form.bidAmount.trim()), BigInt(form.bidDue.trim()), BigInt(form.bidRate.trim()));
                  setLenderTab('reveal');
                });
              }}
            >
              <h3 className={sectionHeading}>Submit sealed bid</h3>
              <InvoicePicker invoices={invoices} disabled={busy || working !== null} onPick={pick('bid')} />
              <Field label="Nullifier" value={form.bidNullifier} placeholder="64 hex chars" onChange={set('bidNullifier')} disabled={busy || working !== null} />
              <Field label="Amount" value={form.bidAmount} placeholder="tNight units" onChange={set('bidAmount')} disabled={busy || working !== null} />
              <Field label="Due date" value={form.bidDue} placeholder="unix seconds" onChange={set('bidDue')} disabled={busy || working !== null} />
              <Field label="Rate" value={form.bidRate} placeholder="basis points, e.g. 400 = 4%" onChange={set('bidRate')} disabled={busy || working !== null} />
              <p className="sl-note">
                Your bid is sealed on-chain — other lenders only see a commitment.
              </p>
              <button
                className="sl-button"
                type="submit"
                disabled={busy || working !== null || form.bidNullifier.trim().length === 0 || form.bidAmount.trim().length === 0 || form.bidDue.trim().length === 0 || form.bidRate.trim().length === 0}
              >
                {working === 'submitBid' ? 'Working…' : 'Submit sealed bid'}
              </button>
            </form>
          )}

          {lenderTab === 'reveal' && (
            <form
              className="sl-stage"
              onSubmit={(e) => {
                e.preventDefault();
                if (!api) return;
                const a = api;
                void run('revealBid', async () => {
                  await a.revealBid(form.revealNullifier, BigInt(form.revealAmount.trim()), BigInt(form.revealDue.trim()), BigInt(form.revealRate.trim()));
                  setLenderTab('browse');
                });
              }}
            >
              <h3 className={sectionHeading}>Reveal your bid</h3>
              <InvoicePicker invoices={invoices} disabled={busy || working !== null} onPick={pick('reveal')} />
              <Field label="Nullifier" value={form.revealNullifier} placeholder="64 hex chars" onChange={set('revealNullifier')} disabled={busy || working !== null} />
              <Field label="Amount" value={form.revealAmount} placeholder="must match your sealed bid" onChange={set('revealAmount')} disabled={busy || working !== null} />
              <Field label="Due date" value={form.revealDue} placeholder="must match your sealed bid" onChange={set('revealDue')} disabled={busy || working !== null} />
              <Field label="Rate" value={form.revealRate} placeholder="must match your sealed bid" onChange={set('revealRate')} disabled={busy || working !== null} />
              <p className="sl-note">
                The contract verifies these terms against your commitment and, if they beat the running best, you take
                the lead. The lowest rate wins.
              </p>
              <button
                className="sl-button"
                type="submit"
                disabled={busy || working !== null || form.revealNullifier.trim().length === 0 || form.revealAmount.trim().length === 0 || form.revealDue.trim().length === 0 || form.revealRate.trim().length === 0}
              >
                {working === 'revealBid' ? 'Working…' : 'Reveal bid'}
              </button>
            </form>
          )}
        </>
      )}

      {working !== null && (
        <div className="sl-meta" style={{ marginBottom: 0 }}>
          {working} in progress… (proof generation can take 30–60s) — when ready, approve in Lace.
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
