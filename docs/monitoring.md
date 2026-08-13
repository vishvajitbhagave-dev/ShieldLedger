# ShieldLedger — monitoring & analytics

ShieldLedger ships with observability built in, but **opt-in by design**: the
bundled integration is inert until a build provides credentials, so development
and preview builds make zero external requests and send nothing anywhere.

Three layers exist in `frontend/src/lib/`:

| Layer | File | What it reports | Enabled by |
| --- | --- | --- | --- |
| Error monitoring | `lib/monitoring.ts` | Unhandled browser errors, unhandled promise rejections, and failed on-chain actions (connect, deploy, join, register, bid, reveal, settle, confirm) | `VITE_SENTRY_DSN` |
| Analytics | `lib/analytics.ts` | Page views, key user actions, and their success/failure outcomes | `VITE_ANALYTICS_DOMAIN` |
| Core Web Vitals | `lib/web-vitals.ts` | CLS, LCP, INP, FCP — forwarded to whichever sinks are enabled | same as above |

## Enabling error monitoring (Sentry)

1. Create a Sentry project for the DApp (browser SDK).
2. Add the DSN as a GitHub repository **Variable** named `SENTRY_DSN`
   (Settings → Secrets and variables → Actions → Variables).
3. Push to `main`. The Pages pipeline injects it as `VITE_SENTRY_DSN` at build
   time (`deploy-pages.yml`). A new release tag (`VITE_APP_RELEASE = git SHA`)
   is attached automatically, and the `preview` network id is set as the
   Sentry **environment**.

Result: every unhandled error and every failed on-chain action is captured with
the failing step name (e.g. `submitBid`) in its context, tagged by release and
environment.

Local verification without deploying:

```bash
$env:VITE_SENTRY_DSN='https://<key>@o<org>.ingest.sentry.io/<project>'
npm --prefix frontend run build && npm --prefix frontend run preview
```

Trigger a failure (e.g. submit a bid below the credit threshold) and watch it
appear in the Sentry project.

## Enabling analytics

ShieldLedger speaks the Plausible beacon protocol (`navigator.sendBeacon` POST,
no cookies, no local storage). It works with Plausible Cloud or any compatible
self-hosted ingest.

1. Register a site and get its **site id** (a domain).
2. Add it as a GitHub repository **Variable** named `ANALYTICS_DOMAIN`.
3. (Self-hosted only) also set `VITE_ANALYTICS_ENDPOINT` — pass it as a second
   variable if desired, or set it in a one-off build.
4. Push to `main`; the Pages pipeline injects `VITE_ANALYTICS_DOMAIN`.

### Events

| Event | Trigger | Props |
| --- | --- | --- |
| `pageview` | App mount | `network` |
| `wallet_connect` | Wallet connect attempt | `outcome` (success/error), `network` |
| `contract_deploy` | Contract deployed from the DApp | `outcome` |
| `contract_join` | Contract joined by address | `outcome` |
| `role_switch` | Role tab changed | `role` (sme/buyer/lender) |
| `registerInvoice`, `submitBid`, `revealBid`, `confirmInvoice`, `settleInvoice` | Each on-chain action completes or fails | `outcome`, `role` |
| `web_vital` | CLS / LCP / INP / FCP collected | `name`, `value` |

Privacy properties: the beacon carries only the event name, the URL, the
document referrer and the props above. It does **not** send nullifiers,
amounts, identities, or any wallet data.

## Core Web Vitals

`lib/web-vitals.ts` uses the native `PerformanceObserver` API — no extra
dependency — and reports each vital as:

- a Sentry message (release-filterable in the issue stream), and
- a `web_vital` analytics event with `name`/`value` dimensions.

There are no budgets enforced in CI yet; the alerts you configure (e.g. Sentry
metric alerts on `web-vital LCP` at the p75) are the enforcement mechanism.

## What is monitored today vs. what is not

**Today:** client-side errors, failed actions, page views, key actions, web
vitals, deployment success/failure (the Pages workflow run), and contract
compile + 131-test CI.

**Not yet:** uptime pings of the proof server, host metrics for the devnet
stack, and ledger-growth dashboards. For a static, state-on-chain DApp these
are best served by external uptime monitors (e.g. UptimeRobot against the Pages
URL) and by watching the indexer/logs of the Midnight stack you operate — the
DApp itself has no server to scrape.
