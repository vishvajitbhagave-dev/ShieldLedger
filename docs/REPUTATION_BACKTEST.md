# ShieldLedger — Reputation Scoring Backtest

> **What this is.** A deterministic simulation of fake SME repayment histories
> driven through the **REAL** wallet-layer scoring function
> (`applyReputationUpdate`, `src/reputation.ts`) — the same one production code
> runs after each settlement — plus the **REAL** pricing engine
> (`getSuggestedRate`, `frontend/src/pricing.ts`). Neither formula is
> reimplemented in the backtest; reimplementing would risk testing a different
> formula than the one deployed.
>
> **Scope boundary (kept separate on purpose).** This is **not** the documented
> "reputation is publicly reconstructable on-chain" privacy limitation. That is
> about *secrecy* (the score is derivable from public data). This report is
> about whether the formula's *output behaviour* makes sense. Different concern,
> untouched here.
>
> Source: `src/reputation-backtest.ts` (full methodology + code), tests:
> `tests/reputation-backtest.test.ts`.

**The formula under test** (from `src/reputation.ts`):
on-time settlement `+10` (capped 100), late/defaulted `-20` (floored 0).

## 1. Method

- Each archetype starts at score `0` and is simulated over settlement events;
  every event calls the real `applyReputationUpdate`.
- Absorbing (monotone) archetypes run up to 300 events; the run stops being
  event-driven at a detected **constant tail** (plateau reached and held).
- The stochastic meltdown archetypes run 2,000 events; stability is reported as
  a **tail-window statistic** (last 500 events) with a mean/band/settled flag —
  not a hand-picked final value.
- Trajectories are deterministic: `mulberry32` seeded PRNG; the primary seed is
  `42`, and the ranking check sweeps 10 seeds.
- Downstream check: `getSuggestedRate(credit=700, reputation=<score>, amount=100_000)`.

## 2. Archetype trajectories and stabilized scores (measured)

| Archetype | Outcome | Stabilized score | Reached in |
|---|---|---|---|
| Always on-time | absorbing @ cap | **100** | 10 events (0 → 100, +10/event) |
| Always late | absorbing @ floor | **0** | 1 event (immediately clamped below 0) |
| Mixed / inconsistent (70% on-time) | stationary band | tail mean **70.5** (seed 42); band **[0, 100]** over the tail window; `settled=false` | not ergodically settled within 2,000 events |
| Reformed (bad → good at event 20) | absorbing @ cap | **100** | 30 events (20 late + 10 on-time) |
| Recently turned bad (good → bad at event 20) | absorbing @ floor | **0** | 25 events (20 good + 5 late) |

Cross-seed sweep for the mixed archetype (tail means over seeds 1, 2, 3, 4, 5,
10, 42, 100, 123, 999):

```
67.3  52.1  54.2  67.8  69.9  65.6  70.5  58.6  55.4  63.6
min = 52.1   max = 70.5   average = 62.5   count reaching 0 or 100 = 0
```

## 3. Does it actually discriminate correctly? (the core check — asserted)

**Yes, and in the strict direction:** in the tests,

- always-on-time final score **100** is strictly greater than mixed (tail mean
  ~62–70 depending on seed, always strictly inside (0, 100));
- mixed is strictly greater than always-late final **0**;
- over the 10-seed sweep, the mixed tail mean never collapses to either
  extreme — no seed lands on 0 or on 100.

So the formula separates a reliable SME, a chronic defaulter, and an
inconsistent SME in the intended order. The random 70%-on-time SME sits in a
mid-band rather than being mistaken for either extreme.

## 4. Recovery vs. decline speed — measured asymmetry

- **Decline:** a formerly perfect SME that turns bad drops 100 → 0 in exactly
  **5 events** (five −20 steps: 100, 80, 60, 40, 20, 0).
- **Recovery:** a ruined SME that reforms climbs 0 → 100 in exactly **10
  events** (+10 per event).

**Finding: the formula is asymmetric.** Decline is exactly **2× faster** than
recovery — one late event (score −20) costs exactly two on-time events (+10
each) to undo. This is structural, not incidental: the penalty magnitude is
twice the reward magnitude (20 vs 10). The test asserts `decline * 2 ===
recovery`.

## 5. Downstream rate effect (real pricing engine) — ordering held

With `credit = 700`, `amount = 100_000` held constant, `getSuggestedRate` mid
rates at archetype plateau scores:

| Score | mid (bps) |
|---|---|
| 0 (always late / turned bad) | 733 |
| ~62–70 (mixed: cross-seed avg 62.5 → mid 608; seed-42 tail mean 70.5 → mid 592) | ~608–592 |
| 100 (always on-time / reformed) | 533 |

- `midBps` is **non-increasing** across the whole 0–100 sweep (asserted
  point-by-point) and **strictly decreasing** at the extremes (533 < 633 < 733).
- **Rate ordering matches reputation ordering**: better reputation ⇒ lower or
  equal suggested rate, never higher — asserted for the archetype plateau
  scores.

## 6. Honest, counter-intuitive findings (reporting them, not hiding them)

1. **A 70% on-time record is NOT a crisp "middle" — it's a slow-drifting,
   wide random walk.** The task hypothesis was "settles at some meaningful
   middle value". Measured truth: the tail band over the last 500 events spans
   **[0, 100]** and the process is not ergodically settled within 2,000 events
   (`settled = false` for seed 42). A 70%-on-time SME oscillates widely and can
   momentarily reach *both* extremes in its tail. The *average* lands in the
   50–70s, so it is discriminating — but its instantaneous score is a poor
   "state" metric for such an SME.
2. **Naive drift reasoning would mislead you.** With p = 0.70 the expected
   drift is +1/event (zero-drift at exactly p = 2/3), which sounds like
   "trends to the cap". Measurement shows the long-run average sits near ~62,
   well below the cap. The −20 jumps dig deep ravines that +10 recovery climbs
   back slowly, so the process spends far more time mid-band than the drift
   suggests. The pricing engine's `reputationAdjustment` (2 bps per point)
   therefore reacts to swings that climb slowly and fall fast — worth keeping
   in mind when interpreting a live SME's quoted rate.
3. **The 2:1 asymmetry is the single most consequential property** of the
   scoring rule, beyond the clamp bounds: a trust fall takes 5 events, a trust
   rebuild takes 10. This is a deliberate-looking design (penalty twice the
   reward) and this backtest confirms the behaviour it implies.

## 7. What this document claims

- **Claims:** real-function measurements (no reimplementation); each archetype's
  plateau/band; the strict ranking property holding over a seed sweep; the 2:1
  recovery-vs-decline asymmetry; rate-ordering consistency through the real
  pricing engine; the mixed-SME wide-band counter-intuition.
- **Does not claim:** any view on the privacy/secrecy limitation of on-chain
  reputation reconstruction (different concern); any recommendation to change
  the scoring constants — the 2:1 asymmetry may well be intentional.

## 8. Repro

```
npx vitest run tests/reputation-backtest.test.ts
```
or seeded outputs with `npx tsx scripts/_backtest-probe.ts` (removed after
use). All numbers above are deterministic for a given seed.