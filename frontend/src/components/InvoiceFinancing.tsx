import React, { useState } from 'react';
import { useShieldLedger } from '../context.js';
import {
  loadRegisteredInvoices,
  registerInvoiceLocally,
  type RegisteredInvoice,
} from '../invoice-registry.js';
import { useLedgerState } from '../use-ledger-state.js';
import { invoiceStatusOf, isAuctionResolved, isOpenInvoice } from '../invoice-status.js';
import type { InvoiceView } from '../shield-ledger-types.js';
import type { ReputationView } from '../../../src/reputation.js';
import { describeError, type UserFacingError } from '../lib/errorMessages.js';
import { track } from '../lib/analytics.js';
import { captureError } from '../lib/monitoring.js';
import { HexBadge } from './HexBadge.js';
import { ErrorBanner } from './ErrorBanner.js';

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

const Icon: React.FC<{ className?: string; strokeWidth?: number; children: React.ReactNode }> = ({
  className = '',
  strokeWidth = 2,
  children,
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className = 'sl-row-arrow' }) => (
  <Icon className={className} strokeWidth={2.5}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

const InvoicePicker: React.FC<{
  invoices: RegisteredInvoice[];
  disabled?: boolean;
  onPick: (inv: RegisteredInvoice) => void;
}> = ({ invoices, disabled, onPick }) => (
  <div className="sl-list">
    <span className="sl-list-label">Your invoice</span>
    {invoices.length === 0 ? (
      <p className="sl-meta">No invoices registered in this browser yet.</p>
    ) : (
      invoices.map((inv) => (
        <button
          key={inv.nullifier}
          type="button"
          className="sl-row-item"
          disabled={disabled}
          onClick={() => onPick(inv)}
        >
          <span className="sl-row-icon">
            <Icon>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
              <path d="M9 13h6M9 17h6" />
            </Icon>
          </span>
          <span className="sl-row-body">
            <span className="sl-row-title">{inv.reference || '(no reference)'}</span>
            <span className="sl-row-sub">
              {inv.amount} tNight · {inv.nullifier.slice(0, 10)}…
            </span>
          </span>
          <ChevronRightIcon />
        </button>
      ))
    )}
  </div>
);

const HeroCard: React.FC<{
  label: string;
  number: string;
  unit?: string;
  sub: string;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
}> = ({ label, number, unit, sub, actionLabel, onAction, disabled }) => (
  <div className="sl-hero">
    <div className="sl-hero-content">
      <span className="sl-hero-label">{label}</span>
      <div className="sl-hero-number-line">
        <span className="sl-hero-number">{number}</span>
        {unit !== undefined && <span className="sl-hero-unit">{unit}</span>}
      </div>
      <span className="sl-hero-sub">{sub}</span>
    </div>
    <button type="button" className="sl-hero-action" onClick={onAction} disabled={disabled}>
      {actionLabel}
    </button>
  </div>
);

type ActionSpec = {
  key: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
};

const ActionCard: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}> = ({ active, icon, label, onClick, disabled }) => (
  <button
    type="button"
    className={active ? 'sl-action-card sl-action-card-active' : 'sl-action-card'}
    onClick={onClick}
    disabled={disabled}
  >
    {icon}
    <span className="sl-action-label">{label}</span>
  </button>
);

const BuyerVerifiedBadge: React.FC = () => (
  <span className="sl-badge" title="The corporate buyer proved in zero knowledge that this invoice is genuine and that it owes the claimed amount.">
    Buyer-verified ✓
  </span>
);

type Notice = { ok: true; text: string } | { ok: false; error: UserFacingError };

