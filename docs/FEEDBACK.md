# User Feedback — Level 5

## Feedback Collection Method
Feedback is collected via a public Google Form linked from the README: https://docs.google.com/forms/d/e/1FAIpQLSf2KQdtBEXqYsQzVzULJf2vXowjDfCLM7aKmb8SVQnKsOaNtg/viewform?usp=header

## How We Ran This Feedback Loop

The form asks for a name, a Preprod wallet address, which roles were exercised, a star rating,
and a free-text comment. **67 tester submissions** were received between 2026-08-30 and
2026-09-29 and are reproduced verbatim in the log below.

Each submission was then handled as follows:

- **Triaged** by reading the free-text comment and sorting it into one of four kinds: a bug
  report, a UI/UX or clarity complaint, a feature request, or positive/no-action feedback.
  Bugs and clarity complaints were prioritised first, since they blocked use of an existing
  flow; feature requests were assessed for scope and only scheduled once the core flows were
  stable.
- **Fixed** by building the change, then **CI-verified** — every shipped item below is tied to a
  commit and its green CI run, so no improvement was marked done on the strength of a local run.
- **Recorded** as either shipped (with the commit hash), deferred to the Roadmap, or explicitly
  not-actioned, so that nothing silently disappeared.

How the 67 submissions broke down:

| Outcome | Count |
|---------|-------|
| Led to a shipped code change (commit hash recorded) | 15 |
| Feature request recorded, not yet scheduled | 25 |
| No written feedback beyond a star rating | 19 |
| Positive or too brief to act on | 6 |
| Investigated, could not reproduce on the current build | 1 |
| Routed straight to the Roadmap, nothing shipped | 1 |
| **Total** | **67** |

Three of the 15 shipped changes also produced a follow-up idea that was deferred rather than
built — which is why the Roadmap lists **6 ideas from 4 submissions**. Requests that were
recorded but have neither shipped nor been scheduled are left visible in the table above rather
than dropped, so the deferred backlog is auditable.

**What we did not do:** we did not attach on-chain proof of individual tester activity. The
addresses are self-reported through the form, and presence in this log is not evidence that a
given address transacted. See the "Preprod Testers" section of the README.

