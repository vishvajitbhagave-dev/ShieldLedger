# ShieldLedger — Product Proposal

## 1. Product and Users

**ShieldLedger** is a confidential invoice-financing marketplace built on the
Midnight Network. It lets small and medium enterprises (SMEs) register trade
invoices for financing without revealing their contents, and connects them with
lenders who compete in a sealed-bid private auction — the **lowest interest
rate wins**, enforced by the contract.

### Who it is for

- **SMEs (borrowers).** Businesses that hold unpaid invoices and need
  working-capital financing. They register invoices on-chain as opaque
  nullifiers — invoice contents, financial history, and identity never leave the
  wallet. They prove creditworthiness via ZK (score ≥ N) and a cross-deal
  reputation score that accrues privately across settlements (+10 on-time,
  −20 late, 0–100 range). A reliable SME gets cheaper capital without ever
  publishing a financial dossier.

- **Corporate buyers.** The companies that owe the SME for delivered goods or
  services. A buyer can confirm an invoice in zero knowledge — proving the
  invoice is genuine and that it owes exactly the claimed amount — without
  disclosing its identity, other supplier relationships, or contract terms. Only
  a boolean `buyerVerified` flag and an opaque per-invoice commitment become
  public.

- **Lenders and investors.** Financiers who underwrite invoices. They post
  sealed bids (commitments to amount, due date, and interest rate) under
  pseudonyms — no lender sees another's bid. The contract compares revealed bids
  against a running best (lowest rate → smallest amount → earliest due date) and
  pays the winner automatically. Lenders also prove their own credit score
  (≥ 700) and can enforce a private minimum-reputation bar against the SME
  without disclosing the bar.

### What problem it solves

Traditional invoice financing exposes sensitive business data: a platform must
see invoice amounts, counterparty identities, and payment history to match
borrowers with lenders. This creates surveillance risk, information asymmetry,
and a central point of failure. SMEs in developing markets — where invoice
financing is most needed — face the worst trade-offs: disclose everything to
access capital, or stay unfunded.

ShieldLedger removes this trade-off. Privacy is enforced by zero-knowledge
circuits, not policy. An SME proves it is creditworthy without revealing its
score; a buyer proves an invoice is genuine without revealing its supply chain;
lenders compete on price without revealing strategy. The contract guarantees
fairness (lowest rate wins, settlement is bound to the winning bid) so no party
can manipulate outcomes.

## 2. Why Midnight Specifically

ShieldLedger cannot be built on a transparent ledger (Ethereum, Solana, Cardano
mainnet) or a traditional off-chain platform. Every core behavior depends on
Midnight's native ZK privacy model.

### What transparent chains cannot do

On Ethereum or any public-but-transparent chain, every transaction payload is
visible. If you register an invoice, the amount and counterparty are public. If
you bid, the terms are public before settlement. There is no circuit that can
keep `smeCreditScore` as a private witness — the EVM has no native ZK proof
verification over private state. You would need to bolt on a ZK-rollup or a
commit-reveal scheme, and even then the contract itself has no concept of
"witness data that never leaves the wallet."

Midnight's Compact language and runtime provide exactly this:

- **Private witnesses** (`smeSecret`, `lenderSecret`, `smeCreditScore`,
  `smeReputationScore`, `lenderCreditScore`, `lenderMinReputation`,
  `lenderExposureCap`, `buyerSecret`) are declared in the contract and consumed
  only inside ZK circuits. They never appear in any transaction, ledger state,
  or indexer response. This is not an application-layer promise — it is a
  compiler and runtime guarantee.

- **`disclose()`** is the explicit boundary between private and public. Every
  value stays private unless the developer writes `disclose(value)`. The
  contract's public fields (`creditThreshold`, `reputationThreshold`,
  `invoiceAmount`, `buyerVerified`, `buyerCommitment`, `smeCommitment`, winning
  bid terms) are the *only* data that touches the ledger.

- **ZK proof verification is native.** When `registerInvoice` asserts
  `smeCreditScore() >= disclose(creditThreshold)`, the proof is verified
  on-chain by the Midnight runtime. There is no oracle, no off-chain prover
  service that could be compromised — the circuit is the trust boundary.

