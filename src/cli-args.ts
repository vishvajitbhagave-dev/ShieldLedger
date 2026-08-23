// Pure argument parsing for the ShieldLedger CLI.
//
// Kept separate from cli.ts so the flag behaviour can be unit-tested without
// booting a wallet/network. The thresholds are deliberately *bigint strings*:
// only the chosen bounds are disclosed on-chain; the actual scores stay in the
// private state and are never CLI arguments. `--confirm-invoice` drives the
// buyer role: a one-shot confirmation of a pending invoice by its nullifier.
// `--min-reputation` sets the lender's private reputation bar for bidding
// (persisted, never disclosed). `--show-reputation` prints the SME's private
// score and on-time/late history for the network and exits.
// `--demo-reputation-cycle` runs the demo-only reputation tool
// (scripts/demo-reputation-cycle.ts) and exits - no network or wallet needed.
// Secondary market: `--transfer-claim <hex> --new-owner-secret <hex>` resells
// the caller's claim on an invoice to a new investor (identified only by a
// commitment to their secret); `--check-claim <hex>` runs a holder-only local
// ownership check against the on-chain commitment.

const NULLIFIER_RE = /^[0-9a-fA-F]{64}$/;
const NON_NEGATIVE_INTEGER_RE = /^\d+$/;

export interface ShieldLedgerCliArgs {
  /** The `--sme-credit-threshold` value (as a string) if provided. */
  readonly smeCreditThreshold: bigint | undefined;
  /** The `--confirm-invoice` nullifier (64 hex chars) if provided. */
  readonly confirmInvoiceNullifier: string | undefined;
  /** The `--confirm-amount` the buyer attests to if provided. */
  readonly confirmAmount: bigint | undefined;
  /** The `--min-reputation` value if provided. */
  readonly minReputation: bigint | undefined;
  /** Print the SME's private reputation for this network and exit. */
  readonly showReputation: boolean;
  /** Run the demo-only reputation-cycle tool and exit (no network needed). */
  readonly demoReputationCycle: boolean;
  /** The `--transfer-claim` invoice nullifier if provided. */
  readonly transferClaimNullifier: string | undefined;
  /** The `--new-owner-secret` of the investor receiving the claim. */
  readonly newOwnerSecret: string | undefined;
  /** The `--check-claim` invoice nullifier for the local ownership check. */
  readonly checkClaimNullifier: string | undefined;
  /** Unknown/unsupported flags the CLI should warn about. */
  readonly unknown: readonly string[];
}

function parseUintValue(name: string, raw: string): bigint {
  if (raw === '' || !NON_NEGATIVE_INTEGER_RE.test(raw)) {
    throw new Error(`${name} expects a non-negative integer value.`);
  }
  return BigInt(raw);
}

function parseHexValue(name: string, raw: string): string {
  if (raw === '' || !NULLIFIER_RE.test(raw)) {
    throw new Error(`${name} expects exactly 64 hex characters.`);
  }
  return raw.toLowerCase();
}

export function parseShieldLedgerCliArgs(argv: readonly string[]): ShieldLedgerCliArgs {
  let smeCreditThreshold: bigint | undefined;
  let confirmInvoiceNullifier: string | undefined;
  let confirmAmount: bigint | undefined;
  let minReputation: bigint | undefined;
  let showReputation = false;
  let demoReputationCycle = false;
  let transferClaimNullifier: string | undefined;
  let newOwnerSecret: string | undefined;
  let checkClaimNullifier: string | undefined;
  const unknown: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--sme-credit-threshold=')) {
      smeCreditThreshold = parseUintValue('--sme-credit-threshold', arg.slice('--sme-credit-threshold='.length));
    } else if (arg === '--sme-credit-threshold') {
      smeCreditThreshold = parseUintValue('--sme-credit-threshold', argv[i + 1] ?? '');
      i++;
    } else if (arg.startsWith('--min-reputation=')) {
      minReputation = parseUintValue('--min-reputation', arg.slice('--min-reputation='.length));
    } else if (arg === '--min-reputation') {
      minReputation = parseUintValue('--min-reputation', argv[i + 1] ?? '');
      i++;
    } else if (arg === '--show-reputation') {
      showReputation = true;
    } else if (arg === '--demo-reputation-cycle') {
      demoReputationCycle = true;
    } else if (arg.startsWith('--confirm-invoice=')) {
      confirmInvoiceNullifier = parseHexValue('--confirm-invoice', arg.slice('--confirm-invoice='.length));
    } else if (arg === '--confirm-invoice') {
      confirmInvoiceNullifier = parseHexValue('--confirm-invoice', argv[i + 1] ?? '');
      i++;
    } else if (arg.startsWith('--confirm-amount=')) {
      confirmAmount = parseUintValue('--confirm-amount', arg.slice('--confirm-amount='.length));
    } else if (arg === '--confirm-amount') {
      confirmAmount = parseUintValue('--confirm-amount', argv[i + 1] ?? '');
      i++;
    } else if (arg.startsWith('--transfer-claim=')) {
      transferClaimNullifier = parseHexValue('--transfer-claim', arg.slice('--transfer-claim='.length));
    } else if (arg === '--transfer-claim') {
      transferClaimNullifier = parseHexValue('--transfer-claim', argv[i + 1] ?? '');
      i++;
    } else if (arg.startsWith('--new-owner-secret=')) {
      newOwnerSecret = parseHexValue('--new-owner-secret', arg.slice('--new-owner-secret='.length));
    } else if (arg === '--new-owner-secret') {
      newOwnerSecret = parseHexValue('--new-owner-secret', argv[i + 1] ?? '');
      i++;
    } else if (arg.startsWith('--check-claim=')) {
      checkClaimNullifier = parseHexValue('--check-claim', arg.slice('--check-claim='.length));
    } else if (arg === '--check-claim') {
      checkClaimNullifier = parseHexValue('--check-claim', argv[i + 1] ?? '');
      i++;
    } else {
      unknown.push(arg);
    }
  }

  return { smeCreditThreshold, confirmInvoiceNullifier, confirmAmount, minReputation, showReputation, demoReputationCycle, transferClaimNullifier, newOwnerSecret, checkClaimNullifier, unknown };
}
