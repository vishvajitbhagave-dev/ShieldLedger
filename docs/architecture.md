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
| 3 | Deployment and interaction with the deployed contract | ✅ | `src/setup.ts`, `src/deploy.ts`, CLI, live **preview** deployment, `state$` interactions, `scripts/e2e-check.ts` |
| 4 | Writing tests for contracts and frontend | ✅ | `tests/` — 9 suites, **131 tests**: `shield-ledger` (31), `cli-args` (19), `error-messages` (16), `reputation` (15), `inter-contract` (14), `buyer-verification` (10), `private-keys` (9), `invoice-status` (9), `invoice-nullifier` (8) |
| 5 | Error handling and loading states | ✅ | deploy/connect errors + dismissible banner, busy/working states, `wallet-locked` retry, new React `ErrorBoundary`, ledger-stream error badge |
| 6 | Inter-contract communication | ✅ (platform-equivalent) | Second `Escrow` contract + off-chain communication layer (see above); on-chain cross-contract calls are not yet implemented by the Compact compiler |
| 7 | Production deployment architecture | ✅ | CI + Pages CD, env-driven config, TS strict, single-version WASM override, gitignored secrets, public site at `/ShieldLedger/` |
| 8 | Documentation and demo/presentation | ✅ | This file + README (architecture, demo script, privacy properties, live links) |
| 9 | Advanced smart-contract development | ✅ | sealed-bid auction, commitment/reveal, ZK credit check & exposure cap, **ZK buyer verification**, **ZK cross-deal reputation (registration bound + lender minimum)**, contract-enforced settlement fairness |

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

## Privacy model (recap)

Only these ever touch the public ledger: invoice **nullifiers** (SHA-256 of
private details + secret), **commitments** (hashes binding an owner to a
nullifier), a **credit attestation** per invoice ("score ≥ N" — the proven
bound), a **reputation attestation** per invoice ("reputation ≥ N" — the proven
bound), lender **pseudonyms**, **sealed-bid commitments**, the **buyer-verified
flag** with its opaque per-invoice **buyer commitment**, and the **winning**
bid's terms. Everything else — invoice contents, bid terms until the owner
reveals, both secrets, the credit score, the reputation score, the lender's
minimum-reputation bar, and the settlement's on-time/late classification —
stays in the wallet.

### ZK credit scoring (SME)

`registerInvoice(nullifier, creditThreshold)` proves the SME's private
`smeCreditScore() >= creditThreshold` inside the circuit. Only the bound is
disclosed; the score and the financial history behind it never leave the wallet.
A contract floor of 650 stops "score ≥ 0" gaming. The attestation survives
settlement (it is carried on the `Invoice` struct) and is shown to lenders as
`score ≥ N` in the DApp's Open-invoices and Public-ledger tables.

#### Privacy model: ZK credit scoring — what an observer can and cannot learn

| Can an observer learn… | Yes / No | How |
| --- | --- | --- |
| The SME's exact credit score | **No** | Private witness `smeCreditScore`, consumed only inside the ZK circuit; never disclosed, stored, or serialized into any transaction payload. |
| The proven bound ("score ≥ N") | **Yes** | `creditThreshold` is a public field of the `Invoice` struct, written by `disclose(creditThreshold)`. |
| That the score meets the attested minimum | **Yes** | The bound *is* the attestation — a viewer sees "score ≥ 650". |
| The financial history behind the score | **No** | Never leaves the wallet; the circuit sees only the score value. |
| The SME's identity | **No** | The invoice is keyed by a nullifier; ownership is a commitment hash, not an identifier. |

**Why it is unforgeable.** The check is a circuit `assert`
(`smeCreditScore() >= disclose(creditThreshold)`), so a score below the
threshold makes **proof generation fail**. Registration is a proof of
creditworthiness, not a claim an SME can make or fake through application
logic: only a threshold at or below the true score is cryptographically
provable, and the verifier checks that proof on-chain.

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
| The SME's exact reputation score | **No** | `smeReputationScore` is a private witness consumed only inside the ZK circuits. |
| How many deals were on-time / late | **No** | `smeOnTimeCount`/`smeLateCount` are private witnesses; no count ever appears on-chain. |
| The proven bound ("rep ≥ N") | **Yes** | `reputationThreshold` is a public field of the `Invoice` struct, written by `disclose(reputationThreshold)`. |
| The lender's minimum-reputation bar | **No** | `lenderMinReputation` is a private witness; `submitBid` compares it to the bound inside the circuit. |
| The settlement's on-time classification | **No** | The boolean is the circuit *return value*, delivered only to the caller's wallet. |
| The SME's identity | **No** | The invoice is keyed by a nullifier; ownership is a commitment hash, not an identifier. |

**Why it is unforgeable.** Both comparisons are circuit `assert`s: a
registration bound above the true score, or a bid against a bound below the
lender's bar, makes **proof generation fail**. The score is therefore an
incentive that reliably compounds across deals (on-time SMEs register
progressively higher bounds, which lenders trust), without ever publishing a
financial history.
