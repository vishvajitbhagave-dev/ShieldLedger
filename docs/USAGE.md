# How to Use ShieldLedger

ShieldLedger is a confidential invoice-financing marketplace. SMEs register invoices for financing, buyers confirm they are genuine, and lenders compete to finance them — all with privacy enforced by zero-knowledge proofs on the Midnight Network.

This guide walks you through the DApp step by step. No technical background required.

## What You Need

1. **Midnight Lace wallet** — a browser extension (like MetaMask, but for Midnight). Install it from [lace.io](https://lace.io/) and create or import a wallet.
2. **Test tokens** — ShieldLedger runs on the Midnight Preview testnet, which uses free test tokens (tNight and tDUST). Get them from the [Preview faucet](https://faucet.preview.midnight.network/).
3. **A browser** — Chrome, Edge, or any Chromium-based browser. Open the [ShieldLedger DApp](https://vishvajitbhagave-dev.github.io/ShieldLedger/).
4. **A running proof-server** — the DApp connects to a local proof-server at `localhost:6300`. If you are using the hosted version, this is pre-configured. If running locally, start it with `npm run proof-server:start`.

## Step-by-Step Guide

### Step 1: Connect Your Wallet

1. Open the [ShieldLedger DApp](https://vishvajitbhagave-dev.github.io/ShieldLedger/).
2. Click **Connect with Lace**.
3. If your Lace wallet is locked, the DApp will show a waiting message and automatically retry once you unlock it.
4. Once connected, you will see the main dashboard with a **Live** badge and your wallet balance.

### Step 2: Register an Invoice (SME Role)

This is how an SME puts an invoice up for financing.

1. Click the **SME** role tab at the top.
2. Fill in the form:
   - **Reference** — a label for this invoice (e.g. "INV-2026-001"). This stays in your browser.
   - **Amount** — the face value of the invoice in tNight (e.g. `1000`).
   - **Due date** — when the buyer should pay (Unix timestamp).
   - **Credit check** — the credit-score threshold you want to prove (e.g. `650`). Your exact score stays private; lenders only see "score ≥ 650".
   - **Reputation check** — optional. Enter `0` if you have no reputation history, or a number up to your current reputation score. Lenders see "reputation ≥ N".
3. Click **Register invoice**.
4. Wait 30–60 seconds for the zero-knowledge proof to generate and the transaction to confirm.
5. Your invoice now appears in the **Open invoices** table. A 2% insurance premium is automatically paid into the default insurance pool.

**What happened privately:** Your credit score, reputation score, invoice contents, and identity never left your browser. The contract only learned a nullifier (hash), your commitment, and the bounds "score ≥ N".

### Step 3: Confirm the Invoice (Buyer Role)

A corporate buyer confirms the invoice is genuine — proving the amount matches what they owe.

1. Click the **Buyer** role tab.
2. Find the invoice you want to confirm in the **Open invoices** table.
3. Click **Confirm ↓** next to it. The form pre-fills the exact claimed amount.
4. Click **Confirm invoice**.
5. Wait for proof generation and confirmation.

The invoice now shows a **Buyer-verified ✓** badge in the ledger. Lenders can see the invoice is genuine without learning anything about you.

### Step 4: Place a Sealed Bid (Lender Role)

Lenders compete to finance the invoice. Bids are sealed — no lender sees another's bid.

1. Click the **Lender** role tab.
2. Find an open invoice in the table and click **Bid on this ↓**.
3. Fill in your bid:
   - **Amount** — how much you are willing to finance.
   - **Due date** — when you want repayment.
   - **Interest rate** — your rate in basis points (e.g. `500` = 5%).
4. Click **Submit sealed bid**.
5. Wait for proof generation.

Only a commitment (hash) of your bid terms goes on-chain. No other lender can see your rate.

### Step 5: Reveal Your Bid (Lender Role)

After bidding closes, lenders reveal their true terms so the contract can pick the winner.

1. Still on the **Lender** tab, find your invoice.
2. Click **Reveal bid ↓**.
3. Enter the **exact same terms** you used when sealing the bid (amount, due date, rate).
4. Click **Reveal bid**.
5. Wait for proof generation.

If your bid beats the current best, you become the leading bidder. The contract tracks the lowest rate → smallest amount → earliest due date.

### Step 6: Settle the Invoice (SME Role)

The SME settles the invoice — the contract pays the winning lender automatically.

1. Click the **SME** tab.
2. Find your invoice and click **Settle ↓**.
3. Enter:
   - **Financed amount** — the amount the winning lender is financing.
   - **Due date** — the repayment due date.
4. Click **Settle invoice**.
5. Wait for proof generation.

The contract pays the winning lender. Your private reputation updates: +10 if you settled on time, −20 if late. Lenders see only that settlement happened.

### Step 7: Check Your Reputation (SME Role)

1. Click the **SME** tab.
2. Your current reputation score, on-time count, and late count are shown under **Your private reputation**.

This information never leaves your browser. The contract never sees your exact score — only the bound you choose to prove.

### Step 8: Secondary Market — Transfer a Claim (Lender Role)

A lender can resell their claim on an invoice to another investor before settlement.

1. Click the **Lender** tab.
2. Click **Transfer claim ↓** next to a settled or pending invoice.
3. Enter the nullifier and the new investor's 32-byte secret.
4. Click **Transfer claim**.

Only a commitment goes on-chain. The new investor's identity is never revealed. The new holder can later settle or claim insurance using their own secret.

### Step 9: Claim Default Insurance (Lender Role)

If an invoice was financed but never paid (the SME defaulted), the current claim holder can collect from the shared insurance pool.

1. Click the **Lender** tab.
2. Switch to the **Default Insurance** sub-tab.
3. The table shows invoices that are past due, financed, and unsettled — eligible for a claim.
4. Click **Claim ↓** next to a defaulted invoice.
5. Click **Claim insurance payout**.
6. Wait for proof generation.

The contract pays 50% of the financed amount from the pool (or whatever is available if the pool is thin). The defaulting SME's identity is never revealed.

### Step 10: View the Public Ledger

1. Click **View → Ledger** at the top.
2. You will see:
   - **Invoices** — with credit and reputation bounds, buyer-verified status.
   - **Sealed bids** — commitments only (terms hidden).
   - **Leading bids** — revealed terms for the current best bid.
   - **Insurance pool** — total balance and list of paid claims.

### Step 11: Check Wallet Balance

1. Click **Check wallet balance** in the header or menu.
2. You will see your tNight and tDUST balances.

## What Gets Proved (and What Stays Private)

| What happens | What is PROVED (public) | What STAYS PRIVATE |
|---|---|---|
| SME registers invoice | "Credit score ≥ 650" and "Reputation ≥ N" | Exact credit score, reputation score, invoice contents, SME identity |
| Buyer confirms invoice | "The invoice is genuine and the amount matches" | Buyer identity, supplier relationships, contract terms |
| Lender places bid | "Lender credit score ≥ 700" | Bid terms (amount, rate, due date), lender identity, credit score |
| Lender reveals bid | The winning bid's terms (amount, rate, due date) | Losing bid terms (unless the owner reveals) |
| SME settles invoice | Winning lender pseudonym, financed amount, rate | SME identity, on-time/late classification (wallet-side only) |
| Claim transferred | New claim commitment | Buyer/seller identity, number of transfers |
| Insurance claimed | Payout amount and pool balance update | Which SME defaulted, why the claim was paid |

**The key principle:** Zero-knowledge circuits are the trust boundary. Privacy is enforced by math, not by policy or platform promises. A ledger observer — including the platform operator — provably cannot learn more than what is disclosed in the public fields.

## Troubleshooting

### "Wallet is locked" or DApp shows "Waiting for wallet"

Your Lace wallet extension is locked. Unlock it in the Lace extension popup. The DApp automatically retries every few seconds — no action needed once you unlock.

### "Proof server unreachable" or connection error

The DApp needs a proof-server running at `localhost:6300` to generate zero-knowledge proofs.

- **If using Docker locally:** Run `npm run proof-server:start` to start the proof-server container.
- **If using the hosted DApp:** The proof-server URL is pre-configured. If you see this error, the server may be temporarily down — try again in a minute.

### "Insufficient balance" when registering or bidding

You need tNight tokens to pay transaction fees. Get free test tokens from the [Preview faucet](https://faucet.preview.midnight.network/). Paste your wallet address (shown in Lace) and request tokens.

### Transaction takes a long time (30–60 seconds)

This is normal. Each transaction requires generating a zero-knowledge proof locally in your browser, which takes 30–60 seconds. The DApp shows a progress indicator while this happens.

### "expected instance of StateValue" error

This is a known issue with duplicate runtime packages. Run:
```bash
npm dedupe
npm ls @midnight-ntwrk/onchain-runtime-v3
```
Confirm the output shows a single copy of the package.

### Invoice not showing up after registration

Wait a few seconds for the indexer to process the transaction. The DApp streams ledger updates in real time, but there may be a brief delay. If the transaction succeeded (check the transaction confirmation in Lace), the invoice will appear shortly.

### "Already settled" or "Auction not resolved" error

These are normal contract rejections:
- **"Already settled"** — the invoice has already been settled; you cannot settle it again.
- **"Auction not resolved"** — no bids have been revealed yet, or no bids were placed. You need at least one revealed bid before settling.

### Browser DApp resets my reputation after page reload

This is a known demo limitation. The browser DApp stores reputation in memory, which resets on reload. The CLI persists reputation to a local file (`midnight-private-state.json`) and survives restarts. A production deployment would use persistent wallet storage.
