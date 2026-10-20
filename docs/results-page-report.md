# Quiz results page: what the code does today

Investigation date: 20 October 2026. Branch as cloned (HEAD `105294d`). Read-only: no code was changed. Meta pixel and tracking were ignored.

**What this report can't see.** This container has no production database and no environment secrets (`OPENAI_API_KEY`, Stripe, PowerBody, email provider, `DATABASE_URL` are all unset). So these things are not visible here:

- the live catalogue
- the Founders Hub overrides (pricing settings, roster, codes, competition settings)
- whether AI and email are switched on in production

Each place this matters says so. All figures below are the **code defaults**. The Founders Hub can override any of them at runtime (`setPricingOverrides`, stored in the `kv` table).

## How the results page is put together

| Piece | File |
|---|---|
| Route `/`: one page made of five acts | `src/app/page.tsx` → `src/components/scroll/ScrollExperience.tsx` |
| Quiz (v1), with v2 split test | `src/components/scroll/Act2Quiz.tsx`, `src/components/quiz/v2/QuizV2.tsx` |
| Analysis animation | `src/components/scroll/Act3Analysis.tsx` |
| Results page ("You" scene) | `src/components/scroll/Act4Reveal.tsx` |
| Results page ("Stack" and "Plan" scenes) | `src/components/stack-review/StackReviewPage.tsx` |
| You / Stack / Plan floating bar | `src/components/stack-review/SceneRail.tsx` |
| Quiz state (Zustand) | `src/lib/store.tsx` |

The You/Stack/Plan "tabs" are not tabs. They are three scroll anchors on one long page: `#scene-you`, `#scene-stack` and `#scene-plan`. The bar scrolls to them.

---

## 1. How stacks are chosen

### Summary: a mix of rules and AI. Rules always run first and set the limits.

Both quizzes (v1 `Act2Quiz` and v2 `QuizV2`) call the same code when the quiz ends (`Act2Quiz.tsx:737-769`):

1. `loadCatalogue()` loads the live catalogue.
2. `buildStackBlueprint(answers, catalogue)` runs the **deterministic rules engine** (`src/lib/stack-blueprint/factory.ts`).
3. These two run in parallel:
   - `POST /api/generate-identity` writes the identity card (AI, `gpt-4o-mini`).
   - `personaliseBlueprint()` calls `POST /api/personalise-stack` (AI, `gpt-4.1-mini`). The AI may swap a product within a slot and rewrite each slot's reason.
4. The page then splits the stack into Essentials / Balanced / Complete depths by price band (`planTiers`, `src/lib/stack-blueprint/tier-plan.ts`).

There is also an optional "Go deeper" step with AI-written questions (`/api/generate-questions`, `gpt-4.1-mini`). Each answer option carries "signal" tags from a fixed list. `withDeepDiveSignals()` (`src/lib/ai-questions.ts:47`) adds those tags to `answers.lifestyle`, where the deterministic scoring reads them.

A third path, the Amp Consult, is off for customers by default (`ScrollExperience.tsx`, `/quizv2` is founders-only). It hands its own blueprint to the same results page (`src/lib/consult/results.ts`).

### Step 1: the rules engine (`factory.ts`)

**Pool.** In stock, not subscription-only, and list price ≥ £8 (`minQuizProductPrice`) (`factory.ts:595`).

**Archetype**, from goals (`getArchetype`, `factory.ts:100`):

```ts
if (goals.includes('muscle') || goals.includes('bulking')) return 'muscle'
if (goals.includes('cutting')) return 'fat-loss'
if (goals.includes('performance') || goals.includes('energy')) return 'performance'
if (!hasPerformanceGoals(goals) && goals.some(g => g !== 'health')) return 'wellbeing'
return 'health'
```

**Number of slots.** The v1 quiz no longer asks a budget question, so `budget` and `stackPreference` are `null` (`src/lib/quiz-answers.ts`). That gives `maxSlots = 7` and no price cap (`factory.ts:607-619`, `budgetCapFor(null) = null`).

**How slots are filled.** There are two paths:

- **Performance path** (any of muscle, energy, performance, hydration, recovery, cutting, bulking). Slot types are ordered by `GOAL_SLOT_RELEVANCE` (`src/lib/quiz-core/goal-map.ts`). For each slot type, the highest-scoring product tagged for that slot is picked.
  - "Protein" is *required* for muscle/bulking.
  - "Performance" (creatine) is *required* for muscle, bulking or performance.
- **Wellbeing path** (only wellbeing goals). Each chosen goal gets its own slot (`WELLBEING_GOAL_SLOTS`), filled by the best product tagged with that goal, with no two from the same swap group. Remaining slots are "extras": products for stated goals, or foundational ones (omega-3, vitamin D, multivitamin, vitamin C, magnesium).

**Score.** `scoreProduct()` (`factory.ts:182-458`) is a sum of about 40 independent terms. Each term depends on one answer field. All weights live in `src/lib/quiz-core/scoring.ts`, `goal-map.ts` and `driver-map.ts`. The terms are:

- `recommendationPriority × 10`
- founders' Top-25 rank bonus (12 − 0.4 per rank)
- +15 per goal the product shares with the person
- −30 if no goal overlap and the product isn't foundational
- per-goal swap-group affinities, e.g. immune → vitamin D +18
- archetype boosts
- wellbeing follow-ups, e.g. "hard to switch off" → sleep blend +15
- lifestyle, e.g. joint issues → joint formula +26
- diet, age, gender, training focus, experience, caffeine and training time (stimulants)
- the v2 "drivers" (scaled by confidence)
- protein-check result (−200 if already over target)

**Hard exclusions (score −∞):**

- safety flags against the product's contraindications
- fat burner without cutting
- mass gainer without bulking
- menopause product without menopause
- probiotic, greens or fibre without gut/immune/health
- adaptogen without stress/sleep/menopause
- stimulants if caffeine "none" or stim preference "no"
- vegan
- "already taking" (unless "try ours" was ticked)

**Tie-break.** `preferMonthlySibling` swaps in a same-group product that runs out about monthly, if it scores within 6 points.

**After the pass.** `applyBundleRules` (`src/lib/quiz-core/bundle-rules.ts`) applies three rules:

- drops non-required picks with confidence below 10
- removes duplicate active ingredients
- enforces total dose caps: caffeine 200 mg, magnesium 400 mg, ashwagandha 600 mg, vitamin C 1000 mg, zinc 25 mg

Goals left with no product go into `unmetGoals`, which shows the "One thing we couldn't match" note.

### Step 2: the AI pass (`src/lib/stack-blueprint/personalise.ts`, `src/lib/ai-stack.ts`, `src/app/api/personalise-stack/route.ts`)

**What the AI sees.** For each slot, up to 8 options that already passed the engine's hard exclusions, ranked by engine score. Each option includes `getApprovedClaims(swapGroup)`.

**What it returns.** `{choices, reasons}`. Choices are checked against each slot's option list. A swap is dropped if it would duplicate another slot. A reason is kept only if the slot ends up holding the product the reason was written about (`reasonAppliesTo`).

