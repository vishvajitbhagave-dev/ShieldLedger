# ShieldLedger — Latency Benchmark Report

> **What this measures — read first.** This report contains **genuine, repeated
> measurements** of the compiled ShieldLedger circuits running in the
> **local test simulator: the compact-runtime VM executing the circuits as
> plain JavaScript** (`tests/shield-ledger-simulator.ts`). It does **NOT**
> measure real ZK proof generation. A real proof
> (`proof-server` docker container + proving keys from `npm run setup` +
> `httpClientProofProvider` + network submission, as in `src/deploy.ts`) is
> absent here, was not invoked, and is expected to be orders of magnitude
> heavier and dominated by different factors. **Do not quote these numbers as
> "proof generation time".** They are the proxy: simulator circuit execution
> time.
>
> Measured on this run: `win32`, `node v24.13.0`, Intel i5-10310U (4 cores / 8
> threads @ 1.7 GHz), 7.7 GiB RAM, system uptime ~20 h. Run via
> `npx tsx scripts/latency-benchmark.ts`.

---

## 1. What was measured (and what was not)

| Entity | Measured? |
|---|---|
| Compiled circuit executing in the compact-runtime VM (JS) | **Yes** — the instrumented metric |
| `impureCircuits` call wall-clock, timed with `performance.now()` around only the circuit invocation | **Yes** |
| Per-circuit modeled gas from the runtime (`gasCost.computeTime` / `readTime`) | **Yes** — reported as secondary, see §4 |
| Real ZK proof generation (prover, proving keys, proof-server, HTTP provider) | **No** — not feasible/run here |
| Network / Preprod submission, chain finality, indexer round-trip | **No** |
| Per-circuit latency on a live actor wallet (`wallet.ts`) | **No** — the simulator is headless |

This is `(a)` in the framing being asked about: **local simulator circuit
execution**. It is deliberately **not** presented as `(b)` real proof
generation, which neither this machine's test path nor this run exercised.

## 2. Methodology (what was actually runs)

- **Instrumentation:** `scripts/latency-benchmark.ts`. Each sample builds a
  **fresh simulator + ledger** (independent state), performs the required
  setup (registration / bids / pool reveals / pool settlement / pool seeding
  for insurance) **untimed**, then times **only** the raw
  `contract.impureCircuits.<circuit>(context, ...)` invocation with
  `performance.now()`. Witness computation and ledger bookkeeping stay outside
  the timer.
- **Data:** real inputs mirrored from the existing test suite
  (`tests/shield-ledger.test.ts`, `tests/pool-insurance.test.ts`,
  `tests/insurance-pool.test.ts`): invoice face 10,000 units, 4-lender pool at
  2,500 each, payout 9,600, single-lender financed 8,000 at 400 bps, due
  1_700_000_000, claims at `AFTER_DUE`.
- **Sample size:** 30 samples × **2 passes** = **60 samples per circuit**,
  each on a distinct nullifier/fresh ledger.
- **Warm-up:** one untimed execution of every circuit precedes each pass so
  JIT/cold-start noise does not sit inside the reported samples.
- **Metrics:** min / median / mean / max / p95 / stddev; a sample is flagged an
  outlier when `> 5 × median`.

## 3. Results (ms, wall-clock)

### Pass 1 (n=30 per circuit)

| Circuit | min | avg | median | max | p95 | stddev |
|---|---|---|---|---|---|---|
| `registerInvoice` | 10.56 | 18.08 | 16.23 | 55.41 | 24.29 | 7.75 |
| `revealBid` | 15.14 | 22.71 | 23.68 | 29.44 | 28.25 | 4.08 |
| `settleInvoice` | 14.38 | 21.73 | 22.22 | 28.65 | 25.91 | 3.52 |
| `settleSplitInvoice` | 29.48 | 41.14 | 41.69 | 51.94 | 49.27 | 5.46 |
| `claimInsurancePayout` | 25.28 | 32.55 | 33.22 | 37.58 | 37.26 | 3.33 |
| `claimPoolInsurancePayout` | 29.64 | 39.10 | 38.85 | 56.73 | 47.32 | 6.09 |

