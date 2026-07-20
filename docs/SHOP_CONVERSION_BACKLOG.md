# Shop conversion backlog

A backlog for `/shop`, distilled from the "8 prompts to go from no site to
earning" thread. That thread is written for someone building a store from
nothing — so most of it is either already done here or wrapped in
get-rich-quick language. This doc keeps only what genuinely moves the needle on
**our** shop, translated into concrete work against the real components, and
drops the parts that would be off-brand or unsafe (see
[Deliberately not doing](#deliberately-not-doing) at the end).

## Where the shop stands today

`ShopShell` already covers a lot of what the thread asks for:

- **Semantic, mobile-first shell** — `<header>`, `<section>`, `<h1>/<h2>`,
  dark-mode via CSS custom properties, swipe decks per category, a sticky
  jump-nav, a Bundles row and a Deals rail.
- **Merchandising signals** — per-variant deal detection with `-X%` badges and
  "Save up to X%" (`lib/shop/merchandising.ts`), plus "Popular" / "Best value"
  badges.
- **Detail + basket** — `ShopProductSheet` (variants, qty, facts, stat bars,
  dietary tags, warnings), `BasketDrawer` (free-delivery progress bar,
  subscribe-&-save nudge), and a real Shopify checkout via `/api/cart` with a
  mock fallback (`useShopCheckout`).
- **Claim-safe by design** — facts are format / serving-count / onset only,
  never a promised result.

So the backlog below is about the **gaps**: trust/social proof, live
availability, checkout confidence, sharper above-the-fold copy, fluid layout
polish, and the instrumentation to actually measure any of it.

## How the thread maps

| # | Thread prompt | Verdict | Backlog item |
|---|---------------|---------|--------------|
| 1 | Semantic HTML5 skeleton, no layout shift | Partly done → polish | [S3](#s3--zero-layout-shift--semantic-pass) |
| 2 | CSS Grid/Flexbox, custom props, fluid type | Mostly done → fluid type only | [S6](#s6--fluid-type--light-mode-polish) |
| 3 | Pattern-interrupt heading hierarchy, 3-sec value | Applies (toned down) | [S4](#s4--above-the-fold-value-proposition) |
| 4 | Direct-response offer copy | Applies (claim-safe) | [S5](#s5--benefit-led-product-copy) |
| 5 | Dynamic assets: live pricing / live stock | Applies — real gap | [S2](#s2--live-availability--low-stock-signals) |
| 6 | Two-step frictionless checkout, secure indicator | Applies | [S7](#s7--checkout-confidence--fewer-steps) |
| 7 | Social proof / validation / skeptic filter | Applies — biggest gap | [S1](#s1--ratings--social-proof) |
| 8 | Performance / conversion audit from metrics | Applies — needs data first | [S8](#s8--funnel-instrumentation--audit-loop) |

Ranked below by expected conversion impact vs. effort, not by thread order.

---

## S1 — Ratings & social proof
**Priority P1 · Impact L · Effort M · from thread #7**

The single biggest gap. The shop currently shows zero ratings, review counts,
or customer proof anywhere — cards, sheet, or basket. Prompt #7's instinct is
right even though its framing ("dissolving skepticism and *forcing* checkout")
isn't ours.

- Add an optional `rating` (avg + count) to `CatalogueProduct` and surface it:
  a compact stars + count row on `ShopProductCard` (under the title) and a
  fuller block in `ShopProductSheet`.
- A short, honest trust strip near the top of the shell and/or in the basket:
  free delivery over threshold, dispatch time, returns/guarantee — facts we can
  stand behind, not invented metrics.
- If real review copy exists, a 2–3 quote rail in the sheet; otherwise ship the
  star summary only and leave quotes for when we have them.

**Guardrail:** only real, sourced numbers. No fabricated review counts or case
studies. If we have no review data yet, this item's first task is *wiring the
source* (Shopify product reviews / a reviews app), not mocking stars.

**Touches:** `lib/catalogue/types.ts`, `ShopProductCard`, `ShopProductSheet`,
`ShopShell` (trust strip), possibly `/api/cart` source data.

## S2 — Live availability & low-stock signals
**Priority P1 · Impact M · Effort M · from thread #5**

Prompt #5 asks for "live stock availability" and "real-time pricing." We
already price per-variant live; stock is only a boolean `available` today.

- Surface a truthful **"Low stock"** / **"Only N left"** chip on the card and
  sheet when the catalogue exposes an inventory count below a threshold.
- Show **"Back in stock soon"** rather than a dead "Sold out" where we know it's
  restocking.
- Optional: a small **subscribe-&-save calculator** in the sheet — "£X/mo,
  save Y%" computed from `PRICING_CONFIG.subscriptionDiscount` — turning the
  existing static basket nudge into a per-product number.

**Guardrail:** only show a count when it's real. No fake countdowns or
permanent "only 2 left." This is the line between urgency and a dark pattern.

**Touches:** `lib/catalogue/types.ts` (inventory field), `lib/shop/merchandising.ts`,
`ShopProductCard`, `ShopProductSheet`.

## S3 — Zero-layout-shift + semantic pass
**Priority P2 · Impact M · Effort S · from thread #1**

Prompt #1's real, useful core: no CLS, fast first paint, clean semantics.

- Audit the `LoadingSkeleton` → content swap for layout shift; make skeleton
  dimensions match the real decks so nothing jumps.
- Ensure `ProductTile` images carry explicit width/height (or aspect-ratio) so
  images don't reflow as they load.
- Semantic tidy: confirm each swipe deck is a labelled `<section>`, the jump-nav
  is a real `<nav>`, and headings step h1→h2→h3 without skips (screen-reader +
  SEO win). Ignore prompt #1's "no `<div>` at all" dogma — wrappers are fine;
  correct landmarks and heading order are what matter.

**Touches:** `ShopShell` (skeleton), `ShopSection`, `ShopCategoryNav`,
`ProductTile`.

## S4 — Above-the-fold value proposition
**Priority P2 · Impact M · Effort S · from thread #3**

Prompt #3 wants an instant, scannable value hit. Our hero currently says
"Everything, à la carte" — pleasant but not a reason to buy. Sharpen the first
screen without resorting to all-caps "MONETIZATION TRIGGERS."

- Tighten the hero sub-line to a concrete promise (range breadth + the quiz
  path + a trust fact like free delivery threshold).
- Make the quiz cross-sell and the Deals rail the two clear "start here" paths
  above the fold.
- Keep heading hierarchy strong but on-brand — contrast and clarity, not
  shouting.

**Touches:** `ShopShell` (hero block), possibly `ShopSection` deal header.

## S5 — Benefit-led product copy
**Priority P2 · Impact M · Effort M · from thread #4**

Prompt #4's "zero-fluff value proposition" — applied within claim-safety.
Cards lean on `shortReason || description`; some read as spec, not benefit.

- Review each product's `shortReason` for a benefit-first, human one-liner
  ("what it does for you" in the honest, onset-based framing we already use).
- Ensure the sheet's "What it is" opens with the outcome, then the detail.
- **Claim-safe only:** describe format, use, and when effects are noticeable —
  never a guaranteed result or health claim. This mirrors the existing
  `product-facts.ts` rule and the pipeline's claim-safety stage.

**Touches:** catalogue copy (data), `ShopProductCard`, `ShopProductSheet`.

## S6 — Fluid type & light-mode polish
**Priority P3 · Impact S · Effort S · from thread #2**

Prompt #2 is largely already satisfied (Grid/Flexbox, custom properties,
dark-mode variables). The one genuine add is **fluid typography**.

- Move the hero/section headings from fixed `text-4xl/2xl` steps to a `clamp()`
  fluid scale so type breathes between 360px and desktop.
- If light mode is a goal, verify the CSS-variable palette has light values and
  the shop reads correctly under `prefers-color-scheme: light`.

**Touches:** `globals.css` (type scale / palette), `ShopShell`, `ShopSection`.

## S7 — Checkout confidence & fewer steps
**Priority P2 · Impact M · Effort M · from thread #6**

Prompt #6's "frictionless, two-step, secure-processing" — the legitimate parts.

- Add a **secure-checkout reassurance** near the basket CTA: a lock/"secure
  checkout" line and accepted-payment cues, so the jump to Shopify feels safe.
- Improve the `loading` → redirect moment in `useShopCheckout` /
  `BasketDrawer` with a clear "Taking you to secure checkout…" state instead of
  a bare "Building cart…".
- Consider an **express path**: "Buy now" already exists on the sheet — make
  sure it's a genuinely shorter route (skip drawer review where sensible).
- Low-friction entry (prompt #6's "micro-offer"): keep the quiz as the free,
  no-commitment on-ramp already linked from the hero and basket.

**Guardrail:** no fake "processing…" theatre and no surprise steps — honest
states only.

**Touches:** `BasketDrawer`, `useShopCheckout`, `ShopProductSheet` (Buy now).

## S8 — Funnel instrumentation & audit loop
**Priority P1 · Impact M · Effort M · from thread #8**

Prompt #8 wants to "audit conversion metrics" — but we can't audit numbers we
don't collect. This is the enabler for measuring S1–S7.

- Instrument the funnel events: shop view, filter use, card expand,
  add-to-basket, basket open, checkout start, checkout success (mock vs live).
- Send to whatever analytics sink we standardise on (or log through an existing
  API route) — lightweight, privacy-respecting.
- Once data exists, run the periodic audit prompt #8 describes: where do people
  drop — deck browse, sheet, or basket→checkout — and feed findings back into
  this backlog.

**Touches:** a small analytics helper, event calls in `ShopShell`,
`ShopProductSheet`, `BasketDrawer`, `useShopCheckout`.

---

## Suggested sequence

1. **S8** first (measure) — everything else is guesswork without it.
2. **S1** and **S2** (trust + availability) — the highest-impact visible gaps.
3. **S7**, **S4**, **S5** (checkout confidence + copy).
4. **S3**, **S6** (polish) as fill-in work.

## Deliberately not doing

Parts of the thread that don't fit this shop, and why:

- **"Avoid all `<div>` wrappers."** Dogmatic and counterproductive. Correct
  landmarks and heading order (S3) are the real accessibility/SEO win; banning
  wrapper elements is not.
- **Fabricated proof — invented case studies, review counts, "operational
  savings" metrics.** For a supplement brand this is both off-brand and a
  compliance risk. S1 ships only real, sourced numbers.
- **Pressure tactics — fake scarcity/countdowns, "forcing checkout,"
  "capturing wallet-share in 3 seconds."** We use honest urgency (real low
  stock, real deals) and clear value, not manipulation.
- **Health/result claims in copy.** The catalogue and pipeline are claim-safe
  by design; S5 stays within that (format, use, onset — never a promised
  outcome).
- **All-caps "MONETIZATION TRIGGER" headings.** Off-brand; S4 gets impact from
  contrast and clarity instead.
