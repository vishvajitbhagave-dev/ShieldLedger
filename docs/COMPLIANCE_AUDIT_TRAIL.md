# Compliance / Audit Trail — ShieldLedger

An exportable report a regulator or auditor can use to verify the system behaved
honestly — correct settlements, no double-financing, no fabricated payouts,
insurance rules followed — **without exposing any private data**.

> **Self-conducted, like the rest of this project.** This is a developer-authored
> feature and explanation, not an external or professional compliance attestation
> or a formal proof of correctness. It follows the same honesty standard as
> `docs/SECURITY_AUDIT.md` and `docs/GAS_OPTIMIZATION.md`: it states exactly what
> it does and does not prove, and does not overclaim.

---

## 1. What this is

A **read-only export of already-public on-chain state**. The audit trail adds **no
new contract circuit, no new ledger state, and no new disclosure**. It is purely a
frontend module (`frontend/src/audit-export.ts`) that:

- reads the same `ShieldLedgerDerivedState` that the Dashboard and LedgerView
  already consume (`useLedgerState()` / `toDerivedState()`),
- reuses the existing pure calculations (`computeDashboardMetrics` and
  `computeCircuitBreakerStatus` — both already public-data-only),
- and renders a structured JSON report plus a download entry point in the UI.

Because the source is the *existing public* view, no private field can be added to
the export without writing new code to pull it out of a private wallet — which
this module does not do.

### Why no contract changes are needed

Everything the report evidences is already a guarantee of the on-chain rules and
ZK proofs:

| Evidence in the report | Where it comes from existing state |
|---|---|
| Settlements happened / aggregate payout math was ZK-verified | Each on-chain `Invoice` with a `lender` recorded was only **accepted** at settlement because `verifyProportionalPayout` / `verifyUnitQuotient` asserts passed. No settlement can exist on-chain that failed its proof. |
| No fabricated payouts accepted | Pool settlements commit `persistentHash(PayoutSeal{slotKey, payout})` on-chain; insurance claims re-derive that hash from the undisclosed payout and must match it (`"payout commitment mismatch"`). If a fabricated payout had been accepted, that claim's value would have failed the binding check. |
| No double-financing / double-claiming | Registration, settlement, and insurance claims are single-use per nullifier/slot (`already registered`, `already financed`, `payout already claimed`). The export's `uniqueInvoices` vs `invoiceCount` equality reflects this. |
| Insurance rules followed | Pool balance transitions are proven equalities (never underflow); premiums are computed as `floor(amount/50)` in-circuit. |

The export reports these as **counts and structural facts of the accepted
state** — not by re-running proofs, but by observing that the state could only
have been produced through them.

---

## 2. What the export contains

A JSON document (`shieldledger-audit-<timestamp>.json`) with sections:

- **`summary`** — total invoices registered, settled, defaulted; financed exposure;
  pool balance; total premiums collected; total payouts made. Counts and
  aggregates only.
- **`evidence`** — correctness counters: number of settlements accepted by valid
  ZK proportional-payout proof, number of per-slot payout commitments bound
  on-chain, `fabricatedClaimsAccepted: 0`, `doubleFinancingEventsPresent: 0`,
  `uniqueInvoices` count.
- **`insurance`** — claims paid (count) plus per-claim lines of `{ nullifier,
  payout, claimedAt }` — all three are already public.
- **`circuitBreaker`** — current health (healthy/warning/critical), the four
  ratios, and any triggered conditions — from the existing off-chain market
  health monitor.
- **`invoices`** — per-invoice public ledger lines: `nullifier`, `smeCommitment`
  (an integrity hash, not an identity), `buyerVerified`, `invoiceAmount`,
  `lender` (pseudonym), `amount`, `dueDate`, `rateBps`, `splitCount`,
  `transferred`. No private fields.
- **`claims` / `caveats` / `privacyBoundary`** — explicit prose stating what the
  report proves and what it does not.

Every value is JSON-stringified public state; the module never reads a private
witness.

---

## 3. What the export DOES prove

- **On-chain rule-following.** The exported state is exactly what the system's
  ZK proofs and single-use guards accepted. A settlement whose payout math was
  wrong, a fabricated/inflated/deflated/cross-slot claim, or a double-finance
  could not appear in this state. The counts in `evidence` reflect those
  guarantees.
