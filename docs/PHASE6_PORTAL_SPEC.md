# Phase 6 — Portal / Control Centre — Build Spec

Status: **spec for review, no code written yet.** Branch:
`claude/phase-6-portal-control-centre`.

## 1. What it is

An admin control centre at **`/portal`** to run everything the quiz, checkout and
hub consume — without redeploys:

- **Manage products & tags** — slots, goals, dietary, swap group, subscription
  flags, cost, days-of-supply, consumption, recommendation basis, etc.
- **Edit pricing rules** — the discount tiers, subscription discount, intro
  offer, minimum term, margin guardrails — with a live **profit preview**.
- **Control centre / readiness dashboard** — per-product traffic-lights for
  "mock vs actual", "tagged correctly", "subscription-ready", so you can see at
  a glance what's launch-ready.
- **Mock ⟷ real data toggle** — flip the whole app between the mock catalogue
  and live Shopify at runtime.

## 2. Principles & non-goals

- **Single deployment.** The portal is routes in this app (`/portal/*`), behind
  a separate admin auth realm — not a separate build.
- **Mock-first, plug-and-play.** Works today on mock data; every edit path has a
  live-Shopify counterpart scaffolded so connecting Shopify later is config, not
  a rewrite. (Consistent with the rest of the project.)
- **Rules are data.** `PRICING_CONFIG` becomes a resolvable, overridable config
  so the portal can change it live.
- **Profit-aware.** Pricing edits show the margin / profit-on-cancel impact
  before they're saved.
- **Not in scope for Phase 6:** real Shopify Admin API writes and a durable
  production database (these are part of the "wire up integrations at the end"
  pass). Phase 6 builds the editing UI + a mock persistence layer + the seams.
  Also out of scope: order/customer management, analytics dashboards, content/CMS.

## 3. Architecture

### 3.1 Route & auth
- Routes under `/portal` (`/portal`, `/portal/products`, `/portal/pricing`,
  `/portal/readiness`, `/portal/settings`).
- **Admin auth realm, separate from customers** (the hub uses customer login).
  Mock-first: a single admin password gate via an `ADMIN_PASSWORD` env var,
  setting a signed `portal_session` cookie; middleware protects `/portal/*` and
  the portal APIs. Live upgrade path (documented): Shopify staff/admin OAuth or
  an SSO provider. No customer can reach `/portal`.

### 3.2 Persistence — the settings & overrides store
A pluggable store interface (`src/lib/portal/store.ts`) with a mock
implementation now and a DB/KV impl later:

- **`appSettings`** — `{ dataSourceMode, pricingOverrides }`.
- **`productOverrides`** — partial `CatalogueProduct` keyed by product id
  (what the portal has edited).

Mock-first impl: an in-memory module store seeded from current defaults, with an
optional JSON snapshot for local-dev persistence. Documented seam to swap to
**Vercel KV / Postgres** at integration time. (Decision needed — see §9.)

### 3.3 Config resolution refactor
- Add `getPricingConfig()` that merges `PRICING_CONFIG` defaults with
  `appSettings.pricingOverrides`. Pricing functions already accept a `config`
  arg; the portal-affected call sites (`calculatePricing`, `buildSubscriptionPlan`,
  checkout) read from `getPricingConfig()` instead of the bare default. Defaults
  unchanged when no overrides exist → no behaviour change until edited.

### 3.4 Data-source toggle
- `getDataSourceMode()` (already the single seam) reads the portal override
  first, then env, then mock. The portal writes `appSettings.dataSourceMode`;
  flipping it changes what `/api/catalogue`, `/api/products`, checkout and the
  hub read — with a banner showing the active mode.
- For the browser to honour a *runtime* change (NEXT_PUBLIC vars are build-time),
  the client reads the resolved mode from a small `/api/portal/data-source`
  endpoint / the catalogue response `source` field rather than the env var.

### 3.5 Edit behaviour: mock vs live
- **Mock mode:** product edits write to `productOverrides`; the catalogue read
  path merges overrides onto `MOCK_CATALOGUE`. Pricing edits write to
  `pricingOverrides`. Everything is immediate and local.
- **Live mode (scaffolded):** product edits map to Shopify Admin API writes
  (tags + `chrgd.*` metafields — reuse `scripts/seed-shopify-tags.mjs` logic).
  Phase 6 builds the mapping + a dry-run/preview; the actual Admin API calls are
  stubbed behind a clear seam to enable at integration time.

## 4. Portal areas

### 4.A Shell, auth, navigation
- Login screen (admin password) → `/portal` dashboard home.
- Persistent nav: Products · Pricing · Readiness · Settings.
- Global banner showing **active data source** (MOCK / SHOPIFY) and a quick link
  to the toggle.
- Home: at-a-glance counts (products total / launch-ready / needs attention),
  current pricing summary, data-source state.

### 4.B Data-source toggle (Settings)
- A clear switch: **Mock data** ⟷ **Live Shopify** (+ an "Auto" option =
  Shopify when credentials present).