**When nothing happens.** If there's no OpenAI key, or there's an error or timeout (12 s), the engine blueprint is used unchanged.

### Step 3: depths (`tier-plan.ts`, `src/lib/quiz-core/tiers.ts`)

Each depth is filled from the ranked stack up to a **monthly subscription** price band, with a product-count range:

| Depth | Monthly band | Products |
|---|---|---|
| Essentials | up to £35 | 2–3 |
| Balanced | £35–55 | 3–4 |
| Complete | £55–80 | 4–6 |

Further rules:

- Required slots are in every depth.
- Depths less than £5/month apart are folded together.
- Balanced (internal id `performance`) is the default (`levelForStackPreference(null)`).
- Which products land in Essentials and which only in Complete depends on **rank order and price**, not on answers.

### 1a. Can we tell which answer(s) caused each product?

**Mostly no.** Here is what exists today:

| Recorded per slot | What it tells you |
|---|---|
| `slotId` | For wellbeing slots, the goal (`slot-sleep-better`). For performance slots, only the slot type (`slot-protein`). Extras are `slot-extra-<productId>`. |
| `required` | Whether a goal forced the slot (muscle/bulking/performance). |
| `confidenceScore` | The engine's total score ÷ 2, clamped 0–100. A single number with no breakdown. |
| `recommendedProductId` vs `selectedProductId` | If these differ, the AI (or the customer, via Swap) changed the engine's pick. |
| `reason` | Free text. Either an engine template that names *one* factor (`buildPersonalisedReason`, `buildWellbeingReason`, `factory.ts:460-561`), or AI-written copy. |

Nothing about the stack is stored on the server:

- The blueprint lives only in browser memory (`store.tsx` `partialize` excludes it).
- The analytics `reveal` event records slot count and totals only.

**What it would take** (facts about the code shape, not a recommendation):

- `scoreProduct` is purely additive. Every `score +=` line reads a named answer field, so returning a list of `{field, value, points}` next to the total would give a complete breakdown for engine picks.
- Exclusions (−∞) would need recording the same way, to show why something is *absent*.
- AI swaps return only a product id and prose. Structured attribution would need the prompt and parser (`parseBlueprintResult`) to return the answer fields used.
- Depth membership is decided by price band and rank, so it would need its own explanation.
- To look any of this up later, the blueprint plus answers would need to be saved server-side. Today they are not.

### 1b. Where each label comes from

