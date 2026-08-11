// Pure argument parsing for the ShieldLedger CLI.
//
// Kept separate from cli.ts so the flag behaviour can be unit-tested without
// booting a wallet/network. The threshold is deliberately a *bigint string*:
// only the chosen bound is disclosed on-chain; the actual score stays in the
// private state and is never a CLI argument.

export interface ShieldLedgerCliArgs {
  /** The `--sme-credit-threshold` value (as a string) if provided. */
  readonly smeCreditThreshold: bigint | undefined;
  /** Unknown/unsupported flags the CLI should warn about. */
  readonly unknown: readonly string[];
}

export function parseShieldLedgerCliArgs(argv: readonly string[]): ShieldLedgerCliArgs {
  let smeCreditThreshold: bigint | undefined;
  const unknown: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--sme-credit-threshold=')) {
      const raw = arg.slice('--sme-credit-threshold='.length);
      if (raw === '' || !/^\d+$/.test(raw)) {
        throw new Error('--sme-credit-threshold expects a non-negative integer value.');
      }
      smeCreditThreshold = BigInt(raw);
    } else if (arg === '--sme-credit-threshold') {
      const raw = argv[i + 1];
      if (raw === undefined || !/^\d+$/.test(raw)) {
        throw new Error('--sme-credit-threshold expects a non-negative integer value.');
      }
      smeCreditThreshold = BigInt(raw);
      i++;
    } else {
      unknown.push(arg);
    }
  }

  return { smeCreditThreshold, unknown };
}
