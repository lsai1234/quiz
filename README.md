# Content Pipeline Studio

Mobile-first AI TikTok carousel idea builder for CHRGD.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 on mobile or in DevTools mobile view (360px+).

## Routes

Production lives on the apex domain **https://getchrgd.co.uk**.

| Path | What it is |
|---|---|
| `/` | The quiz — the front door |
| `/shop` | The shop |
| `/bundles/[slug]` | Bundle landing pages |
| `/myhub` | Customers' subscription hub (sign-in required) |
| `/founderhub` | Founders Hub — the business (founder password required) |

`/hub` and `/portal` are the old names for the last two and redirect. Moving the
site to a new domain, or changing these paths, touches Stripe, every OAuth
provider and Cloudflare DNS — the runbook is `docs/DOMAIN_SETUP.md`.

## Mock mode

Works out of the box — no API keys needed. All 8 builder stages run with realistic CHRGD example data.

## Add live AI

Copy `.env.example` to `.env.local` and add:
- `OPENAI_API_KEY` — enables live idea generation
- `NEXT_PUBLIC_OPENAI_API_KEY` — same value, used client-side

## Add Google Sheets export

Add to `.env.local`:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_TAB` (default: Content Pipeline)

Share your Sheet with the service account email.

## User journey (8 stages)

1. Idea Spark — type a topic or tap a quick chip
2. Swipe cards — swipe through AI-generated ideas
3. Pressure test — scores across 10 dimensions
4. Carousel builder — 5-slide structure
5. Interaction optimiser — comments / saves / shares / etc.
6. Visual director — style system for your n8n image pipeline
7. Claim safety — flags risky supplement/health language
8. TikTok preview + Export review — append to Google Sheets as queued

## Catalogue: mock or real

Which products the shop, quiz and hub serve:

```bash
NEXT_PUBLIC_DATA_SOURCE=mock   # mock | real
```

- `mock` (default) — the built-in sample catalogue, plus anything added from PowerBody.
  Every journey works without adding a single product.
- `real` — **only** the products you have added from the PowerBody feed. This is the shop
  you actually sell, and it starts empty: add products in Hub → Products → PowerBody.

No credentials are involved, so this can't silently fall back. Flip it at runtime in the
Founders Hub (Settings → Data source). A previous storefront integration was the old
"live" side of this switch and has been removed — a stale `shopify` or `auto` value reads
as `mock`, so an old deploy degrades quietly.

## Add the PowerBody supplier (dropship)

Reading products and writing orders are **two separate switches**, so the catalogue can run
fully live while every order is still simulated:

```bash
SUPPLIER_SOURCE=powerbody        # mock | auto | powerbody  — catalogue, stock, prices
POWERBODY_API_URL=https://www.powerbody.co.uk/api/soap/
POWERBODY_API_USER=...           # all three are required
POWERBODY_API_KEY=...
SUPPLIER_ORDERING=simulate       # simulate | live — does "Send" really place an order?
```

Both default to the safe option and can be flipped at runtime from the Founders Hub
(Settings → Supplier, Settings → Order sending). `live` ordering also requires the live
supplier — mock SKUs are sample data. See `docs/POWERBODY_API.md`.

## Accounts & database

Customer accounts (hub sign-in), sessions, subscriptions, feedback and portal
edits persist in a database — zero-config SQLite locally, and Postgres
automatically when `DATABASE_URL` is set (required on serverless / Vercel, where
SQLite doesn't persist). Email + password works out of the box; social sign-in
is available at both the hub login and the checkout account gate for Google,
Microsoft, Amazon, Facebook, X, Discord, LinkedIn, GitHub (all free to set up)
and Apple (needs a paid Apple Developer account). Each one appears only once its
credentials are set — add `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and
"Continue with Google" shows up. See `docs/BACKEND.md` (includes the Vercel
deploy steps).

## Customer emails

Order and subscription confirmations carry the same printed receipt the website
shows, and every change to someone's plan is written to them too. Everything is
queued in the database and listed in Founders Hub → Emails, which is both the
send queue and a searchable log of every email that has ever gone out.

Once a provider is configured, **receipts send themselves** and everything that
reports a decision — a swap, a price rise, a plan settled — waits in the hub for
a founder to read it first. A receipt has no judgement in it and is expected
within seconds of paying; the rest is occasionally wrong and worth reading before
several hundred people do. `NOTIFY_AUTO_SEND` moves that line either way. With no
provider at all, everything waits and is copied out by hand.

Two ways to actually send. `NOTIFY_SOURCE=gmail` goes through the Google
Workspace account the business already has — no third-party service, 2,000 a day,
and the Founders Hub has a **Connect Google Workspace** button that does the
OAuth round trip for you. `NOTIFY_SOURCE=resend` uses a dedicated provider, worth
it once bounce data or volume start to matter. Both use an HTTP API rather than
SMTP, because Vercel blocks outbound port 25 and SMTP from a serverless function
hangs rather than fails.

Setting `NOTIFY_DOMAIN` puts each kind on its own address —
`orderconfirmation.noreply@`, `subscriptions.noreply@`, `billing.noreply@` — with
replies going to the real contact inbox. The setup guide for both routes is
`docs/EMAILS.md`.

## Testing

```bash
npm test     # 2,841 unit tests
npm run e2e  # the browser suite — every product, every journey, no keys needed
```

`npm run e2e` starts its own server against the app's mock modes and drives a
real browser through the quiz, the shop, bundles, checkout, My Hub, the Founders
Hub and the Partners Hub, including a rendered-output pass that catches text and
icon faults the unit suite cannot see. It is written up in
`docs/E2E_AUTOMATED_PLAN.md`; the manual walkthrough for the parts that need real
money and a real supplier is `docs/E2E_TEST_PLAN.md`.

## Stack

Next.js 16 · App Router · TypeScript · Tailwind CSS v4 · SQLite / Postgres · PowerBody dropship API · Stripe · OpenAI API · Google Sheets API