- **Aggregate insurance accounting.** Total premiums collected, total payouts
  made, and the current pool balance reconcile to the public pool ledger; the
  circuit-breaker health snapshot is computed from that same public data.

Concretely, an auditor can state: *"X settlements occurred, and because each
exists on-chain only behind a passing proportional-payout proof, all X were
ZK-verified; 0 fabricated claims and 0 double-financing events are present."*

---

## 4. What the export does NOT prove (be explicit)

1. **Not a proof for any single real-world business.** It does not verify whether
   an SME's invoice corresponds to a genuine receivable, whether a buyer is
   legitimate, or any off-chain reality. `buyerVerified` only records that a
   corporate buyer *proved the invoice genuine to them* in ZK, not that the
   underlying business is sound.
2. **Not a check of off-chain wallet behavior.** It does not audit localStorage
   payout persistence, wallet secret custody, or anything that happens outside the
   on-chain contract.
3. **Not proof that fraud was *never attempted*.** It proves no *fabricated claim
   was accepted* on the public chain, not that no party ever tried to submit one
   off-chain (those attempts simply failed their proof and were never recorded).
4. **Not an independent cryptographic audit.** It relies on the project's tests
   and this document's reasoning; it carries no formal-verification or external
   professional assurance (see `docs/SECURITY_AUDIT.md` §5).
5. **Does not restore privacy the ledger doesn't already have.** Per the known
   limitations (`docs/compact-privacy-notes.md`): per-lender pool contributions
   are mathematically *derivable* from public payouts + invoice amount, the
   credit score is self-reported, and the reputation score is *reconstructable*
   from public settlement history. This export deliberately omits those values
   from its output, but it cannot (and does not claim to) make the underlying
   ledger more private than it already is. The report lists these as `caveats`.

---

## 5. The private-data boundary (guaranteed by construction)

The export **structurally cannot contain**:

- contribution amounts,
- credit scores (the live `score`/`smeCreditScore`),
- reputation scores (`smeReputationScore` / on-time/late counts),
- buyer identity (`buyerSecret` or anything linking a buyer to a real identity),
- lender secrets / claim secrets.

These values exist only in a wallet's **private state**, which the derived public
view does not carry. The explicit test `tests/audit-export.test.ts`
("NO PRIVATE FIELDS LEAK") walks every JSON object key in the exported report and
asserts no private-bearing key appears, and additionally asserts the raw JSON does
not contain any private marker values.

What the report does include that is *public but not identity-revealing*:
`commitment` hashes (integrity, not names), lender **pseudonyms**, and
`creditThreshold`/`reputationThreshold` ZK-proof **bounds** (not the scores
themselves — and these are not exported per-invoice in the current schema).

---

## 6. How a regulator / auditor would use it

1. **Export** — open the Analytics Dashboard and click **"Export Audit Trail
   (JSON)"** (a download named `shieldledger-audit-<timestamp>.json`).
2. **Read `summary` + `evidence`** — verify the headline correctness facts:
   total settled vs defaulted, `settlementsWithValidZkPayoutProof`,
   `fabricatedClaimsAccepted: 0`, `doubleFinancingEventsPresent: 0`.
3. **Cross-check `insurance` + pool accounting** — confirm claims paid reconcile
   with `totalPayouts`, and that the pool balance matches `poolBalance`.
4. **Review `circuitBreaker`** — see whether any public health metric is
   currently warning/critical (this is the same signal the UI banner shows).
5. **Confirm the boundary** — verify that trailing `privacyBoundary` / `caveats`
   and the absence of private keys match this document's §5 claim.

The report is intended as *evidence of on-chain behavior*, not as a substitute
for a formal audit or a business-level KYC/AML review of participating SMEs.

---

## 7. Files

- `frontend/src/audit-export.ts` — report generator + serializer + download helpers.
- `frontend/src/components/Dashboard.tsx` — "Export Audit Trail (JSON)" button.
- `tests/audit-export.test.ts` — report generation, empty-state, and the
  no-private-fields-leak guarantee.