export const InvoiceFinancing: React.FC = () => {
  const { deployment, connected, role, connect, disconnect } = useShieldLedger();
  const api = deployment.status === 'deployed' ? deployment.api : null;
  const busy = deployment.status === 'in-progress' || !connected || api === null;

  const { state: ledgerState } = useLedgerState();

  const [form, setForm] = useState<FormState>(initialForm);
  const [message, setMessage] = useState<Notice | null>(null);
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
      track(label, { outcome: 'success', role });
    } catch (e) {
      console.error(`${label} failed:`, e);
      setMessage({ ok: false, error: describeError(label, e) });
      captureError(e, { step: label });
      track(label, { outcome: 'error', role });
    } finally {
      setWorking(null);
    }
  };

  // Offered inside the banner when the wallet session drops mid-operation.
  const reconnectWallet = () => {
    setMessage(null);
    disconnect();
    void connect();
  };

  const openInvoices = (ledgerState?.invoices ?? []).filter(isOpenInvoice);
  const stateBuyerVerified = (ledgerState?.invoices ?? []).filter((inv) => inv.buyerVerified);
  const pendingBuyerCount = openInvoices.filter((inv) => !inv.buyerVerified).length;

  const hero =
    role === 'sme'
      ? {
          label: 'Private reputation',
          number: reputation ? reputation.score.toString() : '—',
          unit: reputation ? '/ 100' : undefined,
          sub: reputation
            ? `${reputation.onTimeCount.toString()} on-time · ${reputation.lateCount.toString()} late`
            : 'No reputation in this browser yet — settle on time to earn +10.',
          actionLabel: 'Register invoice',
          onAction: () => setSmeTab('register'),
        }
      : role === 'buyer'
        ? {
            label: 'Awaiting your confirmation',
            number: pendingBuyerCount.toString(),
            unit: undefined,
            sub: 'Open invoices you can verify in zero knowledge — your identity stays private.',
            actionLabel: 'Confirm invoice',
            onAction: () => setBuyerTab('confirm'),
          }
        : {
            label: 'Open to finance',
            number: openInvoices.length.toString(),
            unit: undefined,
            sub: 'Invoices accepting sealed bids — your terms stay hidden until you reveal.',
            actionLabel: 'Browse & bid',
            onAction: () => setLenderTab('browse'),
          };

  const actions: ActionSpec[] =
    role === 'sme'
      ? [
          {
            key: 'register',
            label: 'Register Invoice',
            icon: (
              <Icon className="sl-action-icon">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <path d="M14 2v6h6" />
                <path d="M12 11v6M9 14h6" />
              </Icon>
            ),
            active: smeTab === 'register',
            onClick: () => setSmeTab('register'),
          },
          {
            key: 'track',
            label: `Track Invoices (${invoices.length})`,
            icon: (
              <Icon className="sl-action-icon">
                <path d="M8 6h13M8 12h13M8 18h13" />
                <path d="M3 6h.01M3 12h.01M3 18h.01" />
              </Icon>
            ),
            active: smeTab === 'track',
            onClick: () => setSmeTab('track'),
          },
          {
            key: 'settle',
            label: 'Settle Invoice',
            icon: (
              <Icon className="sl-action-icon">
                <path d="M12 3v18" />
                <path d="M7 8h10M7 12h10M7 16h6" />
              </Icon>
            ),
            active: smeTab === 'settle',
            onClick: () => setSmeTab('settle'),
          },
        ]
      : role === 'buyer'
        ? [
            {
              key: 'pending',
              label: `Pending (${openInvoices.length})`,
              icon: (
                <Icon className="sl-action-icon">
                  <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                  <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
                </Icon>
              ),
              active: buyerTab === 'pending',
              onClick: () => setBuyerTab('pending'),
            },
            {
              key: 'confirm',
              label: 'Confirm Invoice',
              icon: (
                <Icon className="sl-action-icon">
                  <path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3Z" />
                  <path d="m9 11.5 2 2 4-4" />
                </Icon>
              ),
              active: buyerTab === 'confirm',
              onClick: () => setBuyerTab('confirm'),
            },
            {
              key: 'confirmed',
              label: `Confirmed (${stateBuyerVerified.length})`,
              icon: (
                <Icon className="sl-action-icon">
                  <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
                  <path d="m9 12 2 2 4-4" />
                </Icon>
              ),
              active: buyerTab === 'confirmed',
              onClick: () => setBuyerTab('confirmed'),
            },
          ]
        : [
            {
              key: 'browse',
              label: `Browse (${openInvoices.length})`,
              icon: (
                <Icon className="sl-action-icon">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.35-4.35" />
                </Icon>
              ),
              active: lenderTab === 'browse',
              onClick: () => setLenderTab('browse'),
            },
            {
              key: 'bid',
              label: 'Submit Bid',
              icon: (
                <Icon className="sl-action-icon">
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </Icon>
              ),
              active: lenderTab === 'bid',
              onClick: () => setLenderTab('bid'),
            },
            {
              key: 'reveal',
              label: 'Reveal',
              icon: (
                <Icon className="sl-action-icon">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </Icon>
              ),
              active: lenderTab === 'reveal',
              onClick: () => setLenderTab('reveal'),
            },
          ];

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
        Lowest revealed rate wins — bids stay sealed until reveal.
      </p>
      <div className="sl-row" style={{ marginBottom: 'var(--sp-5)' }}>
        <button className="sl-button sl-button-secondary" type="button" onClick={() => setForm(sampleForm)} disabled={busy || working !== null}>
          Use sample values
        </button>
        <span className="sl-meta">Fills the forms with sample values.</span>
      </div>

      <HeroCard
        label={hero.label}
        number={hero.number}
        unit={hero.unit}
        sub={hero.sub}
        actionLabel={hero.actionLabel}
        onAction={hero.onAction}
        disabled={busy || working !== null}
      />
      <div className="sl-actions">
        {actions.map((a) => (
          <ActionCard key={a.key} active={a.active} icon={a.icon} label={a.label} onClick={a.onClick} disabled={busy || working !== null} />
        ))}
      </div>

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
              const stepIcon = isCompleted ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                idx + 1
              );
              return (
                <div key={step.key} className={`sl-stepper-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                  <div className="sl-stepper-node">{stepIcon}</div>
                  <div className="sl-stepper-label">{step.label}</div>
                </div>
              );
            })}
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
                  Only a <em>nullifier</em> goes on-chain — your invoice details stay private.
                </p>
                <details className="sl-details">
                  <summary>Learn more</summary>
                  <p>
                    Only a <em>nullifier</em> — a blinded hash of these details plus a random secret — is posted
                    on-chain. The invoice details never leave this browser; the nullifier is saved locally so you can
                    reuse it later. The <em>credit check</em> proves "my credit score is at least{' '}
                    {form.registerThreshold.trim() || '…'}" in zero knowledge — the score itself is never revealed, only
                    the proven bound. The <em>reputation check</em> proves "my reputation is at least{' '}
                    {form.registerReputation.trim() || '…'}" (set 0 for no requirement) — the current score is read from
                    your private wallet state and never disclosed. The <em>claimed amount</em> is posted publicly so your
                    corporate buyer can later vouch for it in zero knowledge; your reference, due date and secret stay
                    private.
                  </p>
                </details>
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
                  +10 on-time, −20 late (clamped 0–100) — proven to lenders in zero knowledge.
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
                          <td style={{ fontWeight: 'bold', color: 'var(--text)' }}>{inv.amount} tNight</td>
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
                The contract pays the lowest-rate winner automatically.
              </p>
              {settleNullifier !== '' && !settleReady && (
                <p className="sl-info" style={{ marginBottom: 0 }}>
                  No winning bid yet — the auction is still open (see <strong>Public ledger → Leading bids</strong>).
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
              const stepIcon = isCompleted ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                idx + 1
              );
              return (
                <div key={step.key} className={`sl-stepper-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                  <div className="sl-stepper-node">{stepIcon}</div>
                  <div className="sl-stepper-label">{step.label}</div>
                </div>
              );
            })}
          </div>

          {/* Buyer Tab Content */}
          {buyerTab === 'pending' && (
            <section className="sl-stage">
              <h3 className={sectionHeading}>Pending invoices (open for bidding)</h3>
              <p className="sl-note">
                Confirm invoices you owe in zero knowledge — only a <strong>Buyer-verified ✓</strong> flag goes on-chain.
              </p>
              <details className="sl-details">
                <summary>Learn more</summary>
                <p>
                  As the <strong>corporate buyer</strong> you can cryptographically confirm that an invoice is genuine
                  and that you owe its claimed amount. Only a <strong>Buyer-verified ✓</strong> flag and an opaque
                  per-invoice commitment go on-chain — your identity, your other supplier relationships and the full
                  contract terms never do.
                </p>
              </details>
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
                          <td style={{ fontWeight: 'bold', color: 'var(--text)' }}>{inv.invoiceAmount.toString()} tNight</td>
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
                Must match the SME's on-chain claim exactly — only a ✓ flag and a commitment go public.
              </p>
              <details className="sl-details">
                <summary>Learn more</summary>
                <p>
                  The circuit verifies the amount you enter matches the SME's on-chain claim exactly — a mismatch fails
                  the proof. Only a boolean flag and an opaque per-invoice commitment become public; nobody learns who
                  you are or what the invoice is.
                </p>
              </details>
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
                          <td style={{ fontWeight: 'bold', color: 'var(--text)' }}>{inv.invoiceAmount.toString()} tNight</td>
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
              const stepIcon = isCompleted ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                idx + 1
              );
              return (
                <div key={step.key} className={`sl-stepper-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                  <div className="sl-stepper-node">{stepIcon}</div>
                  <div className="sl-stepper-label">{step.label}</div>
                </div>
              );
            })}
          </div>

          {/* Lender Tab Content */}
          {lenderTab === 'browse' && (
            <section className="sl-stage">
              <h3 className={sectionHeading}>Open invoices available for financing</h3>
              <p className="sl-note">
                <strong>Credit</strong> &amp; <strong>Reputation</strong> show proven lower bounds only — the scores are
                never revealed.
              </p>
              <details className="sl-details">
                <summary>Learn more</summary>
                <p>
                  The <strong>Credit</strong> column shows the <em>proven bound</em> the SME attested in zero knowledge
                  at registration (e.g. "score ≥ 650"). The <strong>Reputation</strong> column shows the <em>proven
                  reputation bound</em> ("score ≥ N"; <strong>any</strong> means no minimum). Neither the credit score
                  nor the reputation score is ever revealed — only the proven lower bound. The{' '}
                  <strong>Buyer-verified ✓</strong> badge means the corporate buyer proved in zero knowledge that the
                  invoice is genuine — its identity and the terms never appear.
                </p>
              </details>
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
                Beat the current lead and you take it — the lowest rate wins.
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

      {message && message.ok && <div className="sl-success" style={{ marginBottom: 0 }}>{message.text}</div>}
      {message && !message.ok && (
        <ErrorBanner error={message.error} onDismiss={() => setMessage(null)} onReconnect={reconnectWallet} />
      )}
    </div>
  );
};
