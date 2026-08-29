# Trust & data provenance — ShieldLedger

> **Honest framing.** This document states, plainly, where every piece of data the UI shows
> comes from and how much to trust it. It follows the same honesty standard as
> `docs/SECURITY_AUDIT.md`, `docs/GAS_OPTIMIZATION.md`, and `docs/STRESS_TEST_RESULTS.md`: it
> says exactly what is and is not guaranteed, and does not overclaim.

---

## 1. The three trust categories

Everything ShieldLedger displays falls into one of three categories. Knowing which one a
given number belongs to matters, because their guarantees are very different.

| Category | What it is | Guarantee | Examples |
| --- | --- | --- | --- |
| **(a) On-chain, verifiable** | Data read directly from the public ledger state (`bestBids`, `invoices`, `insurancePools`, `insuranceClaims`). | Every observer sees the same, proof-checked state. It cannot be forged by the app or any one party. | The aggregate bid-depth chart, current winning bid per invoice, pool balance, insurance claims. |
| **(b) Private, never revealed** | Data that exists only in a wallet's private state, proven in zero knowledge. | The app/ledger cannot publish it; only the holder knows it. Disclosure is a deliberate act, not a default. | Invoice contents, bid terms until a winner is revealed, lender secrets, SME credit/reputation scores. |
| **(c) Off-chain, indexer-sourced** | Data captured by a third-party service that watches the chain and records what it saw. | **Best-effort only.** If the indexer went down, was compromised, or its operator lied, the data it serves can be wrong or incomplete — even though the underlying chain is still correct. | **Not currently in the app.** This category is documented here so that, if it is ever introduced, it is labeled honestly (§3). |

**ShieldLedger today ships only categories (a) and (b).** There is no indexer, no off-chain
data source, and no third-party feed. Everything the UI shows is either on-chain and
verifiable or private and never revealed.

---

## 2. Non-goal: a true per-invoice, multi-bid "order book"

The app includes an order-book-**style** aggregate market-depth chart (aggregated winning
bids across resolved auctions, grouped by rate). It is **not** a per-invoice, multi-bid
ladder — and that is a **deliberate non-goal**, not an oversight.

### Why it cannot exist

A per-auction ladder would show, for one invoice, all the competing revealed bids and their
rates. On the current contract this is impossible, because the losing bids' terms are never
stored anywhere:

- `revealBid` (`contracts/shield-ledger.compact:356-376`) takes `amount`, `dueDate`,
  `rateBps`, `willingToSplit` as **circuit inputs** and only ever writes the **winner** into
  `bestBids` (which is keyed by invoice and holds a single `BestBid`).
- A bid that does **not** beat the current best is discarded at reveal — its terms were only
  ever private prover input, never written to the ledger.
- Pool bids (`bestPools`, `:198-201`) store only `{ lender, commitment }` — no rate or
  amount is public post-reveal by design.

The finalized-transaction surface served by a Midnight indexer (`FinalizedTxData`,
`ContractAction`, `ContractState`) exposes **post-transaction ledger state and transaction
metadata only — never plaintext circuit arguments**. So even a service actively watching
reveal events sees only the resulting winner for each invoice, not the other bids.

### The tradeoff we decline to make

Producing a true per-invoice ladder would require changing the **contract** to publicly
record every revealed bid. That is a genuine, deliberate privacy regression — it exposes
terms today's design keeps sealed — and it runs against the project's entire thesis
(private, zero-knowledge auctions). It is therefore **out of scope**, and the app is honest
about it: the aggregate chart's accompanying note states that it plots disclosed winning
bids only, never an invented ladder. Nothing prevents a future version from adding a fully
private bid-visibility scheme; that is a protocol-design conversation, not a small UI one.

---

## 3. Considered and not pursued: an indexer-based bid-history service

A related idea was explored and **deliberately not built**: a lightweight local indexer that
captures bid-reveal activity in real time and persists it to a database, to power a
"historical bid trajectory" per invoice.

### Why it was attractive on the surface

The Midnight stack genuinely supports live capture: the project already wires up
`indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS)`
(`deploy.ts`, `cli.ts`) and the provider exposes `contractStateObservable`, which emits on
every state update with block timestamps. A small Node service + SQLite (the right tool at
this demo's scale — relational, append-only, zero-ops, no over-engineering) could record
"who was winning each invoice, and when" over time.

### Why it was declined

1. **It cannot deliver the thing that motivated it.** An indexer has **less** information
   than on-chain state, not more — it still only ever sees the *winner* per invoice, never
   the losing bids' terms. It would not build the order-book ladder either.
2. **It adds the app's only non-cryptographic trust boundary (category (c)).** Its data
   would be best-effort and unverifiable, and it would need to remain running and honest
   during demos to be useful.
3. **It is the least valuable of the three possible views** — a historical *winner
   timeline* — while adding a persistent service, a database, downtime/catch-up handling,
   and ongoing maintenance for a Preprod demo project.

The existing **on-chain-verified aggregate chart already answers the worthwhile public
question** ("what is the current market?") without any of those costs. If a real need for
per-auction history emerges beyond a demo, the indexer scaffolding is already understood and
re-using the existing `PublicDataProvider` wiring makes it a cheap, well-scoped follow-up —
a deliberate later decision, not a default.

---

## 4. If category (c) is ever introduced — required labeling

If an indexer-sourced view is ever added, the resting state (without it) is a fresh,
correctly-labeled build with **no** third trust category. Any such feature must, at minimum:

- Live in a **separately labeled section** (e.g. `Bid history (indexer-sourced)`) with a
  visible **`BEST-EFFORT · OFF-CHAIN`** badge, so no one mistakes it for on-chain data.
- Carry an **always-on** disclaimer that it reflects the indexer's view, not a
  cryptographic guarantee, and that it may be missing or wrong if the indexer was offline
  or compromised — while the underlying auction outcome remains verifiable on-chain.
- Tag each row with its provenance (`Indexer` vs `Verified`), show an explicit
  empty/degraded state rather than implying completeness, and never render a fabricated
  ladder.
- Document the new category here and update the UI's trust framing accordingly.

None of this is implemented today because category (c) does not exist (see §1). This
section exists so the labeling requirement is *already decided* if it ever does.

---

## 5. Scope recap

- **On-chain aggregate market depth** (existing feature) — kept **as-is**, unchanged. It is
  the single honest, verifiable order-book-adjacent view.
- **Per-invoice multi-bid ladder** — deliberate non-goal (§2); would require a
  privacy-reducing contract change.
- **Indexer-based bid history** — considered, not pursued for this project's current scope
  (§3); deferred as a possible future feature, not built.