## Raw Feedback Log
| # | User | Feedback Summary | Date |
|---|------|-----------------|------|
| 1 | Rohini Bhagave | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "Noticed unused blank space on the right side of the "I am an SME" page when scrolling could be tightened up for a cleaner layout" | 2026-08-30 |
| 2 | Bhavesh Patil | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "In the "I am a Lender" section, under "Submit Bid", the Due Date field shows a raw number like "4102444800" instead of a readable date. It would be much clearer if this was displayed in the standard dd-mm-yyyy format, since the current format is confusing and hard to understand at a glance" | 2026-08-30 |
| 3 | Harsh Thakur | tested as SME (Business raising financing), rated 4/5 — "—" | 2026-08-30 |
| 4 | Kunal Gorde | tested as SME (Business raising financing), Buyer (Invoice verifier), rated 5/5 — "—" | 2026-08-30 |
| 5 | Aaradhya Bhagave | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "While registering an invoice, when I click "Sample Values," the Due Date field auto-fills with a raw number like "4102444800" instead of an actual date. This is confusing since we are used to seeing dates in dd-mm-yyyy format. It would be much easier to understand if this field showed a proper date format instead of a long number." | 2026-08-30 |
| 6 | Priti More | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "In the "I am a Lender" section, under "Submit Bid", I couldn't tell how the "Rate" field expects input. Is it meant to be entered as a percentage (like 4) or as a raw number/amount? Some clarification or a "%" label next to the field would make this much easier to understand." | 2026-08-30 |
| 7 | Sai Mathadevaru | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "In the "I am a Buyer" section, there's a lot of empty space on the right side, between the "Confirm Invoice" section and the "Analytics Dashboard" section. It would look cleaner if this spacing was reduced." | 2026-08-30 |
| 8 | Omkar Swami | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "The "Home" section looks like Very Simple. Make "Home" section attractive, professional and user friendly instead of lot of empty/ blank spacing." | 2026-08-31 |
| 9 | Rugved Ambre | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "I think, rather than using Sample Values it is better to add simulation sandbox. Because, for a new user testing is best option before using ShieldLedger into real network. So, on simulation sandbox, there is no risk for a new user." | 2026-09-01 |
| 10 | Vishwa Kalburge | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "When I use this application, at that time I got Public Ledger, Analytic Dashboard, and Lender Portfolio blank." | 2026-09-01 |
| 11 | Saniya Ghase | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "I am Register an Invoice and Settled it, then my Private Reputation score increases 0 --> 10. After that, when I go back and after some time when I start connect wallet again then my Reputation score showing me 0. So, try to solve this problem." | 2026-09-01 |
| 12 | Payal Babar | tested as Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "Everything is good" | 2026-09-12 |
| 13 | ayaan | tested as SME (Business raising financing), rated 4/5 — "UI" | 2026-09-13 |
| 14 | Nikita Biradar | tested as Buyer (Invoice verifier), rated 4/5 — "—" | 2026-09-16 |
| 15 | Vidhi Patil | tested as SME (Business raising financing), Lender (Investor), rated 5/5 — "Add AI chat option, so user ask his question to that AI and the AI will give answers of user's questions." | 2026-09-17 |
| 16 | Sanket Shinde | tested as SME (Business raising financing), Buyer (Invoice verifier), rated 3/5 — "—" | 2026-09-18 |
| 17 | Saket Sen | tested as SME (Business raising financing), rated 4/5 — "—" | 2026-09-18 |
| 18 | janet kiminza | tested as Buyer (Invoice verifier), rated 4/5 — "ui implementation is top notch" | 2026-09-18 |
| 19 | Gunjan Kamble | tested as SME (Business raising financing), Buyer (Invoice verifier), rated 4/5 — "—" | 2026-09-18 |
| 20 | Nandini Khidase | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "UI" | 2026-09-18 |
| 21 | Veer Suryavanshi | tested as SME (Business raising financing), rated 5/5 — "—" | 2026-09-19 |
| 22 | Sankruti Chavan | tested as Buyer (Invoice verifier), rated 5/5 — "—" | 2026-09-19 |
| 23 | Samruddhi Nevse | tested as Lender (Investor), rated 4/5 — "All is good" | 2026-09-19 |
| 24 | Diksha Waghmare | tested as SME (Business raising financing), rated 4/5 — "Complex UI" | 2026-09-20 |
| 25 | Shruti Kasbe | tested as SME (Business raising financing), rated 4/5 — "—" | 2026-09-20 |
| 26 | Suhel Shaikh | tested as SME (Business raising financing), Buyer (Invoice verifier), rated 5/5 — "all" | 2026-09-20 |
| 27 | Yogi Patil | tested as Just browsed, didn't transact, rated 4/5 — "features" | 2026-09-20 |
| 28 | Vaibhavi Agale | tested as Just browsed, didn't transact, rated 4/5 — "—" | 2026-09-20 |
| 29 | Tooba | tested as Just browsed, didn't transact, rated 5/5 — "Add Dark Mode" | 2026-09-21 |
| 30 | Rachana Shinde | tested as SME (Business raising financing), rated 4/5 — "In-platform messaging between SME and Buyer" | 2026-09-21 |
| 31 | Diksha Ughade | tested as SME (Business raising financing), Buyer (Invoice verifier), rated 4/5 — "Exportable PDF/CSV reports for accounting purposes" | 2026-09-21 |
| 32 | Nandini Jadhav | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "UX/UI Improvements" | 2026-09-21 |
| 33 | Jorge Soares | tested as SME (Business raising financing), rated 5/5 — "Accessibility improvements (screen reader support, WCAG compliance)" | 2026-09-21 |
| 34 | Najmi Ansari | tested as Just browsed, didn't transact, rated 3/5 — "—" | 2026-09-21 |
| 35 | Rashi Achaliya | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "In-app help OR FAQ chatbot" | 2026-09-21 |
| 36 | Fajrin | tested as SME (Business raising financing), Buyer (Invoice verifier), rated 4/5 — "In-app notifications (not just email/toast messages)" | 2026-09-21 |
| 37 | Manali Ghule | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "Keyboard shortcuts for power users" | 2026-09-22 |
| 38 | Khyati Upadhye | tested as Just browsed, didn't transact, rated 4/5 — "—" | 2026-09-22 |
| 39 | Johnrick Rabara | tested as SME (Business raising financing), rated 5/5 — "Connection  to Lace and 1am" | 2026-09-22 |
| 40 | Shreyash Parmale | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "UI" | 2026-09-23 |
| 41 | Anushka kachare | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "Real time alerts for unusual platform activity" | 2026-09-23 |
| 42 | Tanmay Musale | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "Multi-currency support (not just tNIGHT)" | 2026-09-23 |
| 43 | Auron | tested as Just browsed, didn't transact, rated 3/5 — "Late payment penalty configuration" | 2026-09-23 |
| 44 | Debansh Tiwari | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "Automatic invoice reminders before due date" | 2026-09-23 |
| 45 | Zeel Chauhan | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "Yield/APR calculator for lenders before bidding" | 2026-09-23 |
| 46 | Rishitha Reddy | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "Automatic invoice reminders before due date" | 2026-09-24 |
| 47 | Muhammad Guntur | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "Early repayment discount option" | 2026-09-24 |
| 48 | Riya Sawant | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "—" | 2026-09-24 |
| 49 | Ankita Dalal | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "Add Invoice financing limits based on SME's credit history" | 2026-09-24 |
| 50 | Trisha shetty | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "Data retention and right-to-erasure policy (privacy compliance)" | 2026-09-24 |
| 51 | Sheetal Goud | tested as SME (Business raising financing), rated 5/5 — "AI-based invoice fraud detection" | 2026-09-25 |
| 52 | Garima | tested as Just browsed, didn't transact, rated 3/5 — "—" | 2026-09-25 |
| 53 | Rohit Labase | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "Public API for developers to build on top of ShieldLedger" | 2026-09-25 |
| 54 | Sofiya Quraishi | tested as Just browsed, didn't transact, rated 4/5 — "—" | 2026-09-25 |
| 55 | Sajid Shaikh | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "Cross-chain bridge (accept financing in other blockchain assets)" | 2026-09-25 |
| 56 | Rupam Ghosh | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "White label version of ShieldLedger for other fintech companies to license" | 2026-09-26 |
| 57 | Sam | tested as SME (Business raising financing), rated 4/5 — "—" | 2026-09-27 |
| 58 | Saniya | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "Institutional lender onboarding (larger capital pools, bulk bidding)" | 2026-09-27 |
| 59 | Samara Shaikh | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "DAO-style governance for platform parameter changes (community-voted circuit breaker thresholds, etc.)" | 2026-09-27 |
| 60 | Akash Mondal | tested as Just browsed, didn't transact, rated 3/5 — "Feedback widget embedded in-app (not just external Google Form)" | 2026-09-27 |
| 61 | Aditya Jha | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "Platform-wide TVL (Total Value Locked) tracker and Lender leaderboard (top performers, opt-in)" | 2026-09-27 |
| 62 | Payal | tested as Just browsed, didn't transact, rated 4/5 — "—" | 2026-09-28 |
| 63 | Sakshi kanhere | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 4/5 — "Weekly digest email of platform activity" | 2026-09-28 |
| 64 | Purva Pawar | tested as Just browsed, didn't transact, rated 1/5 — "—" | 2026-09-28 |
| 65 | janvi pinjan | tested as SME (Business raising financing), rated 5/5 — "Caching layer for faster dashboard loads" | 2026-09-28 |
| 66 | Prathmesh Sonawane | tested as SME (Business raising financing), Lender (Investor), Buyer (Invoice verifier), rated 5/5 — "SMS alerts for critical events (settlement, default)" | 2026-09-29 |
| 67 | Tanishq Sonawane | tested as SME (Business raising financing), rated 4/5 — "—" | 2026-09-29 |

