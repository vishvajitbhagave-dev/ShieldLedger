# PRICE-IMPACT SIMULATION — RESULTS

Price-impact / slippage simulation for ShieldLedger: the question of whether a
**large invoice** is realistically harder or costlier to fund than a small one,
given the protocol's **hard cap of 4 co-lenders per pool**.

> **Honest framing, same standard as `docs/STRESS_TEST_RESULTS.md`.** This is an
> **illustrative, conceptual simulation** built on **assumed** lender-capital
> ranges — **not** a data-driven prediction from real platform activity. Every
> figure below is a seeded, reproducible Monte-Carlo result from
> `frontend/src/price-impact.ts`. It shows the *shape* of the effect and makes
> the scarcity logic explicit; it does **not** supply real market numbers.

## Scope caveat (read first)

ShieldLedger has **no on-chain or observed data on how much capital lenders have
available**. The only per-lender constraint is the private `lenderExposureCap()`
witness — never on-chain, never observed. So:

- Every "available capital" value in this document is an **assumed uniform
  range**, chosen only to illustrate the mechanics.
- All probabilities are **Monte-Carlo estimates** from a seeded PRNG
  (`mulberry32`), reproducible with the same `seed`.
- This simulation does **not** generate ZK proofs, touch the network, or read
  real ledger activity. It is a pure off-chain analysis module.

**The hard constraint it *does* model faithfully is on-chain:** a pool can have
**at most 4 lenders** (`contracts/shield-ledger.compact:291`, `splitCount <= 4`),
so a single invoice cannot spread across an arbitrarily deep lender base.

## What "price impact" means here — and what it does NOT mean

In a deep market, "big trade moves the price" assumes many small marginal
participants. ShieldLedger's sealed-bid pool is **not** that: because a pool
caps at **4** lenders, a `₹10 lakh` invoice still must be covered by **at most
4** lenders, each committing **≥ 25%** of face. The honest, useful framing is
three effects — and the first is a *feasibility* effect, not a *rate* effect:

1. **Fundability (primary).** A large invoice is **harder to fully fund**, not
   smoothly costlier per unit. If even the deepest four reachable lenders cannot
   cover the face, the invoice **simply does not get funded**.
2. **Concentration (secondary).** A large invoice that *does* fill concentrates
   exposure on ≤ 4 lenders (≥ 25% each), so size ⇒ concentrated risk.
3. **Scarcity premium (rate effect, bounded).** Fewer lenders individually able
   to cover a 1/4 share justify a *bounded* rate premium, layered on top of the
   live engine's existing log-scale size adjustment.

It does **not** mean "every large invoice gets a smoothly worse market rate" —
that analogy does not transfer to a 4-lender-capped pool.

## Methodology

`frontend/src/price-impact.ts` is a pure, deterministic analysis module. It does
**not** modify `getSuggestedRate` (`frontend/src/pricing.ts`) — it *calls* it
unchanged, so the suggested rate band stays consistent with the live app.

- `runFundabilitySimulation` — sample `nAvailableLenders` capital draws, then for
  each invoice size run a Monte-Carlo over random **≤ 4-lender** subsets,
  reporting the fraction that fully covers the invoice.
- `computeConcentrationSpread` — for funded invoices, the mean/worst share of
  face held by the largest single lender.
- `computeScarcityPremium` — how many available lenders can each cover
  `ceil(face/4)`, mapped to a bounded premium (0 when 4+ are eligible, full
  premium as eligible → 0).

All runs below use **seed = 1**, `iterations = 5000`.

## Scenario A — small lender market (8 lenders, assumed ₹0.5L–1.5L each)

| Invoice | Fill probability | Note |
| --- | --- | --- |
| ₹2.0L | **100%** | well within any 4-lender pool |
| ₹4.0L | **100%** | still coverable by the typical pool |
| ₹6.0L | **0%** | deepest possible 4-pool ≈ ₹5.37L — cannot fill |
| ₹9.0L+ | **0%** | infeasible regardless of trial |

- **Deepest possible 4-pool ≈ ₹5.37L** — a hard feasibility ceiling.
- **Concentration (₹4.0L, funded):** mean worst single-lender share ≈ **35%**,
  worst observed ≈ **36%** — already above the 25% even-4-way floor.
- **Scarcity (₹9.0L):** requires ₹2.25L/lender; **0 of 8** eligible → premium
  hits the **120 bps** ceiling; suggested mid rises from **662** to **782 bps**
  (on top of the size adjustment already in the base).

## Scenario B — deeper lender market (30 lenders, assumed ₹0.5L–2L each)

| Invoice | Fill probability | Note |
| --- | --- | --- |
| ₹2.0L | **100%** | |
| ₹4.0L | **93.9%** | most pools still fill |
| ₹6.0L | **9.2%** | only lucky deep pools |
| ₹9.0L+ | **0%** | deepest 4-pool ≈ ₹7.21L — infeasible |

- **Deepest possible 4-pool ≈ ₹7.21L** — deeper market raises the ceiling, but
  the **4-lender cap still floors it**: 30 lenders cannot help a single ₹9L pool.
- **Concentration (₹6.0L, funded):** mean worst share ≈ **32%**, worst ≈ **33%**.
- **Scarcity (₹12L):** requires ₹3L/lender; **0 of 30** eligible → **120 bps**
  ceiling; suggested mid **793 bps**.

## Findings

1. **Fundability collapses at a hard, size-dependent ceiling — not a smooth
   rate slope.** In both scenarios, fill probability is ~100% at small sizes and
   **0%** past the deepest-4-pool ceiling. This is the honest "price impact" of
   size: **large invoices get *harder to fill*, not merely costlier.** The
   boundary is set by the sum of the **four deepest** reachable lenders — the
   4-lender cap is the binding constraint, not total market liquidity.
2. **A deeper market helps only within the cap.** Going from 8 → 30 lenders
   raised the ceiling (₹5.4L → ₹7.2L) and kept some fill at ₹6L (9.2% vs 0%), but
   could **not** fund a ₹9L invoice — because at most 4 lenders share any one
   pool.
3. **Funded large invoices are concentrated.** Worst single-lender share stays
   ~32–36% of face — far above the 25% even-4-way floor — because larger-capital
   lenders take proportionally bigger shares, and only they can fill big pools.
4. **The rate effect is real but bounded and assumption-driven.** When < 4
   lenders can each cover a quarter share, a scarcity premium applies (0 → 120
   bps). It layers onto the live `invoiceRiskAdjustment`, never replaces it.

## What this does / does not show

| Question | Answer |
| --- | --- |
| Is the 4-lender cap the binding limit on funding a large invoice? | **Yes** — modelled faithfully on-chain. |
| Does size raise the suggested rate smoothly like a deep market? | **No** — the dominant effect is a fundability step-function, not a smooth premium. |
| Is there a bounded scarcity premium? | **Yes** — but only when < 4 lenders can cover a quarter share. |
| Are these real market numbers? | **No** — assumed capital ranges; conceptual/illustrative only. |

Runs are reproducible: same `seed` + `iterations` ⇒ identical output. Source:
`frontend/src/price-impact.ts`; tests: `tests/price-impact.test.ts`.

## Honest recommendation (recorded)

This confirms the design hypothesis: with a **4-lender pool cap**, "price
impact" is overwhelmingly a **fundability/concentration** phenomenon, not the
"big trade moves a deep market" rate effect. That makes the size-driven rate
premium a **secondary, bounded** factor. Any future *live* pricing suggestion
should remain assumption-free (as the current engine is); this analysis is a
conceptual illustration and must stay labelled as such unless real, observed
(possibly private) lender-capital data ever becomes available.
