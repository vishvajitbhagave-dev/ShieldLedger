# ShieldLedger — architecture & requirements

## Two contracts, one financing lifecycle

ShieldLedger is a multi-contract system: the confidential auction contract and a
separate escrow contract that holds the winning lender's financing until the
invoice is settled.

| Contract | Source | Ledger |
| --- | --- | --- |
| `ShieldLedger` | `contracts/shield-ledger.compact` | invoices, sealed bids, best bids |
| `Escrow` | `contracts/escrow.compact` | escrows (locked/released) per invoice |

### Inter-contract communication

The Compact reference states that the current compiler "does not fully implement
declarations of contracts and the cross-contract calls they support" — the
`contract` keyword is reserved but not yet usable. There is therefore **no
on-chain `Escrow.something()` call** from `ShieldLedger`.

Instead, the two contracts are coordinated **off-chain by a communication
layer**, `frontend/src/escrow-orchestrator.ts`:

```
ShieldLedger ledger                      Escrow contract
  (bestBids, invoices)                        (escrows)
        │                                        ▲
        │  read (via state$ / indexer)           │  transactions
        ▼                                        │
  planEscrowCommands() ──── deposit / release ───┘
      (pure, tested)
```

- A winning bid on `ShieldLedger` ⇒ the layer issues a `deposit` for exactly the
  winning amount.
- A settled invoice (lender set) with a still-locked escrow ⇒ the layer issues a
  `release`.
- The layer is idempotent: it skips anything already escrowed or released.

**Ownership still crosses the contract boundary securely.** Both contracts store
the *same* `smeCommitment = persistentHash([nullifier, secret])`. The private
secret that lets the SME settle an invoice on `ShieldLedger` is exactly the
secret required to `release` the escrow — nothing about the SME is disclosed on
either chain. This is proven end-to-end in `tests/inter-contract.test.ts`
(shared-commitment equality across both ledgers is asserted).

```
ShieldLedger:  smeCommitment = hash(nullifier, smeSecret)   ──┐
                                                              │ same secret,
Escrow:        smeCommitment = hash(nullifier, smeSecret)   ──┘ same value
```

## Advanced smart-contract development — requirement checklist

| # | Requirement | Status | Where |
| --- | --- | --- | --- |
| 1 | Advanced ZK smart-contract development with a private/public data split | ✅ | `contracts/shield-ledger.compact` — every circuit, split annotated; bids, invoices, credit score stay private |
| 2 | Event streaming & real-time updates on a public ledger | ✅ | DApp subscribes to `state$` (`frontend/src/use-ledger-state.ts`); live badge + last-update time in the header |
| 3 | Deployment and interaction with the deployed contract | ✅ | `src/setup.ts`, `src/deploy.ts`, CLI, live **preprod** deployment, `state$` interactions, `scripts/e2e-check.ts` |
| 4 | Writing tests for contracts and frontend | ✅ | `tests/` — 25 files, **348 tests**: `shield-ledger`, `pool-financing`, `pool-settlement`, `pool-insurance`, `insurance-pool`, `secondary-market`, `buyer-verification`, `inter-contract`, `reputation`, `invoice-status`, `invoice-nullifier`, `time`, `cli-args`, `error-messages`, `private-keys`, `pricing`, `price-impact`, `bid-depth`, `rate-trend`, `lender-portfolio`, `dashboard-metrics`, `circuit-breaker`, `audit-export`, `reputation-backtest`, `stress-test` |
| 5 | Error handling and loading states | ✅ | deploy/connect errors + dismissible banner, busy/working states, `wallet-locked` retry, new React `ErrorBoundary`, ledger-stream error badge |
| 6 | Inter-contract communication | ✅ (platform-equivalent) | Second `Escrow` contract + off-chain communication layer (see above); on-chain cross-contract calls are not yet implemented by the Compact compiler |
| 7 | Production deployment architecture | ✅ | CI + Pages CD, env-driven config, TS strict, single-version WASM override, gitignored secrets, public site at `/ShieldLedger/` |
| 8 | Documentation and demo/presentation | ✅ | This file + README (architecture, demo script, privacy properties, live links) |
| 9 | Advanced smart-contract development | ✅ | sealed-bid auction, commitment/reveal, ZK credit check & exposure cap, **ZK buyer verification**, **ZK cross-deal reputation (registration bound + lender minimum)**, contract-enforced settlement fairness, **automated default insurance pool with division-free percentage proofs** |