### Specific behaviors that require Midnight

1. **ZK credit scoring.** The SME's exact CIBIL-style credit score is a private
   witness. The circuit proves `score ≥ threshold` and discloses only the
   threshold (with a contract-enforced floor of 650 to prevent gaming). On a
   transparent chain this data would be visible in the transaction; on Midnight
   it never leaves the wallet.

2. **Cross-deal reputation.** The SME's reputation score (0–100) and the
   on-time/late counts are private witnesses. The score is updated wallet-side
   by `applyReputationUpdate` (in `src/reputation.ts`) using the on-time/late
   boolean returned by `settleInvoice`. At registration, the SME proves
   `reputationScore ≥ threshold` in ZK. At bidding, the lender's private
   `lenderMinReputation` is compared against the stored bound inside the circuit.
   Neither value is disclosed. This compound, cross-transaction privacy — a
   score that accrues across deals and is proven at each one — is only possible
   when the chain natively supports private state that persists across
   transactions.

3. **Sealed-bid private auction.** `submitBid` stores only a commitment
   (`persistentHash(amount, dueDate, rateBps, lenderSecret)`). No other lender
   can read it. The reveal circuit re-derives the commitment and proves it
   matches, so only the genuine bidder can reveal. Losing bids are never
   exposed unless their owner chooses to reveal. On a transparent chain every
   bid would be visible during the bidding phase, enabling front-running,
   bid shading, and strategy theft.

4. **Buyer verification without identity exposure.** `confirmInvoice` proves
   the buyer knows `buyerSecret` for the specific invoice nullifier — binding
   the confirmation to that invoice — without revealing the buyer's identity or
   supplier relationships. The opaque `buyerCommitment` and boolean flag are
   the only public output.

5. **Nullifiers and commitments as the identity model.** Every invoice is keyed
   by a nullifier (hash of invoice details + secret). Ownership is proven via
   `deriveCommitment(smeSecret, nullifier)` — never an address or identity. The
   same commitment crosses the contract boundary to the escrow contract
   (`contracts/escrow.compact`), so the SME's private secret that settles an
   invoice on ShieldLedger is exactly the secret that releases escrowed funds.
   This cross-contract ownership proof is only possible when private state is
   natively available to both contracts' circuits.

### Why not off-chain/traditional?

A traditional platform (centralized invoice marketplace, bank portal) requires
trusting the operator with all business data — amounts, identities, payment
history, credit scores. The operator is a single point of surveillance, failure,
and censorship. Even a "privacy-respecting" off-chain system has no cryptographic
enforcement: the platform *could* see the data, and users must trust that it
won't.

ShieldLedger's privacy is enforced by math, not policy. The ZK circuits are the
trust boundary. A ledger observer — including the platform operator, if one
existed — provably *cannot* learn more than what is disclosed in the public
fields. This is the property that makes confidential invoice financing viable
for SMEs who cannot afford to expose their financial position.

## 3. Data Model: Public, Private, and Selectively Disclosed

The following tables extend and are consistent with the privacy model documented
in `README.md` and `docs/architecture.md`. All field names correspond to
`contracts/shield-ledger.compact` and `contracts/escrow.compact`.

### What is public on-chain (visible to all ledger observers)

