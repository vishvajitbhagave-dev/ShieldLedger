# ShieldLedger

> Confidential invoice financing on Midnight — invoices registered privately, bids sealed, settlements proven in zero knowledge.

![Status](https://img.shields.io/badge/Status-Live-brightgreen?style=flat-square)
![Network](https://img.shields.io/badge/Network-Midnight%20Preprod-blue?style=flat-square)
![Tests](https://img.shields.io/badge/Tests-348%20Passing-success?style=flat-square)
![CI/CD](https://github.com/vishvajitbhagave-dev/ShieldLedger/actions/workflows/ci.yml/badge.svg)

---

## What is ShieldLedger?

ShieldLedger is a confidential invoice-financing marketplace built on the [Midnight Network](https://docs.midnight.network). Small and medium enterprises (SMEs) register trade invoices on-chain without revealing their contents — invoice details, financial history, and identity never leave the wallet. Lenders compete in a **sealed-bid private auction** under pseudonyms: bids are commitments, no lender sees another's bid, and the **lowest interest rate wins**, enforced by the contract.

Corporate buyers confirm invoices in zero knowledge — proving the invoice is genuine and the amount matches — without disclosing their identity or supply chain. A **cross-deal reputation score** (0–100, +10 on-time, −20 late) accrues privately across settlements and is proven in ZK at each registration, so reliable SMEs get cheaper capital without ever publishing a financial dossier. An **automated default insurance pool** (2% premiums in, 50% proven-default payouts out) provides mutual protection while keeping the defaulting SME's identity hidden.

Only opaque nullifiers, commitments, pseudonyms, and disclosed terms ever touch the public ledger. Privacy is enforced by zero-knowledge circuits, not policy.

---

## Problem Statement

| Problem | Reality |
|---------|---------|
| Confidentiality | Invoice factoring today forces SMEs to reveal invoice contents, financial history, and identity to platforms and lenders. |
| Information asymmetry | Lenders cannot safely lend against invoices they cannot independently verify — or against borrowers whose repayment history they cannot assess privately. |
| Privacy vs. verifiability | The market lacks a place where "is this genuine, already-financed, and a known-on-time payer?" can be answered in zero knowledge, without publishing a financial dossier. |
| Trust enforcement | Auction integrity (sealed bids, lowest-rate wins) and default protection require either a trusted operator or on-chain-enforced rules. |

**ShieldLedger solves this.** Confidential registration, sealed-bid auctions, ZK buyer verification, a private cross-deal reputation, and a mutual default insurance pool — all enforced by the contract, not by a platform.

---

## Solution

- **Register invoices confidentially** — the contract stores only a nullifier, a commitment, and ZK-attested bounds ("credit score ≥ N", "reputation ≥ N"). Invoice contents, financial history, and identity never leave the SME's wallet.
- **Run a sealed-bid private auction** — lenders submit commitments; the lowest interest rate wins, enforced on-chain. No lender sees another's bid.
- **Verify invoices in zero knowledge** — corporate buyers prove the invoice is genuine and the amount matches, without revealing their identity.
- **Price fairly from public data** — an off-chain pricing engine suggests rates from the public bounds and invoice amount, adjusted by time-to-maturity and the SME's reputation bound.
- **Protect against defaults mutually** — an automated insurance pool accepts 2% premiums and pays 50% of financed amount on proven default.
- **Let investors band together** — invoices can be financed by a pool of up to 4 lenders, with per-lender insurance claims and a per-lender secondary market.
- **Grow trust privately** — a cross-deal reputation (+10 on-time, −20 late, 0–100) accrues in-wallet and is proven as "≥ N" in ZK at each registration.

---

## Privacy Model

**What is PUBLIC (on-chain, anyone can see):**
Invoice nullifiers, SME commitments, credit/reputation attestation bounds ("score ≥ N"), lender pseudonyms, sealed-bid commitments, winning bid terms after reveal, settlement receipt, buyer-verified flag + buyer commitment, insurance pool balance, paid insurance claims (keyed by nullifier), **per-lender pool settlement payout amounts** (required by Compact 0.23 ledger-write disclosure rule — see [docs/compact-privacy-notes.md](docs/compact-privacy-notes.md)), **payout commitment hashes** (binding for insurance claims).

**What is PRIVATE (private witness, never on-chain):**
Invoice contents, SME secret, lender secret, lender credit score, lender's minimum-reputation bar, lender exposure cap, bid terms before reveal, buyer secret. **NOTE:** several values that never touch the ledger are nonetheless *mathematically derivable* from public on-chain data — see [Known limitations](#known-limitations). Specifically: the **credit score** is self-reported (not verified) and its exact value leaks if the SME maximizes `creditThreshold`; the **reputation score and on-time/late counts** are reconstructable from the public settlement timeline; and **per-lender pool contribution amounts** are derivable from the public payouts + `invoiceAmount`. True secrecy for these is **not** achieved by the current design.

**What the user PROVES without revealing:**
Credit score ≥ threshold, reputation score ≥ threshold, lender credit score ≥ 700, buyer knows the invoice is genuine, bid commitment matches revealed terms, SME owns the invoice, default conditions are met (financed, unsettled, past due) for insurance payout, **individual contributions sum to the invoice amount** (zero-knowledge sum proof), **each payout is proportional to its contribution** (zero-knowledge floor proof via `verifyProportionalPayout`).

---

## Features

### Core
- **Sealed-bid private auction** — lenders commit their terms; the lowest interest rate wins, enforced per-reveal by the contract. No one ever sees a losing bid's terms.
- **Zero-knowledge invoice registration** — on-chain state is limited to a nullifier, a commitment, and ZK-attested credit/reputation bounds.
- **Buyer verification** — corporate buyers confirm an invoice is genuine and the amount matches, in ZK, without revealing identity.
- **Cross-deal reputation** — 0–100 score (+10 on-time, −20 late) accrued privately in-wallet and proven as a bound in ZK (`src/reputation.ts`, `frontend/src/pricing.ts`).
- **Automated default insurance pool** — 2% premiums in, 50% payouts on proven default, with shared-shortfall (thin-pool) behavior.
- **Pooled multi-investor financing** — invoices can be financed by up to 4 lenders (`splitCount` 2–4) with per-lender insurance claims.
- **Secondary market** — winning lenders resell claims (single-lender `transferClaim`; per-slot `transferPoolClaim` for pools), pseudonym → commitment two-phase auth.

### Analytics, tooling, and engineering
- **Pricing engine** — off-chain, informational rate suggestion from public data (base 500 bps, ±10 bps/day, floor 100 bps, credit/reputation adjustments) (`frontend/src/pricing.ts`).
- **Order-book bid-depth view** — charts exactly what the contract makes public: winning bids and committed-but-hidden pool slots (`frontend/src/bid-depth.ts` + `BidDepthChart`).
- **Rate trend** — forward-only, browser-local "winning rate over time" tracking with an honestly labeled, never-fabricated window (`frontend/src/rate-trend.ts` + `RateTrendChart`).
- **Lender portfolio** — positions that belong to the connected wallet, with public vs. private data labeled (`frontend/src/lender-portfolio.ts` + `LenderPortfolio`).
- **Health dashboard + market circuit breaker (Part A)** — default rate, pool utilization, coverage ratio, payout-to-premium, and warning/critical banners (`frontend/src/dashboard-metrics.ts`, `frontend/src/circuit-breaker.ts` + `HealthBanner`).
- **Price-impact simulation** — funded-seeded simulation of pool-liquidity price impact under the hard 4-lender cap; clearly labeled illustrative, not data-driven (see [docs/PRICE_IMPACT_SIMULATION.md](docs/PRICE_IMPACT_SIMULATION.md)).
- **Compliance / audit export** — read-only export evidencing on-chain honesty without exposing private data (see [docs/COMPLIANCE_AUDIT_TRAIL.md](docs/COMPLIANCE_AUDIT_TRAIL.md)).
- **Gas optimization** — circuit-level reductions in hash/multiply work and proof size (see [docs/GAS_OPTIMIZATION.md](docs/GAS_OPTIMIZATION.md)).
- **Stress testing** — seeded adversarial scenarios across the whole system (see [docs/STRESS_TEST_RESULTS.md](docs/STRESS_TEST_RESULTS.md)).
- **Latency benchmarking** — 60-sample wall-clock measurements of every impure circuit under the headless simulator (see [docs/LATENCY_BENCHMARKS.md](docs/LATENCY_BENCHMARKS.md)).
- **Reputation backtest** — deterministic simulations of the +10/−20 reputation dynamics and rate ordering (see [docs/REPUTATION_BACKTEST.md](docs/REPUTATION_BACKTEST.md)).

---

## Screenshots

> **Note:** the screenshots below are the real, current captures already in this project. Additional or newer screenshots (e.g. fresh Preprod captures) can be added by pasting them in here manually.

### Desktop UI

<img width="959" height="473" alt="Screenshot 2026-08-15 201031" src="https://github.com/user-attachments/assets/810e48c5-c5e9-4a02-90fe-c12db6e2eb1f" />

<img width="959" height="473" alt="Screenshot 2026-08-15 201207" src="https://github.com/user-attachments/assets/14ee0f9b-f3d2-4274-92ab-a8e283806dad" />

<img width="959" height="473" alt="Screenshot 2026-08-15 201228" src="https://github.com/user-attachments/assets/ee315f88-4048-4d7c-a4fa-53b990c2a644" />

<img width="959" height="473" alt="Screenshot 2026-08-15 201259" src="https://github.com/user-attachments/assets/81057bf2-dbbf-49a5-bd81-012bbf8092f5" />

<img width="959" height="470" alt="Screenshot 2026-08-15 201328" src="https://github.com/user-attachments/assets/ebe4ca88-4e6a-4754-a53a-60631984326d" />

<img width="959" height="473" alt="Screenshot 2026-08-15 201410" src="https://github.com/user-attachments/assets/5ed6f027-079e-4439-a32c-dcf84f41e62c" />

<img width="959" height="476" alt="Screenshot 2026-08-15 201448" src="https://github.com/user-attachments/assets/0315c5e0-9b1c-431f-b226-33e8da24eee5" />

### Mobile responsive UI

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM" src="https://github.com/user-attachments/assets/65cb00af-c438-4a6b-afc6-722ae4bda013" />

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (1)" src="https://github.com/user-attachments/assets/57712907-4085-4e11-b0e4-463ddd484737" />

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (2)" src="https://github.com/user-attachments/assets/a3e256b9-8845-4cf5-b55a-7ddc44fd5382" />

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (3)" src="https://github.com/user-attachments/assets/e4fabe22-b7df-423c-9dde-fa75dd7743d0" />

<img width="720" height="1600" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (4)" src="https://github.com/user-attachments/assets/9ee99dc3-00c4-4bb8-96d4-cc1970dca2b9" />

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (5)" src="https://github.com/user-attachments/assets/a7598f6a-8914-479d-bb20-02565e6843eb" />

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (6)" src="https://github.com/user-attachments/assets/ef6e3c77-c038-4bbd-bce7-7906afa11d35" />

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (7)" src="https://github.com/user-attachments/assets/2fdaeecf-0547-4536-91d2-1aba2e56f8c3" />

**[PLACEHOLDER — add any updated/new screenshots here manually.]**

---

## Important Links

| Resource | Link |
|----------|------|
| **Live Demo (Midnight Preprod)** | https://vishvajitbhagave-dev.github.io/ShieldLedger/ |
| **Demo Video** (wallet connect + a successful circuit call on the Preview testnet) | https://drive.google.com/file/d/1VFMtWUn_rTVSr8cfy7wJNeSbAMppjFbi/view?usp=drive_link |
| **Product X Profile** | https://x.com/ShieldLedger |
| **Feedback Form** | **[PLACEHOLDER — link to the user-feedback Google Form once created]** |
| **Security Audit** | [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) |
| **Architecture Document** | [docs/architecture.md](docs/architecture.md) |
| **Usage Guide** | [docs/USAGE.md](docs/USAGE.md) |
| **Production Runbook** | [docs/production.md](docs/production.md) |
| **Trust & Data Provenance** | [docs/TRUST_AND_DATA_PROVENANCE.md](docs/TRUST_AND_DATA_PROVENANCE.md) |
| **Compact Privacy Notes** | [docs/compact-privacy-notes.md](docs/compact-privacy-notes.md) |

---

## Verified Users

> **[PLACEHOLDER — this table is intentionally empty.** ShieldLedger has not yet onboarded external test users. Fill it in as real Preprod users are onboarded and complete an end-to-end flow; do not add rows until real wallet addresses exist. All transactions will be verifiable on the Midnight explorer.)

| # | Name | Wallet Address | Network |
|---|------|----------------|---------|
| 1 | *(add when onboarded)* | *(add real preprod wallet address)* | Preprod |
| 2 | *(add when onboarded)* | *(add real preprod wallet address)* | Preprod |
| 3 | *(add when onboarded)* | *(add real preprod wallet address)* | Preprod |
| … | … | … | … |

---

## User Onboarding & Feedback

### Google Form

🔗 **Feedback Form:** *[PLACEHOLDER — link to the user-feedback Google Form once created]*

### User Feedback Summary

> **[PLACEHOLDER — intentionally empty.** Fill in real responses as they arrive. Each row needs a real name, email, wallet address, verbatim feedback, and — once addressed — the CI run URL of the commit that shipped the fix.)

| # | Name | Email | Wallet Address | Feedback | Improvement Commit |
|---|------|-------|----------------|----------|--------------------|
| 1 | *(add)* | *(add)* | *(add real preprod wallet address)* | *(verbatim feedback)* | *(CI run URL of the fix commit)* |
| 2 | *(add)* | *(add)* | *(add real preprod wallet address)* | *(verbatim feedback)* | *(CI run URL of the fix commit)* |

### Improvements Implemented Based on Feedback

> **[PLACEHOLDER — intentionally empty.** Same rule as above: only real feedback → real commits.)

| Feedback | Improvement Made | Commit |
|----------|-----------------|--------|
| *(add)* | *(add)* | *(add)* |

---

## Community Contribution

- **Product X Profile:** https://x.com/ShieldLedger
- **[PLACEHOLDER — link to an X/Twitter post announcing ShieldLedger once published]**
- **Open Source:** full codebase at [github.com/vishvajitbhagave-dev/ShieldLedger](https://github.com/vishvajitbhagave-dev/ShieldLedger)

---

## Project Structure

```
ShieldLedger/
├── contracts/
│   ├── shield-ledger.compact    # Auction + insurance + reputation contract (source of truth)
│   ├── escrow.compact           # Per-invoice escrow contract
│   └── managed/                 # Compiler output — generated by `npm run compile` (gitignored)
├── frontend/
│   └── src/
│       ├── components/          # WalletConnect, LedgerView, InvoiceFinancing, Dashboard,
│       │                        # LenderPortfolio, BidDepthChart, RateTrendChart, HealthBanner, ...
│       ├── lib/                 # error messages, monitoring, analytics, web vitals
│       ├── pricing.ts           # Off-chain rate-suggestion pricing engine
│       ├── price-impact.ts      # Price-impact / liquidity simulation
│       ├── rate-trend.ts        # Forward-only rate-over-time tracking
│       ├── bid-depth.ts         # Order-book bid-depth transformation
│       ├── lender-portfolio.ts  # Portfolio positions for the connected wallet
│       ├── circuit-breaker.ts   # Off-chain market-health monitoring (Part A)
│       ├── dashboard-metrics.ts # Platform health metric calculations
│       ├── audit-export.ts      # Compliance / audit-trail export
│       └── manager.ts           # Provider stack assembly (proof/indexer/wallet)
├── src/                         # Node tooling: compile.ts, setup.ts, deploy.ts, cli.ts,
│                                # reputation.ts, insurance.ts, witnesses.ts, network.ts
├── tests/                       # Vitest suites — 25 files, 348 tests
├── scripts/                     # e2e-check.ts, demo-reputation-cycle.ts,
│                                # latency-benchmark.ts, reputation backtest
├── docs/                        # architecture, security audit, privacy notes, runbooks,
│                                # benchmarks, stress results, compliance trail
├── .github/workflows/           # ci.yml, deploy-pages.yml
├── compose.yml                  # Local proof-server (docker compose)
├── vitest.config.ts
├── package.json
└── PROPOSAL.md
```

---

## Technical Architecture

Full architecture: **[docs/architecture.md](docs/architecture.md)**

```
User Device (Browser)
        ↓
ShieldLedger Frontend (React 19 + Vite + TypeScript)
  ├── Wallet picker (Lace / 1AM DApp Connector API via window.midnight)
  ├── Manager (frontend/src/manager.ts) assembles the provider stack
        ↓
Midnight.js Providers
  ├── Proof provider      → Midnight proof-server (URL from the wallet's
  │                         getConfiguration(); no URL is baked into the build)
  ├── Indexer provider    → Midnight indexer (public data)
  ├── ZK config provider  → ZK config served from the DApp build
  └── Private state provider → in-memory private witness state
        ↓
Midnight Network Ledger (Preview / Preprod testnets)
  ├── shield-ledger.compact  → sealed-bid auction, insurance pool, reputation bounds
  └── escrow.compact         → per-invoice escrow, coordinated via
                               frontend/src/escrow-orchestrator.ts
```

The contracts are written in **Compact** and compile to ZK assets shipped with the DApp build (`npm run compile`). All signing and proving happens in the browser against the connected wallet; only commitments, nullifiers, pseudonyms, and disclosed terms reach the ledger.

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Smart Contract | Compact 0.23 (Midnight's ZK contract language), Compact compiler 0.31.1 |
| Frontend | React 19, Vite, TypeScript |
| Runtime | Midnight.js 4.1.1, proof-server 8.1.0 |
| Wallet | Midnight Lace (primary), 1AM (community wallet) |
| Networks | Midnight Preview and Preprod testnets |
| Testing | Vitest 4.x, headless Compact circuit simulator |
| CI/CD | GitHub Actions (compile → test → typecheck → build → deploy) |
| Deployment | GitHub Pages |
| Node | ≥ 22 |

---

## Smart Contract

The core contract (`contracts/shield-ledger.compact`) is written in Compact. Everything the SME or lender wishes to keep confidential stays in private witness data; only hashes and disclosed terms are published.

| Item | Value |
|------|-------|
| **Preview Contract Address** | `18737084144f6482d529fdb8fa357966c9c2eb2c3734d1753f4b42648a4dc4a6` |
| **Preprod Contract Address** | `a503d5c086f8ab42f3a650fa0c4b67e31ac37c7eb997c8513c3dccf38de8c925` |
| **Networks** | [1AM Explorer — Preview](https://explorer.1am.xyz/contract/18737084144f6482d529fdb8fa357966c9c2eb2c3734d1753f4b42648a4dc4a6?network=preview) / [1AM Explorer — Preprod](https://explorer.1am.xyz/contract/a503d5c086f8ab42f3a650fa0c4b67e31ac37c7eb997c8513c3dccf38de8c925?network=preprod) |

| Environment | Status | Details |
| --- | --- | --- |
| Midnight **Preview** (testnet) | **Active** | Live contract + funded test tokens from the [Preview faucet](https://faucet.preview.midnight.network/). |
| Midnight **Preprod** (testnet) | **Active** | Live contract + DApp (GitHub Pages demo); funded test tokens from the [Preprod faucet](https://midnight-tmnight-preprod.nethermind.dev/). |
| Midnight **Mainnet** | Not deployed | Requires Midnight mainnet tooling; nothing deployed there. |

### What goes on-chain per-flow

| Piece | Public on ledger | Private |
| --- | --- | --- |
| Invoice registration | nullifier, SME commitment, **credit attestation** ("score ≥ N"), **reputation attestation** ("reputation ≥ N") | invoice contents, SME secret, **credit score**, **reputation score** |
| Bidding | bid key, lender pseudonym, **commitment to the bid terms** | bid terms until reveal, lender secret, credit score, exposure cap, **lender minimum reputation** |
| Reveal | leading bid's terms + lender pseudonym (only if it beats the running best) | — |
| Settlement | winning lender pseudonym, financed amount, due date, interest rate; **pool: per-lender payout amounts (public inputs), payout commitment hashes** | on-time/late classification is publicly observable; pool contributions derivable (see [Known limitations](#known-limitations)) |
| Default insurance | shared pool balance, paid claims keyed by the already-public nullifier | which SME funded the pool; why a claim was paid; that this SME defaulted |

### Key circuits

| Circuit | What it proves / does |
|---------|-----------------------|
| `registerInvoice` | credit score ≥ threshold and reputation ≥ threshold in ZK; pays 2% insurance premium; for pooled invoices does not populate `bestBids`. |
| `confirmInvoice` | buyer proves invoice is genuine and amount matches; stores opaque buyer commitment. |
| `submitBid` | lender proves credit score ≥ 700; stores only a commitment to bid terms. |
| `revealBid` | re-derives commitment; enforces private exposure cap; updates running best (single-lender only). |
| `revealPoolBid` | fills a slot in the pool map for `splitCount > 0` invoices; independently tracks pool bids. |
| `settleInvoice` | pays the winning bidder; classifies settlement on-time/late. |
| `settleSplitInvoice` | pays per-lender proportional payouts; verifies floor-exact proportional proof; routes floor-rounding remainder to insurance pool; sets lender to `"shieldledger:pool"`. |
| `claimInsurancePayout` | proves default conditions; pays 50% from shared pool (partially if thin); prevents double-claim. |
| `claimPoolInsurancePayout` | per-lender pool insurance claim with thin-pool shared-shortfall behavior; single-use per slot. |
| `transferPoolClaim` | per-lender claim transfer (two-phase auth: pseudonym → commitment); before/after pool settlement. |
| `verifyProportionalPayout` | division-free floor-exact proportional proof. |
| `verifyUnitQuotient` | division-free percentage proof (2% premium and 50% payout). |

### End-to-End Verification (Preview)

| Flow | TxID | Block |
| --- | --- | --- |
| `registerInvoice` | `0094eb20df7e2664a60bf2a954936d188bc3a6690fa9d2fb3306a4b75ced0ddad0` | 348161 |
| `submitBid` | `00b5ea191391f078eba680333bfb1eac7b2846d1b52afdcd87ed6f5169bbe20f16` | 348212 |
| `settleInvoice` | `001aeab17880b96e64d4ea4441d84b82ec528173171d615c18dcee3296153e70bf` | 348243 |

---

## Feature Deep Dives

### Sealed-Bid Auction

Because Compact circuits cannot iterate over a `Map`, "lowest rate wins" is built from per-reveal comparisons against a running best:

1. SME calls `registerInvoice` with a credit bound and an optional reputation bound (invoice is now `BIDDING`).
2. Optionally, the corporate buyer calls `confirmInvoice` — the `buyer-verified` flag and an opaque per-invoice commitment become public.
3. Each lender calls `submitBid` with a **commitment** — terms are hidden; the contract also enforces the lender's private minimum-reputation bar against the SME's public reputation bound.
4. Lenders who want to compete call `revealBid` with their true terms. The contract verifies the commitment, then compares against the running best; the best bid (lowest rate → smallest amount → earliest due) takes the lead.
5. SME calls `settleInvoice` — the contract pays the *current* best bid; favoritism is impossible. The circuit classifies the settlement on-time or late.

### Pooled Multi-Investor Financing

Invoices can be financed by a pool of up to 4 lenders instead of a single winner. The SME sets `splitCount > 0` at registration:

1. SME registers with `splitCount` = 2–4 (e.g., `splitCount: 4` means up to 4 lenders can co-finance).
2. Each lender places a sealed pool bid (`submitBid` + `revealPoolBid`) targeting a specific slot index (0–3).
3. The contract fills pool slots in reveal order. All bids in a pool share the same `totalContribution` (= invoice amount) and `totalPayout` (repayment amount). The winning pool is the one with the **lowest weighted average rate** (sum of `rate × contribution` / total).
4. SME calls `settleSplitInvoice` with per-lender contribution and payout arrays. The circuit verifies each payout is proportional to its contribution (floor-exact via `verifyProportionalPayout`) and that all contributions sum to the invoice amount. **Contribution amounts are not directly disclosed on-chain and carry no `disclose()`**; **payout amounts are public inputs** (required by Compact 0.23's ledger-write disclosure rule — see [docs/compact-privacy-notes.md](docs/compact-privacy-notes.md)). Payout commitment hashes are stored on-chain to bind insurance claims to the proved payout values. **Note:** because the public payouts, `invoiceAmount`, and `totalPayout` are linked by the proportional proof, each contribution amount is *mathematically derivable* from on-chain data — true per-lender contribution secrecy is not achieved (see [Known limitations](#known-limitations)).
5. Any floor-rounding remainder (< 4 tNight for a 4-lender pool) is routed to the insurance pool as additional premium — modeled on Uniswap V3 fee-rounding behavior.

### Pool Insurance (Per-Lender Claims)

Each pool lender independently claims their proportional share of the 50% default insurance entitlement based on their contribution ratio:

1. After pool settlement, the invoice's lender field is set to the `"shieldledger:pool"` marker.
2. Each lender proves ownership of their slot via the same two-phase auth pattern (pseudonym for untraded slots, claim commitment for transferred slots).
3. The circuit verifies `insurancePayout ≤ floor(settlementPayout × totalInsurance / invoice.amount)` — the upper bound. When the insurance pool is thin (total entitlement exceeds pool balance), each claimant receives a proportional share of the remaining balance, not a fixed amount.
4. **Thin-pool behavior (intentional design):** when the pool cannot cover all entitlements, each claim is capped by `pool.balance × settlementPayout / invoice.amount`. The first claimant to collect receives a larger absolute amount than later claimants, but the fraction relative to their settlement payout is identical. Once the pool is drained, subsequent claimants receive zero. This is a **shared shortfall** — not first-come-first-served — because every lender's payout is proportionally reduced by the same ratio. The single-use `insuranceClaims[slotKey]` map prevents double-claiming.

### Pool Secondary Market (Per-Lender Transfer)

Each pool lender can independently transfer their claim to a new investor, even after pool settlement:

1. Before settlement: the original lender transfers using their `lenderSecret` (pseudonym-based auth).
2. After pool settlement: the original lender still transfers using `lenderSecret` (the lender field is `"shieldledger:pool"`, not a specific lender). The new holder stores an opaque `claimCommitment`.
3. Later transfers (by the secondary buyer): the current holder proves ownership via their `claimSecret` (commitment-based auth).
4. Insurance claims follow the same two-phase auth pattern, so the current holder collects regardless of how many transfers occurred.

### Default Insurance Pool

Every registration pays 2% of the invoice face amount (floored) into one shared public pool. A proven default (financed, unsettled, past due) lets the current claim holder collect 50% of the financed amount — partially if the pool is thin. Both percentages are proven in-circuit via `verifyUnitQuotient` (Compact has no division operator). The defaulting SME's identity is never revealed.

**Thin-pool behavior (both single-lender and pool invoices):** when the pool balance cannot cover the full entitlement, the payout is capped at the pool's remaining balance. For single-lender invoices, the claimant drains the pool entirely. For pool invoices, each lender receives a proportional share of the remaining balance based on their contribution ratio — the shortfall is shared equally across all slots. This is modeled on Uniswap V3 fee-rounding: the pool balance is a shared resource, not a queue.

### Secondary Market

After auction resolution, the winning lender can resell their claim (`transferClaim`). Authorization mirrors settlement exactly: the auction-leader pseudonym before any transfer, an opaque commitment after. On-chain this is just a new commitment and a `transferred` flag — the investor's identity never appears.

For pool invoices, each lender independently transfers their slot's claim via `transferPoolClaim`. The two-phase auth pattern (pseudonym → commitment) supports unlimited secondary transfers per slot.

### Cross-Deal Reputation

Every settlement updates a reputation in the SME's wallet (+10 on-time, −20 late, clamped 0–100), applied by `src/reputation.ts`. At registration the SME proves "my reputation ≥ N" in ZK. At bidding, the lender's private minimum-reputation bar is compared against the stored bound inside the circuit; neither the raw score nor the bar is written to the ledger. **However, the raw score and on-time/late counts are publicly reconstructable**, because the score starts at a known `0`, the update formula is public, and each settlement's on-time/late outcome is observable from the public `settledAt` vs `dueDate` — see [Known limitations](#known-limitations).

### Multi-Contract Design

A separate escrow contract (`contracts/escrow.compact`) holds financing per invoice. Ownership crosses the boundary via a shared commitment — the same `hash(smeSecret, nullifier)` stored on both chains, so only the wallet that can settle an invoice can release its escrow. The contracts are coordinated off-chain via `frontend/src/escrow-orchestrator.ts`.

---

## Transaction Flow

```
1. SME registers an invoice (optionally setting splitCount 2–4 for pool financing)
   → contract stores a nullifier, commitment, and ZK-attested credit/reputation bounds
   → 2% insurance premium paid from the SME's wallet

2. (Optional) Corporate buyer confirms the invoice in ZK
   → buyer-verified flag + opaque commitment become public

3. Lenders submit sealed bids
   → each bid is a commitment; terms stay hidden (frontend pricing engine
     suggests a fair rate from public data first)

4. Competing lenders reveal
   → revealBid (single auction) or revealPoolBid (slot in a pool)
   → lowest-rate single bid, or lowest weighted-average-rate pool, takes the lead

5. SME settles
   → settleInvoice pays the winning bidder; classify on-time or late
   → settleSplitInvoice pays per-lender proportional amounts + routes
     floor-rounding remainder to the insurance pool

6. On default (financed, unsettled, past due)
   → insurance payout: 50% from the shared pool, thin-pool-shared shortfall

7. Anytime: secondary market
   → winner resells the claim (transferClaim / transferPoolClaim);
     escrow release bound to the same commitment
```

---

## Run Locally

### Prerequisites

- **Node.js ≥ 22** and npm
- **Docker** with `docker compose` (for the local proof-server)
- **Midnight Lace wallet** (browser extension, connected to Preview or Preprod network)
- **[compactc](https://docs.midnight.network/developers/tooling/compactc/)** on PATH (used by `npm run compile`)

### Installation

```bash
# Clone
git clone https://github.com/vishvajitbhagave-dev/ShieldLedger.git
cd ShieldLedger

# Install
npm install

# Compile the Compact contract (regenerates ZK assets)
npm run compile

# Start the local proof-server (Docker)
npm run proof-server:start

# Create a wallet, fund it from the faucet, and deploy the contract
npm run setup -- --network preview    # or: --network preprod

# Start the browser DApp
npm run frontend:dev
```

Open the displayed URL in your browser and connect with the Midnight Lace wallet.

### Environment Variables

All frontend configuration is build-time (`VITE_*`), so **rebuilding is the only way to change configuration**. Full reference: `frontend/.env.example`.

| Variable | Meaning | Default |
| --- | --- | --- |
| `VITE_NETWORK_ID` | Ledger the DApp targets (`undeployed` devnet, `preview`, `preprod`) | `undeployed` |
| `VITE_BASE_PATH` | Deployment subpath (e.g. `/ShieldLedger/` for GitHub Pages) | `/` |
| `VITE_INDEXER_URL` / `VITE_INDEXER_WS_URL` | Override indexer endpoints | wallet-reported |
| `VITE_PROOF_SERVER_URL` | Override proof-server endpoint (unset → wallet-reported prover URI) | wallet-reported |
| `VITE_APP_RELEASE` | Release tag attached to error reports | `dev` |
| `VITE_SENTRY_DSN` | Sentry DSN; enables error monitoring | unset → no-op |
| `VITE_ANALYTICS_DOMAIN` | Plausible site id; enables analytics | unset → no-op |
| `VITE_ANALYTICS_ENDPOINT` | Analytics ingest URL override | `https://plausible.io/api/event` |

---

## Tests

```bash
npm test               # full Vitest suite — 25 files, 348 tests
npm run test:e2e       # read-only smoke check against the deployed contract
npm run build          # TypeScript typecheck (root + frontend)
```

![ShieldLedger test suite passing](docs/test-output.png)

The headless Compact circuit simulator covers all circuits (auction, pools, insurance, secondary market, reputation) as well as the frontend analytics logic (pricing engine, price-impact, rate-trend, order book, portfolio, circuit breaker, compliance export, stress tests, reputation backtest). Test count verified via `vitest list` on the current branch; the full suite is green in CI on every push to `main`.

---

## CI/CD

Two GitHub Actions workflows run on every push to `main`:

1. **CI** (`ci.yml`) — compiles the contract, runs the full test suite, typechecks, and builds the browser DApp.
2. **Deploy DApp to GitHub Pages** (`deploy-pages.yml`) — builds and deploys the DApp (targeting **Preprod**, with the proof-server URL left unset so the wallet-reported prover URI is used) to [GitHub Pages](https://vishvajitbhagave-dev.github.io/ShieldLedger/).

Both workflows use the Midnight Compact compiler action (`midnightntwrk/setup-compact-action@v1`) and Node.js 22. Latest CI run on `main`: **passing**.

![GitHub Actions CI/CD pipeline passing](docs/ci-cd-pipeline.png)

---

## Roadmap (Next Phase)

### Future Features

Ideas from the original proposal that are not yet built. These are distinct from the [Known Limitations](#known-limitations) (which document privacy gaps in what *is* built) — these are entirely new subsystems, none of which exist in the current codebase today.

| Feature | Status |
|---------|--------|
| Automated settlement via oracle | 🔜 Planned (not built) |
| Privacy-preserving dispute & default arbitration | 🔜 Planned (not built) |
| Multi-currency / stablecoin support | 🔜 Planned (not built) |
| On-chain governance layer | 🔜 Planned (not built) |

- **Automated settlement via oracle.** Integrate a payment oracle so that when the buyer pays the original invoice, funds are automatically released to investors and the loan is marked settled on-chain — removing the current manual `settleInvoice` / `settleSplitInvoice` reveal step.
- **Privacy-preserving dispute & default arbitration.** Beyond the existing automated default-insurance payouts, add an arbitration flow for disputed/late invoices where evidence is selectively disclosed to an arbitrator only — never to the public ledger or counterparties.
- **Multi-currency / stablecoin support.** Extend financing and settlement to multiple stable assets and currencies. Today amounts are single `Uint<64>` values on one ledger, and only the native `tNight`/`DUST` test tokens are used (for gas/fees) — this would add real multi-asset financing with amounts kept private.
- **On-chain governance layer.** Add a DAO-style parameter-setting mechanism (e.g. minimum funding thresholds, fee rates) so protocol parameters can evolve, while keeping transaction data private. The current contract has no access-control or admin pattern — every circuit is authorized purely through cryptographic proofs.

### Future Work

- **On-chain circuit breaker (Part B).** The current market health monitoring (Part A) is purely off-chain: the Dashboard computes a health status from public ledger data and displays a warning/critical banner when anomalous conditions are detected. An on-chain circuit breaker that automatically pauses new bids and registrations when a threshold is breached was scoped out for this pass. The contract currently has no access-control or admin/governance pattern — every circuit is authorized purely through cryptographic proofs (knowledge of a secret, credit score thresholds, claim-holder re-derivation). Introducing a privileged pause authority is a deliberate governance design decision that requires careful thought about who holds the key, how it is rotated, and what accountability exists. This is reserved for future work when the governance model is agreed upon.
- **Historical trend tracking.** Current monitoring evaluates the latest snapshot of ledger state. Adding on-chain timestamps to registration events (not currently stored) would enable time-windowed velocity detection (claims per hour, payout rate trends).

> **[PLACEHOLDER — update statuses above from "Planned" to "Shipped" with a commit/SHA link as each feature actually lands.]**

---

## Known Limitations

> This section documents honest limitations of the *current* design — they are accepted or known gaps, stated plainly, not hidden.

- **Payout visibility (accepted, Compact-enforced).** On pooled pool-financed invoices, per-lender payout amounts are public. Compact 0.23's ledger-write disclosure rule requires any value flowing into a ledger write (including `persistentHash`) to be `disclose()`d, so `payout_i` and `totalPayout` are public inputs and the commitment hashes provide binding but not privacy. See [docs/compact-privacy-notes.md](docs/compact-privacy-notes.md).
- **Contribution amounts are derivable, not secret (known gap for future work).** Although individual contribution amounts are never directly disclosed or written to the ledger, they are **mathematically derivable** from public on-chain data. Because the proportional proof links each public payout to `totalContribution`, and the sum proof links the contributions to the public `invoiceAmount` (with `totalContribution == invoiceAmount` used in practice), an observer can recover `contribution_i == invoiceAmount * payout_i / totalPayout`. True per-lender contribution secrecy is therefore **not** achieved by the current design — only aggregate/pool-level privacy is. Closing this would require hiding or unlinking the public anchors used here (e.g. not publishing `totalPayout`/per-lender payouts in a form tied to `invoiceAmount`, or proving proportionality against a hidden total).
- **Credit score is self-reported with no verification (known gap for future work).** The `smeCreditScore` witness is **100% self-reported**: it lives only in the SME's own wallet private state and is never checked against any external or platform reality. In the live browser DApp every SME defaults to a hardcoded `720` (there is no UI field to set a real score); via the CLI or manual private-state file editing an SME can set it to any arbitrary value (e.g. `1,000,000`) and the contract accepts it, since the only constraint is `smeCreditScore() >= creditThreshold`. There is **no data source in the system** a platform-calculated score could be derived from that is both private and independently verifiable — the only private wallet fields are random identity secrets, not financial data. Consequently, if the SME maximizes `creditThreshold` to get a better rate (the rational choice), the public threshold tends to converge toward their *self-reported* score, so it offers limited real secrecy or assurance (see the threshold-precision limitation above for the same back-calculation effect). Genuine private, verified credit scoring is **out of scope for the current implementation** and would require a new private data-input architecture (e.g. off-chain financial disclosures or bank/tax/oracle data revealed under ZK credentials) that does not exist in the codebase today.
- **Reputation score is publicly reconstructable from settlement history (known gap for future work).** Although `smeReputationScore` is never directly disclosed or written to the ledger, it is **mathematically reconstructable** by any observer. The score starts at a known default (`0`), updates deterministically (`+10` on-time, `−20` late, clamped 0–100 per `src/reputation.ts`), and every settlement's on-time/late outcome is publicly observable from the public `settledAt` timestamp vs the public `Invoice.dueDate`. An observer can therefore apply the same public formula to the on-chain settlement timeline and recover the SME's exact reputation score and on-time/late counts at any point — the same forced-leak pattern found in pooled-financing contributions and credit thresholds. Closing this would require proving reputation against hidden or noise-perturbed state, or making the on-time/late classification private.

---

## Level 5 — User Validation

- Target: 50 Preprod users
- Current: 0 / 50 (see [USERS.md](USERS.md))
- See [docs/FEEDBACK.md](docs/FEEDBACK.md) for the feedback log and changes made in response

---

## Documentation

- [Architecture Document](docs/architecture.md)
- [Security Audit](docs/SECURITY_AUDIT.md)
- [Usage Guide](docs/USAGE.md)
- [Production Runbook](docs/production.md)
- [Monitoring & Analytics](docs/monitoring.md)
- [Trust & Data Provenance](docs/TRUST_AND_DATA_PROVENANCE.md)
- [Compact Privacy Notes](docs/compact-privacy-notes.md)
- [Compliance Audit Trail](docs/COMPLIANCE_AUDIT_TRAIL.md)
- [Gas Optimization](docs/GAS_OPTIMIZATION.md)
- [Stress Test Results](docs/STRESS_TEST_RESULTS.md)
- [Price-Impact Simulation](docs/PRICE_IMPACT_SIMULATION.md)
- [Latency Benchmarks](docs/LATENCY_BENCHMARKS.md)
- [Reputation Backtest](docs/REPUTATION_BACKTEST.md)
- [Production-Readiness Review](docs/review.md)

---

## Contact

- **Product X Profile:** https://x.com/ShieldLedger
- **GitHub:** [github.com/vishvajitbhagave-dev/ShieldLedger](https://github.com/vishvajitbhagave-dev/ShieldLedger)
- **[PLACEHOLDER — add personal contact details: developer email, LinkedIn, Twitter/X handle, etc.]**

---

## License

MIT.