| On screen | Source | AI? |
|---|---|---|
| Identity name, e.g. "Vitality Boost" | `identity.name` from `/api/generate-identity` (`gpt-4o-mini`, temperature 0.8). The prompt asks for "a punchy 2-3 word stack name". Fallback when there's no key or an error: **"Peak Protocol"**. | Yes |
| Archetype, e.g. "The Balanced Athlete" | `identity.archetype`, same call ("a 2-4 word athlete archetype label"). Fallback: "The Performance Athlete". | Yes |
| Identity description | `identity.description`, same call. The model writes `{{NAME}}`, and the first name is substituted on our server (`src/lib/ai-identity.ts`). | Yes |
| "Your focus areas" chips | `identity.focusAreas`, same call ("3 short focus area labels"). Icons come from a keyword match (`src/lib/identity-visuals.ts`). Fallback: Performance Output / Faster Recovery / Daily Energy. | Yes |
| "Routine fit" score | `identity.routineFitScore`, same call: "integer 72-96, how well this stack fits their specific routine". **Not calculated.** The prompt contains no products. Fallback: **84**. | Yes |
| Stack name under "Your CHRGD Stack", e.g. "Everyday Wellbeing Stack" | `getStackName()` (`factory.ts:108`): 10 fixed names, see the table below | No |
| Stack summary line | `ARCHETYPE_SUMMARIES` (`factory.ts:120`): 5 fixed sentences | No |
| Card pill / product tag, e.g. "Immune support" | `slot.title`. It comes from `SLOT_TITLES` (performance path), `WELLBEING_GOAL_SLOTS[].title` (goal slots, e.g. "Immunity"), `SWAP_GROUP_LABELS` for extras (vitamin C → **"Immune Support"**), or `SLOT_LABELS` for added boosters. Shown uppercase by CSS. | No |
| Card role line | `slot.description` (fixed slot descriptions, or the product's `shortReason` for extras) | No |
| "What it supports" bars | `src/lib/stack-stats.ts`. Axes = the person's goals (primary first), padded to 4. Score per product: 9 / 7 / 6 depending on where the goal sits in the product's `goals` list, ± 0.3 × (`recommendationPriority` − 7). Minimum 5 if the product targets the goal, a flat 2 if not. Comment: "no AI call and no authored per-product stat data". | No |
| "✦ AI personalised" badge | `StackHero.tsx:35`, shown when `blueprint.personalised`. That is set when `/api/personalise-stack` returns at least one usable choice **or reason**, even if no product changed. | Flag only |
| "Why it's in your stack" (detail sheet) | `slot.reason`: AI text if personalised, else the engine template | Either |

A product's `goals`, `swapGroup` and `stackSlots` drive both scoring and the bars. For PowerBody imports they are set by a keyword classifier (`classifySupplierProduct`, `src/lib/supplier/mapping.ts`) and/or an AI classifier (`src/lib/portal/ai-classify.ts`, `gpt-4.1-mini`). Imported products stay `pending`, hidden from shop and quiz, until a founder approves them (`ProductReview` in `src/lib/catalogue/types.ts`).

**Is any AI model involved?** Yes, if `OPENAI_API_KEY` is set in production. That can't be checked from here. However, "Vitality Boost" and "The Balanced Athlete" appear nowhere in the codebase. The only code path that produces identity text other than the fallback is the `gpt-4o-mini` response.

Two prompt details:

- Both AI prompts state a budget the quiz never asked for. The identity prompt sends `Budget: £50-80/month` and `Stack preference: balanced`, the defaults for `null` (`generate-identity/route.ts:43-46`).
- The personaliser prompt says `Monthly budget: £50–80/month` with a "never exceed it" rule (`ai-stack.ts:78`). In code, though, the cap is `null`, so no budget gate is applied to AI swaps.

### 1c. Every possible stack

**A full table of products and prices per stack can't be produced from the code.** Reasons:

- Products are chosen per answer set from the **live catalogue** (database, not in the repo, not reachable here).
- The answer space is large: 15 multi-select goals plus about a dozen other questions, plus AI swaps.
- Each stack is then cut into up to three depths.

Fixed in code are the 10 possible stack names:

| Archetype (trigger) | Trains 5–6×/week or daily | Otherwise | Summary line |
|---|---|---|---|
| muscle (muscle or bulking) | Performance Core Stack | Strength Engine Stack | Built to maximise muscle growth, strength, and recovery. |
| fat-loss (cutting) | Lean Power Stack | Fat Loss Protocol | Designed to support fat loss while preserving lean muscle. |
| performance (performance or energy) | Endurance Edge Stack | Athletic Performance Stack | Optimised for endurance, energy, and athletic output. |
| wellbeing (only wellbeing goals, not just "health") | Daily Reset Stack | Everyday Wellbeing Stack | A daily routine built around how you actually feel — sleep, stress, and everyday resilience. |
| health (everything else) | Daily Charge Stack | Foundation Health Stack | A smart daily foundation for energy, recovery, and long-term health. |

The wellbeing-only track skips the training-frequency question, so those customers always get "Everyday Wellbeing Stack".

Example outputs exist only for the **sample (mock) catalogue**, not real stock: 14 test personas in `src/lib/stack-blueprint/__tests__/__snapshots__/persona-bundles.snapshot.test.ts.snap`.

To produce the real table, you would run `buildStackBlueprint` + `planTiers` against an export of the live catalogue, across the answer combinations you care about.

---

## 2. Prices, margins and delivery

### How product prices are set

**The rule** (`src/lib/pricing/list-price.ts`, `PRICING_CONFIG.listPricing`):

```ts
list price = PowerBody wholesale (ex VAT) × 2.0, rounded DOWN to .99
// roundTo99: Math.max(0.99, Math.floor(price) - 0.01)
```

It's applied when a product is imported (`supplierProductToCatalogue`, `src/lib/supplier/mapping.ts:176`) and when it's re-pulled (`repriceVariants`, `src/lib/supplier/variant-pricing.ts`).

**Manual override.** A founder can set a price per variant (SKU), recorded as `priceSource: 'founder'`. Supplier pulls never overwrite it (`src/lib/catalogue/price.ts`).

**PowerBody's RRP** is stored as `supplierRrp` / `compareAtPrice` (the "was" price). It isn't used to set our price.

**When PowerBody's cost changes.** The nightly sync updates cost and raises a change event if it moved ≥ 2%. The default policy is to **absorb** it, i.e. our shelf price doesn't move (`src/lib/changes/price.ts`, `policy.ts`).

### PowerBody cost per product, and margin

**Cost is stored**, but in the database:

- `CatalogueProduct.cost` and `CatalogueVariant.cost`: PowerBody wholesale **ex VAT**, from the feed's `wholesalePrice`.
- `weightGrams` and `vatRate` are stored too.

The repo has no cost data:

- the sample catalogue has no `cost` fields
- `docs/rosters/chrgd-roster.csv` has no price columns

**Per-product cost and margin: not found** (in the repo). The Founders Hub pricing and product pages show it from the database (`/founderhub/pricing`, `/founderhub/products/powerbody`; `priceRows()` in `catalogue/price.ts`).

If no cost is on file, it's estimated as price × 0.55 (`defaultCostRatio`).

**What the rule implies** (code defaults):

- We're not VAT-registered (`vat.registered: false`), so we keep the whole shelf price.
- PowerBody's 20% VAT on goods and delivery is a cost to us (`vat.supplierChargesVat: true`).
- So the gross margin on goods at full list price ≈ list − 1.2 × cost ≈ 2c − 1.2c = **about 40% of price**, before delivery, card fees (1.5% + 20p) and returns (2%).

Worked from your example. The rule makes £20.99 mean a cost between £10.50 and £10.99, and £31.99 mean a cost between £16.00 and £16.49. So:

| | Amount |
|---|---|
| Customer pays | £48.74 + £2.95 delivery = £51.69 |
| Goods cost us (incl. VAT) | about £31.80–£33.00 |
| PowerBody delivery (incl. VAT) | £7.80 |
| Card fee | about £0.98 |
| **Left over, before returns** | **about £10–£11** |

These are derived from the rule, not from stored costs.

### How the stack total is calculated (£52.98 → £48.74)

`calculatePricing()` → `priceOneOffLines()` (`src/lib/stack-blueprint/pricing.ts:1243-1300`):

1. Subtotal = the sum of the selected variants' list prices = £52.98.
2. Bundle tiers (`bundleTiers`): there is one tier, "£50+ bundle", which gives **8% off** when the subtotal is ≥ £50.
3. Each line becomes `max(price × (1 − 8%), cost × 1.15)` (`discountWithFloor`, margin floor 15%), rounded to the penny **per line**.
   - £20.99 × 0.92 = £19.31
   - £31.99 × 0.92 = £29.43
   - **Total £48.74**
4. The receipt shows "Subtotal · 2 items £52.98", then "Bundle deal · £50+ bundle · 8% off −£4.24", then "Total £48.74 · You save £4.24".

The same function prices the Stripe line items in `/api/cart`, so the display and the charge match.

### Delivery

| | Rate | Source |
|---|---|---|
| **We charge** (UK mainland, on the **pre-discount subtotal**) | under £40: **£4.95** · £40 to £99.99: **£2.95** · £100+: **free** | `delivery.customerRates`, `customerDeliveryCharge()` (`src/lib/pricing/delivery.ts:239`) |
| Highlands, Islands & Isle of Man | + **£2.95** on every band, free band included | `zone2Surcharge` |
| **PowerBody charges us** (UK mainland, on *our wholesale spend* per parcel, ex VAT) | up to £50: **£6.50** · up to £99: **£5.50** · over £99: **free** | `delivery.services` |
| PowerBody, Zone 2 | £7.99 up to £300 wholesale, free above | same |
| PowerBody, EU | £8.60 | same |

While we're unregistered, PowerBody's 20% VAT on delivery is also a cost: £6.50 becomes £7.80. The code comment in `delivery.ts` says these rates replaced an earlier weight-based card and are "worth confirming with PowerBody".

**Delivery is not in the "One-off total"** (the sticky bar or the receipt total):

- **Under £100:** the receipt shows a separate line under the total: "+£2.95 delivery · spend £X more for free" (`PlanReceipt.tsx:555-576`). Delivery is charged on Stripe's page as a shipping option. Stripe offers "UK mainland" and "Highlands, Islands & Isle of Man", and the customer picks one (`deliveryOptions()`, `/api/cart` `src/app/api/cart/route.ts:607-620`).
- **£100 or more:** the receipt shows "Delivery · Free".
- **Subscriptions:** postage is a second recurring Stripe line, "Delivery — UK mainland", billed every month while the plan is under £100 (`recurringDeliveryOption`, `src/lib/payments/stripe.ts:265-286`).

### The top-pick "one-time offer" (e.g. £3.49 delivery)

**Files:**

- `src/components/stack-review/LastChance.tsx`
- `LastChanceView.tsx`
- `src/lib/last-chance/pick.ts`
- `src/lib/last-chance/economics.ts`
- spec: `docs/LAST_CHANCE_OFFER.md`
- settings: Founders Hub → Pricing → Rules → Last-chance offer

**Which product.** One product from the stack on screen. Each is scored on:

- `scoreProduct` fit
- +15 if required
- +10 if it serves the primary goal
- +5 if a register claim exists

Only products that can carry a profitable deal are eligible: in stock, not an accessory, not subscription-only, not excluded for this person. Ties go to the bigger saving.

**What the deal is**, worked out by `quoteOffer`, priced on its own (never with the 8% bundle deal or a code):

1. Free delivery.
2. Then the deepest whole % off (5–25%) that still keeps **≥ £3.00** and **≥ 10%** of net revenue after goods, both sides of delivery, VAT on costs, card fees and returns.
3. If free delivery would lose money, delivery is **reduced** instead. It's set to the lowest of £0.99 / £1.49 / £1.99 / £2.49 / £2.99 / **£3.49** / £3.99 that clears the floor, cheaper than standard, with no % on top (`REDUCED_DELIVERY_PRICES`, `economics.ts:69`).
4. Otherwise there's no deal and no card.
5. It must beat the ordinary checkout price by ≥ £1, and the order must be ≥ £15.

So **£3.49 delivery** appears on a product under £40, where standard delivery would be £4.95 and free delivery would break the floor.

**Who sees it:** everyone who scrolls to the foot of the page, **unless** any of these apply:

- a partner starter claim is in progress
- **any code is applied**, including after tapping "Apply IGNITE25 now"
- the active depth has fewer than 2 products
- no product qualifies
- this browser already completed a last-chance order (`localStorage` key `chrgd:last-chance-used`, set on the confirmation page)

**Checkout.** One-off only, guest checkout. `/api/cart` recalculates the quote from the catalogue. If the server price is higher than what was shown, the order stops and the new deal is shown. No codes are accepted.

---

## 3. Discounts

### IGNITE25 / "Today's code" (`src/lib/store-codes/daily.ts`, `store-codes/index.ts`)

**How it's made.** It isn't random. A fixed list of 48 words, one per London day from **14 Oct to 30 Nov 2026**, each with `25` appended:

- 14 Oct: SPARK25
- …
- **20 Oct: IGNITE25**
- 21 Oct: BOOST25
- 22 Oct: RALLY25
- …
- 27 Nov: BLACKFRIDAY25
- 30 Nov: FINALE25

The codes are created lazily in the database (`ensureDailyCodes`) as ordinary codes owned by a hidden "house" partner, which earns no commission. Their terms:

- 25% off
- not first-order-only
- no use limit
- `startsAt` / `endsAt` = the London midnights around their day

**Expiry.** Midnight Europe/London at the end of its day. The card counts down to it: "This code expires tonight at midnight — 4h 12m left."

**After a refresh or the next day:**

- `/api/checkout-promo` (`no-store`) returns today's code. A refresh on the same London day shows the **same** code.
- The next day shows the **next word's** code.
- If midnight passes with the page open, the card says the code has ended, removes it from the order, and asks for the new day's code 3 seconds later (`StackReviewPage.tsx:678-683`).

**Priority.** The daily code is shown ahead of any store code a founder chose to promote. It shows unless a founder turns it off (`store-codes:daily` in `kv`; default on).

The card is hidden if:

- a partner code, founder code or starter claim is active, or
- the code wouldn't save money

**Server-side expiry check: yes, when the checkout is created.** `checkCode()` (`src/lib/partners/codes.ts`) refuses with "That code has expired." when `now > endsAt`. It runs inside `redeemPartnerCode()` on:

- the code box (`/api/partner-code`)
- one-off checkout (`/api/cart` → `redeemPartnerCode`)
- subscription checkout (`src/lib/checkout/finalize.ts:265`)

It is **not** re-checked when Stripe reports the payment as complete. No `expires_at` is set on Checkout Sessions, so Stripe's default lifetime applies. A session created before midnight can be paid after midnight at the discounted price.

### Other codes

Live codes are rows in the `partner_codes` table, which can't be read here. **List of live codes and their %: not found.** The types and rules are below.

| Type | Example / format | Discount | Rules |
|---|---|---|---|
| Daily code | IGNITE25 | 25% | As above. Works on quiz stacks, bundles, subscriptions **and single shop products** (store-code exception in `redeem.ts`). |
| Store code (founder campaign) | e.g. `SUMMER15`; the code mentions `LAUNCH25` | 1–50%, set in hub | Anyone, any order, optional end date. One can be promoted on the results page. Works on shop products too. (`store-codes/index.ts`) |
| Partner code | e.g. `SARAH20` (generated as first name + %) | default **25%** (`partners.codeDiscountPct`) | **First order only** by default. Optional max uses, min spend, start/end. Bundles, quiz stacks and subscriptions only, **not** single shop products. Can arrive by link (`?ref=` cookie) and auto-apply. The partner earns 15% first-order commission and 5% renewal for 3 months. |
| Founder code | `FH-FREE-…`, `FH-…` | `free` (everything £0, no delivery), `cost` (goods and delivery at PowerBody cost), `unlock` (full price, waives the £15 minimum) | Single use, expires 24 h after issue, **one-off only** (the subscription tab is disabled). (`src/lib/founder-codes/`) |
| Partner starter stack | a claim, not a typed code | free stack up to £100 of goods | Partner accounts only, one-off only, Essentials/Balanced only. (`src/lib/partner-starter/`) |

**Can codes stack? No.**

- The page holds one `partnerCode`, and each checkout takes one code string.
- A code **replaces** the 8% bundle deal rather than adding to it.
- The last-chance offer takes no codes.
- Founder codes are a separate path.

### How a % code is applied when there's already a stack discount

**One-off** (`priceOneOffLines`): each line gets `max(bundle %, code %)`, floored at cost × 1.15.

- £52.98 with IGNITE25: £20.99 × 0.75 = £15.74, £31.99 × 0.75 = £23.99, total **£39.73** (not £52.98 × 0.92 × 0.75).
- The receipt says: "IGNITE25 · 25% off −£13.25", then "Your code replaces the £50+ bundle deal (8% off) — it's the better of the two."
- Delivery is still banded on the £52.98 subtotal (£2.95).

**Subscription** (`firstMonthRate`, `pricing.ts:1129`): the code applies to the **first month only**, as % off list price, replacing the subscribe-and-save rate for that month. It's restated as `1 − (1 − code)/(1 − rung)` off the subscribed price and charged as a Stripe coupon that lasts one billing cycle (`duration: 'once'`). Months 2 onwards are billed at the depth's normal subscription rate (13 / 15 / 20%).

---

## 4. Subscriptions ("Keep me stocked")

### How it works in Stripe (`src/lib/payments/stripe.ts:252-310`, `src/lib/checkout/finalize.ts`)

- Stripe Checkout in `mode: 'subscription'`, billed **every month** (`recurring: { interval: 'month' }`).
- **Line 1:** "CHRGD Monthly Stack" at one flat monthly amount (`subscriptionFlatMonthly: true`).
- **Line 2:** "Delivery — UK mainland", recurring, only while the monthly is under £100. It is £4.95 under £40 and £2.95 from £40 to £99.99.
- Any first-month discount is a `duration: 'once'` coupon. By default there is none: `introOffer.firstMonthDiscount: 0`, and the scratch card is disabled.
- An account is required. The checkout goes through `AccountGate` / `ConsentGate`, whereas one-off orders can check out as a guest.
- **Subscribe-and-save rate by depth:** Essentials 13%, Balanced 15%, Complete 20% (`levelSubscriptionDiscount`). It's floored per line at cost × 1.15.

### Why there's a £25/month minimum

`minSubscriptionMonthly: 25` (`pricing.ts`). The code comment says:

- the real break-even floor is about **£21.60**, where a plan "covers its goods and postage across its whole life including the average scratch card"
- `src/lib/pricing/thresholds.ts` computes that floor, and the hub flags the setting if it falls below it
- it was briefly £40, based on wrongly assuming we absorb postage on every plan

Below £25:

- the "Keep me stocked" tab is disabled and shows "Min £25.00/mo"
- the depth card shows "Monthly unavailable"
- the receipt says: "Monthly subscription unlocks at £25.00/mo. Your monthly plan works out to £X — add a product to enable Subscribe & Save."

Separately, every order has a £15 minimum (`minOrderValue`).

### Products that run out at different times (`pricing.ts:1446` `sizeConsumption`, `src/lib/recharge/schedule.ts`, `clock.ts`)

Each product is sized separately:

1. Uses per month (daily ≈ 30; per-workout from training frequency; as-needed from triggers) × usage level (A little / As recommended / A lot).
2. If one tub lasts ≥ 1 month, 1 unit ships every *round(months it lasts)* months, **capped at 3**. If it lasts less, N units ship monthly.
3. Its monthly price = price per delivery ÷ months between deliveries. The plan bills the **sum of these, flat, every month.**
4. Month 1 ships everything. After that, a box only contains the items due that month (`shipsAtCycle`). The "What lands each month" panel shows "Still stocked — no delivery" for months with nothing due.
5. A billing cycle can ship nothing at all. The order is still recorded, but no box goes out (`src/lib/orders/queue.ts:327-331`).
6. **Not found:** any logic that drops or credits the recurring delivery line in a month when no box ships.

**If a product goes out of stock or is discontinued,** the customer chooses at checkout (`ChangePolicyChoice`):

- "Keep my plan whole": swap to the closest match at the same or lower price (the default)
- "Take it off my plan": the monthly price drops

---

## 5. Product data

### Fields held per product

`CatalogueProduct` and `CatalogueVariant` in `src/lib/catalogue/types.ts`:

| Area | Fields |
|---|---|
| Identity | `id`, `title`, `handle`, `shortName`, `description`, `imageUrl`, `brand` |
| Classification | `category`, `stackSlots`, `goals`, `dietaryTags`, `formats`, `swapGroup` |
| Price and stock | `variants` (each: price, compareAtPrice, available, inventory, sku, servings, imageUrl, cost, priceSource, supplierProductId), `defaultVariantId`, `basePrice`, `compareAtPrice`, `cost` |
| Subscription | `subscriptionEligible`, `servings`, `subscriptionProductId`, `isSubscriptionOnly`, `consumption` (cadence, servingsPerUnit, daysPerWeek, asNeededTrigger, anchor), `minSubscriptionMonths`, `recommendationBasis`, `effectOnset` |
| Ranking | `recommendationPriority`, `marginPriority`, `topRank` |
| Fulfilment | `weightGrams`, `vatRate`, `supplierRrp`, `supplierProductId` |
| Flags | `isCoreEligible`, `isBoosterEligible`, `hasStimulants`, `contraindications`, `actives` (name + mg) |
| Copy | `shortReason`, `warnings`, `rating`, `restockingSoon` |
| Import review | `review` |

### Authorised health-claim field: **not found** (per product)

Claims are held **per swap group**, not per product, in two separate lists:

- `src/lib/stack-blueprint/approved-claims.ts` (`APPROVED_CLAIMS`): paraphrased "structure/function" wording for every group. Fed to the AI personaliser. Several entries are not register wording, e.g. "may support common menopause symptoms such as hot flushes".
- `src/lib/consult/claims.ts` (`CLAIMS_BY_KIND`): verbatim GB register wording with its conditions of use. Used by the last-chance card ("What it does") and the consult. The file says "every mapping below needs checking against the register and the label by whoever signs off the claims".

`CLAIMS_BY_KIND` has **no claim** for these groups: pre-workout (both), aminos, collagen, joint-support, sleep-support, fat-burner, adaptogen, probiotic, greens, fibre, menopause, **multivitamin**, nootropic, energy-gel, accessory, general.

### Directions / dosage field: **not found**

The only related data:

- `servings`, `consumption.cadence`
- `actives` (mg per serving, curated, optional)
- free-text `description`, which the AI rewrite is told to keep dosages in (`src/lib/catalogue/rewrite-description.ts:55`)

### Products missing either

Because neither field exists, **every product is missing both.** The live product list is in the database and not visible here.

The only product list in the repo is the founders' roster import file, `docs/rosters/chrgd-roster.csv` (48 rows). Its columns: sku, brand, name, swapGroup, matrixCell, top25, top25Rank, servings, subscriptionEligible, consumption, occPerMonth, formats, dietaryTags, hasStimulants, contraindications, actives, weightGrams, flavourVariants, variantSkus. That's no claim or directions column.

Roster products whose swap group has **no register claim** (so the last-chance card shows no "What it does" row):

| SKU | Product | Group | Top 25 |
|---|---|---|---|
| P46673 | Applied Nutrition Endurance Breathe Isotonic Energy Gel | energy-gel | #7 |
| P34137 | NOW Foods Probiotic-10 & Bifido Boost | probiotic | #8 |
| P44491 | BioTechUSA Vegan Multivitamin | multivitamin | #10 |
| P43725 | Osavi Collagen Hydrolysed Type I & III | collagen | #11 |
| P44238 | Osavi Collagen Peptides – Joints & Bones | joint-support | #12 |
| P27327 | NOW Foods Glycine | aminos | #14 |
| P30468 | Jarrow Neuro Optimizer | nootropic | #15 |
| P44880 | Osavi Shaker | accessory | #19 |
| P3545 | NOW Foods L-Glutamine | aminos | #23 |
| P47300 | Skill Nutrition Shaker | accessory | – |
| P48410 | Applied Nutrition BCAA Amino-Hydrate | aminos | – |
| P53873 | SciTec Beta Alanine | aminos | – |
| P444 | NOW Foods Taurine | aminos | – |
| P3686 | Xtend | aminos | – |
| P51002 | Allnutrition Collagen Fish | collagen | – |
| P51193 | Osavi Collagen Peptides (Hair Skin & Nails) | collagen | – |
| P47127 | Osavi Marine Collagen Wild Cod | collagen | – |
| P24551 | NOW Foods Double Strength L-Theanine | nootropic | – |

Also in the roster: **P53879 SciTec Zinc Bisglycinate is filed under `magnesium`**. It would therefore be given magnesium claims and magnesium scoring.

---

## 6. Results, emails and the competition

### Persistent results URL or saved record: **no**

- **No route or database table holds a customer's results.** The blueprint (stack) and identity are kept in browser memory only. `store.tsx` persists just the answers, step and v2 interview state to `localStorage` key `chrgd-quiz`, for 7 days.
- **After a reload,** the hero offers "Pick up where you left off?". Resuming re-runs the quiz from the saved step and regenerates everything, including new AI identity text (temperature 0.8).
- **`/#stack`** reopens the results only after a same-tab client-side trip (e.g. to the shop and back), not after a reload (`ScrollExperience.tsx:66-90`).
- **Share card** (`/s/[token]`, table `share_cards`): a stored *poster snapshot* of the stack with a "Build your own in 90 seconds" button. It is not a page to come back to and buy from.
- **Subscribers only.** When someone starts a subscription, their stack and quiz answers are saved to their account, with health data stripped out (`src/lib/checkout/finalize.ts:281`, `CheckoutPayload.quiz` in `src/lib/checkout/types.ts`). They can see them in `/myhub`. The identity card and the results page itself are not saved.
- **One-off buyers:** the order records the items bought (`orders` table), not the results.

### Quiz-end emails (competition entries)

**Where:** `src/components/share-card/GiveawayEntry*.tsx` on the results page, shown only while a competition is open in the hub. There's also a free-entry form (`FreeEntryForm.tsx`). The API is `POST /api/competition/enter`.

**Stored in** table `competition_entries` (`src/lib/db/migrations.ts:395`, plus v26/v27):

| Column | Value for an email entry |
|---|---|
| `id`, `campaign` | entry id and campaign name |
| `channel` | `'email'` |
| `handle` | the email address |
| `route` | `'quiz'` or `'free'` |
| `state` | `pending` until a founder confirms |
| `is_test`, `note`, `created_at` | test flag, note, timestamp |
| `bonus_entries`, `shared_at` | +10 tickets for sharing |
| `follow_entries`, `followed_at` | +3 tickets for an Instagram follow |
| **`marketing_opt_in`** | see below |
| `share_token` | `null` |

`share_token` is `null` for email entries, so **the entry is not linked to the person's stack or answers.**

**Marketing opt-in:** the column exists, but both forms always send `agreedToTerms: true` (`src/lib/competition/client.ts:167`, `FreeEntryForm.tsx:31`), and there is no checkbox. So every email entry is stored with `marketing_opt_in = 1`. The opt-in is the sentence beside the button: "By entering you agree to the competition T&Cs, including that getCHRGD can email you offers and news. Unsubscribe any time."

**Export:** CSV via `GET /api/portal/competition?format=csv` (Founders Hub → Settings → Competition).

### Email setup (`src/lib/notify/`, `docs/EMAILS.md`)

**Providers:** `NOTIFY_SOURCE` env sets this:

- `manual` (default: no provider; emails wait in Founders Hub → Emails to be copied out by hand)
- `gmail` (Google Workspace via Gmail API)
- `resend`
- `auto`

Which is set in production: not visible here.

**Templates** (`src/lib/notify/types.ts`, all transactional):

- order-confirmation, subscription-confirmation
- order-item-update, product-substituted, product-removed
- price-change-notice, terms-updated, payment-failed
- exit-receipt, exit-charge-failed, exit-scheduled, exit-return-requested
- password-reset, password-changed

Every email except "problem" emails carries a promotional block above the footer with an opt-out link (`src/lib/notify/marketing.ts`).

**Automations:**

- Once a provider is configured, receipts (order and subscription confirmations) send automatically.
- Password emails always send.
- Everything else waits for a founder to press Send.
- The only scheduled job is the daily cron at 06:00 UTC (`vercel.json` → `/api/cron/daily`, supplier changes).

**Scheduled sends: not supported.** The `notifications` table has `created_at` / `updated_at` / `sent_at` but no send-at field, and there's no delay logic in `src/lib/notify`.

### Email after seeing results without buying: **not found**

There's no template, job or trigger. Competition entrants receive no email from the system.

### Email after buying: yes

Order or subscription confirmation with the receipt (automatic once a provider is configured, otherwise it waits in the hub). After that, only the event-driven emails listed above. There's no post-purchase sequence or follow-up.

---

## 7. Results page copy, in order

Key: **[F]** fixed text in code · **[D]** from data/config (catalogue, settings, prices) · **[R]** generated by rules/templates · **[AI]** generated by an AI model. Labels marked ↑ are uppercased by CSS.

### Floating bar (all scenes) — `SceneRail.tsx`

- "You" · "Stack" · "Plan" [F]

### YOU — `Act4Reveal.tsx`

1. ↑ "Fully charged" [F]
2. ↑ "{First name}'s supplement identity" / "Your supplement identity" [F + name typed in quiz]
3. Score ring: number [AI, fallback 84] · "/100" [F] · "Routine fit" [F]
4. Identity name, e.g. "Vitality Boost" [AI, fallback "Peak Protocol"]
5. Archetype, e.g. "The Balanced Athlete" [AI, fallback "The Performance Athlete"]
6. Description, 2 sentences [AI, name substituted on server]. There are two different fallbacks:
   - in the browser (`Act2Quiz.tsx:25`): "Your stack is built around output and recovery. These selections may suit your goals and are commonly used by people with similar profiles."
   - on the server (`generate-identity/route.ts:105`): "Your training demands a stack built around output and recovery. These selections may suit your goals and are commonly used by athletes with similar training profiles."
7. ↑ "Your focus areas" [F] · 3 chips [AI, fallback "Performance Output", "Faster Recovery", "Daily Energy"]

### STACK — `StackReviewPage.tsx`, `StackHero.tsx`, `StackDeck.tsx`, `StatCard.tsx`, `UpgradesCard.tsx`

**Loading and error states [F]:**

- "Building your stack…"
- "We couldn't load the shop" / "The catalogue came back empty, so there's nothing to build your stack from yet."
- "Your stack isn't here yet" / "Take the quiz and we'll build one from the products we actually stock."

**Header and summary:**

1. ↑ "Your CHRGD Stack" [F] · ↑ "✦ AI personalised" [F, shown if personalised]
2. Stack name, e.g. "Everyday Wellbeing Stack" [R]
3. Summary sentence [R]
4. Chips: "{n} products" [D] · "£X/mo" (if it can subscribe) or "£X one-off" [D] · primary goal, e.g. "Sleep Better" [D]

**Unmet-goal note (when needed):** "One thing we couldn't match" [F]. Then: "We didn't find a suitable product for {goals} given your answers, so we've left it out rather than suggest something that isn't right for you. It's worth a chat with your GP or pharmacist." [F + D]

**Consult stacks only:** pharmacist note (`ConsultNote.tsx`).

**Depth picker:**

- ↑ "Choose your depth" [F]
- Per card:
  - "Essentials" / "Balanced" / "Complete" [F]
  - ↑ "Recommended" on Balanced [F]
  - "{n} products" [D]
  - Either "£X/mo" + ↑ "Subscription" + "or £X one-off" [D], or ↑ "Monthly unavailable" + "£X one-off" [F + D]

**Deck:**

- ↑ "Your personalised stack — {n} products · swipe to compare" [F + D]

**Each product card:**

- ↑ slot pill, e.g. "Immune Support" [R]
- product title [D, PowerBody name; "Product unavailable" if missing]
- role line [R/D]
- "£X.XX" [D, list price]
- ↑ "What it supports" [F] · 4 bar labels, e.g. "Sleep", "Calm", "Immunity", "Health" [R] · "✦" on targeted bars
- "Tap for details ›" [F]

**Product detail sheet (tap a card):**

- Slot pill [R], title [D], price [D], variant label [D]
- ↑ "Why it's in your stack" [F] + reason [AI or R]. The engine template reads "Chosen for {name} — {suffix}" (performance path) or "For {name}: {shortReason}{suffix}" (wellbeing path).
- Onset line [F, chosen by `effectOnset`]: one of
  - "You'll feel this from the first day."
  - "Give it 1–3 weeks to notice the difference."
  - "Works quietly — expect to notice over 6–12 weeks."
  - "You won't feel it day to day — it's doing the work regardless."
- Badges [F]: "Core to your stack" / "Optional add-on"; then "Monthly refill" / "In monthly plan" / "One-off only" / "Subscribe-ready"
- ↑ "The facts" [F]: "Format" (Powder/Capsules/…), "Per unit" ("{n} servings"), "You'll feel it" ("right away" / "within a few weeks" / "over the first couple of months" / "quietly in the background") [R]. Dietary chips [D].
- Subscription refill note: "On subscription you'll get {X} at £X/mo — a monthly-sized refill so it ships every month." [F + D]
- ↑ "Flavour & size" [F], variants [D], "Sold out" [F]. Then: "{n} other sizes are sold on the product page — a different serving count changes what your plan costs, so it is not a swap." [F]
- Warnings [D]
- Buttons: "Swap product" · "Remove" [F]

**Swap sheet:**

- ↑ slot title [R]
- "Change your {slot}" [F + R]
- "Currently: {title}" [D]
- Per option:
  - title, price, description [D]
  - "+£X/month" / "−£X/month" / "No price change" [R]
  - "Recommended for you" · "Current" [F]
  - Tags [R]: "Vegan", "Dairy-free", "Gluten-free", "Best value" (if `marginPriority` ≥ 8), "Premium" (if `recommendationPriority` ≥ 9), "Light option" (if price < £30)

**Last card in the deck (if there are add-ons):**

- ↑ "Optional add-ons" [F]
- "Complete your stack" [F]
- per item: short name [D/AI], "+{goal}" tags [R], price [D], "+ Add" [F]

### PLAN — `#scene-plan`: `CheckoutPromo.tsx`, `PartnerCodeBox.tsx`, `PlanReceipt.tsx`, `ShopAlaCarte.tsx`, `SubscriptionProtocol.tsx`, `SubscriptionJourney.tsx`, share/giveaway, `LastChanceView.tsx`

**Checkout error box:** server messages [D] + "Dismiss" [F]

**Today's code card** [F + D]:

- ↑ "Today's code" / "Launch offer" / "Limited-time offer" / "Offer"
- countdown clock
- code (animated decode)
- "25% off" · "your whole order" / "your first month"
- "£before ~~£after~~ £X less (on month one)"
- "Apply IGNITE25 now" / "Applying…"
- "This code expires tonight at midnight — 4h 12m left." (store codes: "Ends … — … left to use it.")

When applied:

- "IGNITE25 applied"
- "25% off — your total is now £X."
- "This code expires … — check out before then to keep it."
- "Remove code"

When ended: "IGNITE25 has ended, so it's been taken off your order."

**Code box** [F]:

- "Got a discount code?" / "Got a different code?"
- placeholder "Discount code" · "Apply"
- "Checked against your £X basket."
- errors from the server, e.g. "We don't recognise that code.", "That code has expired.", "That code is for a first order only."

When applied:

- "{CODE} · 25% off"
- "{Partner}'s code — takes 25% off the regular price, instead of any other discount"
- "Applied automatically from a link you followed. Remove it to buy without it."
- "Remove"

**Receipt:**

1. Tabs: "Just this once" + £X · "Keep me stocked" + "£X/mo" / "Min £25.00/mo" / "Unavailable" [F + D]
2. Comparison table: ↑ "Just once" · ↑ "Subscribed" · "Today" · "A month's supply" [F] + amounts [R]. Then: "Just once is one pack of each — your {product} runs out in about a month, the {product} in about three months. Subscribed, each one is topped up as it runs out(, and today's box has more in it)." [F + R]
3. If it can't subscribe [F + D]: one of
   - "None of the products in this stack can be subscribed to monthly yet."
   - "Monthly subscription unlocks at £25.00/mo. Your monthly plan works out to £X — add a product to enable Subscribe & Save."
   - "Your code is for a one-off order, so subscribing isn't available with it."
4. ↑ "Your order · {n} items" [F + D]; each line: title [D], role or "Taken every day · 1 tub a month" [R], price [D]
5. **One-off view:**
   - "Subtotal · {n} items" + amount
   - "Bundle deal · £50+ bundle · 8% off −£X" or "{CODE} · 25% off −£X" + "Your code replaces the £50+ bundle deal (8% off) — it's the better of the two."
   - "Delivery · Free"
   - "Total" + "You save £X" + amount
   - Nudge: "Subscribe & save up to 15%" / "£X/mo · pause or cancel anytime" [F + D]
6. **Subscription view:**
   - "**Performance** bundle · Subscribe & Save · up to 15% off"
   - first-month lines when there's an intro or code
   - "Monthly total £X/mo"
   - "Cancel or pause anytime." [F + D]
7. Delivery line: "Free delivery included" or "+£2.95 delivery · spend £X more for free" [F + D]
8. Buttons [F]:
   - "Continue to checkout →" / "Start subscription →" / "Place my free order →" / "Building your cart…"
   - "Swap products"
   - "Prefer to buy these separately?"

   Expanded:
   - "We'll put all {n} in your shop basket so you can change the quantities or drop what you don't want."
   - "Your {25% off} applies to this stack, not to single products — so buying them separately means paying full price. Your stack stays saved, and you can come back to it whenever you like."
   - "Never mind" · "Take me to the shop"

**Subscription only:**

- "What lands each month" →
  - ↑ "Your monthly protocol"
  - "One flat monthly payment, sized to how you train — {freq}. Here's what lands each month:"
  - "Month 1/2/3", "{n} items", "Still stocked — no delivery"
  - cadence note
  - "Flat monthly £X/mo"
  - "Cancel or pause anytime."
- "Change quantities" opens a sheet:
  - "Tune your monthly plan"
  - "Just nudge anything you get through faster or slower, and we'll sort how often it ships."
  - "How often do you train?" · "This sizes your pre-workout, hydration and other training-day items." · "1–2× a week"… "Every day"
  - "A little / As recommended / A lot"
  - "If something goes out of stock" · "It happens occasionally. Tell us what you'd rather we did…"
  - "Keep my plan whole" / "Take it off my plan" + consequences
  - "Set this per product instead"
  - "Your flat monthly"
  - "One predictable payment — items arrive on their own schedule. Cancel anytime."
  - "Looks good →" [F + D]

**Fine print [F]:** "Food supplements are not a substitute for a varied diet or medical care. Consult your GP before use if you are pregnant, breastfeeding, or taking prescribed medication (including HRT)."

**Share button** (only when **no** competition is open) [F]:

- ↑ "Your card is ready"
- "Share your stack"
- "A poster of your stack, built to post"

**Giveaway** (only while a competition is open) [F + D: prize text, handle and close date come from the hub]:

- prize headline, e.g. "Win £200 of supplements"
- "Enter the competition" · "Your email"
- "By entering you agree to the competition T&Cs, including that getCHRGD can email you offers and news. Unsubscribe any time."
- "No purchase necessary" · "One entry per email"
- After entry:
  - "Entries" · "1 entry" · "Add more entries"
  - "Share your card for 10 bonus entries" · "Follow {handle} on Instagram for 3 bonus entries"
  - "We'll email you if you win."

**Last-chance offer:**

- "Not ready for the whole stack?" / "Then here's a one-time deal on your top pick." [F]
- "Worked out for your stack, just now. It only exists on this page — it isn't in the shop, and no code unlocks it." [F]
- ↑ "One-time offer" [F]
- ribbon "Free delivery" / "Delivery just £3.49" [F + D] · "−8% Off" stamp [D]
- product title + role [D/R]
- goal line [R]: one of
  - "You told us your top goal is "{goal}". Of the {n} products in your stack, this is the one built around it.( It's the core of your stack.)"
  - "Picked for your goal "{goal}"."
  - "One of the {n} products we picked for you."
- ↑ "What it does" + register claim, verbatim [F per swap group]
- ↑ "What you get" + "{n} servings — £X each · lasts about a month at your usage" [R]
- ↑ "Your deal" [F]
  - delivery row: "Free delivery" / "Delivery, cut" · "UK mainland…" [F + D]
  - product row: "Off the £X it'd cost on its own" / "Worked out for this order" [F + D]
  - "Delivered for" · "£X delivered, down from £Y" [F + D]
- "Get it for £X" [F + D]
- "Just this, once — no subscription. Pay on the next screen." · "Highlands, Islands & Isle of Man add £2.95." [F + D]
- "Or get your full stack" [F]

### Sticky checkout bar (bottom)

- ↑ "One-off total" / "Monthly" / "To pay" [F]
- amount [D]
- "Checkout →" / "Start subscription →" / "Place my free order →" / "Taking you to secure checkout…" [F]

---

## 8. Visible issues

### The floating You/Stack/Plan bar covering content

`SceneRail.tsx`:

- **Placement.** The bar is a `position: fixed`, `z-40` pill, attached directly to `<body>` (the code calls this portaling) and centred horizontally. It sits at `top: env(safe-area-inset-top) + 0.75rem`, so it covers roughly the top 50 px of the screen.
- **No reserved space.** Content scrolls underneath it. The background is 82% opaque dark with a blur, so whatever is under it is hidden.
- **When it hides.** It slides away only while scrolling **down** past 120 px (more than 6 px per frame). Any upward scroll brings it straight back (`setRetracted(y > lastY && y > 120)`), on top of whatever is at the top of the screen.
- **Reduced motion.** With reduced motion turned on, it never retracts at all.
- **Your example.** "Prefer to buy these separately?" (`ShopAlaCarte.tsx:83-90`) is a centred, full-width line. When someone scrolls up and that line is near the top of the screen, the centred pill sits over it.

The bottom checkout bar (`StackReviewPage.tsx:1153-1196`, `z-30`, fixed) is similar. It hides only while the receipt's main button or the last-chance button is on screen (an `IntersectionObserver` with a 96 px bottom margin). The rest of the time it covers about 100 px at the bottom of the screen.

I didn't render the page here (no dependencies or data in this container). The cause above comes from reading the code.

### Other inconsistencies found in the code

1. **Two different names for the same stack.** The You card shows the AI identity name ("Vitality Boost"). The Stack header shows the rule-based `stackName` ("Everyday Wellbeing Stack").
2. **"Balanced" vs "Performance".** The depth picker calls the middle depth "Balanced" (`TIER_META`). The subscription receipt line uses `LEVEL_LABEL` in `PlanReceipt.tsx:16` and reads "**Performance** bundle · Subscribe & Save".
3. **Three different headline prices.** On a one-off default:
   - Stack chip: the monthly price "£X/mo"
   - Depth cards: monthly first
   - Sticky bar and receipt: the "One-off total"
   - Delivery is in none of these.
4. **AI prompts assume a budget the quiz doesn't ask for.** Both send "£50–80/month", and the identity prompt also sends "Stack preference: balanced". The personaliser is told never to exceed the budget, but no cap applies in code.
5. **"Routine fit"** is a number the model invents within 72–96 without seeing the products. Everyone whose AI call fails gets 84.
6. **Engine reason can be just the name.** On the performance path, when a name was given, the engine's reason replaces the product reason entirely. Where no suffix applies, it is only "Chosen for {name}" (`factory.ts:519-522`). For example: the energy slot with medium caffeine and no energy goal, or the hydration/recovery slots at 3–4×/week. This shows unless the AI rewrote the reason.
7. **Swap sheet "/month" wording.** It labels one-off list-price differences as "/month". It compares the current product's `basePrice` with each alternative's first available variant price. Its "Best value" tag comes from our `marginPriority`.
8. **"Prefer to buy these separately?" warning.** It says the code "applies to this stack, not to single products" for any code. But daily and store codes (e.g. IGNITE25) do work on single shop products (`redeem.ts` store-code exception). It also says "Your stack stays saved, and you can come back to it whenever you like", but the stack is held in memory only and is lost on reload.
9. **Margin floor ignores supplier VAT.** The floor is `cost × 1.15` on ex-VAT `cost` (`unitCostOf` / `discountWithFloor`). While PowerBody's VAT is a cost to us, real goods cost is `cost × 1.2`, so the floor is below real cost. A store code can go to 50% (`MAX_STORE_CODE_PCT`). Other parts of `lib/pricing/*` do gross up by VAT.
10. **Recurring delivery line in empty months.** It is billed every month, including months when nothing ships (see §4).
11. **"Cancel or pause anytime".** The receipt and protocol say this. The early-exit settlement for goods already sent still applies (`settlement` in `PRICING_CONFIG`, `docs/EXIT_JOURNEY_PROPOSAL.md`).
12. **Roster data error.** SciTec Zinc Bisglycinate (P53879) is in the `magnesium` group.
13. **Two fallback identity descriptions**, one in the browser and one on the server, with different wording (§7).
14. **"AI personalised" badge.** It shows whenever the AI returned any usable reason, even if every product is the engine's original pick.
15. **Share button disappears during competitions.** It is hidden while a competition is open (`giveawayElsewhere`); the giveaway card replaces it.
16. **Applying today's code removes the last-chance offer.** Applying IGNITE25 hides the offer at the foot of the page (§2).