| Field | Circuit / Source | Description |
| --- | --- | --- |
| Invoice nullifier | `registerInvoice` | 32-byte hash of invoice details + SME secret; opaque identifier for the invoice |
| `smeCommitment` | `registerInvoice` | `deriveCommitment(smeSecret, nullifier)` — proves SME ownership without identity |
| `creditThreshold` | `registerInvoice` | Public bound: "SME's credit score ≥ N" (floor: 650); the only credit data disclosed |
| `reputationThreshold` | `registerInvoice` | Public bound: "SME's reputation score ≥ N"; 0 = no requirement |
| `invoiceAmount` | `registerInvoice` | Claimed face amount of the invoice (buyer will vouch for this) |
| `buyerVerified` | `confirmInvoice` | Boolean: corporate buyer has confirmed the invoice |
| `buyerCommitment` | `confirmInvoice` | Opaque per-invoice hash binding the confirmation to this nullifier |
| Bid commitment | `submitBid` | 32-byte commitment to bid terms; no terms are readable |
| Bid key | `submitBid` | `deriveBidKey(nullifier, pseudonym)` — pseudonymous key for the sealed bid |
| Lender pseudonym | `submitBid` | `derivePseudonym(lenderSecret)` — pseudonymous lender identity |
| Best bid terms | `revealBid` | Winning bid's amount, due date, and rate (only if it beats the running best) |
| Settlement receipt | `settleInvoice` | Financed amount, due date, winning rate, winning lender pseudonym |
| Escrow lender pseudonym | `deposit` (escrow) | Lender who locked funds |
| Escrow `smeCommitment` | `deposit` (escrow) | Same commitment as on ShieldLedger — binds escrow to invoice |
| Escrow amount | `deposit` (escrow) | Exact winning-bid amount |
| Escrow released flag | `release` (escrow) | Boolean: funds have been released to the SME |

### What stays private (never leaves the wallet, never disclosed)

| Value | Witness | Who holds it |
| --- | --- | --- |
| Invoice contents (buyer identity, line items, counterparties) | — | SME's wallet; never enters any circuit as a witness (only the nullifier is used) |
| SME secret | `smeSecret` | SME; proves ownership via `deriveCommitment` without identity exposure |
| SME credit score (exact value) | `smeCreditScore` | SME; consumed only in `registerInvoice` circuit assert |
| SME reputation score (exact value) | `smeReputationScore` | SME; consumed in `registerInvoice` and `submitBid` circuit asserts |
| SME on-time / late counts | `smeOnTimeCount`, `smeLateCount` | SME; private witnesses, never on-chain |
| Lender secret | `lenderSecret` | Lender; derives pseudonym and bid commitment |
| Lender credit score (exact value) | `lenderCreditScore` | Lender; asserted ≥ 700 in `submitBid`/`revealBid` |
| Lender minimum reputation bar | `lenderMinReputation` | Lender; compared against stored bound in `submitBid` circuit |
| Lender exposure cap | `lenderExposureCap` | Lender; enforced in `revealBid` circuit |
| Bid terms (amount, due date, rate) — before reveal | — | Lender; sealed in commitment until `revealBid` |
| Buyer secret | `buyerSecret` | Buyer; proves knowledge of secret for the specific invoice |
| Settlement on-time/late classification | — | Returned by `settleInvoice` to the SME's wallet only |

### What is selectively disclosed / proven via ZK

These values are never disclosed as raw data. Instead, ZK circuits prove
properties about them, and only the proven bound or boolean is made public.

| Proven property | Circuit | What is public | What stays private |
| --- | --- | --- | --- |
| SME credit score ≥ threshold | `registerInvoice` | `creditThreshold` (the bound) | Exact score, financial history |
| SME reputation score ≥ threshold | `registerInvoice` | `reputationThreshold` (the bound) | Exact score, deal history |
| Lender credit score ≥ 700 | `submitBid`, `revealBid` | Nothing (circuit accepts/rejects) | Exact score |
| SME reputation ≥ lender minimum | `submitBid` | Nothing (circuit accepts/rejects) | Both the bound and the bar |
| Buyer knows the invoice is genuine | `confirmInvoice` | `buyerVerified` flag, `buyerCommitment` | Buyer identity, supplier relationships |
| Bid commitment matches revealed terms | `revealBid` | Revealed terms (only if beating best) | Lender secret |
| Settlement is on-time vs late | `settleInvoice` | Nothing on-chain | Boolean returned to SME wallet only |
| SME owns the invoice | `settleInvoice`, `release` | Nothing (commitment is already public) | SME secret |
| Lender owns the bid | `revealBid` | Lender pseudonym (already public) | Lender secret |

### Ledger observer: can and cannot learn (summary)