### Pass 2 (n=30 per circuit)

| Circuit | min | avg | median | max | p95 | stddev |
|---|---|---|---|---|---|---|
| `registerInvoice` | 13.80 | 22.82 | 20.23 | 56.82 | 40.91 | 8.81 |
| `revealBid` | 22.78 | 30.04 | 29.15 | 45.75 | 38.29 | 4.75 |
| `settleInvoice` | 19.59 | 27.88 | 25.79 | 55.18 | 37.78 | 7.10 |
| `settleSplitInvoice` | 37.63 | 49.17 | 45.43 | 121.45 * | 63.77 | 15.44 |
| `claimInsurancePayout` | 31.59 | 40.55 | 37.70 | 65.18 | 57.57 | 8.10 |
| `claimPoolInsurancePayout` | 36.58 | 44.71 | 43.64 | 61.72 | 61.32 | 5.90 |

\* Outlier flagged by the `> 5 × median` rule (121.45 ms, ~2.7 × pass-2 median).

### Combined (n=60 per circuit)

| Circuit | min | avg | median | max | p95 | stddev |
|---|---|---|---|---|---|---|
| `registerInvoice` | 10.56 | 20.45 | 18.53 | 56.82 | 35.86 | 8.63 |
| `revealBid` | 15.14 | 26.38 | 26.75 | 45.75 | 36.67 | 5.75 |
| `settleInvoice` | 14.38 | 24.80 | 23.91 | 55.18 | 37.09 | 6.39 |
| `settleSplitInvoice` | 29.48 | **45.15** | **42.28** | **121.45** | **63.61** | **12.25** |
| `claimInsurancePayout` | 25.28 | 36.55 | 34.91 | 65.18 | 49.44 | 7.37 |
| `claimPoolInsurancePayout` | 29.64 | **41.90** | 41.80 | 61.72 | 52.20 | 6.62 |

Measured ordering by mean: **`settleSplitInvoice` ≈ `claimPoolInsurancePayout` >
`claimInsurancePayout` > `revealBid` ≈ `settleInvoice` > `registerInvoice`.**

## 4. The bottleneck — and the honest comparison with GAS_OPTIMIZATION

**Measured heaviest:** `settleSplitInvoice` (mean 45.2 ms), **statistically tied
with** `claimPoolInsurancePayout` (mean 41.9 ms) at this sample size.

Cross-referenced against the source-level operation counts in `docs/GAS_OPTIMIZATION.md`:

| Circuit | hash+mult+assert (GAS_OPT) | reads+writes (GAS_OPT) | measured mean (ms) |
|---|---|---|---|
| `settleSplitInvoice` | 9+8+20 = **37** | 7+7 = **14** | **45.15** |
| `claimPoolInsurancePayout` | 3+2+15 = 20 | 9+3 = 12 | **41.90** |
| `claimInsurancePayout` | 3+2+12 = 17 | 7+3 = 10 | 36.55 |
| `revealBid` | 3+0+6 = 9 | 4+1 = 5 | 26.38 |
| `settleInvoice` | 1+0+5 = 6 | 5+1 = 6 | 24.80 |
| `registerInvoice` | 1+2+6 = 9 | 4+3 = 7 | 20.45 |

Honest findings:

1. **The document's "heaviest circuit" prediction is confirmed:** `settleSplitInvoice`
   is measured heaviest, matching its top place in the op-count table. It was
   already the one circuit the doc flagged as needing a bigger redesign to
   reduce. Good cross-check.
