# Three changes: format on the results page, product short names, sized tiers

Three changes that arrived together and are written up together because two of
them collide in the same file (`quiz-core/tiers.ts` and `stack-blueprint/`), and
one of them uncovers a latent fault the other two would inherit.

| # | Change | Why now |
|---|---|---|
| **A** | **Format stops being a quiz question and becomes a control on the results page.** | Nobody knows they prefer capsules until they see the powder they'd be sent. Asking it blind costs a question and buys a guess. |
| **B** | **Every product gets a short name**, with an AI pass that writes one for the whole catalogue in a single button press. | The poster and the cards print `product.title`, and a supplier title is 60+ characters of brand, size and flavour. |
| **C** | **Depth tiers get product-count bands and a target price**, on top of the price bands they already have. | "Essentials" currently has no floor — a member can be shown a one-product Essentials. And a band is a range, so two members still see two prices for the same tier. |

Everything below is written against the code as it stands on
`claude/product-quiz-pricing-plan-81zkr5`.

---

## 0. The fault that has to be fixed first

**The catalogue has no format vocabulary.** Four sources write the `formats`
field and three of them disagree:

| Source | Emits |
|---|---|
| `lib/catalogue/mock-catalogue.ts` | `powder`, `capsules`, `rtd`, `drink`, `can`, `shot`, `effervescent` |
| `lib/supplier/mapping.ts` (`formatsFor`) | `powder`, `capsule`, `liquid` |
| `lib/supplier/roster-import.ts` | `powder`, `liquid`, plus whatever the CSV column says |
| The quiz's `FORMAT_DATA` (`Act2Quiz.tsx:303`) | `powder`, `capsules`, `bars`, `any` |

So today, a member who picks **Capsules** in the quiz gets no preference applied
to any PowerBody-imported product, because the catalogue calls them `capsule`
and the answer says `capsules`. And **Bars** matches literally nothing in the
catalogue — no writer ever emits `bars`.

This is currently invisible because format preference is a soft ±score in
`scoreProduct` (`factory.ts:281-289`): a preference that matches nothing simply
applies no penalty, and the stack still looks reasonable. **Change A turns it
into a visible filter**, at which point "Capsules" returns an empty list and the
fault becomes the feature's first bug report.

### Fix: one canonical format taxonomy

New `src/lib/catalogue/formats.ts`:

```ts
/** What a product physically is. The only values `CatalogueProduct.formats`
 *  may hold — everything else is a synonym normalised on the way in. */
export type ProductFormat = 'powder' | 'capsule' | 'tablet' | 'liquid' | 'bar' | 'gel' | 'other'

/** The four buckets a customer chooses between. A display grouping, not a
 *  storage type: 'tablet' and 'capsule' are one choice to a person holding a
 *  pill, and every ready-made drink is one choice to a person who wants one. */
export type FormatChoice = 'powder' | 'capsule' | 'drink' | 'bar'

export function normaliseFormat(raw: string): ProductFormat
export function formatChoicesOf(product: CatalogueProduct): FormatChoice[]
export function matchesFormat(product: CatalogueProduct, choice: FormatChoice): boolean
```

- `normaliseFormat` folds the synonyms: `capsules|softgel|caps → capsule`,
  `tabs|tablets → tablet`, `rtd|drink|shot|can|bottle|ready-to-drink → liquid`,
  `bars|snack → bar`, `effervescent → powder` (it is mixed into water).
- Applied at **both catalogue boundaries** — `supplier/mapping.ts`,
  `supplier/roster-import.ts`, `catalogue/adapter.ts` — and in
  `portal/store.ts` when a founder edits the field, so nothing un-normalised can
  be stored.
- `mock-catalogue.ts` is rewritten to the canonical values (mechanical
  `capsules → capsule`, `rtd/drink/can/shot → liquid`).
- **`filters.ts` keeps its own vocabulary.** `RTD_FORMATS` and
  `DRINKABLE_FORMATS` decide LQD eligibility, and LQD's promise is *no mixing* —
  a distinction the customer-facing `drink` bucket deliberately does not make
  (`effervescent` is a `powder` for the picker and never RTD). Both lists get
  narrowed to canonical values but the two concepts stay separate, with a
  comment saying why.