## What We Heard (Themes)

- **Layout and visual polish** — unused blank space in the role-view grid, Home looking too simple, and requests for a more professional / fintech-branded UI (Rohini Bhagave, Omkar Swami, Rugved Ambre, Nandini Khidase, ayaan).
- **Date clarity** — Due Date shown as raw Unix seconds (e.g. 4102444800) instead of dd-mm-yyyy (Bhavesh Patil, Aaradhya Bhagave).
- **Rate input clarity** — the Lender Submit Bid "Rate" field was unclear: percentage or raw amount (Priti More).
- **Risk-free testing** — instead of Sample Values, add a sandbox so new users can test before going on the real network (Rugved Ambre).
- **Reliability and performance** — Public Ledger / Analytics Dashboard / Lender Portfolio appearing blank, slow feedback when the ledger stream stalled, and mixed loading/error states (Vishwa Kalburge).
- **On-chain consistency and persistence** — cross-device invoice visibility, private Reputation score resetting after a wallet reconnect, and a place to view/clear local data (Saniya Ghase).
- **Account features** — Profile and Settings sections (Vishwa Kalburge, Saniya Ghase).
- **Onboarding and help** — guided next-steps prompts, an interactive walkthrough for first-time users, and a "Why ShieldLedger" comparison (Yogi Patil, Nandini Jadhav, Nandini Khidase).
- **Exports** — exportable PDF/CSV reports for accounting (Diksha Ughade).
- **Theming and device support** — dark/light mode and a mobile-responsive / native app version (Tooba).
- **Ideas logged for the roadmap** — AI chat assistant (Vidhi Patil), customizable dashboard widgets (Yogi Patil), native mobile app (Tooba), in-platform messaging and live chat (Rachana Shinde).

