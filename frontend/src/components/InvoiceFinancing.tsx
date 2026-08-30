import React, { useState, useMemo } from 'react';
import { useShieldLedger } from '../context.js';
import {
  loadRegisteredInvoices,
  registerInvoiceLocally,
  type RegisteredInvoice,
} from '../invoice-registry.js';
import { useLedgerState } from '../use-ledger-state.js';
import { invoiceStatusOf, isAuctionResolved, isOpenInvoice, isInsuranceClaimed } from '../invoice-status.js';
import type { InvoiceView } from '../shield-ledger-types.js';
import type { ReputationView } from '../../../src/reputation.js';
import { insuranceContribution } from '../../../src/insurance.js';
import { describeError, type UserFacingError } from '../lib/errorMessages.js';
import { track } from '../lib/analytics.js';
import { captureError } from '../lib/monitoring.js';
import { getSuggestedRate, type SuggestedRate } from '../pricing.js';
import { HexBadge } from './HexBadge.js';
import { ErrorBanner } from './ErrorBanner.js';

type FormState = {
  registerReference: string;
  registerAmount: string;
  registerDue: string;
  registerThreshold: string;
  registerReputation: string;
  registerSplitCount: string;
  confirmNullifier: string;
  confirmAmount: string;
  bidNullifier: string;
  bidAmount: string;
  bidDue: string;
  bidRate: string;
  bidWillingToSplit: string;
  revealNullifier: string;
  revealAmount: string;
  revealDue: string;
  revealRate: string;
  revealWillingToSplit: string;
  settleNullifier: string;
  settleAmount: string;
  settleDue: string;
  transferNullifier: string;
  transferSecret: string;
  checkNullifier: string;
  claimNullifier: string;
  poolRevealNullifier: string;
  poolRevealSlot: string;
  poolRevealAmount: string;
  poolRevealDue: string;
  poolRevealRate: string;
  poolSettleNullifier: string;
  poolSettleDue: string;
  poolSettleContrib0: string;
  poolSettleContrib1: string;
  poolSettleContrib2: string;
  poolSettleContrib3: string;
  poolSettlePayout0: string;
  poolSettlePayout1: string;
  poolSettlePayout2: string;
  poolSettlePayout3: string;
  poolSettleTotalContrib: string;
  poolSettleTotalPayout: string;
  poolInsuranceNullifier: string;
  poolInsuranceSlot: string;
  poolTransferNullifier: string;
  poolTransferSlot: string;
  poolTransferCommitment: string;
};

const initialForm: FormState = {
  registerReference: '',
  registerAmount: '',
  registerDue: '',
  registerThreshold: '650',
  registerReputation: '0',
  registerSplitCount: '0',
  confirmNullifier: '',
  confirmAmount: '',
  bidNullifier: '',
  bidAmount: '',
  bidDue: '',
  bidRate: '',
  bidWillingToSplit: '',
  revealNullifier: '',
  revealAmount: '',
  revealDue: '',
  revealRate: '',
  revealWillingToSplit: '',
  settleNullifier: '',
  settleAmount: '',
  settleDue: '',
  transferNullifier: '',
  transferSecret: '',
  checkNullifier: '',
  claimNullifier: '',
  poolRevealNullifier: '',
  poolRevealSlot: '',
  poolRevealAmount: '',
  poolRevealDue: '',
  poolRevealRate: '',
  poolSettleNullifier: '',
  poolSettleDue: '',
  poolSettleContrib0: '',
  poolSettleContrib1: '',
  poolSettleContrib2: '',
  poolSettleContrib3: '',
  poolSettlePayout0: '',
  poolSettlePayout1: '',
  poolSettlePayout2: '',
  poolSettlePayout3: '',
  poolSettleTotalContrib: '',
  poolSettleTotalPayout: '',
  poolInsuranceNullifier: '',
  poolInsuranceSlot: '',
  poolTransferNullifier: '',
  poolTransferSlot: '',
  poolTransferCommitment: '',
};

const SAMPLE_REFERENCE = 'Sample invoice';
const SAMPLE_NULLIFIER = 'aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66';
const SAMPLE_AMOUNT = '1000';
const SAMPLE_RATE = '400';
const SAMPLE_SECRET = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
const SAMPLE_DUE = (() => {
  const d = new Date(Date.now() + 30 * 86_400_000);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
})();