| Observer can learn | Observer cannot learn |
| --- | --- |
| That an invoice exists (nullifier) | Invoice contents, buyer identity, counterparty terms |
| SME's chosen credit and reputation bounds | Exact credit or reputation scores |
| That a buyer confirmed an invoice | Buyer's identity or other supplier relationships |
| That a lender placed a sealed bid | Bid terms until the bidder reveals |
| The winning bid's terms (after reveal/settlement) | Losing bid terms (unless the owner reveals) |
| The lender's pseudonym | The lender's real identity or secret |
| Whether a lender meets the credit minimum | The lender's exact credit score |
| Whether the SME meets the lender's reputation bar | The bar itself or the SME's exact score |
| Settlement timing (block timestamp) | On-time/late classification (wallet-side only) |

## 4. Mainnet Feasibility by Level 6

ShieldLedger is currently deployed on the **Midnight Preview** and **Preprod**
testnets with a working contract (`contracts/shield-ledger.compact`), a
multi-contract escrow (`contracts/escrow.compact`), a CLI, and a React/Vite
browser DApp. 136 tests pass in the simulator suite. The following is a concrete
plan for reaching a Mainnet-ready state by Level 6.

### What is already built (Preprod/Preview)

- **Auction contract** with all five circuits: `registerInvoice`,
  `confirmInvoice`, `submitBid`, `revealBid`, `settleInvoice` — deployed and
  verified on-chain on both Preview and Preprod.
- **Escrow contract** with `deposit` and `release` circuits, coordinated
  off-chain via `frontend/src/escrow-orchestrator.ts` using shared commitments.
- **ZK credit scoring** (contract floor 650) and **ZK cross-deal reputation**
  (+10 on-time, −20 late, 0–100, enforced in-circuit at registration and
  bidding).
- **ZK buyer verification** with per-invoice commitment binding.
- **Sealed-bid auction** with commitment/reveal, running-best comparison, and
  contract-enforced lowest-rate-wins settlement.
- **Browser DApp** with SME, Buyer, and Lender role workflows, Lace wallet
  integration, live ledger streaming via `state$`, mobile-responsive UI.
- **CLI** with interactive and non-interactive modes, all nine menu options.
- **Test suite** — 136 tests across 9 suites (auction, escrow, buyer
  verification, inter-contract, reputation, private keys, invoice status,
  invoice nullifier, error messages, CLI args).
- **CI/CD** — GitHub Actions: contract tests, typecheck, DApp build, GitHub
  Pages deployment.
- **E2E smoke check** — `npm run test:e2e` reads on-chain state from the
  deployed contract.

### Remaining engineering work

| Area | What is needed | Scope |
| --- | --- | --- |
| **Token-backed escrow** | The current escrow uses `Uint<64>` amounts, not real NIGHT/DUST tokens. Add `send` circuits or a token-transfer layer so the escrow holds and releases actual tokens. | New circuit additions to `escrow.compact`; re-audit the escrow contract |
| **On-chain cross-contract calls** | Currently coordinated off-chain. When the Compact compiler implements `contract` keyword support, migrate the communication layer to on-chain calls for atomicity. | Depends on Compact compiler roadmap; off-chain layer is production-viable in the interim |
| **Wallet persistence across browser sessions** | The DApp resets reputation state on reload (in-memory provider). Wire `midnight-js-level-private-state-provider` to persist reputation and secrets across sessions. | Frontend state management change |
| **Multi-network deployment** | Mainnet deployment scripts, network selection, faucet alternatives (Mainnet uses real tokens). | `src/setup.ts`, `src/deploy.ts`, `.midnight-state.json` |
| **Rate limiting and bid timing** | Add configurable bidding windows (open/close timestamps) so auctions have defined durations. | Contract change + UI countdown |
| **Invoice linking / off-chain metadata** | A reference system for linking invoice documents (hashes) off-chain while keeping contents private. | Application-layer, not contract change |

### Audits and security review

