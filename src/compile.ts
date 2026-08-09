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

const DEFAULT_INPUT = 'contracts/shield-ledger.compact';
const DEFAULT_OUTPUT = 'contracts/managed/shield-ledger';

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
  const [input = DEFAULT_INPUT, output = DEFAULT_OUTPUT] = process.argv.slice(2);
  const isWin = process.platform === 'win32';
  const compact = findCompactBinary();

  if (!isWin) {
    return spawnSync(compact, ['compile', input, output], { stdio: 'inherit' }).status ?? 1;
  }

  const cmd = `'${compact}' compile '${toWslPath(input)}' '${toWslPath(output)}'`;
  return spawnSync('wsl', ['-e', 'bash', '-lc', cmd], { stdio: 'inherit' }).status ?? 1;
}

process.exit(main());
