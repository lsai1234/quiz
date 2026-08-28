# Three changes: format on the results page, product short names, sized tiers

Three changes that arrived together and are written up together because two of
them collide in the same file (`quiz-core/tiers.ts` and `stack-blueprint/`), and
one of them uncovers a latent fault the other two would inherit.

| # | Change | Why now |
|---|---|---|
| **A** | **The format question is deleted.** No replacement control. | Nobody knows they prefer capsules until they see the powder they'd be sent, so the answer was a shrug or a habit. It fed one soft scoring rule and nothing else. Deleting it is one fewer question and less code than keeping it. |
| **B** | **Every product gets a short name**, with an AI pass that writes one for the whole catalogue in a single button press. | The poster and the cards print `product.title`, and a supplier title is 60+ characters of brand, size and flavour. |
| **C** | **Depth tiers get product-count bands and a target price**, on top of the price bands they already have. | "Essentials" currently has no floor — a member can be shown a one-product Essentials. And a band is a range, so two members still see two prices for the same tier. |

Everything below is written against the code as it stands on
`claude/product-quiz-pricing-plan-81zkr5`.

---

## 0. A dormant fault, deliberately left alone

Worth recording, because it was very nearly this plan's first pull request.

**The catalogue has no format vocabulary.** Four code paths write the `formats`
field and three of them disagree: `mock-catalogue.ts` says `capsules`,
`supplier/mapping.ts` says `capsule`, `roster-import.ts` says whatever the CSV
column said, and the quiz offered `bars`, which no writer has ever emitted. So a
member who picked **Capsules** had no preference applied to any
PowerBody-imported product, and **Bars** matched nothing in the catalogue at all.

This was invisible because format preference was only a soft ± score in
`scoreProduct` — a preference matching nothing simply applied no penalty, and the
stack still looked reasonable. An earlier draft of this plan therefore opened
with a normalisation pass, because a *visible* format filter would have turned
the mismatch into the feature's first bug report.

**§A deletes the preference instead, which deletes the only broken consumer.**
So the normalisation is no longer needed and is not being done. What remains is
cosmetic: `product-facts.ts` renders `formats[0]` capitalised, so a card can read
"Capsule" or "Capsules" depending on where the product came from.

> **If a format filter is ever added to the shop, normalise the vocabulary
> first.** `filters.ts` is unaffected either way — its `RTD_FORMATS` list already
> accepts every synonym, which is why LQD has never suffered from this.

## A. The format question is deleted

### A.1 The concept

Format is not a goal, it is a delivery preference — and it is the one question a
person cannot answer honestly in the abstract. Asked cold on question eleven,
"what formats do you prefer?" gets a shrug or a habit.

An earlier draft moved it to the results page as a live control that re-picked
products inside their swap groups. That is a genuinely better place to ask the
question, and it is still more machinery than the answer is worth: a new
blueprint helper, a pinning flag on every slot so a hand-picked product isn't
overwritten, honest copy for the slots that can't be honoured, format chips in
the swap modal. All of it to serve a preference the member can already act on
directly — **the swap modal has always let anyone change any product in their
stack, and it shows the format on every option.**

So the question goes, and nothing replaces it. One fewer question, one fewer
field, one fewer scoring rule, and a member who wants capsules changes the line
they care about in the place they were already going to change it.

### A.2 What that means in code

Pure deletion. `preferredFormats` has exactly five non-test readers:

| File | Change |
|---|---|
| `lib/quiz-flow.ts` | Delete the `formats` step from `QUIZ_STEPS` and from `StepId`. It is a union, so the compiler finds every reader. |
| `components/scroll/Act2Quiz.tsx` | Delete `FORMAT_DATA`, the `formats` render branch, and the review-summary row. |
| `lib/quiz-sell.ts` | `STACK_FACTS.formats` holds the subscribe-&-save tidbit. Rehomes to `supps`, the last step before review — so the fact survives the step that carried it. |
| `lib/types.ts` + `lib/store.tsx` | Delete `preferredFormats` from `QuizAnswers` and its initial value. |
| `lib/stack-blueprint/factory.ts` | Delete the format-preference block and `SCORING.formatMismatch` with it. Every product is now judged on what it does, not what shape it comes in. |
| `app/api/generate-identity/route.ts` | Drop the `formats` prompt line rather than send "no preference" to the model as though it were an answer. |

