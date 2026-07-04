# Master roadmap — everything queued, in build order

The one list. Consolidates the storage plan (docs/STORAGE.md), the quiz UX
roadmap (docs/QUIZ.md), the outstanding subscriptions/Recharge integration work
(docs/SUBSCRIPTIONS.md) and the portal spec's deferred items
(docs/PHASE6_PORTAL_SPEC.md). When items land they should also be tracked on
the portal backlog (`/portal/backlog`) — this doc is the ordering rationale.

Sizing: **S** ≈ half a session · **M** ≈ one session · **L** ≈ multiple sessions.

## ✅ Recently done (context)

- Founders Hub / portal (Phase 6): products, pricing, readiness, coverage,
  import, AI classify, backlog board, founder auth.
- Hub Phases 3–7 (mock-first): dashboard, delivery calendar, check-ins,
  full flexibility, cancel-save flow.
- Quiz flow overhaul + question-first instant-start hero.
- **Storage 8.1** — Postgres (Neon) kv store behind the persist seam; backlog,
  product/pricing overrides and the data-source toggle are durable.

## Step 0 — your two manual setups (no code)

| # | What | Where |
|---|---|---|
| 0a | Create the Neon Postgres DB: Vercel project → Storage → Create Database → Neon → connect. `DATABASE_URL` is wired automatically; next deploy makes portal state durable. | Vercel |
| 0b | Content studio VPS deploy (today's job — independent of everything below): DEPLOY.md §1–6 in the getCHRGD repo. | VPS |

## Phase 1 — data foundation (finish what storage started)

Order matters here: each step feeds the next.

| # | Change | Why now / unblocks | Size |
|---|---|---|---|
| 1.1 | **Quiz sessions (storage 8.2) + persist & resume** — mint a session id, upsert answers + recommended stack server-side as the visitor progresses; `zustand/persist` the client store with a "resume where you left off" prompt (a refresh currently wipes everything). One piece of work, two wins: the QUIZ.md resume item and the stored answers every later feature reads. | Foundation for linking, insights, AI loop; kills the refresh-wipes-answers UX hole. | M |
| 1.2 | **Checkout linking (storage 8.3)** — session id as a cart attribute on both checkout routes; `/api/webhooks/shopify` (HMAC) handles `orders/create`, marks sessions converted, upserts `subscribers`. Mock mode: simulated link. | Conversion truth for insights; identity spine for the hub. | M |
| 1.3 | **Events + Insights dashboard (storage 8.6)** — thin batched events from quiz + hub, nightly rollup, portal **Insights** page: starts/completions/conversion by day, per-step funnel with drop-off, answer distributions. | You wanted drop-off stats; doing it *before* more quiz UX work means changes are measured, not guessed. Only needs 1.1–1.2. | M–L |

## Phase 2 — conversion polish, guided by Phase 1's data

| # | Change | Why | Size |
|---|---|---|---|
| 2.1 | **Results moment** (QUIZ.md) — real fit score (not the `84` fallback), per-product "why this for you" (reuse `aiReasons`), edit-answers-from-results, outcome-driven Act3 wait. | The reveal is the conversion moment; insights will show exactly where it leaks. | M |
| 2.2 | Smaller QUIZ.md "later" items as data indicates: contextual micro-feedback (`LiveFeedback.tsx` is built but unused), accessibility pass, deep-link to quiz, consolidate the two checkout surfaces. | Pick by funnel evidence, not vibes. | S–M each |

## Phase 3 — subscriber accounts + the AI feedback loop

| # | Change | Why | Size |
|---|---|---|---|
| 3.1 | **Hub auth (storage 8.4)** — Shopify Customer Account API (passwordless email code) behind the existing `HubLogin`; hub keyed by real `customer_id`; check-ins persist to `checkins`. Mock login stays for dev. | Turns the hub from demo to real accounts; prerequisite for everything per-subscriber. | M–L |
| 3.2 | **AI feedback loop (storage 8.5)** — generate tailored follow-up question sets from stored answers + stack + check-in history (never repeats itself), store with per-generation cost, answers feed `recommendForSubscription`. | The subscription feature you described; everything it needs exists after 3.1. | M |

## Phase 4 — commerce go-live (Shopify + Recharge)

Mostly configuration + one real integration. Needs the live store and the
Recharge app installed; sequence within the phase:

| # | Change | Why / depends on | Size |
|---|---|---|---|
| 4.1 | **Decide the Recharge billing model** — membership SKU at flat monthly (option 1, recommended — matches the "one predictable bill" promise) vs per-line subscriptions (option 2). Blocks 4.2/4.4. | SUBSCRIPTIONS.md flags this as the open call. | decision |
| 4.2 | Configure Recharge selling plans to match `PRICING_CONFIG`; seed `chrgd.*` metafields (`node scripts/seed-shopify-tags.mjs`); fix anything the portal **Readiness** board flags. | Checkout seams already emit `sellingPlanId` — this makes them real. | S–M |
| 4.3 | Flip `NEXT_PUBLIC_DATA_SOURCE=shopify` (or portal toggle) → live catalogue, live carts, real subscriptions created at checkout; webhook linking (1.2) starts firing for real. | The switch itself is config; watch Insights + Readiness after. | S |
| 4.4 | **Recharge customer-API adapter** — wire the hub's mutation surface (add/remove/cadence/skip/extras/delivery edits/pause/cancel) to Recharge instead of the mock object. The mock helpers were shaped for this; it's the biggest single integration left. | Hub manage actions become real. Needs 3.1 + 4.1. | L |

## Phase 5 — retention roadmap (from SUBSCRIPTIONS.md, post-launch)

In rough order once real subscribers exist: proactive lifecycle prompts →
consumption-aware right-sizing → outcomes-over-time view → dunning/account
edge-cases → goals re-stacking. Each is S–M and independently shippable;
prioritise off Insights churn data.

## Parallel track — getCHRGD content studio (other repo)

Independent of all of the above. After today's VPS deploy (0b): weekly systemd
timer already shipped; remaining roadmap there is Phase C (turn on Higgsfield
video, M6) and Phase D polish. Only touchpoint with this repo: someday quiz
Insights could seed the studio's trend scout — parked, out of scope.

## Sequencing logic (why this order)

1. **Storage before UX**: every feature you asked for (resume, AI loop,
   insights, accounts) reads/writes the same foundation — build it once, first.
2. **Insights before polish**: measure the funnel before spending sessions
   polishing it.
3. **Accounts before AI loop**: tailored questions need a durable per-person
   history to tailor against.
4. **Go-live last among builds**: mock-first means everything above ships and
   is testable without Shopify; the flip is then config + one adapter, not a
   rewrite — and the retention work only means anything with real subscribers.
