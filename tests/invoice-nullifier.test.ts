import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  deriveInvoiceNullifier,
  findRegisteredInvoice,
  generateInvoiceSecret,
  hexToBytes,
  registerInvoiceLocally,
} from '../frontend/src/invoice-registry';

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

  it('reports no matching invoice when nothing has been stored', () => {
    // No localStorage in the node test environment: the registry is empty.
    expect(findRegisteredInvoice({ reference: 'INV-001', amount: 1000n, dueDate: 4102444800n })).toBeUndefined();
  });

  it('does not throw when storage is unavailable', async () => {
    const record = await registerInvoiceLocally({ reference: 'INV-001', amount: 1000n, dueDate: 4102444800n });
    expect(record.nullifier).toMatch(/^[0-9a-f]{64}$/);
    expect(record.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(record.reference).toBe('INV-001');
  });
});
