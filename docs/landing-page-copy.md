# ShieldLedger — Landing-page copy archive

This file preserves the full, original long-form explanatory copy that previously
appeared inline in the app UI. The app now shows shortened one-liners (some behind a
"ⓘ Learn more" expander); the full text below is retained here for reuse on a future
marketing / landing page. Copy is organized by the component it came from.

> Note on dynamic values: some paragraphs interpolate live form/state values at render
> time (e.g. the current credit/reputation threshold typed into the form). Those are
> marked below as `{…}` placeholders — reproduce the interpolation logic when reusing.

---

## `InvoiceFinancing.tsx` — Invoice financing panel

### Panel intro (heading "Invoice financing")

> A sealed-bid auction: lenders post only a _commitment_ to their terms, so no lender
> can see any other bid. Whoever reveals the lowest interest rate wins — the contract
> enforces it, the SME cannot play favorites.

---

## `InvoiceFinancing.tsx` — SME workflow

### Step 1 · Register an invoice — privacy explanation

> Only a _nullifier_ — a blinded hash of these details plus a random secret — is posted
> on-chain. The invoice details never leave this browser; the nullifier is saved locally
> so you can reuse it later. The _credit check_ proves "my credit score is at least
> {threshold}" in zero knowledge — the score itself is never revealed, only the proven
> bound. The _reputation check_ proves "my reputation is at least {reputation}"
> (set 0 for no requirement) — the current score is read from your private wallet state
> and never disclosed. The _claimed amount_ is posted publicly so your corporate buyer
> can later vouch for it in zero knowledge; your reference, due date and secret stay
> private.

### Step 2 · Your private reputation

> Stored only in this browser session. Settling _on or before_ the due date earns you
> **+10**; a late settlement costs **−20** (clamped to 0–100). Every registration proves
> "score ≥ threshold" in zero knowledge, so lenders are bound to what you really have —
> without ever seeing the score.

### Settle invoice

> The contract pays the lowest-rate winner automatically — you cannot pick a different
> lender. You can settle as soon as a lender has revealed a winning bid.

### Settle invoice — awaiting-bid status message

> No winning bid yet for this invoice — the auction is still open. Settlement is possible
> only once a lender has revealed the lowest-rate bid (see **Public ledger → Leading
> bids**).

---

## `InvoiceFinancing.tsx` — Buyer workflow

### Pending invoices (open for bidding)

> As the **corporate buyer** you can cryptographically confirm that an invoice is genuine
> and that you owe its claimed amount. Only a **Buyer-verified ✓** flag and an opaque
> per-invoice commitment go on-chain — your identity, your other supplier relationships
> and the full contract terms never do.

### Confirm an invoice

> The circuit verifies the amount you enter matches the SME's on-chain claim exactly — a
> mismatch fails the proof. Only a boolean flag and an opaque per-invoice commitment
> become public; nobody learns who you are or what the invoice is.

---

## `InvoiceFinancing.tsx` — Lender workflow

### Open invoices available for financing (Credit / Reputation columns)

> The **Credit** column shows the _proven bound_ the SME attested in zero knowledge at
> registration (e.g. "score ≥ 650"). The **Reputation** column shows the _proven
> reputation bound_ ("score ≥ N"; **any** means no minimum). Neither the credit score nor
> the reputation score is ever revealed — only the proven lower bound. The
> **Buyer-verified ✓** badge means the corporate buyer proved in zero knowledge that the
> invoice is genuine — its identity and the terms never appear.

### Submit sealed bid (kept short in UI)

> Your bid is sealed on-chain — other lenders only see a commitment.

### Reveal your bid

> The contract verifies these terms against your commitment and, if they beat the running
> best, you take the lead. The lowest rate wins.

---

## `LedgerView.tsx` — Public ledger

### Invoices section (ZK-proof explanation)

> **Credit (ZK-proof)** and **Reputation (ZK-proof)** are the bounds the SME proved in
> zero knowledge — the actual scores are never revealed to anyone. A **Buyer-verified ✓**
> badge means a corporate buyer proved the invoice genuine; the buyer's identity and terms
> stay private.

---

## `WalletConnect.tsx` — Wallet connection

### Connect wallet

> Connect the Midnight Lace wallet to deploy or join a ShieldLedger contract. The wallet
> signs and balances every transaction in your browser — private state never leaves it.

### Wallet locked status

> Lace is locked. Click the **Lace extension icon** in your browser toolbar to unlock it
> — the connection continues automatically as soon as you do.
