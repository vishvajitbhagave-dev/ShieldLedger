// Cross-platform wrapper for the `compact` compiler.
//
// On Windows the `compact` binary is not on PATH — it lives inside WSL (see
// the project README, Phase 0). This script runs the compiler through
// `wsl -e bash -lc` when needed, translating Windows paths to /mnt/... form,
// so `npm run compile` works identically on Windows and POSIX.
//
// Customize the compiler location via the COMPACT_BIN env var.

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

const CONTRACTS: ReadonlyArray<readonly [string, string]> = [
  ['contracts/shield-ledger.compact', 'contracts/managed/shield-ledger'],
  ['contracts/escrow.compact', 'contracts/managed/escrow'],
];

function toWslPath(p: string): string {
  const abs = path.resolve(p).replace(/\\/g, '/');
  const m = /^([A-Za-z]):(\/.*)$/.exec(abs);
  return m ? `/mnt/${m[1].toLowerCase()}${m[2]}` : abs;
}

function findCompactBinary(): string {
  const env = process.env.COMPACT_BIN?.trim();
  if (env) return env;
  if (process.platform !== 'win32') return 'compact';

  const probe = spawnSync('wsl', ['-e', 'bash', '-lc', 'command -v compact'], {
    encoding: 'utf-8',
  });
  const found = (probe.stdout ?? '').trim().split(/\r?\n/)[0];
  if (probe.status === 0 && found) return found;
  return '/home/vishvajit/.local/bin/compact';
}

function main(): number {
  const args = process.argv.slice(2);
  const pairs = args.length >= 2 ? [[args[0], args[1]] as const] : CONTRACTS;
  const isWin = process.platform === 'win32';
  const compact = findCompactBinary();

  for (const [input, output] of pairs) {
    const status = isWin
      ? (spawnSync('wsl', ['-e', 'bash', '-lc', `'${compact}' compile '${toWslPath(input)}' '${toWslPath(output)}'`], { stdio: 'inherit' }).status ?? 1)
      : (spawnSync(compact, ['compile', input, output], { stdio: 'inherit' }).status ?? 1);
    if (status !== 0) return status;
  }
  return 0;
}

process.exit(main());