| Item | Approach |
| --- | --- |
| **Compact circuit audit** | Engage a ZK security auditor (e.g., with Compact/Midnight experience) to review `shield-ledger.compact` and `escrow.compact` for assertion completeness, edge cases in the `isBetter` comparison, and commitment collision resistance. The circuits are ~277 and ~75 lines respectively — a focused engagement. |
| **Commitment scheme review** | Verify `persistentHash` preimage resistance and that no two distinct inputs can produce the same commitment or bid key. The `deriveBidCommitment` struct hashing should be reviewed for domain separation. |
| **Reputation formula audit** | Confirm that the clamping logic in `src/reputation.ts` (+10/−20, 0–100) cannot be manipulated through edge cases (e.g., overflow, underflow at floor/ceiling boundaries). |
| **Frontend security** | Review Lace wallet integration for secret handling, ensure private state is never logged or sent to analytics, verify the Plausible-compatible analytics is truly opt-in. |
| **Dependency audit** | Pin and audit all `@midnight-ntwrk/*` packages; the existing `overrides` for `onchain-runtime-v3` should be documented as a known dual-package hazard. |

### Wallet and UX polish

| Item | Description |
| --- | --- |
| **Lace wallet UX** | Test on Mainnet Lace; handle wallet lock/unlock, network switching, and token balance display. Currently the DApp shows a waiting hint when Lace is locked — refine for Mainnet reliability. |
| **Transaction feedback** | The current 30–60s proof-generation time needs clear progress indicators. Add step-by-step status (generating proof → submitting → confirming). |
| **Ledger explorer links** | Add Mainnet block explorer links (1AM Explorer, Midnight Explorer) to the DApp once Mainnet explorers are available. |
| **Mobile responsiveness** | The DApp and landing page are already mobile-responsive (demonstrated in screenshots). Final pass for Mainnet launch polish. |
| **Error recovery** | The existing error handling (deploy/connect errors, dismissible banner, `wallet-locked` retry, `ErrorBoundary`) should be tested against Mainnet failure modes (network congestion, proof-server timeouts). |

### Regulatory and compliance considerations

| Consideration | Approach |
| --- | --- |
| **Not a financial service** | ShieldLedger is a protocol demonstration on the Midnight testnets. The README and DApp clearly state this. For Mainnet, maintain prominent disclaimers that this is experimental technology, not a regulated lending platform. |
| **KYC/AML separation** | Invoice financing in most jurisdictions requires KYC/AML compliance. ShieldLedger's privacy model is compatible with off-chain KYC: a trusted identity provider could issue a ZK credential (e.g., "this entity passed KYC") that the SME or lender presents at registration without revealing identity on-chain. This is an application-layer concern, not a contract change. |
| **Credit score source** | The current ZK credit scoring uses a private witness (`smeCreditScore`) that the wallet provides. For production, this score must come from a trusted source (e.g., a CIBIL API, a credit bureau oracle, or a ZK-attested credential). The contract itself is source-agnostic — it only verifies the bound. |
| **Lending regulations** | Invoice financing is regulated differently across jurisdictions (e.g., RBI guidelines in India, FCA in the UK, SEC in the US). ShieldLedger does not originate, underwrite, or service loans — it is a marketplace protocol. A production deployment would need to partner with or be operated by a licensed entity. The protocol itself is neutral. |
| **Data residency** | Because all sensitive data stays in the wallet (private state), ShieldLedger is inherently compatible with data-residency requirements (GDPR, India's DPDP Act). No personal data is stored on-chain or on any server. |

### Rough timeline to Mainnet readiness

| Phase | Duration | Deliverables |
| --- | --- | --- |
| **Token escrow integration** | 2–3 weeks | `escrow.compact` updated with token circuits; escrow tests expanded |
| **Wallet persistence + UX polish** | 2 weeks | Reputation persists across sessions; transaction progress UI; mobile QA |
| **Circuit and contract audit** | 3–4 weeks (can overlap with engineering) | External audit report; remediation of findings |
| **Mainnet deployment scripts** | 1–2 weeks | Network config, deployment verification, block explorer integration |
| **Regulatory review** | 2–3 weeks (can overlap) | Legal review of disclaimers, KYC integration design document |
| **Integration testing on Preprod with Mainnet-like config** | 1–2 weeks | End-to-end flows with token escrow, Mainnet wallet, explorer verification |

**Total estimated time:** 8–12 weeks from current Preprod state to
Mainnet-ready, with parallel workstreams. The critical path is the circuit audit
and token escrow integration. The off-chain communication layer for
inter-contract coordination is production-viable as-is and does not block
Mainnet deployment.