Plus `share-card/personas.ts` and roughly fifteen test fixtures that list the
field — mechanical, and the compiler names every one.

### A.3 Test impact

- `quiz-flow.test.ts` — the mode assertion for `formats` goes; the wellbeing step
  count drops from 7 to 6, performance likewise by one.
- `quiz-sell.test.ts` — the two assertions keyed on `formats` move to `supps`.
- `lqd.test.ts` — the assertions that drinks mode *drops* the formats step become
  moot; drinks mode and stack mode now differ by the LQD-only steps alone, which
  is a simpler thing to state and to test.
- `e2e/support/quiz.ts` — drop the `'What formats do you prefer?'` answer.

### A.4 What is lost, honestly

A member who genuinely prefers capsules no longer nudges the engine toward them.
In practice that nudge was `-18` on a mismatch and — per §0 — it never fired at
all for any supplier-imported product, which is most of the real catalogue. What
replaces it is the swap modal, which was always the stronger tool: it changes one
line for certain, rather than tilting a score and hoping.

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

### C.3 "Complete is 3+ but more premium" — DECIDED

Read literally, this collided with an invariant the tests lock:

> **Nested.** Each depth contains everything the depth below it has.

If Complete could hold the same count as Balanced but be "more premium", then
Complete is not Balanced-plus-more, it is Balanced-with-substitutions — a member
tapping up a tier would watch a product vanish and a different one appear.

**Decision: premium by depth and by rate.** Complete is 4–6 products against
Balanced's 3–4, and its extra premium is (i) the deeper subscribe-&-save rate it
already carries — 20% against 15% and 13%, from
`PRICING_CONFIG.levelSubscriptionDiscount` — and (ii) a fill that prefers
high-`recommendationPriority` products once past the floor.

**Nesting is preserved exactly as it stands**, which means the existing invariant
tests keep passing unchanged and the tier selector needs no new copy. Moving up a
tier can only ever add.

The rejected alternative, recorded because it will be proposed again: a premium
*substitution* pass, where Complete takes the higher-priority product in each
shared swap group. It is the most literal reading of "more premium" and it is a
real option — but it weakens the invariant from *contains every slotId below* to
*covers every slotType below*, rewrites `tiers.test.ts`, and needs a line of
on-screen copy ("Complete upgrades your protein to …") or it reads as a bug. Not
ruled out forever; ruled out until the count floors are in and Complete's real
contents can be looked at.

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

Four pull requests, each independently shippable and independently revertible.
The format-normalisation PR an earlier draft opened with is gone — §A deletes the
only consumer that needed it.

| PR | Contents | Risk |
|---|---|---|
| **1** | §A — delete the quiz step, the `preferredFormats` field, the scoring rule and the identity-prompt line. Rehome the subscribe-&-save fact. Update step counts and the e2e answer map. | Low. Deletion only, and the compiler names every reader. |
| **2** | §B.2–B.3 — the `shortName` field, `short-name.ts`, `shortNameOf`, poster and card consumers. Derivation only, no AI. | Low. Every surface has a working fallback from the first commit. |
| **3** | §B.4 — the portal route, `ShortNamePanel`, `ProductEditor` + `REVIEW_FIELDS`. The AI button. | Low. Founder-only, behind portal auth, degrades without a key. |
| **4** | §C — size bands, target-seeking fill, precedence, tests, and the Tiers panel on `/founderhub/pricing`. | **Medium — the one that moves money.** Every member sees different tier contents and prices. |

No hard ordering constraint remains between them. PR 4 is worth landing on its
own rather than alongside anything else, because it is the only one whose effect
is invisible in a diff and visible in a price.

## Verification, per PR

- `npm test` — the suite is 2,841 tests and both `tokens.test.ts` and
  `tokens-only.test.ts` are enforcement, not convention. Any new component in
  `components/portal` or `components/stack-review` builds from
  `@/components/system` and uses tokens for every value.
- `npm run e2e` — PR 1 changes the quiz's step count, which the quiz spec walks.
- `/styleguide` for PR 3 and PR 4, per `AGENTS.md`.
- PR 4 additionally: the twelve `PROFILES` before and after, as a table in the
  PR body. A pricing change nobody can see the shape of is a pricing change
  nobody can review.
