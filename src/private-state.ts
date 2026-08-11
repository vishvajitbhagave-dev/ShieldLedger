// Stable per-network private state for CLI/deploy runs.
//
// The contract's witnesses read the SME/lender secrets from the private state
// passed at deploy time. A CLI that reconnects must supply the *same* private
// state or the witness-derived commitments/pseudonyms change and circuits
// fail. This module persists one private state per network (like network.ts
// persists the wallet seed), so re-running `npm run cli` keeps identity.
//
// SECURITY: the file is owner-only (0o600) and gitignored, but it holds the
// secrets in hex at rest. On a shared machine set MIDNIGHT_WALLET_SEED etc.
// or delete the file to rotate identities.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { NetworkId } from './network';
import {
  createShieldLedgerPrivateState,
  randomBytes,
  type ShieldLedgerPrivateState,
} from './witnesses';

const PRIVATE_STATE_FILE = '.midnight-private-state.json';

export interface StoredPrivateState {
  version: 1;
  smeSecret: string;
  smeCreditScore?: string;
  lenderSecret: string;
  lenderCreditScore: string;
  lenderExposureCap: string;
  buyerSecret?: string;
}

type PrivateStateFile = Partial<Record<NetworkId, StoredPrivateState>>;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  return Uint8Array.from(clean.match(/.{2}/g) ?? [], (b) => parseInt(b, 16));
}

function statePath(cwd: string): string {
  return path.join(cwd, PRIVATE_STATE_FILE);
}

function readFile(cwd: string): PrivateStateFile {
  const p = statePath(cwd);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as PrivateStateFile;
  } catch {
    return {};
  }
}

function toStored(ps: ShieldLedgerPrivateState): StoredPrivateState {
  return {
    version: 1,
    smeSecret: bytesToHex(ps.smeSecret),
    smeCreditScore: ps.smeCreditScore.toString(),
    lenderSecret: bytesToHex(ps.lenderSecret),
    lenderCreditScore: ps.lenderCreditScore.toString(),
    lenderExposureCap: ps.lenderExposureCap.toString(),
    buyerSecret: bytesToHex(ps.buyerSecret),
  };
}

function fromStored(s: StoredPrivateState): ShieldLedgerPrivateState {
  return {
    smeSecret: hexToBytes(s.smeSecret),
    smeCreditScore: s.smeCreditScore !== undefined ? BigInt(s.smeCreditScore) : 720n,
    lenderSecret: hexToBytes(s.lenderSecret),
    lenderCreditScore: BigInt(s.lenderCreditScore),
    lenderExposureCap: BigInt(s.lenderExposureCap),
    buyerSecret: s.buyerSecret !== undefined ? hexToBytes(s.buyerSecret) : randomBytes(32),
  };
}

export function loadOrCreatePrivateState(
  network: NetworkId,
  cwd: string = process.cwd(),
): ShieldLedgerPrivateState {
  const file = readFile(cwd);
  const stored = file[network];
  if (stored && stored.version === 1) {
    const ps = fromStored(stored);
    if (stored.buyerSecret === undefined) {
      // Migration: pre-buyer files have no buyer secret. Generate one now and
      // persist it, so buyer confirmations survive a later restart.
      const next: PrivateStateFile = { ...file, [network]: toStored(ps) };
      fs.writeFileSync(statePath(cwd), `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    }
    return ps;
  }

  const ps = createShieldLedgerPrivateState();
  const next: PrivateStateFile = { ...file, [network]: toStored(ps) };
  fs.writeFileSync(statePath(cwd), `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return ps;
}
