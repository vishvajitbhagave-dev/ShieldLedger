# Compact 0.23 — Privacy Constraints: Disclosure & Ledger Writes

## Experiment 1: Undisclosed Parameter Constraint Verification

### Question

Can Compact 0.23 enforce arithmetic constraints (e.g. `assert(a + b + c + d == total)`)
over circuit parameters that are **never** wrapped in `disclose()`?

### Answer

**Yes.** `disclose()` controls on-chain visibility only. It has zero effect on constraint
enforcement. Undisclosed parameters are fully constrained by `assert()` just like disclosed
ones. A prover cannot cheat by providing arbitrary undisclosed values — the constraint
system rejects them.

### Test results (10/10 passed)

| Circuit | Scenario | Result |
|---|---|---|
| `sumUndisclosed` | correct sum (1000+2000+3000+4000 == 10000) | pass |
| `sumUndisclosed` | wrong sum (same inputs, expected=10001) | throws |
| `sumUndisclosed` | cheat attempt (99+99+99+99 == 10000) | throws |
| `sumUndisclosed` | large values (2^32-1 + 1) | pass |
| `sumUndisclosed` | wrong large values (2^32-1 + 2 == 2^32-1) | throws |
| `sumHybrid` | correct sum (mix disclosed/undisclosed) | pass |
| `sumHybrid` | wrong sum | throws |
| `sumHybrid` | cheat on undisclosed values | throws |

---

## Experiment 2: Ledger-Write Disclosure Rule

### Question

If an undisclosed parameter flows into a ledger write (even indirectly via `persistentHash`),
can it remain private?

### Answer

**No.** Compact 0.23's privacy analysis enforces a hard rule: **any value that flows into a
ledger write — directly or indirectly, including as input to `persistentHash` whose output is
inserted into a ledger map — must be wrapped in `disclose()`.** The compiler emits:

```
potential witness-value disclosure must be declared but is not:
  nature of the disclosure:
    ledger operation might disclose a hash of the witness value
```

`disclose()` makes the value a **public input** to the circuit, visible on-chain to anyone
verifying the proof. This is not an optional annotation — it is a semantic requirement. The
compiler will not generate the circuit without it.

### Why this exists

If a hash of a private value is stored on-chain, an attacker could brute-force the hash
(since `Uint<64>` has only 2^64 possible values — large but not infinite). The compiler
forces the programmer to acknowledge this by disclosing the value, ensuring no private data
leaks through ledger writes without explicit intent.

### What this means concretely

| Value type | Private? | Why |
|---|---|---|
| Used only in `assert()` / arithmetic | **YES** | No ledger write involved |
| Flows into `persistentHash` → ledger `insert()` | **NO** | Compiler requires `disclose()` |
| Flows into `persistentHash` → read-only (no insert) | **YES** | No ledger write; hash verified off-chain |

### Applied to ShieldLedger

In `settleSplitInvoice`:
- **Contributions (`contribution0..3`)**: Not directly disclosed on-chain. They are never
  written to a ledger and carry no `disclose()`, so the Compiler doesn't force them public.
  They are used only as private witnesses in the sum proof and `verifyProportionalPayout`
  (pure arithmetic assertions, no ledger writes).
- **Payouts (`payout0..3`)**: **Public.** They flow into
  `payoutCommitments.insert(..., persistentHash(PayoutSeal { payout: disclose(payout) }))`.
  The compiler requires `disclose()` for the ledger write, making payouts public inputs.
  `totalPayout` is likewise stored publicly on-chain in `Invoice.amount`.

In `claimPoolInsurancePayout`:
- **`settlementPayout`**: Private. It flows into `persistentHash` for **verification only**
  (the hash is compared against a stored commitment, not inserted into a ledger). No ledger
  write → no disclosure required.

### Design consequence

The payout commitment scheme (`persistentHash` of slotKey + payout, stored on-chain) provides
**binding** (a claimant cannot fabricate their payout value) but **not privacy** (the payout
amount is visible as a public input).

### Known limitation: contribution amounts are derivable, not secret

While no contribution value is directly disclosed or written to the ledger, **true per-lender
contribution secrecy is NOT achieved** by the current design. The public information released
on a pool settlement is sufficient to back-calculate each contribution amount:

1. `sum(contribution_i) == invoiceAmount` is proven publicly (invoiceAmount is public since
   registration).
2. Each `payout_i` is a public input, and `totalPayout` is public on-chain (`Invoice.amount`).
3. The proportional proof forces `payout_i / totalPayout == contribution_i / totalContribution`.
4. Since settlement always uses `totalContribution == sum(contributions) == invoiceAmount`, it
   follows exactly that `contribution_i == invoiceAmount * payout_i / totalPayout`.

All three factors on the right are public, so **every lender's exact contribution amount is
mathematically derivable** from on-chain data. What the design genuinely provides is *aggregate*
privacy — an observer cannot tell which contribution belonged to which pseudonym without the
public slot-to-pseudonym mapping, and can see the pool as a whole — not per-lender secrecy.

**This is a known limitation for future work**, alongside the payout-visibility limitation.
Closing it would require hiding or unlinking the public anchors used here (e.g. not publishing
`totalPayout`/per-lender payouts in a form tied to `invoiceAmount`, or proving proportionality
against a hidden total).