const sampleForm: FormState = {
  registerReference: SAMPLE_REFERENCE,
  registerAmount: SAMPLE_AMOUNT,
  registerDue: SAMPLE_DUE,
  registerThreshold: '650',
  registerReputation: '0',
  registerSplitCount: '0',
  confirmNullifier: SAMPLE_NULLIFIER,
  confirmAmount: SAMPLE_AMOUNT,
  bidNullifier: SAMPLE_NULLIFIER,
  bidAmount: SAMPLE_AMOUNT,
  bidDue: SAMPLE_DUE,
  bidRate: SAMPLE_RATE,
  bidWillingToSplit: '',
  revealNullifier: SAMPLE_NULLIFIER,
  revealAmount: SAMPLE_AMOUNT,
  revealDue: SAMPLE_DUE,
  revealRate: SAMPLE_RATE,
  revealWillingToSplit: '',
  settleNullifier: SAMPLE_NULLIFIER,
  settleAmount: SAMPLE_AMOUNT,
  settleDue: SAMPLE_DUE,
  transferNullifier: SAMPLE_NULLIFIER,
  transferSecret: SAMPLE_SECRET,
  checkNullifier: SAMPLE_NULLIFIER,
  claimNullifier: SAMPLE_NULLIFIER,
  poolRevealNullifier: '',
  poolRevealSlot: '0',
  poolRevealAmount: '',
  poolRevealDue: '',
  poolRevealRate: '',
  poolSettleNullifier: '',
  poolSettleDue: '',
  poolSettleContrib0: '5000',
  poolSettleContrib1: '5000',
  poolSettleContrib2: '0',
  poolSettleContrib3: '0',
  poolSettlePayout0: '4800',
  poolSettlePayout1: '4800',
  poolSettlePayout2: '0',
  poolSettlePayout3: '0',
  poolSettleTotalContrib: '10000',
  poolSettleTotalPayout: '9600',
  poolInsuranceNullifier: '',
  poolInsuranceSlot: '0',
  poolTransferNullifier: '',
  poolTransferSlot: '0',
  poolTransferCommitment: '',
};

const isDigits = (s: string): boolean => /^\d+$/.test(s.trim());

const isHex64 = (s: string): boolean => /^[0-9a-fA-F]{64}$/.test(s.trim());

const isDateInput = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
};

const dateInputToUnixSeconds = (s: string): bigint => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return 0n;
  return BigInt(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 1000);
};