A migration test asserts every product in the resolved catalogue carries only
canonical formats, so an import path that forgets to normalise fails CI rather
than silently producing an empty filter.

**Order matters: §0 ships before §A.** It is a pure refactor with no user-visible
change, and it is the difference between the format picker working and the
format picker looking broken for every supplier-imported product.

---

## A. Format moves from the quiz to the results page

### A.1 The concept

Format is not a *goal*, it is a *delivery preference* — and it is the one
question a person cannot answer honestly in the abstract. Asked cold on question
eleven, "what formats do you prefer?" gets a shrug or a habit. Asked on the
results page, next to a picture of the 900g tub we are proposing to send them
every month, it gets a real answer, and it is reversible in one tap.

So:

- **The quiz stops asking.** One fewer question, and the one with the weakest
  claim on a member's attention.
- **The engine builds format-neutral.** The best product for the job, whatever
  shape it comes in.
- **The results page carries a Format control** that re-picks products within
  their existing swap groups.

The important property: **changing format never changes what the stack is
*for*.** It swaps *which product fills a slot*, never which slots exist. A
member who prefers capsules gets the same protein/creatine/omega-3 stack, in
capsules where a capsule exists, and told plainly where one does not.

### A.2 What the control looks like

A chip row above the stack deck on `StackReviewPage`:

> **Prefer** ⟨ No preference ⟩ ⟨ Powders ⟩ ⟨ Capsules & tablets ⟩ ⟨ Drinks ⟩ ⟨ Bars ⟩

Multi-select, default **No preference**. Under it, one honest line when a slot
could not be honoured:

> *Protein and Creatine are only made as powders — those two stay as they are.*

And per-slot, inside `ProductSwapModal`, the same chips filter the alternatives
list, so a member who wants capsules for *one* line can have that without
changing the whole stack.

Hidden entirely in **LQD drinks mode** — the package promise is that everything
arrives ready-made, so a format picker there is a control that can only make the
package worse.

### A.3 The mechanism

New in `lib/stack-blueprint/helpers.ts`:

```ts
/**
 * Re-pick every slot's product to honour a format preference, without
 * changing which slots the stack has.
 *
 * Non-destructive by construction: a slot the member has swapped by hand is
 * pinned and never re-picked, and a slot with no in-stock candidate in a
 * preferred format keeps exactly what it had. Both are reported back rather
 * than silently applied — the results page has to be able to say which lines
 * it could not honour.
 */
export function applyFormatPreference(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  choices: FormatChoice[],
): { blueprint: StackBlueprint; unhonoured: StackSlotEntry[] }
```

Per slot, in order:

1. **Pinned?** (`slot.pinnedByUser`) → leave it. A hand-picked product is a
   decision, and a global control must not overwrite one.
2. Candidates = `getSwappableProductsForSlot(slot, inStockOnly(catalogue))`
   plus the current product, filtered by `matchesFormat`.
3. Empty → leave it, and add the slot to `unhonoured`.
4. Otherwise pick the highest `recommendationPriority`, ties broken by
   `marginPriority` then price — the same ordering the swap modal already
   presents alternatives in, so the control picks what a member scrolling that
   list would have picked.
5. Reset `selectedVariantId` to the new product's first available variant
   (exactly what `handleSelectSwap` already does).

`StackSlotEntry` gains `pinnedByUser?: boolean`, set in `handleSelectSwap`
(a manual swap pins) and in `addBoosterSlot` (`addedByUser` already implies it).

**Re-pricing is free**: `planTiers` and `calculatePricing` both read the
blueprint's current `selectedProductId`, so a format change reprices through the
existing path and the tier selector updates itself. Nothing new to wire.

### A.4 Files touched