### Demo tool: reputation across invoice cycles

`scripts/demo-reputation-cycle.ts` (`npm run demo:reputation`, or
`npm run cli -- --demo-reputation-cycle`) is a **demo-only** tool for terminal
recordings. It drives the headless simulator (`tests/shield-ledger-simulator.ts`)
through scripted invoice cycles — real Compact circuits, real
`applyReputationUpdate` from `src/reputation.ts` — and prints the SME's
reputation before/after each settlement. It never touches a network or a wallet
and is explicitly not part of the production flow.

### Notes on honest platform limits

- **Cross-contract calls (req 6).** The compiler reserves `contract` but rejects
  external-contract references (`invalid context for reference to contract type
  name`), matching the Compact reference. The event-driven, shared-commitment
  pattern above is the supported equivalent; the demo flow is fully simulated in
  `tests/inter-contract.test.ts`.
- **Amounts are data.** Neither contract issues or moves real NIGHT/DUST tokens
  (no `Token`/`Coin` circuits); amounts are `Uint<64>` fields on a public ledger.
  Token-backed escrow would layer `send` circuits on the same structure.
- **Data provenance / non-goals.** For where every displayed value comes from and how much
  to trust it — the on-chain/private/off-chain trust categories, why a per-invoice
  multi-bid "order book" is a deliberate non-goal, and why an indexer-based bid-history
  service was considered and not pursued — see
  [docs/TRUST_AND_DATA_PROVENANCE.md](TRUST_AND_DATA_PROVENANCE.md).

## Level-5 feature layer (added since the auction MVP)

The core auction, buyer verification, reputation, single-lender secondary market,
and single-lender insurance pool described above were the original product. Since
then the contract and DApp have grown into the full feature set documented in the
README:

### Pooled multi-investor financing (split invoices)

An SME can register an invoice with `splitCount` 2–4 so up to four lenders
co-finance it instead of a single winner:

- Registration with `splitCount > 0` does not populate `bestBids`; pool bids are
  tracked independently in the pool maps.
- Each lender submits the usual sealed `submitBid` commitment, then reveals it for a
  specific slot with `revealPoolBid(nullifier, slotIndex, commitment)`. Slots are
  keyed by `poolSlotKey(nullifier, slotIndex)`; the pool maps store only
  `{ lender, commitment }`, so a pool bid's rate and amount stay private until
  settlement. Slots fill in reveal order, and the winning pool is the one with the
  lowest weighted average rate (sum of `rate × contribution` / total).
- The SME settles with `settleSplitInvoice(nullifier, financedDueDate, settledAt,
  contribution0–3, payout0–3, totalContribution, totalPayout,
  newInsurancePoolBalance)`. The circuit verifies each payout against its
  contribution with `verifyProportionalPayout` (division-free, floor-exact), proves
  the contributions sum to the declared total (equal to the invoice amount), routes
  any floor-rounding remainder (< 4 tNight for a 4-lender pool) to the insurance
  pool, and records the constant `"shieldledger:pool"` lender marker.
- Per-lender insurance: `claimPoolInsurancePayout(nullifier, slotIndex,
  totalInsurance, insurancePayout, newPoolBalance, claimedAt, settlementPayout)`
  proves `insurancePayout ≤ floor(settlementPayout × totalInsurance / invoice.amount)`
  and is single-use per slot; a thin pool shares the shortfall proportionally
  across slots.
- Per-lender secondary market: `transferPoolClaim(nullifier, slotIndex,
  newOwnerCommitment)` supports unlimited transfers per slot, before or after pool
  settlement, using the same pseudonym → commitment two-phase auth as single-lender
  transfers.
