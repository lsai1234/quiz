# Prebuilt Bundles — feature plan

The shop gets a **Bundles row above Deals**: six curated, creator-led bundles
(each with a matching workout), expanding into the full bundle landing page —
the view originally built for *Big Night, Big Morning*, rebuilt on the current
Act 4 stack-review system. The founders' portal gets full bundle management:
create, edit, publish/unpublish, reorder, remove.

## Where things stand today

- **Big Night, Big Morning (BNBM) was never merged.** It lives on the branch
  `claude/big-night-big-morning-bundle-1e5svw`, which forked from master at
  `509dcf9` — *before* the Act 4 F/G/H redesign and before the entire shop
  build (S1–S8). It contains:
  - `src/lib/bundles/` — a solid `PrebuiltBundle` data model (fixed
    `StackBlueprint` + add-ons + `BundleWorkout` + how-to steps + claim-safe
    copy fields) with tests.
  - `src/components/bundles/` — `BundleLandingPage`, `BundleHero`,
    `WorkoutSection`, `BundleHowTo`, `BundleAddOnCard` at the fixed route
    `/big-night-big-morning`.
  - The landing page renders the stack with `StackProductCard`,
    `StackPriceSummary` and `StickyCheckoutBar` — components that **no longer
    exist on master** (replaced by `StackDeck`, `ProductTile`, `PlanReceipt`,
    `ProductDetailSheet` etc. in the Act 4 redesign). A rebase would conflict
    on ghosts; the landing page needs **porting, not merging**.
- The shop (`ShopShell`) already has the row pattern to extend: sections are
  swipe decks with a sticky jump-nav, and the Deals rail is prepended ahead of
  category sections — the Bundles row slots in above it the same way.
- The portal already has the exact management pattern to mirror: products are
  resolved from a base catalogue + DB-persisted founder overrides /
  removals / imports (`lib/portal/store.ts` + `lib/portal/persist.ts`), with
  guarded API routes and a readiness model. Bundles should reuse this shape
  wholesale.

## Data model decisions (made once, up front)

- **Bundles become data, not code.** The BNBM branch hard-codes the bundle as
  a TS constant. That can't support portal CRUD. Instead: code ships *seed
  bundles* (the six launch bundles), and the DB (portal persist layer) stores
  founder-created bundles, per-bundle overrides, removed slugs, display order
  and published state — exactly the products pattern.
- **Prices are computed, not stored.** The branch stored
  `estimatedOneOffPrice`/`estimatedSubscriptionPrice`; those go stale the
  moment portal pricing overrides change. Bundle pricing should resolve from
  the live catalogue through `stack-blueprint/pricing`, with an optional
  founder-set bundle discount. The shop card shows bundle price vs
  sum-of-parts saving from the same computation.
- **Bundle checkout stays on the stack-checkout pipe** (`useStackCheckout`),
  separate from the shop basket, as on the branch. Merging bundles into the
  shop basket is a possible later enhancement, noted in Phase 7.
- **Draft/published state** exists from day one so the portal editor can save
  half-built bundles without them appearing in the shop.

---

## Phase 1 — Land the bundle engine on current master

Port (not rebase) the BNBM branch:

1. Bring over `src/lib/bundles/` (types, BNBM definition, tests) and adapt to
   the current `StackBlueprint`/catalogue types.
2. Replace the fixed `/big-night-big-morning` route with a dynamic
   **`/bundles/[slug]`** route (keep a redirect from the old path).
3. Rebuild `BundleLandingPage` on today's Act 4 components: the top-trumps
   `StackDeck`/`ProductTile` cards with `ProductDetailSheet`, `PlanReceipt`
   for the price summary, the current one-off vs subscription plumbing, and
   the scene-cut/wayfinding language — while keeping the bundle-only sections
   (hero, honesty line, add-on toggles, `WorkoutSection`, `BundleHowTo`,
   disclaimer).
4. Review the branch's second commit (checkout copy + `next.config.ts`
   changes) and carry over only what still applies.

**Done when:** BNBM works end-to-end at `/bundles/big-night-big-morning`,
visually consistent with the post-redesign Act 4 stack review.

## Phase 2 — Bundle store + public API

The persistence layer that both the shop and the portal read:

1. `lib/bundles/store.ts` mirroring `lib/portal/store.ts`: seeds + DB-persisted
   created bundles, overrides, removed slugs, order, published flags.
2. Resolution + validation helpers: a bundle resolves against the live
   catalogue (every product id must exist and be in stock to be shown);
   computed pricing; a `bundleReadiness()` in the spirit of
   `productReadiness()`.
3. Public **`GET /api/bundles`** (published, ordered, resolved) and the
   landing page/route reading through it.
