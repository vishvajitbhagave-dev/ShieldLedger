// Pure argument parsing for the ShieldLedger CLI.
//
// Kept separate from cli.ts so the flag behaviour can be unit-tested without
// booting a wallet/network. The threshold is deliberately a *bigint string*:
// only the chosen bound is disclosed on-chain; the actual score stays in the
// private state and is never a CLI argument. `--confirm-invoice` drives the
// buyer role: a one-shot confirmation of a pending invoice by its nullifier.

const NULLIFIER_RE = /^[0-9a-fA-F]{64}$/;
const NON_NEGATIVE_INTEGER_RE = /^\d+$/;

export interface ShieldLedgerCliArgs {
  /** The `--sme-credit-threshold` value (as a string) if provided. */
  readonly smeCreditThreshold: bigint | undefined;
  /** The `--confirm-invoice` nullifier (64 hex chars) if provided. */
  readonly confirmInvoiceNullifier: string | undefined;
  /** The `--confirm-amount` the buyer attests to if provided. */
  readonly confirmAmount: bigint | undefined;
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
  const unknown: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--sme-credit-threshold=')) {
      smeCreditThreshold = parseUintValue('--sme-credit-threshold', arg.slice('--sme-credit-threshold='.length));
    } else if (arg === '--sme-credit-threshold') {
      smeCreditThreshold = parseUintValue('--sme-credit-threshold', argv[i + 1] ?? '');
      i++;
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
    } else {
      unknown.push(arg);
    }
  }

  return { smeCreditThreshold, confirmInvoiceNullifier, confirmAmount, unknown };
}
