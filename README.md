# ShieldLedger

[![CI](https://github.com/vishvajitbhagave-dev/ShieldLedger/actions/workflows/ci.yml/badge.svg)](https://github.com/vishvajitbhagave-dev/ShieldLedger/actions/workflows/ci.yml)

> Confidential invoice financing on Midnight — invoices registered privately, bids sealed, settlements proven in zero knowledge.

## Live Demo

[Preprod demo URL](https://vishvajitbhagave-dev.github.io/ShieldLedger/)

## Contract Address

| Network | Address |
|---------|---------|
| Preview | `18737084144f6482d529fdb8fa357966c9c2eb2c3734d1753f4b42648a4dc4a6` |
| Preprod | `a503d5c086f8ab42f3a650fa0c4b67e31ac37c7eb997c8513c3dccf38de8c925` |

View on block explorers:
- [1AM Explorer — Preview contract](https://explorer.1am.xyz/contract/18737084144f6482d529fdb8fa357966c9c2eb2c3734d1753f4b42648a4dc4a6?network=preview)
- [1AM Explorer — Preprod contract](https://explorer.1am.xyz/contract/a503d5c086f8ab42f3a650fa0c4b67e31ac37c7eb997c8513c3dccf38de8c925?network=preprod)

## What This Product Does

ShieldLedger is a confidential invoice-financing marketplace built on the [Midnight Network](https://docs.midnight.network). Small and medium enterprises (SMEs) register trade invoices on-chain without revealing their contents — invoice details, financial history, and identity never leave the wallet. Lenders compete in a **sealed-bid private auction** under pseudonyms: bids are commitments, no lender sees another's bid, and the **lowest interest rate wins**, enforced by the contract.

Corporate buyers confirm invoices in zero knowledge — proving the invoice is genuine and the amount matches — without disclosing their identity or supply chain. A **cross-deal reputation score** (0–100, +10 on-time, −20 late) accrues privately across settlements and is proven in ZK at each registration, so reliable SMEs get cheaper capital without ever publishing a financial dossier. An **automated default insurance pool** (2% premiums in, 50% proven-default payouts out) provides mutual protection while keeping the defaulting SME's identity hidden.

Only opaque nullifiers, commitments, pseudonyms, and disclosed terms ever touch the public ledger. Privacy is enforced by zero-knowledge circuits, not policy.

## Privacy Model

**What is PUBLIC (on-chain, anyone can see):**
Invoice nullifiers, SME commitments, credit/reputation attestation bounds ("score ≥ N"), lender pseudonyms, sealed-bid commitments, winning bid terms after reveal, settlement receipt, buyer-verified flag + buyer commitment, insurance pool balance, paid insurance claims (keyed by nullifier).

**What is PRIVATE (private witness, never on-chain):**
Invoice contents, SME secret, credit score (exact value), reputation score + on-time/late counts, lender secret, lender credit score, lender's minimum-reputation bar, lender exposure cap, bid terms before reveal, buyer secret, settlement on-time/late classification.

**What the user PROVES without revealing:**
Credit score ≥ threshold, reputation score ≥ threshold, lender credit score ≥ 700, buyer knows the invoice is genuine, bid commitment matches revealed terms, SME owns the invoice, default conditions are met (financed, unsettled, past due) for insurance payout.

## Tech Stack

- **Smart contract:** [Compact 0.23](https://docs.midnight.network/developers/language/compact/) (Midnight's ZK contract language)
- **Frontend:** React 19 + Vite + TypeScript
- **Wallet:** [Midnight Lace](https://lace.io/) (browser extension)
- **Runtime:** Midnight.js 4.1.1, proof-server 8.1.0, Compact compiler 0.31.1
- **Testing:** Vitest, headless Compact circuit simulator
- **CI/CD:** GitHub Actions → GitHub Pages

## Prerequisites

- **Node.js ≥ 22** and npm
- **Docker** with `docker compose` (for the local proof-server)
- **Midnight Lace wallet** (browser extension, connected to Preview or Preprod network)
- **[compactc](https://docs.midnight.network/developers/tooling/compactc/)** on PATH (used by `npm run compile`)

## Setup & Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/vishvajitbhagave-dev/ShieldLedger.git
cd ShieldLedger

# 2. Install dependencies
npm install

# 3. Compile the Compact contract
npm run compile

# 4. Start the local proof-server (Docker)
npm run proof-server:start

# 5. Create a wallet, fund it from the faucet, and deploy the contract
npm run setup -- --network preview

# 6. Start the browser DApp
npm run frontend:dev
```

Open the displayed URL in your browser and connect with the Midnight Lace wallet.

## Run Tests

```bash
npm test                 # 182 simulator tests (all circuits + frontend logic)
npm run test:e2e         # read-only smoke check against the deployed contract
npm run build            # TypeScript typecheck (root + frontend)
```

## CI/CD

Two GitHub Actions workflows run on every push to `main`:

1. **CI** (`ci.yml`) — compiles the contract, runs the full test suite, typechecks, and builds the browser DApp.
2. **Deploy DApp to GitHub Pages** (`deploy-pages.yml`) — builds and deploys the DApp to [GitHub Pages](https://vishvajitbhagave-dev.github.io/ShieldLedger/).

Both workflows use the Midnight Compact compiler action (`midnightntwrk/setup-compact-action@v1`) and Node.js 22.

## Usage Guide

See [docs/USAGE.md](docs/USAGE.md) for a step-by-step guide covering all three roles (SME, Buyer, Lender), including invoice registration, buyer verification, sealed-bid auction, settlement, the secondary market, and the default insurance pool.

## Product X Profile

[PLACEHOLDER — I will add after creating the account]

---

## How It Works

The contract (`contracts/shield-ledger.compact`) is written in Compact. Everything the SME or lender wishes to keep confidential stays in private witness data; only hashes and disclosed terms are published.

| Piece | Public on ledger | Private |
| --- | --- | --- |
| Invoice registration | nullifier (32-byte hash of the invoice), SME commitment (hash of SME secret + nullifier), **credit attestation** ("score ≥ N", the proven bound), **reputation attestation** ("reputation ≥ N", the proven bound) | invoice contents, SME secret, **credit score**, **reputation score** |
| Bidding | bid key (hash of nullifier + pseudonym), lender pseudonym (hash of lender secret), **commitment to the bid terms** | bid terms (amount, due date, interest rate) until reveal, lender secret, credit score, exposure cap, **lender minimum reputation** |
| Reveal | leading bid's terms + lender pseudonym (only if it beats the running best) | — (commitment re-derivation proves ownership) |
| Settlement | winning lender pseudonym, financed amount, financed due date, winning interest rate | — (SME proves ownership via commitment); the on-time/late classification and the reputation update stay in the SME's wallet |
| Default insurance | ONE shared pool balance (2% premiums in, 50% default payouts out), paid claims keyed only by the already-public nullifier | which SME funded the pool; why a specific claim was paid; the fact that *this* SME defaulted |

### Sealed-Bid Auction

Because Compact circuits cannot iterate over a `Map`, "lowest rate wins" is built from per-reveal comparisons against a running best:

1. SME calls `registerInvoice` with a credit bound and an optional reputation bound (invoice is now `BIDDING`).
2. Optionally, the corporate buyer calls `confirmInvoice` — the `buyer-verified` flag and an opaque per-invoice commitment become public.
3. Each lender calls `submitBid` with a **commitment** — terms are hidden; the contract also enforces the lender's private minimum-reputation bar against the SME's public reputation bound.
4. Lenders who want to compete call `revealBid` with their true terms. The contract verifies the commitment, then compares against the running best; the best bid (lowest rate → smallest amount → earliest due) takes the lead.
5. SME calls `settleInvoice` — the contract pays the *current* best bid; favoritism is impossible. The circuit classifies the settlement on-time or late.

### Key Circuits

- **`registerInvoice`** — proves credit score ≥ threshold and reputation ≥ threshold in ZK; pays 2% insurance premium via `verifyUnitQuotient`; asserts pool balance update.
- **`confirmInvoice`** — buyer proves invoice is genuine and amount matches; stores opaque buyer commitment.
- **`submitBid`** — lender proves credit score ≥ 700; stores only a commitment to bid terms.
- **`revealBid`** — re-derives commitment; enforces private exposure cap; updates running best.
- **`settleInvoice`** — pays the winning bidder; proves on-time/late classification (returned to wallet only).
- **`claimInsurancePayout`** — proves default conditions (past due, unsettled); pays 50% of financed amount from shared pool (partially if thin); prevents double-claim.
- **`verifyUnitQuotient`** — division-free percentage proof powering both 2% premium and 50% payout.

### Default Insurance Pool

Every registration pays 2% of the invoice face amount (floored) into one shared public pool. A proven default (financed, unsettled, past due) lets the current claim holder collect 50% of the financed amount — partially if the pool is thin. Both percentages are proven in-circuit via `verifyUnitQuotient` (Compact has no division operator). The defaulting SME's identity is never revealed.

### Secondary Market

After auction resolution, the winning lender can resell their claim (`transferClaim`). Authorization mirrors settlement exactly: the auction-leader pseudonym before any transfer, an opaque commitment after. On-chain this is just a new commitment and a `transferred` flag — the investor's identity never appears.

### Cross-Deal Reputation

Every settlement updates a private reputation in the wallet (+10 on-time, −20 late, clamped 0–100). At registration the SME proves "my reputation ≥ N" in ZK. At bidding, the lender's private minimum-reputation bar is compared against the stored bound inside the circuit. Neither value is disclosed.

### Multi-Contract Design

A separate escrow contract (`contracts/escrow.compact`) holds financing per invoice. Ownership crosses the boundary via a shared commitment — the same `hash(smeSecret, nullifier)` stored on both chains, so only the wallet that can settle an invoice can release its escrow. The contracts are coordinated off-chain via `frontend/src/escrow-orchestrator.ts`.

## Repository Layout

```
contracts/shield-ledger.compact   Auction contract source (the source of truth)
contracts/escrow.compact          Escrow contract source
contracts/managed/                Compiler output — generated by `npm run compile` (gitignored)
docs/
  architecture.md                 Architecture + requirements checklist
  USAGE.md                        Step-by-step usage guide for all roles
  production.md                   Deployment runbook
  monitoring.md                   Monitoring & analytics
  review.md                       Production-readiness assessment
src/
  compile.ts                      Compiles all Compact contracts
  insurance.ts                    Shared insurance formulas (premium, payout, pool key)
  setup.ts                        Creates/funds wallet, deploys contract
  cli.ts                          Interactive CLI (12 menu options)
  reputation.ts                   Shared reputation formula (+10/−20, 0–100)
  witnesses.ts                    Witness definitions feeding the circuits
frontend/
  src/components/                 React components (WalletConnect, LedgerView, InvoiceFinancing, etc.)
  src/hooks/                      Custom hooks (use-ledger-state)
  src/shield-ledger-api.ts        Contract interaction layer
tests/                            Vitest simulator tests (182 tests across 12 suites)
scripts/
  e2e-check.ts                    On-chain smoke check
  demo-reputation-cycle.ts        Demo-only reputation tool
.github/workflows/
  ci.yml                          CI pipeline (compile + test + typecheck + build)
  deploy-pages.yml                GitHub Pages deployment
```

## Mainnet/Testnet

ShieldLedger is a **working demonstration on the Midnight Preview and Preprod testnets** — not a regulated financial service.

| Environment | Status | Details |
| --- | --- | --- |
| Midnight **Preview** (testnet) | **Active** | Live contract + DApp; funded with free test tokens from the [Preview faucet](https://faucet.preview.midnight.network/). |
| Midnight **Preprod** (testnet) | **Active** | Live contract (no DApp build); funded with free test tokens from the [Preprod faucet](https://midnight-tmnight-preprod.nethermind.dev/). |
| Midnight **Mainnet** | Not deployed | Requires Midnight mainnet tooling; nothing has been deployed there. |

## End-to-End Verification (Preview)

| Flow | TxID | Block |
| --- | --- | --- |
| `registerInvoice` | `0094eb20df7e2664a60bf2a954936d188bc3a6690fa9d2fb3306a4b75ced0ddad0` | 348161 |
| `submitBid` | `00b5ea191391f078eba680333bfb1eac7b2846d1b52afdcd87ed6f5169bbe20f16` | 348212 |
| `settleInvoice` | `001aeab17880b96e64d4ea4441d84b82ec528173171d615c18dcee3296153e70bf` | 348243 |

## Demonstration

**Desktop UI**

<img width="959" height="473" alt="Screenshot 2026-08-15 201031" src="https://github.com/user-attachments/assets/810e48c5-c5e9-4a02-90fe-c12db6e2eb1f" />

<img width="959" height="473" alt="Screenshot 2026-08-15 201207" src="https://github.com/user-attachments/assets/14ee0f9b-f3d2-4274-92ab-a8e283806dad" />

<img width="959" height="473" alt="Screenshot 2026-08-15 201228" src="https://github.com/user-attachments/assets/ee315f88-4048-4d7c-a4fa-53b990c2a644" />

<img width="959" height="473" alt="Screenshot 2026-08-15 201259" src="https://github.com/user-attachments/assets/81057bf2-dbbf-49a5-bd81-012bbf8092f5" />

<img width="959" height="470" alt="Screenshot 2026-08-15 201328" src="https://github.com/user-attachments/assets/ebe4ca88-4e6a-4754-a53a-60631984326d" />

<img width="959" height="473" alt="Screenshot 2026-08-15 201410" src="https://github.com/user-attachments/assets/5ed6f027-079e-4439-a32c-dcf84f41e62c" />

<img width="959" height="476" alt="Screenshot 2026-08-15 201448" src="https://github.com/user-attachments/assets/0315c5e0-9b1c-431f-b226-33e8da24eee5" />

<img width="959" height="471" alt="Screenshot 2026-08-15 201510" src="https://github.com/user-attachments/assets/262d2f5f-de3e-4857-96b2-bef68778cb8f" />

<img width="959" height="473" alt="Screenshot 2026-08-15 201549" src="https://github.com/user-attachments/assets/636f0a90-b2a4-49ba-8bc2-dccae97374fc" />

<img width="959" height="470" alt="Screenshot 2026-08-15 202102" src="https://github.com/user-attachments/assets/c07a7990-d75f-4b26-8ee6-64cb780c8ec3" />

<img width="959" height="473" alt="Screenshot 2026-08-15 202427" src="https://github.com/user-attachments/assets/57b13e85-06f0-4f52-91aa-9dddd69825b0" />

<img width="959" height="472" alt="Screenshot 2026-08-15 202500" src="https://github.com/user-attachments/assets/698ca257-7366-456b-a9c1-a394ac84ed89" />

<img width="959" height="476" alt="Screenshot 2026-08-15 202526" src="https://github.com/user-attachments/assets/c2ae97e6-0e22-4d50-95b4-2dc9857b3edd" />

<img width="959" height="482" alt="Screenshot 2026-08-15 202554" src="https://github.com/user-attachments/assets/ad0c192c-17af-4c8a-b5e9-641c2cf9977b" />

<img width="959" height="475" alt="Screenshot 2026-08-15 202639" src="https://github.com/user-attachments/assets/0f224c7f-6649-44c7-b5e4-b9208082394d" />

<img width="959" height="475" alt="Screenshot 2026-08-15 202714" src="https://github.com/user-attachments/assets/ab3e9695-2a7e-4f41-ac89-d534f48f2368" />

<img width="959" height="476" alt="Screenshot 2026-08-15 202741" src="https://github.com/user-attachments/assets/afff75a0-b559-45ef-9467-ff9cdcb953ee" />

<img width="959" height="472" alt="Screenshot 2026-08-15 202810" src="https://github.com/user-attachments/assets/47db04dd-dc37-47d6-98fd-9595a81bc575" />

<img width="959" height="478" alt="Screenshot 2026-08-15 202827" src="https://github.com/user-attachments/assets/7ac41c3d-4713-4d30-bc73-c0e8d7a840ee" />

<img width="959" height="475" alt="Screenshot 2026-08-15 202904" src="https://github.com/user-attachments/assets/6846193d-61b9-47a5-aee9-162e197c346f" />

<img width="959" height="476" alt="Screenshot 2026-08-15 202926" src="https://github.com/user-attachments/assets/e873c3df-9777-4171-b6a7-8d249077ae5b" />

**Mobile responsive UI**

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM" src="https://github.com/user-attachments/assets/65cb00af-c438-4a6b-afc6-722ae4bda013" />

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (1)" src="https://github.com/user-attachments/assets/57712907-4085-4e11-b0e4-463ddd484737" />

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (2)" src="https://github.com/user-attachments/assets/a3e256b9-8845-4cf5-b55a-7ddc44fd5382" />

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (3)" src="https://github.com/user-attachments/assets/e4fabe22-b7df-423c-9dde-fa75dd7743d0" />

<img width="720" height="1600" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (4)" src="https://github.com/user-attachments/assets/9ee99dc3-00c4-4bb8-96d4-cc1970dca2b9" />

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (5)" src="https://github.com/user-attachments/assets/a7598f6a-8914-479d-bb20-02565e6843eb" />

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (6)" src="https://github.com/user-attachments/assets/ef6e3c77-c038-4bbd-bce7-7906afa11d35" />

<img width="576" height="1280" alt="WhatsApp Image 2026-08-16 at 7 15 09 PM (7)" src="https://github.com/user-attachments/assets/2fdaeecf-0547-4536-91d2-1aba2e56f8c3" />

**CI/CD pipeline**

![GitHub Actions CI/CD pipeline passing](docs/ci-cd-pipeline.png)

**Test output**

![ShieldLedger test suite passing](docs/test-output.png)

**Demo video** — wallet connect + a successful circuit call on the Preview testnet:

https://drive.google.com/file/d/1Jo0o03gjT0YcqAVUUIzWBfvHHYL2rDv0/view?usp=drive_link

## License

MIT.
