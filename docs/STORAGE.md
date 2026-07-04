# Storage & Accounts — Architecture Spec

Status: **spec for review, no code written yet.** Branch:
`claude/quiz-hub-storage-setup-c65sjz`.

This answers: what database the app needs, what lives in it vs in
Shopify/Recharge, how subscriber login works, how the AI feedback loop and the
insights dashboard get their data, and how to keep the whole thing cheap.

## 1. What actually needs durable storage

Five distinct needs, in rough build order:

1. **Founders Hub state** — the improvements backlog, product overrides,
   removed/imported products, pricing overrides. Exists today as JSON files
   under `.data/` (`src/lib/portal/persist.ts`). **This does not survive on any
   serverless host** (Vercel et al. have an ephemeral filesystem) and doesn't
   share state across instances — it only works on a single long-lived box.
2. **Quiz responses** — what a visitor answered, the stack we recommended, and
   whether they converted. Needed so a subscriber's original answers are the
   seed context for everything later (feedback loop, tailored questions,
   re-recommendations).
3. **Subscriber records** — the app-side row per subscriber that *links* our
   data (quiz session, check-ins, AI questions) to the commerce identities
   (Shopify customer, Recharge customer). Not billing — just the join.
4. **AI feedback loop** — check-in answers over time, plus AI-generated
   follow-up question sets tailored to that subscriber's stack + history.
   Today feedback history lives in the client-side hub store and evaporates.
5. **Insights events** — thin analytics events (step viewed, answered, dropped,
   revealed, checkout started…) so the portal can show funnels and drop-off.

## 2. Recommendation in one paragraph

Add **one Postgres database** (managed serverless Postgres — **Neon** is the
default recommendation; Supabase is the alternative if we ever want its extras)
accessed through **Drizzle ORM** for schema + migrations. Keep Shopify and
Recharge as the systems of record for commerce and billing — the app DB never
duplicates money state. Phase 1 is tiny because `persist.ts` was built as the
seam: its `readJson`/`writeJson` name→JSON contract maps 1:1 onto a single
`kv(key, value jsonb)` table, so the backlog and all portal state migrate with
almost no call-site changes. Relational tables are added only for the genuinely
relational new data (sessions, subscribers, check-ins, events). Analytics stays
in the same Postgres as an append-only thin `events` table with daily rollups —
at our volumes this is effectively free and avoids a second vendor.

Why not other options considered:

- **Vercel KV / Upstash Redis** — fine for the kv part, useless for querying
  events/funnels or joining subscriber history. Would force a second store.
- **SQLite (as in the content studio)** — perfect on its VPS; wrong for a
  Next.js app that may deploy serverless. Only viable if this app is
  deliberately pinned to a single VPS forever.
- **PostHog (hosted analytics)** — genuinely good and its free tier (~1M
  events/mo) would cover the funnel dashboard without building anything. Not
  chosen as the primary because we want the insights *inside the portal* and
  the same DB already does it; noted as a zero-cost complement we can bolt on
  later purely client-side.
- **Prisma** — heavier runtime; Drizzle is lighter for serverless and the
  schema surface here is small.

## 3. System-of-record boundaries

| Data | System of record | App DB holds |
|---|---|---|
| Products, prices, inventory, images | **Shopify** (+ `chrgd.*` metafields) | portal overrides only (mock mode) |
| Customers (identity, addresses) | **Shopify** | `customer_id` + email as a link key |
| Orders, checkout, payment | **Shopify** | order id on the session row (conversion marker) |
| Subscription contract, billing, retries, dunning | **Recharge** | `recharge_customer_id` link key |
| Quiz answers + recommended stack | **App DB** | ✔ full record |
| Check-in / feedback history | **App DB** | ✔ full record |
| AI-generated question sets + answers | **App DB** | ✔ full record |
| Improvements backlog, portal settings, pricing overrides | **App DB** | ✔ full record |
| Analytics events + rollups | **App DB** | ✔ full record |

Rule: if Shopify/Recharge already owns it, we store only the foreign key.
Never mirror subscription/billing state into the app DB — read it live (or via
webhook-refreshed cache later if rate limits ever demand it).

## 4. Data model