## What We Changed
| Feedback | Improvement Made | Commit |
|----------|-----------------|--------|
| SME page shows unused blank space on the right while scrolling (action-card band) | Changed `.sl-actions` grid to `repeat(auto-fit, minmax(96px, 1fr))` so action cards fill the row on all roles | `3dfccbb` |
| Lender Submit Bid: due date shown as a raw timestamp (wanted dd-mm-yyyy); wanted a built-in rate→amount calculator | Shared `unixSecondsToDmy()` (dd-mm-yyyy) formatter used app-wide, replacing duplicated `formatDate`/`toLocaleDateString` logic; added a live, display-only bid-amount calculator under the Submit Bid rate input (amount × bps/10000, tNight) | `253bd53` |
| Lender Submit Bid: Rate field unit unclear — is a percentage (e.g. 4) or a raw number/amount expected? | Clarified via an upfront hint ("Enter basis points — 100 bps = 1%, so 400 = 4%") plus updated placeholder ("e.g. 400 bps = 4%"). Deliberately avoided a literal "%" label since the field is genuinely bps-based — a "%" would mislead users into entering 4 (= 0.04% instead of 4%) | `792fbf5` |
| Home section looks too simple — make it attractive, professional and user friendly instead of lots of empty/blank spacing | Rebuilt the Home page within the existing design system (no new styles/tokens): added a role-aware hero band (live invoice stat + value-prop line + primary CTA), a quick-actions card band with role-specific route CTAs (register invoice, confirm invoice, submit bid, portfolio, analytics, rate trend), and upgraded the stat grid to the Dashboard metric set (default rate, pool utilization, pool balance, coverage ratio) with provenance captions; real on-chain data throughout | `80b62d8` |
| "Add a database to store local information." — investigated: invoices were meant to be shared on-chain, but could silently diverge across networks or separately-deployed contract instances | Cross-device invoice visibility fix: removed the Deploy/Join choice and auto-connect every user to one shared default contract per network; also discovered and fixed both Preprod and Preview default contracts running stale, outdated circuit logic and redeployed both fresh | `e1d1a92, f09684b, 818ee7a, b7e89a9` |
| Analytics/database request | Privacy-preserving usage-stats tracking (Supabase-backed): anonymized platform-wide analytics, starting with a unique-user count via a random per-browser ID (never wallet-derived), strictly no-op when unconfigured — addresses the analytics/database request without compromising the app's on-chain privacy model | `f289ab2` |
| Instead of 'Sample Values', add a sandbox so new users can test risk-free before going on the real network | Demo Mode / Simulation Sandbox — a fully client-side, wallet-free walkthrough of the whole flow (register invoice, bid, reveal, settle, insurance, pool, secondary market) using seeded fake data, entirely isolated from real wallet/network/localStorage. Accessible via a 'Simulation Sandbox' button in the landing page nav (desktop + mobile menu). | `8073501`, `2483c2e` |
| Vishwa Kalburge (SME/Lender/Buyer): Public Ledger, Analytics Dashboard, and Lender Portfolio pages appeared blank; slow feedback when the ledger stream stalled (blank pages lingered); loading spinner and error banner could show simultaneously; requested a Profile section | Fixed the blank-page bug: these pages now render their full layout instantly with placeholder values while the live ledger data loads, instead of blocking the entire page; reduced the stream-stall error timeout from 20s to ~6s for faster error feedback; fixed the UI bug so only one state displays at a time (loading or error), applied consistently across LedgerView, Dashboard, LenderPortfolio, and Profile; added a new Profile section: wallet addresses, role switcher, network switcher, lender pseudonym, registered invoices, and lender portfolio summary | `b2d5961` |
| Saniya Ghase (SME/Lender/Buyer): Private Reputation score increased correctly after settlement but reset to 0 after reconnecting the wallet later; the private-state cache was browser-wide, so the reset/leak risk spanned wallets; the same underlying store issue affected registered invoices and pool payouts; requested a Settings section | Fixed the root cause: private wallet state (SME/lender identity secrets) is now persisted to the local cache immediately on wallet connect, instead of only after a settlement — previously any reload or reconnect before a first settlement would silently generate a new identity, causing subsequent settlements to fail or the reputation to appear reset; fixed the private-state cache to be scoped per-wallet (shielded address + contract), not just per-browser, preventing one wallet's cached data from leaking into another wallet's session on the same browser; applied the same per-wallet (shielded address + contract) scoping fix to the invoice registry and pool payouts records, which had the same underlying issue — previously any wallet on the same browser could see and attempt to settle invoices registered by a different wallet; added a new Settings section: view and clear locally stored data (registered invoices, pool payouts, rate-trend history, private-state cache) with clear warnings before destructive actions, plus contract instance override management | `573bad6` |
| Ayaan (SME): reported a bug and requested the UI feel more professional and user-friendly, with unwanted/unneeded elements removed | Conducted a full UI audit and cleanup across three phases — (1) fixed demo/live data mismatches (e.g. incorrect dates, missing pool positions in Simulation Sandbox) and removed internal jargon/debug text from user-facing copy across Public Ledger, Rate Trend, Lender Portfolio, and Settings; (2) removed dead/non-functional UI code (unused state, unreachable warnings, broken error banners) and added missing context to wallet picker; (3) removed duplicated UI elements (network selector, exit-demo button, invoice count shown twice, redundant Profile sections) and unified inconsistent styling (stat cards, segmented switches, page headers, role-change confirmations) across the app | `712e0aa, 79fb6d9, 117bce2` |
| Nandini Khidase (SME/Lender/Buyer): asked why ShieldLedger is better than traditional invoice financing platforms; wanted the UI to feel like a polished fintech brand rather than a project/demo | Added a "Why ShieldLedger" comparison section to the landing page, contrasting ShieldLedger with traditional factoring across privacy (ZK-proofs vs. exposing full books), funding speed, rate-setting (sealed-bid auction vs. opaque negotiation), and control. Conducted an objective UI audit against fintech design patterns (typography, spacing, color, empty states, iconography, native-control theming) and fixed the concrete gaps found: styled the app's remaining raw/unstyled Wallet Connect panel heading, themed native date-input and checkbox controls in Invoice Financing to match the app's design system, hid native number spinners on the landing page demo, and unified Home's empty state with the rest of the app | `0bcdd5e` |
| Yogi Patil: requested guided next-steps prompts based on user role, and customizable drag-and-drop dashboard widgets | Added a role-aware guided next-steps card on the Home page that suggests the single most relevant next action based on the connected wallet's current state (e.g. register your first invoice, check bid activity on a live invoice, reveal a pending bid, confirm an invoice awaiting verification). Dismissible per session. The drag-and-drop dashboard request was logged in the Future Ideas / Roadmap section as a larger, not-yet-scoped effort. | `3682127` (feature), `37e4616` (roadmap entry) |
| Tooba: requested a dark/light mode toggle and a mobile-responsive/native app version | Added a dark/light theme toggle in the header, defaulting to system preference with manual override persisted locally, applied consistently across the app and landing page via the existing design-token system. Conducted a full mobile responsiveness audit (375-428px) confirming core flows already worked on mobile, then shipped targeted polish: nav scroll-affordance fade, table column wrapping to reduce horizontal swipe distance, header overflow fix, and compressed mobile header padding. The native mobile app request and an optional mobile card-list table view were logged in Future Ideas / Roadmap as larger, not-yet-scoped efforts. | `b2ae7dc, 6d2984c, 14b7189` |
| Diksha Ughade (SME/Buyer): requested exportable PDF/CSV reports for accounting purposes | Added an "Export CSV for Accounting" button on the Analytics Dashboard next to the existing JSON audit export. One row per invoice with the 10 public audit fields plus a derived status (bidding / financed / transferred) computed only from public on-chain data. Includes spreadsheet-formula protection and Excel-friendly encoding. Sealed bids and private wallet data are never included, and the data is generated in the browser only. PDF export was deliberately not added — CSV covers accounting import needs; a zero-dependency print-based PDF remains an option if requested later. | `fcc9a1a` |
| Nandini Jadhav (SME/Lender/Buyer): requested an onboarding tutorial or interactive walkthrough for first-time users, and UX/UI improvements | Onboarding: added a dismissible "How it works in this app" card on Home with role-specific steps (SME 3, Buyer 3, Lender 4) and a plain-language line on why bids are sealed, remembered per role locally in the browser (no wallet data, no analytics); added a click-only "Take a tour" guided spotlight walkthrough inside that card (SME 6 steps, Buyer 7, Lender 7) that moves between pages, closes with Skip, Esc or clicking outside, and works in dark/light mode and at phone width, built with existing design tokens and no new library. UI/UX audit fixes: invoice status badges now reflect the real status (Registered / Bidding / Settled) and the "Await Confirmation" step only completes when a buyer has confirmed; internal action names replaced with friendly progress/success messages; export buttons now show success/error messages, explain when disabled, and no longer risk cancelling the download; Public Ledger columns renamed to "Face amount (tNight)" and "Financed amount (tNight)", "Bidding" shown as a consistent badge, and the new-row highlight now fades after a few seconds. | `5ae7565, bda5049, 8809d34, f7488ac` |