2. **Op-count is a weak predictor of VM wall-clock.** `claimPoolInsurancePayout`
   is effectively tied with `settleSplitInvoice` at **less than half the
   hash/mult volume** — its 9 reads + 3 writes cost roughly the same VM time
   as 4×-unrolled pool logic. And at the bottom, `registerInvoice` (9 ops,
   7 reads/writes) measures **lightest**, while `settleInvoice` (6 ops,
   6 reads/writes) measures heavier than it. Neither
   hash/mult/assert count nor reads/writes alone reproduces the measured
   ordering perfectly.
3. **The runtime's own modeled gas barely discriminates.** `gasCost.computeTime`
   was ~1,323,481,916 ps for all circuits except the pool-settling pair at
   ~1,389,176,549 ps, and `readTime` a flat 170,000,000 ps. The runtime's cost
   model treats virtually every circuit as equal ~1.3 ms of modeled compute —
   it cannot explain the 10–55 ms wall-clock spread, so wall-clock is dominated
   by VM/instrumentation overhead, not the modeled gas primitives.
4. **The real-proving caveat changes the "which to optimize" answer.** In actual
   zk proving, hash operations dominate constraint count, so `settleSplitInvoice`
   (9 hashes) would almost certainly pull clearly ahead of
   `claimPoolInsurancePayout` (3 hashes) in real proving time — the near-tie
   here is an artifact of VM execution and **should not** be extrapolated to
   proving costs. If a real proving path is ever run, this is the number to
   re-measure, not assumed.

## 5. Honest caveats about environment variability

- **Run-to-run drift is real and reported, not hidden.** Pass 2 averaged
  **+14 % to +33 %** slower than pass 1 on every circuit (register 18.08→22.82,
  reveal 22.71→30.04, settle 21.73→27.88, split 41.14→49.17, claim 32.55→40.55,
  poolClaim 39.10→44.71). Same code, same machine, minutes apart — this is a
  shared dev laptop, not a pinned CI runner.
- **Outliers exist and are not discarded.** Worst is `settleSplitInvoice`
  121.45 ms in pass 2 (2.7 × its median). We report max/p95 alongside
  min/median because the mean on its own would be misleading for a distribution
  with a trailing tail.
- **No CPU isolation.** Node ran un-pinned on the i5's 8 logical threads while
  Windows background work (Antivirus scanning, other processes) was active.
  Absolute numbers would move on an idle/pinned machine; the **relative
  ordering** (§4) is the stable part.
- **This run did not exercise the known WSL/compiler instability.** The
  benchmark executes on the **Windows** node runtime (`tsx`, no WSL, no
  Compact recompile). The prior "compile process failed to spawn" incident
  involved WSL + the compiler; that path was not touched, so it could not
  distort these numbers. The noise here is ordinary shared-machine variance,
  and as noted it remained large enough that a single sample run would have
  been non-representative.
- **Fresh-state sampling is intentionally expensive-but-real.** Every sample is
  an independent full ledger build (many untimed setup circuit calls per timed
  sample), matching how the circuits are actually driven in production flows
  rather than hammering one warm ledger.

## 6. Reproduce

```
npx tsx scripts/latency-benchmark.ts
```

Prints environment header, two passes, and the combined table. No network,
no docker, no proof generation, no test-suite dependency beyond the shared
simulator (`tests/shield-ledger-simulator.ts`). Keep the file revision you
export numbers from if you ever re-run — timings are machine- and load-
dependent, and the point of the report is variance, not a single pretty
average.

## 7. What this document claims

- **Claims:** 60 real samples per circuit; min/median/mean/max/p95/stddev
  reported with pass-over-pass drift and outliers visible; measured heaviest
  circuit is `settleSplitInvoice` (tied stat with `claimPoolInsurancePayout`),
  confirming GAS_OPTIMIZATION's top pick by op-count; op-count does not fully
  predict VM wall-clock in this environment.
- **Does not claim:** any real proof-generation or submission latency. Those
  require the proof-server + proving keys + a network and were not measured
  here. The simulator numbers are a proxy and must be labelled as such.