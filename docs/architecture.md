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
| 4 | Writing tests for contracts and frontend | ✅ | `tests/shield-ledger.test.ts` (33), `tests/inter-contract.test.ts` (14), `tests/invoice-nullifier.test.ts` (8), `tests/invoice-status.test.ts` (6) = **61** |
| 5 | Error handling and loading states | ✅ | deploy/connect errors + dismissible banner, busy/working states, `wallet-locked` retry, new React `ErrorBoundary`, ledger-stream error badge |
| 6 | Inter-contract communication | ✅ (platform-equivalent) | Second `Escrow` contract + off-chain communication layer (see above); on-chain cross-contract calls are not yet implemented by the Compact compiler |
| 7 | Production deployment architecture | ✅ | CI + Pages CD, env-driven config, TS strict, single-version WASM override, gitignored secrets, public site at `/ShieldLedger/` |
| 8 | Documentation and demo/presentation | ✅ | This file + README (architecture, demo script, privacy properties, live links) |
| 9 | Advanced smart-contract development | ✅ | sealed-bid auction, commitment/reveal, ZK credit check & exposure cap, contract-enforced settlement fairness |

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
nullifier), lender **pseudonyms**, **sealed-bid commitments**, and the
**winning** bid's terms. Everything else — invoice contents, bid terms until the
owner reveals, credit score, exposure cap, both secrets — stays in the wallet.