```
kv                      -- portal state, 1:1 replacement for .data/*.json
  key         text pk   -- 'backlog' | 'products' | 'pricing' | ...
  value       jsonb
  updated_at  timestamptz

quiz_sessions           -- one row per quiz run (anonymous at creation)
  id            uuid pk           -- also stored client-side; sent to checkout
  created_at    timestamptz
  answers       jsonb             -- QuizAnswers (incl. dynamic AI questions asked + answers)
  stack         jsonb             -- the recommended blueprint + pricing snapshot
  status        text              -- started | completed | checkout_started | converted
  email         text null         -- captured if given pre-checkout
  customer_id   text null         -- Shopify customer gid, linked post-checkout
  order_id      text null         -- Shopify order gid when converted

subscribers             -- app-side row per known customer
  customer_id           text pk   -- Shopify customer gid
  email                 text
  recharge_customer_id  text null
  source_session_id     uuid null -> quiz_sessions
  created_at            timestamptz

checkins                -- every feedback touch (journey or micro check-in)
  id            uuid pk
  customer_id   text -> subscribers
  created_at    timestamptz
  kind          text              -- journey | micro | ai_followup
  responses     jsonb             -- dimension ratings / per-product answers
  outcome       jsonb             -- recommendForSubscription result snapshot

ai_question_sets        -- tailored follow-up questions (the feedback loop)
  id            uuid pk
  customer_id   text -> subscribers
  generated_at  timestamptz
  context_hash  text              -- hash of (stack + recent checkins) that produced it
  questions     jsonb
  answers       jsonb null
  answered_at   timestamptz null
  model         text
  cost_usd      numeric           -- spend logging, same discipline as the content studio

events                  -- thin, append-only, batched
  id          bigint identity pk
  ts          timestamptz
  session_id  uuid null           -- quiz session when in the quiz
  customer_id text null           -- when logged into the hub
  name        text                -- quiz_step_view | quiz_answer | quiz_dropout ...
  step        text null           -- question id / hub screen
  props       jsonb null          -- keep tiny; no free text, no PII

rollup_daily            -- pre-aggregated, what the dashboard actually reads
  day    date
  name   text
  step   text
  count  int
  primary key (day, name, step)
```

Notes:

- `quiz_sessions.answers` as jsonb (not normalised per-question rows) is
  deliberate: questions are partly AI-generated and change shape; jsonb keeps
  the schema stable. Funnel analysis uses `events`, not this column.
- The AI feedback loop's prompt context = `subscribers` → `quiz_sessions.answers`
  + `stack` + recent `checkins` + previously asked `ai_question_sets.questions`
  (so it never repeats itself). All reads, no new infrastructure.

## 5. Identity & login — how subscribers come to exist

**Principle: the quiz stays anonymous; identity attaches at checkout; the hub
authenticates against Shopify.** No app-owned passwords, ever.

1. **Quiz (anonymous).** First page-load mints a `session_id` (uuid, stored in
   `localStorage` + cookie). Answers are upserted to `quiz_sessions` as the
   visitor progresses (also what makes drop-off analysis and "resume later"
   possible).
2. **Checkout (linking).** `POST /api/cart` and `POST /api/subscribe` attach the
   session id as a **cart attribute** (`chrgd_session_id`). Shopify carries cart
   attributes onto the order as note attributes.
3. **Webhook (identity attach).** A new `POST /api/webhooks/shopify` endpoint
   (HMAC-verified) handles `orders/create`: reads `chrgd_session_id` from the
   note attributes, marks the session `converted`, fills `customer_id`/`order_id`,
   and upserts the `subscribers` row. Shopify creates the customer account at
   checkout — we don't run a signup flow.
4. **Hub login.** `HubLogin`'s email gate becomes the real thing via the
   **Shopify Customer Account API** (passwordless: email → 6-digit code →
   customer access token). The app resolves the token to a `customer_id`, sets
   its own session cookie, and everything in the hub keys off that id —
   `subscribers` → original answers, check-ins, AI questions; Recharge customer
   API (when wired) for the live contract.
5. **Log in before the quiz?** Supported later, not v1: a logged-in visitor's
   new `quiz_sessions` row simply gets `customer_id` set from the start (no
   linking step needed). It's an additive feature on this model, so nothing is
   blocked by deferring it — and keeping the quiz friction-free is the right
   default for conversion anyway.

