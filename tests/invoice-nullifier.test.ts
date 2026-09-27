import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bytesToHex,
  deriveInvoiceNullifier,
  findRegisteredInvoice,
  generateInvoiceSecret,
  hexToBytes,
  registerInvoiceLocally,
} from '../frontend/src/invoice-registry';

const SCOPE_A = { shieldedAddress: '0xwallet-a', contractAddress: '0xcontract-1' };
const SCOPE_B = { shieldedAddress: '0xwallet-b', contractAddress: '0xcontract-1' };

/** Minimal in-memory localStorage for scoping tests. */
function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe('deriveInvoiceNullifier', () => {
  const base = {
    reference: 'INV-001',
    amount: 1000n,
    dueDate: 4102444800n,
  };

  it('is deterministic for identical invoice details and secret', async () => {
    const secret = generateInvoiceSecret();
    const a = await deriveInvoiceNullifier({ ...base, secret });
    const b = await deriveInvoiceNullifier({ ...base, secret });
    expect(a).toBe(b);
  });

  it('returns a 64-character hex digest', async () => {
    const secret = generateInvoiceSecret();
    const nullifier = await deriveInvoiceNullifier({ ...base, secret });
    expect(nullifier).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is blinded: a different secret gives a different nullifier', async () => {
    const a = await deriveInvoiceNullifier({ ...base, secret: generateInvoiceSecret() });
    const b = await deriveInvoiceNullifier({ ...base, secret: generateInvoiceSecret() });
    expect(a).not.toBe(b);
  });

  it('is bound to the invoice details: changing any field changes the nullifier', async () => {
    const secret = generateInvoiceSecret();
    const baseline = await deriveInvoiceNullifier({ ...base, secret });
    const otherAmount = await deriveInvoiceNullifier({ ...base, amount: base.amount + 1n, secret });
    const otherDue = await deriveInvoiceNullifier({ ...base, dueDate: base.dueDate + 1n, secret });
    const otherRef = await deriveInvoiceNullifier({ ...base, reference: 'INV-002', secret });
    expect(otherAmount).not.toBe(baseline);
    expect(otherDue).not.toBe(baseline);
    expect(otherRef).not.toBe(baseline);
  });

  it('does not reveal the invoice details in the nullifier', async () => {
    const secret = generateInvoiceSecret();
    const nullifier = await deriveInvoiceNullifier({ ...base, secret });
    expect(nullifier).not.toContain(base.reference);
    expect(nullifier).not.toContain(base.amount.toString());
    expect(nullifier).not.toContain(base.dueDate.toString());
  });
});

describe('invoice registry', () => {
  it('round-trips secrets through hex encoding', () => {
    const secret = generateInvoiceSecret();
    expect(hexToBytes(bytesToHex(secret))).toEqual(secret);
  });

  it('reports no matching invoice when nothing has been stored for the scope', () => {
    // No localStorage in the node test environment: the registry is empty.
    expect(
      findRegisteredInvoice({ reference: 'INV-001', amount: 1000n, dueDate: 4102444800n }, SCOPE_A),
    ).toBeUndefined();
  });

  it('does not throw when storage is unavailable', async () => {
    const record = await registerInvoiceLocally(
      { reference: 'INV-001', amount: 1000n, dueDate: 4102444800n },
      SCOPE_A,
    );
    expect(record.nullifier).toMatch(/^[0-9a-f]{64}$/);
    expect(record.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(record.reference).toBe('INV-001');
  });
});

describe('invoice registry scoping', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isolates invoices per wallet on the same contract', async () => {
    await registerInvoiceLocally({ reference: 'InvoiceDagdu', amount: 1200n, dueDate: 4102444800n }, SCOPE_A);
    await registerInvoiceLocally({ reference: 'Sample invoiceJB', amount: 3400n, dueDate: 4103654400n }, SCOPE_B);

    const ownedByA = findRegisteredInvoice(
      { reference: 'InvoiceDagdu', amount: 1200n, dueDate: 4102444800n },
      SCOPE_A,
    );
    const leakedB = findRegisteredInvoice(
      { reference: 'InvoiceDagdu', amount: 1200n, dueDate: 4102444800n },
      SCOPE_B,
    );
    expect(ownedByA).toBeDefined();
    expect(leakedB).toBeUndefined();
  });

  it('isolates invoices per contract for the same wallet', async () => {
    const inv = { reference: 'INV-77', amount: 500n, dueDate: 4102444800n };
    await registerInvoiceLocally(inv, SCOPE_A);
    const otherContract = { shieldedAddress: SCOPE_A.shieldedAddress, contractAddress: '0xcontract-2' };
    const elsewhere = findRegisteredInvoice(inv, otherContract);
    const own = findRegisteredInvoice(inv, SCOPE_A);
    expect(elsewhere).toBeUndefined();
    expect(own).toBeDefined();
  });

  it('returns an empty list when the scope is incomplete', async () => {
    await registerInvoiceLocally({ reference: 'INV-88', amount: 500n, dueDate: 4102444800n }, SCOPE_A);
    const incomplete = findRegisteredInvoice(
      { reference: 'INV-88', amount: 500n, dueDate: 4102444800n },
      { shieldedAddress: '', contractAddress: '' },
    );
    expect(incomplete).toBeUndefined();
  });

  it('re-registering identical details reuses the same nullifier within a scope', async () => {
    const first = await registerInvoiceLocally(
      { reference: 'INV-999', amount: 777n, dueDate: 4102444800n },
      SCOPE_A,
    );
    const second = await registerInvoiceLocally(
      { reference: 'INV-999', amount: 777n, dueDate: 4102444800n },
      SCOPE_A,
    );
    expect(second.nullifier).toBe(first.nullifier);
  });
});