- Shows credential status (domain/token present?) and warns if switching to
  Shopify without seeded metafields ("N products not subscription-ready — see
  Readiness").
- Writes `appSettings.dataSourceMode`; takes effect app-wide immediately.

### 4.C Pricing rules editor
Editable, grouped, with inline help and validation. All map to `PRICING_CONFIG`:

- **Bundle tiers** (one-off): add/edit/remove tiers `{ label, minSubtotal,
  minItems, discountPct }`; best-qualifying wins.
- **Subscription:** base `subscriptionDiscount`, per-bundle `levelSubscriptionDiscount`,
  optional `subscriptionTiers`, `introOffer.firstMonthDiscount`, `minSubscriptionMonths`,
  `minSubscriptionMonthly`.
- **Cadence:** `maxDeliveryMonths`, `maxSubscriptionServings`.
- **Guardrails:** `marginFloorPct`, `defaultCostRatio`.
- **Live profit preview:** pick a representative stack (or the demo blueprint)
  and show, as rules change: one-off total + margin %, flat monthly, first month,
  minimum-term commitment, and **profitable-on-cancel** (green/red). Warn if any
  rule makes the offer lose money on the earliest cancel.
- Save writes `pricingOverrides`; "Reset to defaults" clears them.

### 4.D Product manager
- **List:** all products with key columns (title, category, slots, price, cost,
  margin %, subscription flags, readiness light). Search + filter (by slot,
  subscription-eligible, needs-attention).
- **Editor (per product):**
  - Classification: stack slots, goals, dietary tags, swap group, category.
  - Subscription: `subscriptionEligible`, `servings`, `consumption.cadence`
    + `servingsPerUnit`, `subscriptionProductId` (mapped refill), `isSubscriptionOnly`,
    `minSubscriptionMonths`.
  - Recommendation: `recommendationBasis` (objective/subjective), `recommendationPriority`,
    `marginPriority`, `isCoreEligible`, `isBoosterEligible`.
  - Commerce: `cost`, price/compareAt (read-only from Shopify when live).
  - Inline validation + the product's readiness checklist.
- Save → `productOverrides` (mock) or Shopify Admin write (live, scaffolded).
- "Mock vs actual products": clearly label which are real Shopify products vs
  mock/placeholder, and let you filter to "mock only".

### 4.E Control centre / readiness dashboard
Per product, traffic-light checks with a "what's missing" list:

- **Identity (mock vs actual):** real `shopifyProductId` + real image → green;
  placeholder/mock → amber/red.
- **Tagged correctly:** ≥1 stack slot, ≥1 goal, a swap group, a category.
- **Subscription-ready:** `subscriptionEligible` set; `servings` set;
  consumption cadence; if long-lasting either ships ≤ `maxDeliveryMonths` or has
  a `subscriptionProductId`; `sellingPlanId` present when live.
- **Pricing-ready:** `cost` set (for margin); `recommendationBasis` set/derivable.
- Overall product status = worst of its checks. Dashboard summarises counts and
  lets you jump to fix each product.

## 5. Data model (new)

```ts
// src/lib/portal/types.ts
interface AppSettings {
  dataSourceMode: 'auto' | 'mock' | 'shopify'
  pricingOverrides: Partial<PricingConfig>   // merged over PRICING_CONFIG
}
type ProductOverrides = Record<string, Partial<CatalogueProduct>>
```

## 6. Mock-first mechanics & plug-and-play

- Today: settings + overrides in the mock store; product reads = `MOCK_CATALOGUE`
  + overrides; pricing = defaults + overrides; data toggle flips mock⟷(mock,
  since no creds) and the UI reflects it.
- At integration time: swap the store impl for KV/Postgres; enable the Shopify
  Admin write path; set real credentials → the same portal now manages live data.

## 7. Build milestones (within Phase 6)

1. **6.1 Shell + admin auth + nav + data-source banner.**
2. **6.2 Settings store + runtime data-source toggle** (incl. `getPricingConfig`
   refactor wiring).
3. **6.3 Pricing rules editor + live profit preview.**
4. **6.4 Product manager** (list + editor, mock overrides; live write scaffold).
5. **6.5 Readiness / control-centre dashboard.**

Each milestone: typecheck + unit tests + build green, committed separately.

## 8. Testing

- Store: override merge precedence; reset.
- `getPricingConfig`: defaults vs overrides; pricing reflects overrides.
- Data-source resolver: portal override beats env.
- Readiness checks: green/amber/red per dimension on representative products.
- Pricing preview: profit-on-cancel flips correctly with rule changes.
- Auth: `/portal` blocked without session.

## 9. Open decisions (need your call before/early in the build)

1. **Mock persistence:** in-memory (resets on restart, simplest) vs a local JSON
   snapshot (survives restarts in dev) for portal edits. Durable prod storage
   (KV/Postgres) is part of the later integration pass either way.
2. **Admin auth for now:** a single shared `ADMIN_PASSWORD` (simple, fine for
   mock) — or do you want named admin users from the start?
3. **Scope of "live writes" in this phase:** build the Shopify Admin write path
   fully (callable once creds exist) vs scaffold + dry-run only (recommended,
   matching "integrations at the end").
4. **Profit preview basis:** preview against the demo blueprint, or let you pick
   a sample stack?
