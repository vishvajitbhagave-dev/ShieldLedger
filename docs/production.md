# ShieldLedger — production deployment runbook

This document describes how ShieldLedger is built, released and verified in
production. It is the operational counterpart to `architecture.md`; the privacy
and contract design lives there.

## Environment

| Aspect | Value |
| --- | --- |
| Hosting | GitHub Pages (project site, static bundle) |
| Live URL | `https://vishvajitbhagave-dev.github.io/ShieldLedger/` |
| Deployment pipeline | `.github/workflows/deploy-pages.yml` (push to `main` + manual dispatch) |
| CI pipeline | `.github/workflows/ci.yml` (contract compile, tests, DApp build) |
| Network target | Midnight `preview` |
| Contract artifact | compiled ZK assets are committed as build inputs to `frontend/public/` |
| Proof server | `http://localhost:6300` (a local `proof-server` instance that ships with the Midnight stack) |

The DApp is a **static bundle**; it has no backend of its own. All state lives
on the public ledger, and signing/proving happens in the browser against the
connected Midnight wallet. The proof server is the only infrastructure the DApp
requires at runtime, and the DApp reads its URL from the connected wallet's
`getConfiguration()` unless overridden.

## How a release happens

1. Push to `main` (or run the workflow manually with **Actions → Deploy DApp to
   GitHub Pages → Run workflow**).
2. `deploy-pages.yml` checks out the repo, installs the Compact compiler
   (pinned `0.31.1`), compiles the contracts to regenerate ZK assets, installs
   frontend dependencies, and builds the DApp.
3. The build bakes in the deployment configuration:
   - `VITE_BASE_PATH=/ShieldLedger/` (Pages project site path)
   - `VITE_NETWORK_ID=preprod`
   - `VITE_APP_RELEASE=<git SHA>` (release tag for error reports)
   - `VITE_SENTRY_DSN` / `VITE_ANALYTICS_DOMAIN` from GitHub repository
     **Variables** (leave unset to run without monitoring — see `monitoring.md`)
4. The `frontend/dist` folder is uploaded and deployed to Pages by the
   `configure-pages` / `upload-pages-artifact` / `deploy-pages` actions.

## Environment variables

All frontend configuration is build-time (`VITE_*`), so **rebuilding is the
only way to change configuration**. Full reference: `frontend/.env.example`.

| Variable | Meaning | Default |
| --- | --- | --- |
| `VITE_NETWORK_ID` | Ledger the DApp targets (`undeployed` devnet, `preview`, `preprod`) | `undeployed` |
| `VITE_INDEXER_URL` / `VITE_INDEXER_WS_URL` | Override indexer endpoints (else wallet-reported) | wallet-reported |
| `VITE_PROOF_SERVER_URL` | Override proof-server endpoint (else wallet-reported) | wallet-reported |
| `VITE_BASE_PATH` | Pages base path (only relevant for the CD build) | `/` |
| `VITE_SENTRY_DSN` | Sentry DSN; enables error monitoring | unset → no-op |
| `VITE_ANALYTICS_DOMAIN` | Plausible site id; enables analytics | unset → no-op |
| `VITE_ANALYTICS_ENDPOINT` | Analytics ingest URL override (self-hosting) | `https://plausible.io/api/event` |
| `VITE_APP_RELEASE` | Release tag for error reports | `dev` |

Sensitive values (`VITE_SENTRY_DSN`, `VITE_ANALYTICS_DOMAIN`) are never
committed: they are passed to the pipeline from GitHub repository **Variables**
and read via `vars.*`. Local `.env` files are gitignored.

## Local production-like build

```bash
npm ci
npm run compile                  # regenerates the ZK assets the DApp needs
npm --prefix frontend ci
$env:VITE_BASE_PATH='/ShieldLedger/'
$env:VITE_NETWORK_ID='preprod'
# proof server is unset → the DApp uses the wallet-reported prover URI
npm --prefix frontend run build
npm --prefix frontend run preview   # serves frontend/dist locally
```

The production bundle must be served from `/ShieldLedger/` to match the live
URL (the `base` in `vite.config.ts` reads `VITE_BASE_PATH`).

## Verifying a deployment

1. The workflow ends green (Actions → **Deploy DApp to GitHub Pages**).
2. Open the environment URL reported by the workflow (`github-pages`
   environment). It should resolve to
   `https://vishvajitbhagave-dev.github.io/ShieldLedger/`.
3. Check the served `index.html` references the **new** hashed bundle names
   (they change on every release), and confirm the page loads the wallet
   connection screen.
4. Smoke test against the live `preview` contract: connect a wallet, switch
   between the SME / Buyer / Lender roles, and confirm the header shows a live
   ledger stream badge with a recent update time.
5. If monitoring is configured, confirm a Sentry event appears for the new
   release and a `pageview` lands in analytics (see `monitoring.md`).

## Rollback

GitHub Pages deploys are immutable artifacts keyed by commit; **rolling back is
a redeploy of the previous commit**:

1. Find the last known-good SHA (e.g. from the previous green run).
2. Push a revert commit (preferred — keeps history linear and CI consistent),
   or trigger a manual workflow run against the old SHA via the GitHub UI's
   "workflow dispatch from a branch/tag" — note Pages deploys build from the
   checked-out code, so a tag pointing at the old SHA works.

Because configuration is baked at build time, a rollback also restores the
previous configuration snapshot automatically.

## Operational notes

- The DApp has **no upgrade path for the deployed contract**: on-chain state
  accumulates on the `preview` ledger and the live address is whatever the
  wallet deploys/joins at runtime. Treat the ledger state as append-only demo
  data for now.
- Proof generation runs locally in the browser against the proof server; it is
  CPU-bound and the "working…" states in the UI reflect real proving time.
- CI and the Pages build are deliberately separate jobs, so a broken DApp build
  cannot silently deploy and a broken contract compile cannot pass CI.