| File | Change |
|---|---|
| `lib/quiz-flow.ts` | Delete the `formats` step def. Keep `StepId` narrowed — it is a union, so the compiler finds every reader. |
| `components/scroll/Act2Quiz.tsx` | Delete the `formats` render branch (`:1621`) and the review-summary row (`:982`). Move `FORMAT_DATA` to `lib/catalogue/formats.ts` as `FORMAT_CHOICES` (label + sub + icon), now shared with the results page. |
| `lib/quiz-sell.ts` | `STACK_FACTS.formats` — the subscribe-&-save tidbit — rehomes to `supps`, the last step before review. |
| `lib/types.ts` | `preferredFormats: string[]` → `preferredFormats: FormatChoice[]`. Same field, set post-quiz instead of mid-quiz. |
| `lib/stack-blueprint/factory.ts` | Keep the soft `formatMismatch` score — it now only ever fires on a *rebuild* (personalise, hub re-recommend) with a preference already set. Rewrite the match to use `matchesFormat`. |
| `lib/stack-blueprint/helpers.ts` | `applyFormatPreference` (above). |
| `components/stack-review/StackReviewPage.tsx` | `FormatPreferenceRow` + state + the unhonoured note. |
| `components/stack-review/ProductSwapModal.tsx` | Format chips over the alternatives list. |
| `app/api/generate-identity/route.ts` | `:51` reads `preferredFormats` for the prompt. It runs *before* the results page now, so it always reads `[]`. Drop the line rather than send "no preference" to the model as if it were an answer. |
| `e2e/support/quiz.ts` | Drop `'What formats do you prefer?'`. |
| `lib/__tests__/quiz-flow.test.ts`, `quiz-sell.test.ts`, `lqd.test.ts` | Step counts drop by one on both tracks (`7 → 6` wellbeing); the LQD assertions that `formats` is dropped in drinks mode become moot and are deleted. |

### A.5 What could go wrong

- **A format change that empties the stack.** It cannot: step 3 keeps the
  current product rather than removing the slot. Test: for every profile in the
  `PROFILES` fixture × every format choice, slot count is unchanged.
- **A format change that breaks a tier's price band.** It can — swapping to
  capsules can be dearer. This is correct behaviour (the member chose it), and
  the tier selector reprices live. The bands are a *build-time* target, not a
  cage the member is kept in.
- **Losing a preference on a rebuild.** `preferredFormats` lives in the same
  quiz store as everything else, so it survives the reveal and reaches checkout.
  The hub's re-recommend path should read it too — filed as follow-on, not in
  this change.

---

## B. Short names, and a button that writes them all

### B.1 The concept

A product has two names and today only stores one.

- **`title`** — the full, unambiguous name. What goes on a receipt, an order
  confirmation, a dispute. `"Applied Nutrition Critical Whey Protein Isolate
  Chocolate Fudge 900g"`.
- **`shortName`** — what it is called when there is no room. `"Whey Isolate"`.

The share card is where this stops being cosmetic. `share-card/format.ts:333`
builds the poster's spec table as `specRows: shown.map(row => ({ name:
row.product, qty: row.dose ?? '' }))`, and `payload.ts:241` fills `row.product`
with `product.title.replace(/^CHRGD\s+/i, '')`. That single `replace` is the
entire current answer to "make the name fit", and it only works because every
mock product happens to be called `CHRGD Something`. Point it at a real
PowerBody title and the poster row runs off the card.

### B.2 The field

```ts
/**
 * The name for tight spaces — the poster's spec table, a product card, a
 * receipt line in the hub.
 *
 * Two or three words, no brand, no size, no flavour. Absent means nobody has
 * written one: `shortNameOf()` derives one from the title, so a missing short
 * name is never a missing name.
 *
 * Deliberately NOT used on order confirmations or emails. Those are records of
 * what somebody bought, and "Whey Isolate" is not enough to identify a tub in
 * a dispute. Full `title`, always, on anything with a price next to it that
 * leaves the site.
 */
