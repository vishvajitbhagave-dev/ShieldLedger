# ShieldLedger — Gas / Fee Optimization

> **Honest framing.** This pass performs **relative/structural optimization** — reducing the
> number of operations (map reads, lookups) that each circuit performs. It does **not** report
> precise gas-unit or fee numbers, because **this project has no gas/profiling measurement
> tool** (confirmed: `package.json` scripts are `compile`/`build`/`test`/`deploy`/etc.; there is
> no benchmark, gas-report, or profiling harness, and the only `profiling`/`bench*` files under
> the repo live in `node_modules` third-party dependencies). Every "before/after" figure below
> is therefore a **structural source-level count** of hash/multiplication/assert/read/write
> operations, not a measured gas cost.

---

## 1. Part 1 — Profiling (before numbers, measured by source inspection)

**Counting methodology** (per circuit):
- **hash** = `persistentHash(...)` calls (dominant cost in a ZK proof).
- **mult** = `*` multiplication operations.
- **assert** = explicit `assert(...)` (helpers like `verifyUnitQuotient` / `verifyProportionalPayout`
  contribute their own asserts and mults, included in the totals below).
- **read** = ledger `member`/`lookup` operations.
- **write** = ledger `insert` operations (the shared `invoiceCount.increment(1)` is counted once
  as a write and noted; it is present in every circuit).

The five heaviest circuits (by hash + mult + assert volume, which dominate ZK cost):

| # | Circuit | hash | mult | assert | read | write | Notes |
|---|---|---|---|---|---|---|---|
| 1 | `settleSplitInvoice` | 9 | 8 | ~20 | ~7 | 7 | 4×-unrolled pool logic; 8 of the 9 hashes are the 4 `poolSlotKey` + 4 `PayoutSeal` commitments |
| 2 | `claimPoolInsurancePayout` | 3 | 2 | ~15 | ~9 | 3 | heaviest single insurance path |
| 3 | `claimInsurancePayout` | 3 | 2 | ~12 | ~7 | 3 | single-lender insurance |
| 4 | `revealBid` | 3 | 0 | 6 | ~4 | 1 | 3 hashes: pseudonym, bid key, bid commitment |
| 5 | `registerInvoice` | 1 | 2 | ~6 | ~4 | 3 | has a 2 assertion + 2 mult `verifyUnitQuotient` premium check |

Other circuits: `settleInvoice` (1 hash, 5 asserts, ~5 reads, 1 write), `confirmInvoice`
(1 hash, 4 asserts, ~6 reads, 1 write), `submitBid` (2 hashes, 5 asserts, ~4 reads, 1 write),
`transferClaim` (1 hash, 4 asserts, ~2 reads, 1 write), `transferPoolClaim` (2 hashes, ~5
asserts, ~4 reads, 1 write), plus the pure helpers (`derivePseudonym`, `deriveBidKey`,
`poolSlotKey`, etc.) and the four small escrow circuits (`deposit`, `release`, `poolDeposit`,
`poolRelease` — 1–2 hashes, 2–4 asserts each).

### 1.1 Storage cost per ledger map

| Ledger map | Struct stored per entry | Redundancy / oversized? |
|---|---|---|
| `invoices` | `Invoice` = 3×Bytes32 + 5×Uint64 + 2×Bool + Maybe<Bytes32> | `creditThreshold` (Uint64) could be a smaller bound, **but** the value range is theoretically unbounded (SME-chosen, only floored at 650); storing as Uint64 is correct and not gamed-crossing. `reputationThreshold` (Uint64) similarly unbounded-upward. Not safely shrinkable. |
| `bids` | `SealedBid` = 3×Bytes32 (nullifier, lender, commitment) | `lender` is derivable from `deriveBidKey`/pseudonym, but storing it avoids an extra proof and is not a real waste at source level. `commitment` is required (sealed-bid). |
| `bestBids` | `BestBid` = 1×Bytes32 + 3×Uint64 + Bool | No redundancy; every field is public and read at settlement. |
| `bestPools` | `PoolBid` = 2×Bytes32 (lender, commitment) | Same reasoning as `bids`. |
| `payoutCommitments` | `PayoutCommitment` = 1×Bytes32 (hash) | Minimal. |
| `insurancePools` | `InsurancePool` = 1×Uint64 (balance) | Minimal; kept as a map because Compact cannot assign arithmetic back to a scalar ledger (documented in-contract). |
| `insuranceClaims` | `InsuranceClaim` = 2×Uint64 (payout, claimedAt) | `claimedAt` is public/derivable, but it is a genuine recorded field (when the claim happened). Not redundant. |
| `poolClaimCommitments` | `PoolClaim` = 1×Bytes32 + Bool | Minimal. |
| `escrows` / `poolEscrows` | `Escrow` = 2×Bytes32 + 1×Uint64 + Bool | Minimal (escrow.compact). |