const unixSecondsToDateInput = (unixSeconds: bigint | number): string => {
  const d = new Date(Number(unixSeconds) * 1000);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const formatDate = (unixSeconds: bigint): string => {
  if (unixSeconds <= 0n) return '—';
  return new Date(Number(unixSeconds) * 1000).toLocaleString();
};

const sectionHeading = 'sl-section-title';

const Field: React.FC<{
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  suffix?: string;
  hint?: React.ReactNode;
  onChange: (v: string) => void;
  disabled?: boolean;
}> = ({ label, value, placeholder, type, suffix, hint, onChange, disabled }) => {
  const control =
    suffix !== undefined || hint !== undefined ? (
      <div className="sl-field-body">
        <div className="sl-input-wrap">
          <input
            className="sl-input"
            type={type ?? 'text'}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
          {suffix !== undefined && <span className="sl-input-suffix">{suffix}</span>}
        </div>
        {hint !== undefined && <span className="sl-field-hint">{hint}</span>}
      </div>
    ) : (
      <input
        className="sl-input"
        type={type ?? 'text'}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    );
  return (
    <div className="sl-field">
      <label className="sl-field-label">{label}</label>
      {control}
    </div>
  );
};

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
  const [smeTab, setSmeTab] = useState<'register' | 'track' | 'settle' | 'settleSplit'>('register');
  const [buyerTab, setBuyerTab] = useState<'pending' | 'confirm' | 'confirmed'>('pending');
  const [lenderTab, setLenderTab] = useState<'browse' | 'bid' | 'reveal' | 'poolBid' | 'market' | 'insurance'>('browse');
  // Verdict of the last holder-only claim check in the secondary-market tab.
  const [claimCheck, setClaimCheck] = useState<{ nullifier: string; verdict: 'not-transferred' | 'mine' | 'other' } | null>(null);
  // Payout actually granted by the last successful insurance claim.
  const [insurancePayout, setInsurancePayout] = useState<string | null>(null);

  // On-chain invoice data for the currently picked bid invoice (for pricing suggestion).
  const [selectedBidInvoice, setSelectedBidInvoice] = useState<InvoiceView | null>(null);

  // Dynamic pricing suggestion: computed from public on-chain data.
  const suggestedRate: SuggestedRate | null = useMemo(() => {
    if (!selectedBidInvoice) return null;
    const dueDateEstimate = form.bidDue.trim() !== '' && isDateInput(form.bidDue) ? dateInputToUnixSeconds(form.bidDue) : undefined;
    return getSuggestedRate(
      selectedBidInvoice.creditThreshold,
      selectedBidInvoice.reputationThreshold,
      selectedBidInvoice.invoiceAmount,
      dueDateEstimate,
    );
  }, [selectedBidInvoice, form.bidDue]);

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
      return { ...f, [`${prefix}Nullifier`]: inv.nullifier, [`${prefix}Amount`]: inv.amount, [`${prefix}Due`]: unixSecondsToDateInput(BigInt(inv.dueDate)) } as FormState;
    });
    if (kind === 'bid') {
      const onChain = (ledgerState?.invoices ?? []).find((i) => i.nullifier === inv.nullifier) ?? null;
      setSelectedBidInvoice(onChain);
    }
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

  const bestBids = ledgerState?.bestBids ?? [];
  const resolved = (nullifier: string): boolean => isAuctionResolved(nullifier, bestBids);

  // Default insurance (lender view): invoices that are financed (auction
  // resolved), unsettled, past due and not yet paid out — claimable now.
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const dueDateOf = (nullifier: string): bigint =>
    bestBids.find((b) => b.nullifier === nullifier)?.dueDate ?? 0n;
  const defaultedInvoices = (ledgerState?.invoices ?? []).filter(
    (inv) =>
      inv.lender === null &&
      resolved(inv.nullifier) &&
      !isInsuranceClaimed(inv.nullifier, ledgerState?.insuranceClaims ?? []) &&
      nowSeconds > dueDateOf(inv.nullifier),
  );

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
          {
            key: 'settleSplit',
            label: 'Settle Pool',
            icon: (
              <Icon className="sl-action-icon">
                <path d="M16 3h5v5" />
                <path d="M8 3H3v5" />
                <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
                <path d="m15 9 6-6" />
              </Icon>
            ),
            active: smeTab === 'settleSplit',
            onClick: () => setSmeTab('settleSplit'),
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
            {
              key: 'market',
              label: 'Secondary Market',
              icon: (
                <Icon className="sl-action-icon">
                  <path d="m16 3 4 4-4 4" />
                  <path d="M20 7H4" />
                  <path d="m8 21-4-4 4-4" />
                  <path d="M4 17h16" />
                </Icon>
              ),
              active: lenderTab === 'market',
              onClick: () => setLenderTab('market'),
            },
            {
              key: 'insurance',
              label: `Default Insurance (${defaultedInvoices.length})`,
              icon: (
                <Icon className="sl-action-icon">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                  <path d="m9 11.5 2 2 4-4" />
                </Icon>
              ),
              active: lenderTab === 'insurance',
              onClick: () => setLenderTab('insurance'),
            },
          ];

  const statusOf = (inv: RegisteredInvoice): string => invoiceStatusOf(inv, ledgerState?.invoices ?? []);

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
    { key: 'poolBid', label: 'Reveal Pool Bid' },
    { key: 'market', label: 'Secondary Market' },
    { key: 'insurance', label: 'Default Insurance' },
  ];

  let activeLenderStep = 'browse';
  if (lenderTab === 'bid') activeLenderStep = 'bid';
  else if (lenderTab === 'reveal') activeLenderStep = 'reveal';
  else if (lenderTab === 'poolBid') activeLenderStep = 'poolBid';
  else if (lenderTab === 'market') activeLenderStep = 'market';
  else if (lenderTab === 'insurance') activeLenderStep = 'insurance';

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
                  const dueDate = dateInputToUnixSeconds(form.registerDue.trim());
                  const creditThreshold = BigInt(form.registerThreshold.trim());
                  const reputationThreshold = BigInt(form.registerReputation.trim());
                  const splitCount = BigInt(form.registerSplitCount.trim() || '0');
                  void run('registerInvoice', async () => {
                    const record = await registerInvoiceLocally({ reference, amount, dueDate });
                    setInvoices(loadRegisteredInvoices());
                    await a.registerInvoice(record.nullifier, creditThreshold, amount, reputationThreshold, splitCount);
                    await refreshReputation();
                    setSmeTab('track');
                  });
                }}
              >
                <h3 className={sectionHeading}>1 · Register an invoice</h3>
                <Field label="Reference" value={form.registerReference} placeholder="optional, private — e.g. INV-001" onChange={set('registerReference')} disabled={busy || working !== null} />
                <Field label="Amount" value={form.registerAmount} placeholder="tNight units" onChange={set('registerAmount')} disabled={busy || working !== null} />
                {isDigits(form.registerAmount) && (
                  <p className="sl-note" style={{ marginTop: '-0.5rem' }}>
                    🛡️ Registration pays a{' '}
                    <strong>{insuranceContribution(BigInt(form.registerAmount.trim())).toString()} tNight</strong>{' '}
                    default-insurance premium (2% of the face amount) into the shared public pool.
                  </p>
                )}
                <Field label="Due date" type="date" value={form.registerDue} hint="Stored on-chain as a Unix timestamp (UTC) — the calendar date is converted automatically on submit." onChange={set('registerDue')} disabled={busy || working !== null} />
                <Field label="Credit check" value={form.registerThreshold} placeholder="e.g. 650 — your score stays private" onChange={set('registerThreshold')} disabled={busy || working !== null} />
                <Field label="Reputation check" value={form.registerReputation} placeholder="e.g. 30 — proven in zero knowledge" onChange={set('registerReputation')} disabled={busy || working !== null} />
                <Field label="Split count" value={form.registerSplitCount} placeholder="0 = single lender, 2–4 = pool" onChange={set('registerSplitCount')} disabled={busy || working !== null} />
                {isDigits(form.registerSplitCount) && BigInt(form.registerSplitCount.trim()) > 0n && (
                  <p className="sl-note" style={{ marginTop: '-0.5rem' }}>
                    🏦 Pool financing: up to {form.registerSplitCount.trim()} lenders will co-finance this invoice.
                    Each lender submits a sealed pool bid for a specific slot, and the SME later settles with proportional payouts.
                  </p>
                )}
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
                    the proven bound.                     The <em>reputation check</em> proves "my reputation is at least{' '}
                    {form.registerReputation.trim() || '…'}" (set 0 for no requirement) — the current score is read from
                    your private wallet state and never disclosed. The <em>claimed amount</em> is posted publicly so your
                    corporate buyer can later vouch for it in zero knowledge; your reference, due date and secret stay
                    private. Registration also pays a 2% default-insurance premium into the shared public pool — the
                    exact premium is proven in-circuit and no one can link it back to you.
                  </p>
                </details>
                <button
                  className="sl-button"
                  type="submit"
                  disabled={
                    busy ||
                    working !== null ||
                    !isDigits(form.registerAmount) ||
                    !isDateInput(form.registerDue) ||
                    !isDigits(form.registerThreshold) ||
                    !isDigits(form.registerReputation) ||
                    !isDigits(form.registerSplitCount) ||
                    BigInt(form.registerThreshold.trim() || '0') < 650n ||
                    BigInt(form.registerSplitCount.trim() || '0') > 4n
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
                                    const onChainSplit = (ledgerState?.invoices ?? []).find((i) => i.nullifier === inv.nullifier)?.splitCount ?? 0n;
                                    if (onChainSplit > 0n) {
                                      setForm((f) => ({
                                        ...f,
                                        poolSettleNullifier: inv.nullifier,
                                        poolSettleDue: unixSecondsToDateInput(BigInt(inv.dueDate)),
                                      }));
                                      setSmeTab('settleSplit');
                                    } else {
                                      setForm((f) => ({
                                        ...f,
                                        settleNullifier: inv.nullifier,
                                        settleAmount: inv.amount,
                                        settleDue: unixSecondsToDateInput(BigInt(inv.dueDate)),
                                      }));
                                      setSmeTab('settle');
                                    }
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
                    dateInputToUnixSeconds(form.settleDue.trim()),
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
              <Field label="Due date" type="date" value={form.settleDue} onChange={set('settleDue')} disabled={busy || working !== null} />
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
                disabled={busy || working !== null || form.settleNullifier.trim().length === 0 || form.settleAmount.trim().length === 0 || !isDateInput(form.settleDue) || !settleReady}
              >
                {working === 'settleInvoice' ? 'Working…' : settleNullifier !== '' && !settleReady ? 'Awaiting winning bid' : 'Settle'}
              </button>
            </form>
          )}

          {smeTab === 'settleSplit' && (
            <form
              className="sl-stage"
              onSubmit={(e) => {
                e.preventDefault();
                if (!api) return;
                const a = api;
                void run('settleSplitInvoice', async () => {
                  await a.settleSplitInvoice(
                    form.poolSettleNullifier,
                    dateInputToUnixSeconds(form.poolSettleDue.trim()),
                    [
                      BigInt(form.poolSettleContrib0.trim() || '0'),
                      BigInt(form.poolSettleContrib1.trim() || '0'),
                      BigInt(form.poolSettleContrib2.trim() || '0'),
                      BigInt(form.poolSettleContrib3.trim() || '0'),
                    ],
                    [
                      BigInt(form.poolSettlePayout0.trim() || '0'),
                      BigInt(form.poolSettlePayout1.trim() || '0'),
                      BigInt(form.poolSettlePayout2.trim() || '0'),
                      BigInt(form.poolSettlePayout3.trim() || '0'),
                    ],
                    BigInt(form.poolSettleTotalContrib.trim()),
                    BigInt(form.poolSettleTotalPayout.trim()),
                  );
                  setSmeTab('track');
                });
              }}
            >
              <h3 className={sectionHeading}>Settle pool invoice</h3>
              <InvoicePicker invoices={invoices} disabled={busy || working !== null} onPick={(inv) => {
                setForm((f) => ({ ...f, poolSettleNullifier: inv.nullifier, poolSettleDue: unixSecondsToDateInput(BigInt(inv.dueDate)) }));
              }} />
              <Field label="Invoice nullifier" value={form.poolSettleNullifier} placeholder="64 hex chars" onChange={set('poolSettleNullifier')} disabled={busy || working !== null} />
              <Field label="Financed due date" type="date" value={form.poolSettleDue} onChange={set('poolSettleDue')} disabled={busy || working !== null} />

              <h4 className={sectionHeading} style={{ fontSize: '0.95em', marginTop: '1rem' }}>Per-lender contributions</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <Field label="Slot 0" value={form.poolSettleContrib0} placeholder="0" onChange={set('poolSettleContrib0')} disabled={busy || working !== null} />
                <Field label="Slot 1" value={form.poolSettleContrib1} placeholder="0" onChange={set('poolSettleContrib1')} disabled={busy || working !== null} />
                <Field label="Slot 2" value={form.poolSettleContrib2} placeholder="0" onChange={set('poolSettleContrib2')} disabled={busy || working !== null} />
                <Field label="Slot 3" value={form.poolSettleContrib3} placeholder="0" onChange={set('poolSettleContrib3')} disabled={busy || working !== null} />
              </div>

              <h4 className={sectionHeading} style={{ fontSize: '0.95em', marginTop: '1rem' }}>Per-lender payouts</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <Field label="Slot 0" value={form.poolSettlePayout0} placeholder="0" onChange={set('poolSettlePayout0')} disabled={busy || working !== null} />
                <Field label="Slot 1" value={form.poolSettlePayout1} placeholder="0" onChange={set('poolSettlePayout1')} disabled={busy || working !== null} />
                <Field label="Slot 2" value={form.poolSettlePayout2} placeholder="0" onChange={set('poolSettlePayout2')} disabled={busy || working !== null} />
                <Field label="Slot 3" value={form.poolSettlePayout3} placeholder="0" onChange={set('poolSettlePayout3')} disabled={busy || working !== null} />
              </div>

              <h4 className={sectionHeading} style={{ fontSize: '0.95em', marginTop: '1rem' }}>Totals</h4>
              <Field label="Total contribution" value={form.poolSettleTotalContrib} placeholder="sum of all slot contributions" onChange={set('poolSettleTotalContrib')} disabled={busy || working !== null} />
              <Field label="Total payout" value={form.poolSettleTotalPayout} placeholder="sum of all slot payouts" onChange={set('poolSettleTotalPayout')} disabled={busy || working !== null} />

              <p className="sl-note">
                Each payout = floor(contribution × totalPayout ÷ totalContribution). The floor-rounding remainder
                is automatically routed to the default insurance pool. Contributions must sum to the invoice amount.
              </p>
              <button
                className="sl-button"
                type="submit"
                disabled={
                  busy || working !== null ||
                  form.poolSettleNullifier.trim().length === 0 ||
                  !isDateInput(form.poolSettleDue) ||
                  form.poolSettleTotalContrib.trim().length === 0 ||
                  form.poolSettleTotalPayout.trim().length === 0
                }
              >
                {working === 'settleSplitInvoice' ? 'Working…' : 'Settle pool invoice'}
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
                  await a.submitBid(form.bidNullifier, BigInt(form.bidAmount.trim()), dateInputToUnixSeconds(form.bidDue.trim()), BigInt(form.bidRate.trim()), form.bidWillingToSplit === 'true');
                  setLenderTab('reveal');
                });
              }}
            >
              <h3 className={sectionHeading}>Submit sealed bid</h3>
              <InvoicePicker invoices={invoices} disabled={busy || working !== null} onPick={pick('bid')} />
              <Field label="Nullifier" value={form.bidNullifier} placeholder="64 hex chars" onChange={set('bidNullifier')} disabled={busy || working !== null} />
              <Field label="Amount" value={form.bidAmount} placeholder="tNight units" onChange={set('bidAmount')} disabled={busy || working !== null} />
              <Field label="Due date" type="date" value={form.bidDue} onChange={set('bidDue')} disabled={busy || working !== null} />
              <Field
                label="Rate (basis points)"
                value={form.bidRate}
                placeholder="e.g. 400 = 4%"
                suffix="bps"
                hint={
                  isDigits(form.bidRate)
                    ? `${form.bidRate.trim()} bps = ${(Number(form.bidRate.trim()) / 100).toFixed(2)}% per year — 100 bps = 1%`
                    : undefined
                }
                onChange={set('bidRate')}
                disabled={busy || working !== null}
              />
              {suggestedRate && (
                <div className="sl-note" style={{ padding: '0.5rem 0.75rem', background: 'var(--card-bg, rgba(255,255,255,0.05))', borderRadius: '6px', borderLeft: '3px solid var(--accent, #4f8cff)' }}>
                  <strong>Suggested fair rate{suggestedRate.estimated ? ' (estimate)' : ''}:</strong>{' '}
                  {(suggestedRate.lowBps / 100).toFixed(2)}% – {(suggestedRate.highBps / 100).toFixed(2)}%{' '}
                  ({suggestedRate.lowBps}–{suggestedRate.highBps} bps)
                  <span style={{ display: 'block', fontSize: '0.8em', opacity: 0.7, marginTop: '0.25rem' }}>
                    Based on public credit threshold, reputation threshold, and invoice amount. Non-binding suggestion — you may bid any rate.
                  </span>
                </div>
              )}
              <label className="sl-checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                <input
                  type="checkbox"
                  checked={form.bidWillingToSplit === 'true'}
                  onChange={(e) => setForm((f) => ({ ...f, bidWillingToSplit: e.target.checked ? 'true' : '' }))}
                  disabled={busy || working !== null}
                />
                Willing to split invoice (lower priority in tiebreak)
              </label>
              <p className="sl-note">
                Your bid is sealed on-chain — other lenders only see a commitment.
              </p>
              <button
                className="sl-button"
                type="submit"
                disabled={busy || working !== null || form.bidNullifier.trim().length === 0 || form.bidAmount.trim().length === 0 || !isDateInput(form.bidDue) || form.bidRate.trim().length === 0}
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
                  await a.revealBid(form.revealNullifier, BigInt(form.revealAmount.trim()), dateInputToUnixSeconds(form.revealDue.trim()), BigInt(form.revealRate.trim()), form.revealWillingToSplit === 'true');
                  setLenderTab('browse');
                });
              }}
            >
              <h3 className={sectionHeading}>Reveal your bid</h3>
              <InvoicePicker invoices={invoices} disabled={busy || working !== null} onPick={pick('reveal')} />
              <Field label="Nullifier" value={form.revealNullifier} placeholder="64 hex chars" onChange={set('revealNullifier')} disabled={busy || working !== null} />
              <Field label="Amount" value={form.revealAmount} placeholder="must match your sealed bid" onChange={set('revealAmount')} disabled={busy || working !== null} />
              <Field label="Due date" type="date" value={form.revealDue} hint="Must be the same calendar date you used in your sealed bid." onChange={set('revealDue')} disabled={busy || working !== null} />
              <Field
                label="Rate (basis points)"
                value={form.revealRate}
                placeholder="must match your sealed bid, e.g. 400 = 4%"
                suffix="bps"
                hint={
                  isDigits(form.revealRate)
                    ? `Re-enter the sealed basis points: ${form.revealRate.trim()} bps = ${(Number(form.revealRate.trim()) / 100).toFixed(2)}%`
                    : undefined
                }
                onChange={set('revealRate')}
                disabled={busy || working !== null}
              />
              <label className="sl-checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                <input
                  type="checkbox"
                  checked={form.revealWillingToSplit === 'true'}
                  onChange={(e) => setForm((f) => ({ ...f, revealWillingToSplit: e.target.checked ? 'true' : '' }))}
                  disabled={busy || working !== null}
                />
                Willing to split invoice (must match your sealed bid)
              </label>
              <p className="sl-note">
                Beat the current lead and you take it — the lowest rate wins.
              </p>
              <button
                className="sl-button"
                type="submit"
                disabled={busy || working !== null || form.revealNullifier.trim().length === 0 || form.revealAmount.trim().length === 0 || !isDateInput(form.revealDue) || form.revealRate.trim().length === 0}
              >
                {working === 'revealBid' ? 'Working…' : 'Reveal bid'}
              </button>
            </form>
          )}

          {lenderTab === 'poolBid' && (
            <form
              className="sl-stage"
              onSubmit={(e) => {
                e.preventDefault();
                if (!api) return;
                const a = api;
                void run('revealPoolBid', async () => {
                  await a.revealPoolBid(
                    form.poolRevealNullifier,
                    BigInt(form.poolRevealSlot.trim()),
                    BigInt(form.poolRevealAmount.trim()),
                    dateInputToUnixSeconds(form.poolRevealDue.trim()),
                    BigInt(form.poolRevealRate.trim()),
                  );
                  setLenderTab('browse');
                });
              }}
            >
              <h3 className={sectionHeading}>Reveal a pool bid</h3>
              <p className="sl-note" style={{ marginBottom: '0.75rem' }}>
                For invoices registered with <code>splitCount &gt; 0</code>. Reveal your sealed pool bid into a specific slot (0–3).
              </p>
              <Field label="Invoice nullifier" value={form.poolRevealNullifier} placeholder="64 hex chars" onChange={set('poolRevealNullifier')} disabled={busy || working !== null} />
              <Field label="Slot index" value={form.poolRevealSlot} placeholder="0–3" onChange={set('poolRevealSlot')} disabled={busy || working !== null} />
              <Field label="Amount" value={form.poolRevealAmount} placeholder="must match your sealed bid" onChange={set('poolRevealAmount')} disabled={busy || working !== null} />
              <Field label="Due date" type="date" value={form.poolRevealDue} hint="Must be the same calendar date you used in your sealed bid." onChange={set('poolRevealDue')} disabled={busy || working !== null} />
              <Field
                label="Rate (basis points)"
                value={form.poolRevealRate}
                placeholder="must match your sealed pool bid, e.g. 400 = 4%"
                suffix="bps"
                hint={
                  isDigits(form.poolRevealRate)
                    ? `Re-enter the sealed basis points: ${form.poolRevealRate.trim()} bps = ${(Number(form.poolRevealRate.trim()) / 100).toFixed(2)}%`
                    : undefined
                }
                onChange={set('poolRevealRate')}
                disabled={busy || working !== null}
              />
              <button
                className="sl-button"
                type="submit"
                disabled={
                  busy || working !== null ||
                  !isHex64(form.poolRevealNullifier) ||
                  !isDigits(form.poolRevealSlot) ||
                  !isDigits(form.poolRevealAmount) ||
                  !isDateInput(form.poolRevealDue) ||
                  !isDigits(form.poolRevealRate)
                }
              >
                {working === 'revealPoolBid' ? 'Working…' : 'Reveal pool bid'}
              </button>
            </form>
          )}

          {lenderTab === 'market' && (
            <>
              <form
                className="sl-stage"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!api) return;
                  const a = api;
                  void run('transferClaim', async () => {
                    await a.transferClaim(form.transferNullifier, form.transferSecret);
                    setForm((f) => ({ ...f, checkNullifier: f.transferNullifier, transferSecret: '' }));
                  });
                }}
              >
                <h3 className={sectionHeading}>Resell your claim</h3>
                <Field label="Invoice nullifier" value={form.transferNullifier} placeholder="64 hex chars" onChange={set('transferNullifier')} disabled={busy || working !== null} />
                <Field
                  label="New owner's secret"
                  value={form.transferSecret}
                  placeholder="64 hex chars — agree on it with the investor privately"
                  onChange={set('transferSecret')}
                  disabled={busy || working !== null}
                />
                <p className="sl-note">
                  Only a <em>commitment</em> to the new owner's secret goes on-chain — neither of you is ever named.
                </p>
                <details className="sl-details">
                  <summary>Learn more</summary>
                  <p>
                    The first hand-over must come from the auction winner; afterwards only the current holder can sell
                    on. The circuit publishes <code>hash(newOwnerSecret, invoice)</code> and nothing else — the
                    investor's identity stays hidden from everyone, including the chain. Share the secret itself with
                    the investor out of band: they will need it as their claim secret to resell later or prove payout
                    rights. After settlement the contract records an anonymous payee instead of any pseudonym.
                  </p>
                </details>
                <button
                  className="sl-button"
                  type="submit"
                  disabled={busy || working !== null || !isHex64(form.transferNullifier) || !isHex64(form.transferSecret)}
                >
                  {working === 'transferClaim' ? 'Working…' : 'Transfer claim'}
                </button>
              </form>

              <section className="sl-stage">
                <h3 className={sectionHeading}>Check my claim ownership</h3>
                <p className="sl-note">
                  Holder-only and fully local — your secret and the verdict never leave this browser.
                </p>
                <div className="sl-row" style={{ alignItems: 'stretch' }}>
                  <input
                    className="sl-input"
                    style={{ flex: 1 }}
                    value={form.checkNullifier}
                    placeholder="invoice nullifier (64 hex chars)"
                    onChange={(e) => set('checkNullifier')(e.target.value)}
                    disabled={busy || working !== null}
                  />
                  <button
                    className="sl-button sl-button-secondary"
                    type="button"
                    disabled={busy || working !== null || !isHex64(form.checkNullifier) || !ledgerState}
                    onClick={() => {
                      if (!api || !ledgerState) return;
                      const a = api;
                      const nf = form.checkNullifier.trim().toLowerCase();
                      void run('checkClaim', async () => {
                        const verdict = await a.checkClaim(nf, ledgerState);
                        setClaimCheck({ nullifier: nf, verdict });
                      });
                    }}
                  >
                    Check locally
                  </button>
                </div>
                {claimCheck && (
                  <p className={claimCheck.verdict === 'mine' ? 'sl-success' : 'sl-info'} style={{ marginBottom: 0 }}>
                    {claimCheck.verdict === 'mine'
                      ? '✅ You hold this claim — settlement pays its current holder.'
                      : claimCheck.verdict === 'other'
                        ? '❌ This claim belongs to someone else.'
                        : 'ℹ️ This claim was never transferred.'}
                  </p>
                )}
              </section>

              <section className="sl-stage">
                <h3 className={sectionHeading}>Claims on the secondary market</h3>
                {(ledgerState?.invoices ?? []).filter((inv) => inv.transferred).length === 0 ? (
                  <p className="sl-empty">No claims have been resold yet.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="sl-table">
                      <thead>
                        <tr>
                          <th>Invoice (nullifier)</th>
                          <th>Holder commitment</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(ledgerState?.invoices ?? [])
                          .filter((inv) => inv.transferred)
                          .map((inv) => (
                            <tr key={inv.nullifier}>
                              <td><HexBadge hex={inv.nullifier} /></td>
                              <td><HexBadge hex={inv.claimCommitment} /></td>
                              <td>{inv.lender ? 'settled anonymously' : 'open for resale'}</td>
                              <td>
                                {!inv.lender && (
                                  <button
                                    className="sl-button sl-button-secondary"
                                    type="button"
                                    disabled={busy || working !== null}
                                    onClick={() =>
                                      setForm((f) => ({ ...f, transferNullifier: inv.nullifier }))
                                    }
                                  >
                                    Resell ↓
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

              <section className="sl-stage">
                <h3 className={sectionHeading}>Pool claim transfer — per-lender</h3>
                <p className="sl-note">
                  Transfer your pool financing slot claim to another investor. Works before or after pool settlement.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!api) return;
                    const a = api;
                    void run('transferPoolClaim', async () => {
                      await a.transferPoolClaim(
                        form.poolTransferNullifier.trim(),
                        BigInt(form.poolTransferSlot.trim()),
                        form.poolTransferCommitment.trim(),
                      );
                      setMessage({ ok: true, text: 'Pool claim transferred successfully.' });
                    });
                  }}
                >
                  <Field label="Invoice nullifier" value={form.poolTransferNullifier} placeholder="64 hex chars" onChange={set('poolTransferNullifier')} disabled={busy || working !== null} />
                  <Field label="Slot index" value={form.poolTransferSlot} placeholder="0–3" onChange={set('poolTransferSlot')} disabled={busy || working !== null} />
                  <Field label="New owner commitment" value={form.poolTransferCommitment} placeholder="64 hex — hash(newSecret, nullifier)" onChange={set('poolTransferCommitment')} disabled={busy || working !== null} />
                  <button className="sl-button" type="submit" disabled={busy || working !== null || !isHex64(form.poolTransferNullifier) || !isDigits(form.poolTransferSlot) || !isHex64(form.poolTransferCommitment)}>
                    {working === 'transferPoolClaim' ? 'Working…' : 'Transfer pool claim'}
                  </button>
                </form>
              </section>
            </>
          )}

          {lenderTab === 'insurance' && (
            <>
              <section className="sl-stage">
                <h3 className={sectionHeading}>Default insurance pool</h3>
                <p className="sl-note">
                  Funded by 2% premiums at every registration; a proven default pays out 50% of the financed amount —
                  partially if the pool is thin.
                </p>
                {ledgerState?.insurancePool ? (
                  <p style={{ fontWeight: 'bold', fontSize: '1.2em', margin: '0.25rem 0' }}>
                    Balance: {ledgerState.insurancePool.balance.toString()} tNight
                  </p>
                ) : (
                  <p className="sl-empty">Not seeded yet — it fills with the first invoice registration.</p>
                )}
              </section>

              <section className="sl-stage">
                <h3 className={sectionHeading}>Defaulted invoices</h3>
                <p className="sl-note">
                  Financed, unsettled and past due — the current claim holder may collect now.
                </p>
                {defaultedInvoices.length === 0 ? (
                  <p className="sl-empty">No defaulted invoices right now.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="sl-table">
                      <thead>
                        <tr>
                          <th>Invoice (nullifier)</th>
                          <th>Financed amount</th>
                          <th>Due date</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {defaultedInvoices.map((inv) => (
                          <tr key={inv.nullifier}>
                            <td><HexBadge hex={inv.nullifier} /></td>
                            <td style={{ fontWeight: 'bold', color: 'var(--text)' }}>{inv.amount.toString()} tNight</td>
                            <td>{formatDate(dueDateOf(inv.nullifier))}</td>
                            <td>
                              <button
                                className="sl-button sl-button-secondary"
                                type="button"
                                disabled={busy || working !== null}
                                onClick={() => {
                                  setInsurancePayout(null);
                                  setForm((f) => ({ ...f, claimNullifier: inv.nullifier }));
                                }}
                              >
                                Claim ↓
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <form
                className="sl-stage"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!api) return;
                  const a = api;
                  const nf = form.claimNullifier.trim().toLowerCase();
                  setInsurancePayout(null);
                  void run('claimInsurancePayout', async () => {
                    const paid = await a.claimInsurancePayout(nf);
                    setInsurancePayout(paid.toString());
                  });
                }}
              >
                <h3 className={sectionHeading}>Collect insurance payout</h3>
                <Field label="Invoice nullifier" value={form.claimNullifier} placeholder="64 hex chars" onChange={set('claimNullifier')} disabled={busy || working !== null} />
                <p className="sl-note">
                  The circuit proves in zero knowledge that this invoice is financed, unsettled and past due, that you
                  hold its financing claim, and that the payout is exactly min(50% of it, the pool balance). The
                  defaulting SME stays anonymous.
                </p>
                {insurancePayout !== null && (
                  <p className="sl-success" style={{ marginBottom: 0 }}>
                    🛡️ Payout of <strong>{insurancePayout} tNight</strong> granted from the insurance pool.
                  </p>
                )}
                <button className="sl-button" type="submit" disabled={busy || working !== null || !isHex64(form.claimNullifier)}>
                  {working === 'claimInsurancePayout' ? 'Working…' : 'Claim payout'}
                </button>
              </form>

              <section className="sl-stage">
                <h3 className={sectionHeading}>Pool insurance — per-lender claim</h3>
                <p className="sl-note">
                  For pool-settled invoices that defaulted. Each lender claims their proportional share of the 50% insurance
                  entitlement based on their contribution. When the pool is thin, the shortfall is shared proportionally across all slots.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!api) return;
                    const a = api;
                    void run('claimPoolInsurancePayout', async () => {
                      const paid = await a.claimPoolInsurancePayout(
                        form.poolInsuranceNullifier.trim(),
                        BigInt(form.poolInsuranceSlot.trim()),
                      );
                      setMessage({ ok: true, text: `Pool insurance payout: ${paid.toString()} tNight` });
                    });
                  }}
                >
                  <Field label="Invoice nullifier" value={form.poolInsuranceNullifier} placeholder="64 hex chars" onChange={set('poolInsuranceNullifier')} disabled={busy || working !== null} />
                  <Field label="Slot index" value={form.poolInsuranceSlot} placeholder="0–3" onChange={set('poolInsuranceSlot')} disabled={busy || working !== null} />
                  <button className="sl-button" type="submit" disabled={busy || working !== null || !isHex64(form.poolInsuranceNullifier) || !isDigits(form.poolInsuranceSlot)}>
                    {working === 'claimPoolInsurancePayout' ? 'Working…' : 'Claim pool insurance'}
                  </button>
                </form>
              </section>
            </>
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