Two auth realms, unchanged: founders (`/portal`, env-configured accounts) vs
customers (`/hub`, Shopify customer accounts). No customer touches the portal.

## 6. The insights dashboard, cheaply

Cost worry addressed head-on: analytics data is only expensive when it's fat or
kept raw forever. So:

- **Thin events** (~150–250 bytes each), no free text, batched from the client
  via `navigator.sendBeacon` → `POST /api/events` (insert many per request).
- **Nightly rollup** (a cron route) aggregates into `rollup_daily`; the portal
  dashboard reads *only* rollups, so dashboard queries stay milliseconds and
  don't scan raw events.
- **Retention:** prune raw `events` older than ~90 days (rollups keep the
  history). Even at 10k quiz runs/month × ~30 events that's ~60 MB/month raw —
  inside Neon's free tier for a long time, and low single-digit £/month at 10×
  that. There is no realistic version of this that "costs loads".

Dashboard v1 (portal → **Insights**): quiz starts / completions / conversion
by day; per-step funnel with drop-off; answer distributions per question;
hub engagement (check-ins run, phases seen); AI spend (`ai_question_sets.cost_usd`).

## 7. Overlap with the getCHRGD content studio

Checked the content-studio repo — **keep them separate; there is no shared
infrastructure worth building.**

- Different stacks on different hosts by design: Python/FastAPI/SQLite on an
  always-on ~£4 VPS vs a Next.js app. SQLite is right there *because* the VPS
  has a persistent disk and one process; that assumption doesn't transfer here.
- Nothing the studio does needs quiz data today, and vice versa. Your studio
  setup today is fully independent of this work — nothing here blocks it.
- What *does* transfer is discipline, not infra: the studio's `runs`/spend
  logging and resumable-jobs patterns are mirrored here as
  `ai_question_sets.cost_usd` and idempotent webhook/rollup handlers.
- Only revisit if the quiz app is ever deliberately deployed onto that same
  VPS — then self-hosted Postgres (or even SQLite) on the box becomes an
  option to save the managed-DB cost. Not recommended while hosting is
  serverless-shaped.
- Possible future nicety, explicitly out of scope: quiz insights (top goals,
  drop-off questions, common stacks) feeding the studio's trend scout as
  content seeds. Would be a tiny export API, decided later.

## 8. Build milestones

1. **8.1 DB foundation** — Neon + Drizzle + migrations; `kv` table; swap
   `persist.ts` internals from fs → `kv` (env-gated: no `DATABASE_URL` → fs
   fallback, so local dev and mock mode still work offline). One ripple to
   absorb: reads become async, so the portal store/backlog hydrate paths go
   async — contained, routes are already async.
2. **8.2 Quiz sessions** — mint/persist `session_id`, upsert answers + stack,
   status transitions; cart attribute on both checkout routes.
3. **8.3 Webhook + subscribers** — `/api/webhooks/shopify` (HMAC), link on
   `orders/create`, upsert `subscribers`.
4. **8.4 Hub auth** — Shopify Customer Account API login behind `HubLogin`;
   hub reads keyed by `customer_id`; check-ins persist to `checkins`.
5. **8.5 AI feedback loop** — generate + store `ai_question_sets` from stored
   context; answering writes back and feeds `recommendForSubscription`.
6. **8.6 Events + Insights** — event batching endpoint, instrument quiz + hub,
   rollup cron, portal Insights page.

Each milestone: typecheck + unit tests + build green, committed separately.
Mock-first throughout: every step works without Shopify credentials (mock mode
skips webhook linking and logs in with the sample subscription, as today).

## 9. Open decisions (your call before the build)

1. **Where will this app be hosted?** Vercel (assumed — spec optimises for it)
   vs the same VPS as the studio. Vercel → Neon; VPS-forever → could even stay
   SQLite. This is the only decision that changes the recommendation.
2. **Neon vs Supabase.** Both fine. Supabase only wins if you want its admin
   UI/auth extras; its auth is redundant here since Shopify owns customer login.
3. **PostHog alongside** (free tier) for session replays/funnels while the
   portal Insights page matures — zero backend work, can be added or dropped
   any time.
4. **Data retention window** for raw events (default proposed: 90 days).
5. **Pre-quiz login** — deferred by default (see §5.5); say if you want it in v1.