**No field is safely shrinkable without a behavior/type change that could affect the privacy
or security invariants (all Uint64 amounts are genuinely unbounded within their usage), and
no stored field is truly redundant** — each is either required for a proof or read at a later
transition. Nothing here was changed.

### 1.2 Redundant computation (the real finding)

Two distinct kinds of waste were identified:

1. **Repeated `invoices.lookup` of the same key within one circuit** (redundant reads):
   - `confirmInvoice` — looked up `invoices[nullifier]` **4 times** (validation ×3 + the
     `current` const).
   - `settleInvoice` — looked up `invoices[nullifier]` **3 times**.
   - `submitBid` — looked up `invoices[nullifier]` **2 times**.
   These are genuinely redundant: one lookup returns the full `Invoice` struct, and all fields
   are already public (stored in a public map), so a single `const` can be reused everywhere.
   **Fix feasible: Yes** (safe, behavior-preserving — Part 2 below).

2. **`settleSplitInvoice` 4×-unrolled pool logic** — the 4-slot verification, 4 `poolSlotKey`
   hashes, and 4 `PayoutSeal` commitments are written out 4 times. **This is a genuine Compact
   0.23 language constraint** (no loops / no arrays for circuit bodies), so it is **not
   avoidable** without a bigger redesign. **Fix feasible: Needs bigger redesign** — not attempted.

3. **`persistentHash` on non-hashed-diff data** — checked: no hash is computed on data that
   could be a simpler equality. The payout commitments and sealed bids *must* be hashes for
   binding/privacy. No false finding here.

### 1.3 Part 1 findings table

| Circuit | Rough cost (hash/mult/assert/read/write) | Waste identified | Fix feasible without breaking behavior? |
|---|---|---|---|
| `settleSplitInvoice` | 9/8/20/7/7 | 4×-unrolled pool logic | **No** — Compact 0.23 has no loops; needs bigger redesign |
| `claimPoolInsurancePayout` | 3/2/15/9/3 | none | — |
| `claimInsurancePayout` | 3/2/12/7/3 | none | — |
| `revealBid` | 3/0/6/4/1 | none | — |
| `registerInvoice` | 1/2/6/4/3 | none | — |
| `settleInvoice` | 1/0/5/5/1 | 3× redundant `invoices.lookup` | **Yes** |
| `confirmInvoice` | 1/0/4/6/1 | 4× redundant `invoices.lookup` | **Yes** |
| `submitBid` | 2/0/5/4/1 | 2× redundant `invoices.lookup` | **Yes** |
| `transferClaim` | 1/0/4/2/1 | none | — |
| `transferPoolClaim` | 2/0/5/4/1 | none | — |
| escrow `deposit`/`release`/`poolDeposit`/`poolRelease` | 1–2/0/2–4/~2/1 | none | — |

---

## 2. Part 2 — What was actually changed

Three safe, behavior-preserving read-dedup optimizations were applied to
`contracts/shield-ledger.compact`. In each, a single `const <name> = invoices.lookup(nullifier)`
now replaces repeated inline lookups of the **same** key; the same struct fields are read,
in the same order, with **identical asserts, disclosures, and writes**. No disclosure set, no
security/binding check, and no privacy invariant changed.