shortName?: string | null
```

### B.3 `lib/catalogue/short-name.ts`

Two functions, and the split matters:

**`deriveShortName(product): string`** — deterministic, no network, always
returns something. Strip a leading brand token (`CHRGD`, and the first word when
it matches a known supplier brand list), strip trailing size/quantity
(`/\b\d+\s?(g|kg|ml|l|caps?|capsules?|tabs?|tablets?|servings?)\b.*$/i`), strip a
trailing flavour after a dash, collapse to at most three words, title-case, cap
at 24 characters. This is the fallback and the floor: **the AI pass is an
improvement on this, never a prerequisite for it.**

**`aiShortName(product): Promise<ShortNameResult>`** — one OpenAI call, modelled
directly on `rewrite-description.ts`, which is the house pattern for "a model
wrote this, now prove it is safe":

1. **Claim safety is a gate, not an instruction.** Run `claimFlags()` from
   `lib/shop/claim-safety` over the answer. `"Sleep Fixer"` is a health claim in
   two words and is exactly the kind of thing a model reaches for when asked to
   be punchy. Flagged → throw it away, use the derivation.
2. **Grounded, never invented.** Every content word in the answer must appear in
   the product's `title`, `description` or `category`. A model that renames
   `"Marine Collagen Peptides"` to `"Glow Complex"` has invented a product name,
   and it would then be the name on a public poster. Ungrounded → discard.
3. **Length is a hard check**, not a request: ≤ 24 characters, ≤ 3 words.
4. **Always degrades** to `deriveShortName`. No key, timeout, empty answer,
   refusal — every path returns a usable name.

Return `{ shortName, source: 'ai' | 'derived', reason?, flags? }` so the founder
UI can say *why* it fell back, the way `DescriptionCleanupPanel` already does.

**`shortNameOf(product): string`** — `product.shortName?.trim() ||
deriveShortName(product)`. The only function the rest of the app calls.

### B.4 The founder-facing button

**API** — `src/app/api/portal/product-short-names/route.ts`, a near-copy of
`product-descriptions/route.ts` (same auth guard, same `syncPortalRuntime()`,
same `maxDuration = 300`, same `MAX_BATCH = 25`):

- `GET` → free scan, no API calls: `{ total, withShortName, missing, overlong,
  candidates: [{ id, title, current, derived }] }`.
- `POST { ids, ai }` → writes via `setProductOverride(id, { shortName })` and
  returns before/after for each, plus the fallback reason where one applied.

`ProductOverrides` is `Record<string, Partial<CatalogueProduct>>` already, so
persistence needs no schema change at all.

**UI** — `src/components/portal/ShortNamePanel.tsx`, sitting beside
`DescriptionCleanupPanel`, built from `@/components/system` per `DESIGN.md`:

- A headline: *"18 of 214 products have a short name."*
- **Two buttons, the same split as the description panel.** `Fill from titles`
  is free, instant and always right — the primary action. `Write with AI` costs
  a call per product and is a judgement call about voice — the quieter one.
- Batched at 10, **sequential** (the description panel's comment explains why:
  parallel batches race each other's writes to the same product list and the
  last one in wins), with a progress line.
- A before/after review list. A rewrite you would trust on three products is not
  automatically one you trust on three hundred, so it shows its work.
- Per-product editing in `ProductEditor`, and `shortName` added to
  `REVIEW_FIELDS` in `catalogue/review.ts` as a `CLASSIFIED_FIELD` — it is
  machine-written copy, which is exactly what that list is for.

### B.5 Who reads it

| Surface | Name | Why |
|---|---|---|
| Share card / poster (`share-card/payload.ts:241`) | **short** | The reason the field exists. Replaces the `CHRGD ` strip. |
| `ShopProductCard`, `ProductTile`, `StatCard`, `UpgradesCard`, `AddProductSheet` | **short** | Two-line clamps that currently truncate mid-word. |
| `PlanReceipt`, `SubscriptionJourney`, hub line rows | **short** | Dense lists where the slot label already carries the context. |
| `ShopProductSheet`, `ProductDetailSheet`, swap modal | **full** | You are looking at one product; ambiguity is the enemy. |
| Order confirmations, emails, `lib/notify/*`, `lib/receipt/*` | **full** | Records. Never abbreviate a thing somebody paid for. |
| Founders Hub product lists | **full** | The founder is identifying a SKU. |

A test asserts the notify/receipt paths never call `shortNameOf` — the boundary
is the point of the field, and it is the kind of boundary that erodes silently.

---

## C. Tiers: sized as well as priced

### C.1 Where it stands

`quiz-core/tiers.ts` already made the good half of this change: the **price** is
the fixed thing and the product count is whatever fits. `TIER_PRICE_BANDS` is
`essentials 0–35`, `performance 35–55`, `complete 55–80`, and `TIER_MAX_SIZES`
is `4 / 6 / 8` as a shape backstop.

Two gaps:

1. **No floor on count.** `planTiers` step 1 seeds Essentials with "anchors, or
   the top-ranked product if there are none" — so a wellbeing member whose top
   pick is a £30 product gets a **one-product Essentials**, priced inside its
   band and looking like a mistake. Nothing prevents it.
2. **A band is a range, not a price.** Essentials is £35 for one member and £22
   for the next. That is a large improvement on the £26-vs-£68 it replaced, but
   it is not what "Essentials is one price" means.

### C.2 The change

**Count bands, and a target price.**

```ts
/** The number of products each depth is built to hold.
 *
 *  `min` is a FLOOR, and it outranks the price ceiling: a depth below its floor
 *  is not a cheaper stack, it is a stack that isn't one. `max` is the shape
 *  backstop `TIER_MAX_SIZES` already was. */