- Privacy note: contribution amounts are private witnesses, but payout amounts are
  public inputs (Compact 0.23 ledger-write disclosure rule) and, because of the
  proportional proof, each contribution is mathematically derivable from the public
  payouts. See `docs/compact-privacy-notes.md` and the README's Known limitations.

### Off-chain dynamic pricing engine

`frontend/src/pricing.ts` suggests a fair rate range before a lender bids, from
PUBLIC on-chain data only (creditThreshold, reputationThreshold, invoiceAmount),
plus an optional local due-date estimate:

`midBps = 500 + (750 − creditThreshold) + 2·(50 − reputationThreshold) +
log2(invoiceAmount / 10,000) × 25  [+ log2(daysToDue / 30) × 10 when a due date
estimate is available]`, floored at 100 bps, with `midBps ± 50 bps` as the
suggested range. It is informational only — lenders may bid any rate — and the
result is labelled "estimated" when a due-date estimate was used.

### Analytics dashboard & market circuit breaker (Part A)

`frontend/src/dashboard-metrics.ts` computes real-time health metrics from public
ledger state: invoices registered/settled/defaulted, default rate, pool balance,
total premiums, total payouts, pool utilization (payouts/premiums), financed
exposure, and coverage ratio (pool/exposure). Zero-denominator cases return
`null` ("not enough data"), never NaN/Infinity.

`frontend/src/circuit-breaker.ts` turns those into a `healthy | warning |
critical` status using: default rate ≥ 15%/30%, pool utilization ≥ 60%/85%,
coverage ratio ≤ 150%/100%, and payout-to-premium ≥ 0.60/0.90, taking the
worst-of across triggered conditions. The DApp renders it as a HealthBanner. This
is Part A (off-chain monitoring only); an on-chain breaker that pauses
bids/registrations is explicitly deferred to future work (README Future Work).

### Order-book / market-depth visualization