4. Tests: CRUD round-trips, resolution against a changing catalogue, a bundle
   referencing a removed product auto-hides.

**Done when:** bundles are served from the store; deleting a seed's product
from the portal hides the bundle rather than breaking the shop.

## Phase 3 — Author the six launch bundles

Pure content, shipped as seeds. Working titles (all renameable in the portal
later; each pairs a stack with a matching workout and claim-safe copy):

| # | Bundle | Angle | Core stack sketch |
|---|--------|-------|-------------------|
| 1 | **Big Night, Big Morning** | the weekend reset (exists) | electrolytes · creatine · whey |
| 2 | **Leg Day Loading** | the heavy lower session | pre-workout · creatine · whey (+ recovery add-on) |
| 3 | **Early Shift** | 6am training before work | low/no-stim energy · electrolytes · protein (+ sleep add-on) |
| 4 | **Game Day** | sport performance (football/rugby/5-a-side) | hydration · energy · recovery |
| 5 | **Deadline Week** | train through a stressful week | health/multivitamin · energy · sleep |
| 6 | **Sunday Reset** | low-intensity movement + wind-down | gut health · health · sleep (+ hydration add-on) |

Each needs: name, tagline, series name, description + honesty line, 3 core
slots with reasons (approved-claims language only), up to 2 add-ons, a full
workout (warm-up, exercises with prescriptions, intensity rule, finisher,
post-workout note), how-to steps, disclaimer, meta title/description. Product
choices must resolve in both mock and Shopify catalogues.

**Done when:** all six render complete landing pages with no placeholder copy.

## Phase 4 — Shop bundles row

1. New **"Bundles" section above Deals** in `ShopShell`, same swipe-deck +
   jump-nav language as existing sections.
2. A bespoke `ShopBundleCard` (distinct from product cards): bundle name,
   tagline, mini product-thumbnail strip, bundle price + saving vs parts, and
   a "includes workout" marker. Tap/expand navigates to `/bundles/[slug]`.
3. Row order comes from the store's display order (portal-controlled later).
4. Dietary filters: bundles stay visible unless a filter excludes one of the
   bundle's core products (a vegan filter should hide a whey-led bundle).
   Empty row drops out like the Deals rail does.

**Done when:** /shop opens with the bundles rail on top and each card lands on
its bundle page.

## Phase 5 — Portal: bundle list & curation

1. **`/portal/bundles`** page + nav entry in `PortalShell`.
2. List view with per-bundle readiness (products resolve, in stock, workout
   present, claims/disclaimer present), computed prices, published state.
3. Actions: publish/unpublish, reorder (drives the shop rail), remove (soft
   delete with restore, like products `removedIds`), duplicate-as-draft
   (the fastest path to a new bundle).
4. Guarded **`/api/portal/bundles`** routes (GET/POST/DELETE) following the
   products routes' shape.

**Done when:** a founder can hide, reorder, remove/restore and clone bundles
and see the shop update.

## Phase 6 — Portal: bundle creator/editor

The big one — a sectioned editor (create + edit share it):

1. **Identity & story** — name, slug, tagline, series, description, honesty
   line, disclaimer, meta fields.
2. **Stack builder** — pick products from the resolved catalogue (search +
   category browse), set per-slot title/reason/order/required, default
   flavour; live price preview (one-off vs subscription) as slots change.
3. **Add-ons** — optional products with reasons.
4. **Workout editor** — title, intro, warm-up, exercise rows
   (name + prescription), intensity rule, finisher, post-workout note.
5. **Preview & publish** — render the real landing page in a preview mode;
   publishing is gated on validation (readiness green, slug unique, no empty
   required copy). Drafts save at any state of completeness.

**Done when:** a founder can build a seventh bundle from nothing — including
its workout — publish it, and buy it from the shop.

## Phase 7 — Polish & hardening

- Motion/a11y/reduced-motion parity with the shop's S8 pass; SEO metadata and
  sitemap entries generated from bundle data.
- Failure states: bundle → missing product (auto-hide + portal warning),
  empty bundles row, checkout errors on the bundle page.
- Test sweep across store, resolution, shop row, portal APIs (auth included).
- **Later candidates (not in scope now):** AI assist to draft workout/copy
  from the chosen products (ai-classify precedent exists), bundles in the
  shop basket alongside à-la-carte items, syncing bundles to Shopify as
  native bundle products, per-bundle analytics.

## Order & dependencies

Phase 1 → 2 are strictly sequential (engine, then storage). Phase 3 (content)
and Phase 4 (shop row) both need Phase 2 and can run in either order or in
parallel. Phase 5 → 6 build on the store and each other. Phase 7 last.
Roughly: **1 & 2 together are one solid session; 3, 4, 5 a session each;
6 is the largest (one to two sessions); 7 a half-session.**