| Circuit | Before | After | Net reduction |
|---|---|---|---|
| `confirmInvoice` | 4 × `invoices.lookup` | 1 × lookup + reuse | **−3 reads** |
| `settleInvoice` | 3 × `invoices.lookup` | 1 × lookup + reuse | **−2 reads** |
| `submitBid` | 2 × `invoices.lookup` | 1 × lookup + reuse | **−1 read** |

- `confirmInvoice`: was `const current = invoices.lookup(...)` at the *end* (after three
  inline validation lookups on lines 320/321/322); hoisted to the top and the three inline
  lookups replaced with `current.*`.
- `settleInvoice`: was 3 inline lookups (lines 379/380) then a `const current` at 391; hoisted
  one `const current` to the top and reused it for the SME-auth check, the already-financed
  check, and the receipt insertion.
- `submitBid`: two inline lookups (lines 338/339) collapsed into one `const invoice`.

**Why these are safe:**
- They remove redundant **reads of the same public map entry** — no value is newly revealed,
  hidden, or re-derived; the same public `Invoice` fields feed the same asserts.
- None of the recent privacy-fix surfaces are touched: no disclosure wrapper added/removed,
  no payout/contribution credit (in `settleInvoice` there is no disclosure change — only
  `current.transferred`/`current.smeCommitment` etc. are read), nothing to do with
  `settleSplitInvoice` payouts, credit-score self-report, reputation, or secondary-market
  commitments.

---

## 3. Part 2 — found but NOT changed (honest list)

| Item | Why not changed |
|---|---|
| `settleSplitInvoice` 4×-unrolled pool logic | **Genuine language constraint** — Compact 0.23 has no loops/arrays in circuit bodies; the 4 slots must be written out. Would require a bigger redesign (e.g. a different proof structure) and risks touching the payout-commitment privacy/binding work. Not worth the risk / not feasible here. |
| `InsurancePool` kept as a single-entry map | Required — Compact cannot assign arithmetic results back to a scalar ledger; the balance is proven via a passed-in `newPoolBalance` argument. A "fix" would be a compiler-language change, not a source-level optimization. |
| Shrinking `creditThreshold`/`reputationThreshold`/amount fields to smaller-than-Uint64 | Not safely shrinkable — these are genuinely unbounded upward (SME/lender-chosen, only floored). A tighter bound would change behavior. |
| Removing `SealedBid.lender` / `PoolBid.lender` | Not genuinely redundant — re-deriving the pseudonym would add a hash/proof, not save anything measurable, and risks the sealed-bid front-running/reveal logic. Not worth the risk. |
| Escrow contracts | Already small (1–2 hashes each); no measurable waste found. Not touched. |

---

## 4. Part 3 — Verification

1. **Recompiled** both contracts through the Compact 0.5.1 compiler (`wsl`):
   - `shield-ledger.compact` → "Compiling 11 circuits", exit **0**.
   - `escrow.compact` → "Compiling 4 circuits", exit **0**.
   - Fresh `contracts/managed/*` artifacts regenerated (timestamps 2026-08-28).
2. **Full test suite** (`npx vitest run`) against the freshly compiled optimized code:
   - **18 test files passed** / **278 tests passed** — **exactly matches the 278 baseline**
     recorded before any optimization.
3. **No test changes were required.** This is expected: the optimizations are
   behavior-preserving read-dedup refactors (same asserts, same disclosures, same writes), so
   no test needed to change. Any test change would have indicated a behavioral regression, and
   none appeared.

---

## 5. What this document does and does not claim

- **Claims:** structural reductions in the number of ledger reads per circuit (3 circuits,
  6 reads removed in total); recompile is clean; the full suite (278 tests) passes unchanged.
- **Does not claim:** any gas-unit or fee number. There is no benchmark tool in this project,
  so before/after values are source-level operation counts, not measured gas. On a ZK circuit,
  each eliminated `lookup` removes a membership/read sub-constraint, which is expected to reduce
  proving cost, but the exact magnitude was not measured and is not asserted.