`frontend/src/bid-depth.ts` charts exactly what the contract discloses: a
per-invoice view (the winning bid's rate/amount/whole-or-split plus a "pool
members (committed)" lane) and a cross-auction depth view grouping disclosed
winning bids by rate with cumulative depth. It never fabricates a rate for a
non-winning or pool bid, because none is public.

### Price-impact / fundability simulation

`frontend/src/price-impact.ts` is a deliberately separate, illustrative
simulation (see `docs/PRICE_IMPACT_SIMULATION.md`). It layers fundability and
concentration analysis on the unchanged pricing engine: with the hard 4-lender
cap (`splitCount ≤ 4`), a large invoice is either fully funded by up to four
lenders or cannot be filled; concentration means each lender then holds ≥ 25% of
the face amount in a full four-way pool. Capital values are a configurable
assumed model and every probability comes from a seeded deterministic PRNG — this
demonstrates the concept; it is not a data-driven prediction.

### Lender portfolio view

`frontend/src/lender-portfolio.ts` + the `LenderPortfolio` component identify
positions that belong to the connected wallet by its pseudonym: single-lender
winning bids (terms public once the auction resolved) and pool slots keyed by
`poolSlotKey` (the slot's contribution stays private, so principal/return are
labelled as such; the wallet recalls its own payout from its browser-local
pool-payout record).

### Rate trend chart

`frontend/src/rate-trend.ts` + `RateTrendChart` record a "winning rate over time"
series only while THIS browser observes an on-chain financing transition —
forward-only, browser-local, single-lender invoices only (pool invoices store
`rateBps: 0`), grouped by the public credit/reputation lower bounds. It is
honestly labelled as observed-since-tracking-began, never a complete history.

### Compliance / audit trail export

`frontend/src/audit-export.ts` produces a read-only JSON report from the
already-public derived state (no new circuit or ledger state): invoice lines,
settlement/claim evidence, health + circuit-breaker metrics, and privacy
boundary notes. It excludes contribution amounts, credit/reputation scores, and
buyer identity, which are not in the public view and therefore cannot leak. See
`docs/COMPLIANCE_AUDIT_TRAIL.md`.

### Gas optimization

Circuit-level reductions in hash/multiply/preimage work and proof size, measured
before/after on the headless simulator — see `docs/GAS_OPTIMIZATION.md`.

### Stress testing & latency benchmarking

Seed-driven adversarial scenarios across the whole system (auction, pools,
insurance, secondary market, reputation, analytics) and 60-sample wall-clock
latency measurements of every impure circuit — see `docs/STRESS_TEST_RESULTS.md`
and `docs/LATENCY_BENCHMARKS.md`.

### Reputation backtesting

Deterministic simulations of the +10/−20 reputation dynamics and the resulting
rate ordering — see `docs/REPUTATION_BACKTEST.md`.

## Privacy model (recap)

Only these ever touch the public ledger: invoice **nullifiers** (SHA-256 of
private details + secret), **commitments** (hashes binding an owner to a
nullifier), a **credit attestation** per invoice ("score ≥ N" — the proven
bound), a **reputation attestation** per invoice ("reputation ≥ N" — the proven
bound), lender **pseudonyms**, **sealed-bid commitments**, the **buyer-verified
flag** with its opaque per-invoice **buyer commitment**, the **winning**
bid's terms, — for resold claims — the **claim commitment** to the current
holder plus a `transferred` flag, and the **default-insurance pool**: one shared
public balance plus paid-claim records keyed by already-public nullifiers.
Everything else — invoice contents, bid terms
until the owner reveals, both secrets, the lender's minimum-reputation bar,
every secondary-market party identity, and which SME funded or defaulted into
the insurance pool — stays in the wallet. **Caveat:** the credit score, the
reputation score / on-time-late counts, and the settlement's on-time/late
classification are never written to the ledger, but several are **reconstructable
from public data** (credit threshold, on-chain settlement timeline) — see the
ZK credit / cross-deal reputation sections below and the README's
[Known limitations](../README.md#known-limitations).

### ZK credit scoring (SME)

`registerInvoice(nullifier, creditThreshold)` proves the SME's private
`self-reported smeCreditScore() >= creditThreshold` inside the circuit. Only the
bound is disclosed; the score value itself is never written to the ledger. A
contract floor of 650 stops "score ≥ 0" gaming. The attestation survives
settlement (it is carried on the `Invoice` struct) and is shown to lenders as
`score ≥ N` in the DApp's Open-invoices and Public-ledger tables.

**Important — the score is self-reported, not verified.** `smeCreditScore` is a
wallet-private witness with **no verification against any external or platform
reality**. In the browser DApp it defaults to a hardcoded `720` with no UI field
to set a real value; via the CLI or manual private-state file editing an SME can
set it to any arbitrary value (e.g. `1,000,000`) and the contract accepts it.
The only constraint is `smeCreditScore() >= creditThreshold`, which binds the
*self-reported* value to the chosen bound — it does not bind the value to real
financial data, because no such verifiable data source exists in the system.
See the README's [Known limitations](../README.md#known-limitations).

#### Privacy model: ZK credit scoring — what an observer can and cannot learn

| Can an observer learn… | Yes / No | How |
| --- | --- | --- |
| The SME's exact credit score | **Depends** | It is never disclosed or stored, but if the SME maximizes `creditThreshold` for a better rate (the rational choice) the public threshold converges toward the self-reported score, so the exact value can leak (see [Known limitations](../README.md#known-limitations)). |
| The proven bound ("score ≥ N") | **Yes** | `creditThreshold` is a public field of the `Invoice` struct, written by `disclose(creditThreshold)`. |
| That the score meets the attested minimum | **Yes** | The bound *is* the attestation — a viewer sees "score ≥ 650". |
| The financial history behind the score | **No** | The wallet holds only the self-reported score; there is no financial history in the system to leak. |
| The SME's identity | **No** | The invoice is keyed by a nullifier; ownership is a commitment hash, not an identifier. |

**What the proof actually guarantees.** The check is a circuit `assert`
(`smeCreditScore() >= disclose(creditThreshold)`), so a *self-reported* score
below the threshold makes **proof generation fail**. This guarantees the SME
cannot claim a bound above the value in their own wallet — it is **not** a
guarantee that the wallet value reflects real creditworthiness, since that value
is self-set with no verification. Registration proves "my self-reported score ≥
N," not "my real-world credit score ≥ N."

### ZK buyer verification

`confirmInvoice(nullifier, confirmedAmount)` lets a corporate buyer prove, in
zero knowledge, that an invoice is genuine and that it owes the SME's claimed
amount. The circuit asserts the invoice exists, is not already financed, is not
already verified, and that `confirmedAmount == invoiceAmount` — a mismatch makes
proof generation fail. On success the ledger stores
`buyerCommitment = hash(buyerSecret, nullifier)` and flips the public
`buyerVerified` flag.

**What is public:** only the boolean flag and the opaque per-invoice commitment.
**What stays private:** the buyer's identity, its other supplier relationships,
and the full contract terms. Because the commitment binds the confirmation to
the specific nullifier, a confirmation cannot be forged for, or replayed on, a
different invoice. The flag and commitment survive settlement (carried on the
`Invoice` struct) and are shown to lenders in the DApp's Open-invoices and
Public-ledger tables.

#### Privacy model: buyer verification — what an observer can and cannot learn

| Can an observer learn… | Yes / No | How |
| --- | --- | --- |
| That the invoice is buyer-verified | **Yes** | Public `buyerVerified` flag on the `Invoice` struct. |
| The buyer's identity | **No** | `buyerSecret` is a private witness consumed only inside the ZK circuit; the stored commitment is `hash(buyerSecret, nullifier)`, which reveals neither. |
| Which other invoices the buyer confirmed | **No** | Every commitment is keyed by its own nullifier; no field links two confirmations to one buyer. |
| The confirmed terms (e.g. exact liability) | **No** | The only public amount is the SME's claimed `invoiceAmount`; the confirmation adds no new public data. |
| Whether the buyer really owes the claimed amount | **Yes** | The circuit asserts `confirmedAmount == invoiceAmount` — the buyer cannot vouch for a different amount. |

### ZK cross-deal reputation (SME)

The SME carries a private **reputation score** in its private state
(`smeReputationScore`, plus `smeOnTimeCount`/`smeLateCount`). The score is
wallet-side state — the contract never stores it — and is updated only at
settlement, from the on-time/late classification the `settleInvoice` circuit
returns:

```
score    = clamp(score    + 10, 0, 100)   // settledAt <= financedDueDate
score    = clamp(score    - 20, 0, 100)   // settledAt >  financedDueDate
onTimeCount += 1 / lateCount += 1
```

The single source of truth for the formula is `src/reputation.ts`
(`applyReputationUpdate(privateState, onTime)`), shared by the CLI, the
simulator and the browser DApp.

The reputation is enforced in zero knowledge at two points:

- **Registration.** `registerInvoice(nullifier, creditThreshold, invoiceAmount,
  reputationThreshold)` asserts `smeReputationScore() >=
  disclose(reputationThreshold)` — the SME proves its current score meets the
  chosen bound, so the attestation is real, not a claim. `reputationThreshold =
  0` disables the requirement (the bound stored on-chain is still compared
  against the score).
- **Bidding.** `submitBid` asserts `invoices.lookup(disclose(nullifier))
  .reputationThreshold >= lenderMinReputation()` — the lender's private
  minimum bar is a witness, and the SME's stored bound is read from the
  public invoice, so the comparison is done inside the circuit and neither
  value is disclosed. A lender that only finances SMEs above a reputation
  floor is therefore bound by it without revealing its bar.

`settleInvoice(nullifier, financedAmount, financedDueDate, settledAt)` compares
`disclose(settledAt) <= disclose(financedDueDate)` inside the circuit and
**returns** the boolean to the calling wallet. The classification never appears
on the ledger; the wallet applies `applyReputationUpdate` and persists the new
score via `savePrivateState` (CLI) or the in-memory provider (DApp).

#### Privacy model: cross-deal reputation — what an observer can and cannot learn

| Can an observer learn… | Yes / No | How |
| --- | --- | --- |
| The SME's exact reputation score | **Yes** | Never disclosed/stored, but **reconstructable**: the score starts at a known `0`, updates deterministically (`+10`/−`20`, clamped 0–100), and every settlement's on-time/late outcome is public — an observer replays the formula over the on-chain timeline (see [Known limitations](../README.md#known-limitations)). |
| How many deals were on-time / late | **Yes** | `smeOnTimeCount`/`smeLateCount` are never written on-chain, but they follow from the same publicly observable on-time/late settlement sequence. |
| The proven bound ("rep ≥ N") | **Yes** | `reputationThreshold` is a public field of the `Invoice` struct, written by `disclose(reputationThreshold)`. |
| The lender's minimum-reputation bar | **No** | `lenderMinReputation` is a private witness; `submitBid` compares it to the bound inside the circuit. |
| The settlement's on-time classification | **Yes** | Publicly observable: the settlement's `settledAt` and the invoice's public `dueDate` are both on-chain, so `settledAt <= dueDate` (on-time vs late) is visible to anyone. |
| The SME's identity | **No** | The invoice is keyed by a nullifier; ownership is a commitment hash, not an identifier. |

**Why it is unforgeable.** Both comparisons are circuit `assert`s: a
registration bound above the wallet's self-reported score, or a bid against a
bound below the lender's bar, makes **proof generation fail**. The bound
attestation is therefore real relative to the wallet's score. **It does not
keep the score secret from observers** — because the score evolves
deterministically from a public start with publicly observable outcomes (above),
the exact value and counts are reconstructable. Accept the reputation as an
incentive that compounds across deals, but do not rely on it as a private/
hidden value.

### Secondary market — private claim transfers

After the auction resolves but before settlement, the winning lender can resell
their claim with `transferClaim(nullifier, newOwnerCommitment)`. A claim is a
commitment to its holder:

```
claimCommitment = persistentHash(ClaimSeal{nullifier, secret})
```

`ClaimSeal` domain-separates the hash so a claim commitment can never collide
with an invoice-ownership or bid commitment, and binds it to exactly one
invoice (no cross-invoice replay). Authorization has two phases, both proven in
ZK inside the circuit:

1. **First hand-over** — the seller proves `derivePseudonym(lenderSecret)`
   equals the auction leader's pseudonym stored in `bestBids`.
2. **Later hand-overs** — the seller proves
   `deriveClaimCommitment(claimSecret(), nullifier) == invoice.claimCommitment`;
   only the current holder satisfies it.

A successful transfer atomically replaces the commitment and sets the public
`transferred` flag. At settlement, `pickPayee(transferred, winnerPseudonym)`
records the constant anonymous marker (`shieldledger:secondary`, exposed as
`deriveSecondaryPayee()`) instead of any pseudonym, while preserving
`transferred`/`claimCommitment` so the current holder can prove payout rights in
ZK. The DApp exposes this under **Lender → Secondary Market** (resell form,
local "Check my claim ownership", and a claims table); the CLI mirrors it via
`--transfer-claim/--new-owner-secret/--check-claim` and menu items 9–10.

#### Privacy model: secondary market — what an observer can and cannot learn

| Can an observer learn… | Yes / No | How |
| --- | --- | --- |
| That a claim changed hands | **Yes** | The `transferred` flag and replaced commitment are public by design. |
| Who sold or who bought | **No** | The seller proves ownership in ZK; the buyer appears only as an opaque commitment. |
| How many times it was resold | **No** | Each transfer overwrites the single commitment field; no history is kept on-chain. |
| Who received the settlement of a resold claim | **No** | `settleInvoice` records the anonymous marker, never a pseudonym. |
| Who may claim the payout | **No** | Only the current holder's secret opens the commitment; the check runs locally or in ZK. |

**Why it is unforgeable.** Every authorization path is a circuit `assert`: a
non-holder's first transfer fails the pseudonym match ("not the claim holder"),
a former owner's retry fails the commitment match after the atomic overwrite,
and pre-resolution/post-settlement windows are rejected explicitly. Known demo
limitations: the winner's pseudonym was already public from the auction, and the
demo contract has no token ledger — payout is the receipt record, so the second
investor is simulated by sharing the claim secret out of band rather than by a
real second wallet.

### Default insurance pool � automated, proven, anonymous

The pool turns individual financing risk into a shared public guarantee. It is
ONE aggregate balance (`insurancePools`, stored under the fixed domain key
`pad(32, "shieldledger:pool")` via `insurancePoolKey()`), funded automatically
and drained by proof:

1. **Premium in (automatic).** Every `registerInvoice` pays
   `floor(invoiceAmount / 50)` � exactly 2%, floored. The SME discloses the
   premium and the resulting balance; the circuit proves both with
   `verifyUnitQuotient(invoiceAmount, contribution, 50)` and an equality
   against the on-chain balance (`pool.balance + contribution ==
   newPoolBalance`; the first registration seeds the entry from zero). The
   wallet computes these values (see `src/insurance.ts`) but cannot lie about
   them.
2. **Payout out (proof-gated).** `claimInsurancePayout(nullifier,
   maxEntitlement, payout, newPoolBalance, claimedAt)` requires, all proven
   inside the circuit: auction resolved ? never settled ? `claimedAt` strictly
   past the winning bid's due date; authorization identical to settlement
   (leader pseudonym before any transfer, re-derived `claimCommitment` after);
   single-use via `insuranceClaims`;
   `maxEntitlement == floor(best.amount / 2)`; and the strict formula
   `payout == min(maxEntitlement, balance)` � enforced by two branches
   ("fully covered claims must be maximal" / "partially covered claims must
   drain the pool") plus the dynamic underflow check inside the balance
   equality.

**Division-free percentages.** Compact 0.23 has no division operator, so both
percentages use the verified-quotient pattern:
`quotient*unit <= total && total - quotient*unit < unit` proves
`quotient == floor(total/unit)` for any unit (50 ? 2% premiums, 2 ? 50%
payouts) using only multiplication and comparison.

**Why a map entry instead of a scalar ledger.** Compact's Uint arithmetic
widens result bounds through `+`/`-` (e.g. `Uint<64> + Uint<64>` has bound
`2^65-1`), so an arithmetic result can never be assigned back to a scalar
`Uint<64>` ledger variable � the compiler rejects it statically. The pool is
therefore a single-entry `Map<Bytes<32>, InsurancePool>`, and every transition
passes the NEW balance as a public argument proven against the old one. The
result is equivalent to a mutable scalar: observers read one number.

#### Privacy model: default insurance pool � what an observer can and cannot learn

| Can an observer learn� | Yes / No | How |
| --- | --- | --- |
| The pool balance and each payout | **Yes** | Deliberately public: that is the shared guarantee being sold. |
| Which SME paid a given premium | **No** | Premiums merge into one running total; no per-SME record exists. |
| That this SME defaulted / why a claim was paid | **No** | Claims are recorded only under the already-public nullifier with size + time. The default conditions are proven, not narrated. |
| Who collected | **Only as before** | Settlement's exact authorization scheme is reused; no new identifier is introduced. |
| That percentages were honored | Always | `verifyUnitQuotient` + maximality/drain branches prove the exact formulas in ZK. |
| A double payout on one default | Impossible | Presence in `insuranceClaims` blocks re-claiming the nullifier. |

Known demo-scale limits (documented): late settlement after a claim is possible
(no subrogation); both percentages floor to whole tNight; a thin pool pays
partially rather than rejecting; under-claiming is permitted (the CLI and DApp
always claim the provable maximum).