export const TIER_SIZE_BANDS: Record<StackLevel, { min: number; max: number }> = {
  essentials:  { min: 2, max: 3 },
  performance: { min: 3, max: 4 },
  complete:    { min: 4, max: 6 },
}

/** Each depth's headline monthly price — what the fill AIMS for, rather than
 *  the ceiling it must merely stay under. */
export const TIER_PRICE_BANDS: Record<StackLevel, { min: number; target: number; max: number | null }> = {
  essentials:  { min: 22, target: 29, max: 35 },
  performance: { min: 35, target: 45, max: 55 },
  complete:    { min: 55, target: 68, max: 80 },
}
```

`TIER_MAX_SIZES` is absorbed into `TIER_SIZE_BANDS.max` and deleted — one
concept, one home.

**`planTiers` fill changes in three places:**

1. **Step 1 gains a floor pass.** After anchors, keep adding by rank until
   `picked.length >= size.min`, *ignoring the price ceiling*. This is the
   licensed overshoot, and it is licensed for the same reason the anchor
   overshoot already is: a required thing that costs more than the band is still
   required.
2. **Step 2 aims rather than fills.** Today: add by rank while under `band.max`.
   Instead: of the candidates that keep the total ≤ `band.max` and the count ≤
   `size.max`, add the one that brings the total **closest to `target`**, and
   stop once adding anything would move it further away. This is what turns a
   range into a price — the same £29-ish Essentials for everyone the catalogue
   allows it for.
3. **Step 3's distinctness bump respects `size.max`.** Today it can push a tier
   past its cap to avoid a duplicate row. With floors in place the fold in step 4
   is the better answer: if a tier cannot be distinct without breaking its own
   shape, it should not be shown at all.

**Precedence, stated once so it is not re-decided per bug:**

> `size.min` **>** `price.max` **>** `size.max` **>** `price.target`

A tier reaches its product floor even if that costs more than its ceiling; it
respects its ceiling before its count cap; and the target is an aim, not a rule.

### C.3 "Complete is 3+ but more premium" — the open question

Read literally, this collides with an invariant the tests lock:

> **Nested.** Each depth contains everything the depth below it has.

If Complete can hold the *same count* as Balanced but be "more premium", then
Complete is not Balanced-plus-more, it is Balanced-with-substitutions. Two ways
to give the founder what they asked for:

**Design A — premium by depth and by rate (recommended first).**
Complete is 4–6 products against Balanced's 3–4, and its extra premium is (i) the
deeper subscribe-&-save rate it already carries (20% vs 15% vs 13%, from
`PRICING_CONFIG.levelSubscriptionDiscount`) and (ii) a fill that prefers high
`recommendationPriority` products once past the floor. Nesting is untouched, the
existing test suite holds, and it is roughly 40 lines in `tier-plan.ts`.

**Design B — premium by substitution (second phase, behind a flag).**
Complete gets an upgrade pass: for each slot it shares with Balanced, if the swap
group holds a higher-priority product and the budget allows, take it. Complete
then covers the same *jobs* with better *products*, which is what "more premium"
most naturally means.

The cost is real and worth stating: the nesting invariant weakens from
**"contains every slotId below"** to **"covers every slotType below"**, and
`tiers.test.ts` changes with it. A member comparing Balanced and Complete would
see a product *change*, not just products *added* — which needs a line of UI copy
("Complete upgrades your protein to …") or it reads as a bug.

**Recommendation: ship A, then evaluate B against a real catalogue.** A is the
part the founder unambiguously asked for and the part that cannot regress
anything. B is a genuine product decision that wants a look at real numbers, and
it is much easier to judge once A has fixed the floors.

### C.4 Founder control

The bands are compile-time constants today, and `planTiers` already accepts
`bands`/`maxSizes`/`minStep` as parameters — the seam is cut, nothing flows
through it. Move them into `PRICING_CONFIG` (so they inherit the existing
`setPricingOverrides` / `getPricingOverrides` persistence in
`portal/store.ts`), and add a **Tiers** panel to `/founderhub/pricing` alongside
`CustomerRates` and `LadderPanel`: three rows of *min products / target price /
max price*, with live validation — overlapping bands, a target outside its own
band, a floor above its own cap.

### C.5 Tests

`stack-blueprint/__tests__/tiers.test.ts` already runs twelve real quiz profiles
through the bands. It gains:

- Every plan holds at least `TIER_SIZE_BANDS[level].min` products, for every
  profile — the assertion whose absence is the bug.
- Every plan lands within a stated tolerance of `target` **or** documents which
  of the precedence rules pushed it out. A tolerance test that can only be
  satisfied by a lucky catalogue is a flaky test; the escape hatch has to name
  the reason.
- The precedence order itself, on a constructed catalogue: an expensive-anchor
  stack overshoots its ceiling to reach its floor, and never the reverse.
- `TIER_MIN_STEP` folding never yields a shown tier below its own floor.

---

## Sequencing

Six pull requests, each independently shippable and independently revertible.

| PR | Contents | Risk |
|---|---|---|
| **1** | §0 — canonical formats, normalisation at every import boundary, mock catalogue rewritten, migration test. No user-visible change. | Low. Pure refactor, guarded by a test that fails if any path forgets. |
| **2** | §B.2–B.3 — `shortName` field, `short-name.ts`, `shortNameOf`, poster + card consumers. No AI yet, derivation only. | Low. Every surface has a working fallback from the first commit. |
| **3** | §B.4 — the API route, `ShortNamePanel`, `ProductEditor` + `REVIEW_FIELDS`. The AI button. | Low. Founder-only, gated behind portal auth, degrades without a key. |
| **4** | §C.2 + §C.5 — size bands, target-seeking fill, precedence, tests. Design A only. | **Medium — the one that moves money.** Every member sees different tier contents and prices. Wants a before/after run of the twelve profiles in the PR body. |
| **5** | §A — remove the quiz step, `applyFormatPreference`, the results-page control, e2e and step-count test updates. | Medium. Touches the funnel; the e2e quiz spec is the safety net. |
| **6** | §C.4 — tier bands into `PRICING_CONFIG`, Tiers panel on `/founderhub/pricing`. | Low. Exposes existing numbers; changes no default. |

**PR 1 before PR 5** is the only hard ordering constraint — the format control is
the thing that turns the taxonomy fault into a visible bug. PR 4 before PR 5 is
worth having too: both change what the results page shows, and debugging them
separately is much cheaper than debugging them together.

## Verification, per PR

- `npm test` — the suite is 2,841 tests and both `tokens.test.ts` and
  `tokens-only.test.ts` are enforcement, not convention. Any new component in
  `components/portal` or `components/stack-review` builds from
  `@/components/system` and uses tokens for every value.
- `npm run e2e` — PR 5 changes the quiz's step count, which the quiz spec walks.
- `/styleguide` for PR 3 and PR 6, per `AGENTS.md`.
- PR 4 additionally: the twelve `PROFILES` before and after, as a table in the
  PR body. A pricing change nobody can see the shape of is a pricing change
  nobody can review.
