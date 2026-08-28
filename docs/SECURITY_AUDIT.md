# ShieldLedger — Security Audit & Threat Model

> **Self-conducted review.** This is not an external or professional security audit. It is a
> developer-authored threat model assembled from the real defenses, constraints, and known
> gaps that were actually discovered, implemented, and tested *during development* of this
> codebase. See [What this audit does NOT cover](#5-what-this-audit-does-not-cover) and
> [Methodology](#6-methodology-note).

---

## 1. Scope

**In scope.** The deployed application contract (`contracts/shield-ledger.compact`), the pool
escrow contract (`contracts/escrow.compact`), the offline market-health monitor
(`frontend/src/circuit-breaker.ts`), and the frontend/pricing logic that reads ledger state,
**as of the current commit** (`docs: add Future Features section`, `579bb3f` on `origin/main`).

Concretely, the security-relevant surfaces covered here are:

- Invoice registration, buyer verification, and the sealed-bid auction (`submitBid` /
  `revealBid` / `revealPoolBid`), settlement (`settleInvoice` / `settleSplitInvoice`).
- The private secondary market (`transferClaim` / `transferPoolClaim`).
- Default insurance claims, single-lender (`claimInsurancePayout`) and pool
  (`claimPoolInsurancePayout`).
- Pool proportional payout math and the floor-rounding remainder routing.
- The offline circuit-breaker health monitor (Part A).
- The documented privacy gaps (credit self-report, reputation reconstructability, pool
  contribution derivability, payout visibility).

**Explicitly out of scope.**

- No external or professional audit was performed.
- No formal verification of the ZK circuits was performed.
- The underlying cryptographic primitives (Midnight's `persistentHash`, the Compact ZK
  proof system, base-chain transaction layer) are **assumed correct** and were **not
  independently verified**.

---

## 2. Threat Model

Each row's **Status** reflects the *actual* guarantee in code, verified against the cited
circuit lines and test names. Nothing is rounded up. Where a defense is partial, that is
stated explicitly. Rows marked **Known limitation** link to the corresponding entry in the
README [Known Limitations](../../README.md#known-limitations) (linked inline, not duplicated here).

| # | Attack vector | Defense mechanism | Status |
|---|---|---|---|
| 1 | **Double-financing / double-claiming an invoice** — register the same invoice twice, finance it twice, or claim insurance twice. | Registration is single-use (`assert(!invoices.member(nullifier), "invoice already registered")`, `shield-ledger.compact:287`, test `error-messages.test.ts:39`). Settlement is gated on the invoice not already being financed (`assert(!lender.is_some, "already financed")` at `shield-ledger.compact:380` single / `:605` pool; pool test `pool-settlement.test.ts:519–530` "rejects settlement on already-financed invoice"). Insurance claims are single-use per nullifier (single: `assert(!insuranceClaims.member(nullifier), "payout already claimed")` `:704`, test `insurance-pool.test.ts:148` "never pays twice for the same default"; pool: `assert(!insuranceClaims.member(slotKey), "payout already claimed")` `:808`, test `pool-insurance.test.ts:156` "rejects double claim on same slot"). | **Defended** — the nullifier is the uniqueness anchor; every destructive transition is idempotence-guarded. |
| 2 | **Sealed-bid front-running** — a competing lender reads another lender's bid terms before the auction resolves and undercuts them. | `submitBid` stores only a pseudonym + a hash *commitment* to the terms (`shield-ledger.compact:335–343`; terms never touch the ledger until reveal). `revealBid` re-derives the commitment from the private `lenderSecret` (`:364`) so only the bidder who holds the secret can reveal a matching bid (`"commitment mismatch"`). | **Defended (partial & honest)** — competitors cannot read each other's terms pre-reveal (only a hash is on-chain), so front-running by *observation* of another bid is prevented. **However**, the reveal is not non-replayable and there is a real *sweep/ordering* caveat: the circuit does not sequence or commit reveals, so an active multi-bid revealer can still be the *last* to reveal with full knowledge of the running best and publish a better term within the same block/finalization window. The pattern defends against *pre-reveal visibility*, not against *all order-dependent auction manipulation*. See #8 for the tie-break caveat. |
| 3 | **Replay attacks** — resubmitting a valid, already-executed transaction. | There is **no per-transaction nonce** in any circuit, and neither `SealedBid` nor `BestBid` carries a timestamp (`shield-ledger.compact:169–181`). Re-execution is instead prevented by *state-conditional guards*: each destructive operation flips the ledger into a new state that the same operation then rejects (registration `:287`, settlement `:380`/`:605`, claim-once `:704`/`:808`, escrow `deposit`/`release` once-only, escrow test `inter-contract.test.ts:161` "rejects releasing an escrow twice", buyer-verification no-replay test `buyer-verification.test.ts:95`). `invoiceCount` is an unbounded epoch counter "for UI/replay" (`:45`). | **Defended at the object level** — a replay that re-executes the *same* state-changing operation on the *same* object is rejected. **Not a transaction-level nonce**: raw proof-level replay prevention (distinct nonces per proof/transaction) is delegated to the underlying Midnight base layer, which is **out of scope** here and was not independently verified. This is a real boundary of the defense, not a guarantee. |
| 4 | **Pool settlement payout fabrication** — the SME fabricates a lender's payout to inflate (or deflate) an insurance claim, or to overpay an empty slot. | The settlement circuit **commits** each slot's payout on-chain as `persistentHash(PayoutSeal{slotKey, payout})` (`shield-ledger.compact:637–640`; private-state layout `:221–224`). At insurance-claim time the claimant must supply the previously *undisclosed* `settlementPayout` and the circuit recomputes the hash and requires it to match the stored commitment (`:795–798`, `"payout commitment mismatch"`). Verified by the dedicated binding tests in `pool-insurance.test.ts`: inflated value (`:269` "rejects a fabricated payout value"), **deflated** value (`:280`), a slot whose committed payout was never recorded (`:290`), per-slot binding (`:303`), and **cross-slot** use of another slot's payout (`:313` "rejects a claim using another slot's committed payout"). | **Defended** — the commitment is cryptographically binding (a fabricated/inflated/deflated/out-of-slot payout fails the hash check). Per `compact-privacy-notes.md`, the commitment gives **binding but not privacy**: the payout amount is still a public input. |
| 5 | **Overflow / underflow in proportional payout math** — arithmetic that wraps `Uint<64>` and fabricates an invalid share, or drains the insurance pool below zero. | `verifyProportionalPayout` asserts `contribution < 2^32` **before** any multiplication, guaranteeing `(2^32−1)² < 2^64` (`shield-ledger.compact:549–560`, comment `:546–548`). Pool-claim proportional math repeats the `< 2^32` guard (`:819`). The pool balance transition is proven as an equality (`pool.balance − payout == newPoolBalance`, `:710` single, `:828` pool) so an over-draining claim fails the assert (underflow documented `:687–688`). Verified by `pool-settlement.test.ts:437–471` "rejects a contribution ≥ 2^32" and `pool-insurance.test.ts:76–130` claims never exceed pool balance / drained-to-zero invariant. | **Defended** (enforced at the contribution boundary, i.e. per-slot amounts < 2^32; pool balance is proven, not computed, so no underflow reaches the ledger). |
| 6 | **Insurance claim fraud** (single-lender) — a non-holder claims, or a holder claims more than their 50% entitlement. | Authorization is cryptographically proven: untraded the auction leader proves `derivePseudonym(lenderSecret()) == best.lender`; traded the current holder re-derives the stored `claimCommitment` (`shield-ledger.compact:699–703`). Entitlement is proven via `verifyUnitQuotient(best.amount, maxEntitlement, 2)` = `floor(best.amount / 2)` and `payout ≤ maxEntitlement` (`:705–706`), with a drained-to-zero branch for thin pools (`:711–715`). | **Defended**. |
| 7 | **Insurance claim fraud** (pool) — a non-slot-holder claims, or claims a fabricated payout, or double-claims a slot. | Slot ownership is proven (original lender pseudonym match or current claim-commitment re-derivation, `shield-ledger.compact:801–805`), each slot is single-use (`:808`), the claimed payout is bound to the committed settlement value (`:795–798`), and the proportional share is upper-bounded (`:819–822`). Verified in `pool-insurance.test.ts`: auth mismatch (`:145`), double claim (`:156`), fabricated/inflated/deflated/cross-slot (`:269–343`), and total never exceeding the pool (`:76–130`). | **Defended**. |
| 8 | **Tie-break manipulation** in the Whole-Invoice-First logic — an SME or lender manipulating which bid wins. | `isBetter` enforces, in priority order: whole-bid always beats split-bid regardless of rate (`shield-ledger.compact:476–481`), then within the group **lowest rate → smallest amount → earliest due date** (`:482–485`). Settlement pays `bestBids` only — the SME cannot settle to a non-winning bidder (`settleInvoice` binds to `best`, `:382–396`). Verified by `shield-ledger.test.ts:258–284` (whole beats split even at worse rate; split never beats whole even at better rate). | **Defended for the ordering documented in code.** **Honest caveat:** the contract's header comment claims a final "**first revealer**" tie-break (`:29`, `:482` comment "first revealer"), but the `isBetter` circuit contains **no such term** — there is no timestamp in `SealedBid`/`BestBid` (`:169–181`) and `isBetter` returns `false` on exact ties (`:483–485`), leaving the *first* `bestBids` entry in place when equal. So the code preserves the first-revealed entry on exact ties, but a *strictly* better later bid always wins (no earliest-reveal priority). The "first revealer" wording is aspirational in the comment and not an enforced circuit guarantee. |
| 9 | **Systemic risk / market collapse** — the insurance pool depleting, default rate spiking, coverage collapsing. | **Part A (built, off-chain):** `computeCircuitBreakerStatus` (`frontend/src/circuit-breaker.ts:49–178`) reads public ledger data and computes four ratios — default rate (warn ≥15% / crit ≥30%), pool utilization (≥60% / ≥85%), coverage ratio (≤150% / ≤100%), payout-to-premium (≥0.6 / ≥0.9) — and reports the worst-of (`maxSeverity`) as a warning/critical banner. Verified across `circuit-breaker.test.ts:47–290`. | **Partially defended** — **Part A is detection/display only.** It reads public data, it does not pause or block anything, and it has no on-chain timestamp (no time-windowed trend detection — see Part B note below). |
| 9b | **Systemic risk — Part B (on-chain circuit breaker)** | **Not built.** Marked as a [Future Feature](../../README.md) (README `## Future Work`). The contract has **no admin/governance/pause authority** — every circuit is authorized purely by cryptographic proof. Introducing a privileged pauser is a deferred governance decision. | **Not applicable (deferred)** — documented, not defended. No automatic on-chain pause exists today. |
| 10 | **Oracle manipulation** — corrupting a payment/default oracle to force a settlement or insurance outcome. | **No oracle exists** in the current implementation; there is no oracle circuit, no oracle input, and settlement is manual (`settleInvoice` / `settleSplitInvoice` reveals provided by the SME, `shield-ledger.compact:377`, `:586`). An automated payment oracle is listed as a [Future Feature](../../README.md). | **Not applicable today** — no oracle to attack. **Forward-looking consideration:** when/if an oracle is added, its integrity and its inputs become a direct manipulation surface and must be defended then. No oracle-specific defense is invented for a feature that does not exist. |

### 2.1 Replay & nonce summary (consolidated)

For clarity, the replay posture is:

- **No per-transaction nonce** exists in any circuit. `submitBid`/`revealBid` use the same
  `SealedBid` record with no one-time field beyond the nullifier-slot.
- Re-execution protection at the application level is entirely **state-conditional** (guards
  like `already financed`, `invoice already registered`, `payout already claimed`, `escrow
  already exists`, `slot already filled`).
- The nullifier doubles as the only per-invoice freshness token. It prevents a settlement,
  registration, or claim from being applied twice to the same invoice — but it is **not** a
  transaction anti-replay nonce in the classic sense.

---

## 3. Known Privacy Limitations

These are real, already-audited gaps. They are documented in full in the README
[Known Limitations](../../README.md#known-limitations) and `docs/compact-privacy-notes.md`, and this audit
does **not** re-describe them — it links them so the two documents cannot drift:

- **Payout visibility** (accepted, Compact-enforced) — [README #known-limitations](../../README.md#known-limitations), `compact-privacy-notes.md:32–91`.
- **Contribution amounts are derivable, not secret** — [README #known-limitations](../../README.md#known-limitations), `compact-privacy-notes.md:93–114`.
- **Credit score is self-reported with no verification** — [README #known-limitations](../../README.md#known-limitations), `compact-privacy-notes.md:116–130`.
- **Reputation score is publicly reconstructable from settlement history** — [README #known-limitations](../../README.md#known-limitations), `compact-privacy-notes.md:132–142`.

Each is a **known limitation** (a documented privacy gap in the *built* system), not a
defended control. They are kept here as links rather than prose to guarantee a single source
of truth.

---

## 4. Known Limitations Referenced From This Audit's Table

The direct links used above (README anchors):

- `#1` double-financing → *not* a Known Limitation (fully defended).
- `#2` front-running → Defended with a partial caveat (order-dependence), reflected in §2 row 2.
- `#3` replay → Defended at object level; transaction-level nonce delegated to base layer (§2.1).
- `#4` payout fabrication → the integrity defense is Defended; the **privacy** half is the "Payout visibility" Known Limitation (linked above).
- `#9b` Part B circuit breaker → **not** a Known Limitation; it is a deferred [Future Feature](../../README.md).

---

## 5. What This Audit Does NOT Cover

Be explicit and honest:

1. **Self-conducted, not external.** This is a developer-authored review. It has not been
   performed, reviewed, or endorsed by any independent security firm; it carries no
   professional audit assurance.
2. **No formal verification of the ZK circuits.** The proof logic (sum proofs, proportional
   floor proofs, commitment bindings) is covered by simulator/unit tests, not by a formal
   prover or a proof-of-correctness argument against the Compact compiler.
3. **Underlying primitives assumed correct.** Midnight's `persistentHash`, the Compact ZK
   proof system, and the base-chain transaction/replay layer are taken as correct; they were
   not independently verified. Any flaw in these invalidates guarantees that depend on them
   (notably commitment binding in rows 2 and 4, and object-level replay in row 3).
4. **Not a gas/economic audit.** Fee math, pool premium mechanics, and capital-efficiency
   bounds are validated for correctness of invariants, not for adversarial economic
   incentive design.
5. **Code paths not exhaustively fuzzed or adversarially tested.** Test coverage is the set
   enumerated in the cited test files; no property-based fuzzing or formal adversarial
   search was run.

---

## 6. Methodology Note

This document was produced the way the project's real security findings were actually
produced: **iterative feature audits during development**, not a formal one-shot review. The
pattern was, for each subsystem built:

1. **Build the feature** (e.g. pooled multi-investor financing).
2. **Question the privacy/security claim** each new write made.
3. **Probe the boundary with targeted simulator tests** — e.g. the pooled-contribution gap
   was discovered by asking "what does the ledger actually reveal about an individual
   contribution?", then back-calculating it from public payouts + `invoiceAmount` as
   documented in `compact-privacy-notes.md`.
4. **Patch the docs to state the true guarantee** (README Known Limitations and
   `compact-privacy-notes.md`), and add binding tests for the integrity defenses
   (e.g. `pool-insurance.test.ts` fabricated/inflated/deflated/cross-slot cases).

So this audit's "findings" reflect findings that were genuinely reached and, where a real
defense existed, encoded in code and verified by tests; and where a gap was real, documented
as a limitation rather than hidden. No attack scenario was invented for this document; every
row in the threat model traces to a circuit assert, a governing comment, a Known Limitations
entry, or a named test.

---

## 7. Verification Appendix — claim → evidence

| Claim in this audit | Verified against |
|---|---|
| Double-financing defended | `shield-ledger.compact:287,380,605`; tests `pool-settlement.test.ts:519`, `insurance-pool.test.ts:148`, `error-messages.test.ts:39` |
| Sealed-bid terms hidden pre-reveal | `shield-ledger.compact:335–343,364`; `SealedBid` struct `:169–173` |
| No bid timestamp / no nonce | `SealedBid`/`BestBid` structs `:169–181` (grep: no `nonce`/`timestamp`) |
| Object-level replay guards | `shield-ledger.compact:287,380,605,704,808`; `escrow.compact:53,65`; tests `inter-contract.test.ts:161`, `buyer-verification.test.ts:95` |
| Payout commitment binding (fabricated/inflated/deflated/cross-slot) | `shield-ledger.compact:637–640,795–798`; tests `pool-insurance.test.ts:269,280,290,303,313` |
| Overflow cap < 2^32 before multiply | `shield-ledger.compact:549–560,819`; test `pool-settlement.test.ts:437` |
| Proportional payouts, sum-mismatch rejection | `shield-ledger.compact:609,615–618`; tests `pool-settlement.test.ts:397–433,476–502` |
| Pool balance proven (no underflow) | `shield-ledger.compact:710,828`; tests `pool-insurance.test.ts:76–130` |
| Single-lender claim auth + entitlement | `shield-ledger.compact:699–715,705–706` |
| Pool claim auth + single-use + bound | `shield-ledger.compact:795–808,819–822`; tests `pool-insurance.test.ts:145,156,269–343` |
| Whole-Invoice-First tie-break | `shield-ledger.compact:476–485`; tests `shield-ledger.test.ts:258–284` |
| "First revealer" tie-break claim (unverified / not enforced) | **discrepancy**: comment `:29,482` claims it; `isBetter` `:483–485` has no timestamp term; `SealedBid`/`BestBid` `:169–181` lack a timestamp |
| Circuit breaker Part A (off-chain detection) | `frontend/src/circuit-breaker.ts:49–178`; tests `circuit-breaker.test.ts:47–290` |
| Circuit breaker Part B deferred / no governance | README `## Future Work`; `contracts/*.compact` (no admin/pause authority found) |
| No oracle exists | grep across contracts: no oracle input/circuit; manual settlement `:377,:586`; README Future Feature |
| Privacy limitations (credit/reputation/contributions/payout) | README `#known-limitations` `:330–333`; `compact-privacy-notes.md:32–142` |

### 7.1 Items flagged as unconfirmed / not verified (not guessed)

- **"First revealer" tie-break** — the contract header/`isBetter` comment claim it, but the
  code and structs do not implement it. Flagged as a **comment/code discrepancy**, not
  asserted as a working control.
- **Transaction-level nonce / raw proof replay** — no circuit nonce exists; protection is
  delegated to the (out-of-scope, unverified) base layer. Flagged as **not verified here**.
- **`persistentHash` preimage resistance & struct domain separation** — noted as an
  outstanding item in `PROPOSAL.md:268`; **not re-verified** here.
- **Reputation clamp edge cases** (`src/reputation.ts` +10/−20, 0–100) — listed in
  `PROPOSAL.md:269` as an open item; the reconstructability *limitation* is verified, but an
  independent audit of the clamp arithmetic was **not** repeated.
