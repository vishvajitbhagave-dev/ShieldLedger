// Derives the opaque on-chain nullifier for an invoice from its *private*
// details, and keeps a browser-local registry of the SME's own invoices so the
// same nullifier can be reused across Register / Bid / Reveal / Settle.
//
// Privacy model: only SHA-256("shieldledger:invoice:v1" || reference || amount
// || dueDate || secret) ever touches the ledger. The invoice fields stay in the
// browser; the random secret blinds the digest so nobody can guess which
// invoice a nullifier represents.

export const INVOICE_DOMAIN = 'shieldledger:invoice:v1';

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Fresh 32-byte blinding secret. Kept private in the browser. */
export function generateInvoiceSecret(): Uint8Array {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  return secret;
}

function u64be(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/**
 * nullifier = SHA-256(domain || reference || amount || dueDate || secret)
 *
 * Deterministic for identical inputs, unguessable without the secret, and
 * bound to the invoice details: the contract treats it as an opaque
 * Bytes<32>, so nothing about the invoice is disclosed.
 */
export async function deriveInvoiceNullifier(params: {
  reference: string;
  amount: bigint;
  dueDate: bigint;
  secret: Uint8Array;
}): Promise<string> {
  const enc = new TextEncoder();
  const parts = [
    enc.encode(INVOICE_DOMAIN),
    enc.encode(params.reference),
    u64be(params.amount),
    u64be(params.dueDate),
    params.secret,
  ];
  const input = new Uint8Array(parts.reduce((total, p) => total + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    input.set(p, offset);
    offset += p.length;
  }
  const digest = await crypto.subtle.digest('SHA-256', input);
  return bytesToHex(new Uint8Array(digest));
}

export interface RegisteredInvoice {
  readonly reference: string;
  readonly amount: string;
  readonly dueDate: string;
  readonly secret: string;
  readonly nullifier: string;
  readonly createdAt: number;
}

const STORAGE_KEY = 'shieldledger.registeredInvoices';

export function loadRegisteredInvoices(): RegisteredInvoice[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as RegisteredInvoice[]) : [];
  } catch {
    return [];
  }
}

function saveRegisteredInvoices(invoices: RegisteredInvoice[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
  } catch {
    // Storage unavailable (e.g. private mode): the invoice still works for this
    // session, it just can't be recalled on a later visit.
  }
}

/** The previously registered invoice with the same private details, if any. */
export function findRegisteredInvoice(params: {
  reference: string;
  amount: bigint;
  dueDate: bigint;
}): RegisteredInvoice | undefined {
  return loadRegisteredInvoices().find(
    (inv) =>
      inv.reference === params.reference &&
      inv.amount === params.amount.toString() &&
      inv.dueDate === params.dueDate.toString(),
  );
}

/**
 * Registers an invoice locally: derives its nullifier from the private details
 * plus a fresh secret and persists the record. Re-registering identical
 * details reuses the existing nullifier (idempotent).
 */
export async function registerInvoiceLocally(params: {
  reference: string;
  amount: bigint;
  dueDate: bigint;
}): Promise<RegisteredInvoice> {
  const existing = findRegisteredInvoice(params);
  if (existing) return existing;
  const secret = generateInvoiceSecret();
  const nullifier = await deriveInvoiceNullifier({
    reference: params.reference,
    amount: params.amount,
    dueDate: params.dueDate,
    secret,
  });
  const record: RegisteredInvoice = {
    reference: params.reference,
    amount: params.amount.toString(),
    dueDate: params.dueDate.toString(),
    secret: bytesToHex(secret),
    nullifier,
    createdAt: Date.now(),
  };
  saveRegisteredInvoices([...loadRegisteredInvoices(), record]);
  return record;
}

/** Re-derives the nullifier for a previously stored invoice. */
export async function deriveRegisteredNullifier(inv: RegisteredInvoice): Promise<string> {
  return deriveInvoiceNullifier({
    reference: inv.reference,
    amount: BigInt(inv.amount),
    dueDate: BigInt(inv.dueDate),
    secret: hexToBytes(inv.secret),
  });
}
