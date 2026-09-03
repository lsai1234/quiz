# Shop search, filters, and five things nobody else has

A build plan for `/shop`. Two halves: **Part A** is search and filtering — the
plumbing, specified tightly enough to build from. **Part B** is five features
that make the shop worth showing someone, specified loosely enough to argue
with.

`docs/SHOP_CONVERSION_BACKLOG.md` (S1–S8) is the neighbouring doc. It covers
trust, availability and checkout confidence. Neither of its items overlap with
search — this is the gap next to it.

---

## Where the shop stands today

`ShopShell.tsx` loads the whole catalogue client-side through
`useCatalogueProducts` → `loadCatalogue()` → `GET /api/catalogue`, which returns
**every sellable product in one response**. That single fact decides most of the
architecture below.

What exists to browse with:

| | Component | What it does |
|---|---|---|
| Dietary chips | `ShopFilterBar` | 7 tags, AND semantics, narrows every shelf |
| Category nav | `ShopCategoryNav` | Sticky jump-nav — *navigation, not filtering* |
| Shelves | `ShopSection` | One horizontal swipe deck per category |
| Deals rail | `merchandising.dealsProducts` | RRP-vs-price, sorted by saving |

What does not exist: any way to type a word. There is no search box, no price
filter, no sort, no stock filter, no way to link someone to a filtered view, and
no `?q=` in the URL. A visitor who arrives knowing they want magnesium has to
guess which of ten shelves it is on and swipe.

### What the catalogue already knows

This is the part worth dwelling on, because it is why our search can be better
than a substring match on a title. Every `CatalogueProduct` carries:

`title` · `shortName` · `description` · `category` · `stackSlots[]` · `goals[]` ·
`dietaryTags[]` · `formats[]` · `swapGroup` · `hasStimulants` ·
`contraindications[]` · `actives[]` (name + mg) · `warnings[]` · `shortReason` ·
`servings` · `consumption` (cadence, servings per unit, anchor) · `effectOnset` ·
`rating` (average + count) · `subscriptionEligible` · `recommendationPriority` ·
`marginPriority` · `topRank` · and per variant: `flavour`, `size`, `price`,
`compareAtPrice`, `available`, `inventory`, `sku`.

So "vegan pre-workout with no caffeine under £30" is not a semantic-search
problem. It is four fields we already hold. Search's job is to translate the
sentence into those fields and show its working.

---

# Part A — Search and filters

## The seven principles

1. **Search is a filter over the catalogue already in memory. No new endpoint.**
   `lib/catalogue/load.ts` exists because the quiz and the reveal reading
   different catalogues produced £0.00 "Product unavailable" cards. A
   `/api/search` would reintroduce exactly that split — a second opinion about
   what is sellable. At the catalogue's real size (tens of products, not
   thousands) a client-side index scores in well under a millisecond.

2. **Search state lives in the URL.** `filters` is component state today, so it
   dies on navigation and cannot be shared, bookmarked, A/B-linked or put in an
   email. `/shop?q=magnesium&d=vegan&sort=price` should restore exactly.

3. **Search answers goal questions, not just name questions.** People type
   "sleep", "something for cramp", "cheap protein", "stim free". The catalogue
   has `goals`, `stackSlots` and `hasStimulants`; a title-only match throws all
   of it away.

4. **A parse is only trustworthy if it is visible and editable.** Whatever we
   infer from a query becomes a removable chip. Never a hidden filter.

5. **Zero results is our failure, not the shopper's.** Every empty state offers
   a spelling suggestion, a one-tap way to relax the narrowest filter, and the
   nearest six products anyway.

6. **Relevance is never sold.** Ranking may use `recommendationPriority`,
   `topRank`, rating and stock as tie-breakers. It must **not** use
   `marginPriority`. A search that puts the profitable answer above the correct
   one is the fastest way to lose the trust the quiz is built on. This is
   asserted in a test, not just written here.

7. **No new dependencies, no new blurred surfaces.** The bundle already carries
   three.js and gsap; a search library on top is not free. And DESIGN.md caps
   glass at three composited surfaces — the sticky nav already spends one.

## New modules

### `src/lib/shop/search.ts` — scoring

```ts
export interface SearchDoc { id: string; fields: Array<{ text: string; weight: number }> }
export interface SearchHit { product: CatalogueProduct; score: number; matched: string[] }

export function normalise(s: string): string          // lowercase, strip accents + punctuation
export function tokenize(q: string): string[]
export function buildSearchDoc(p: CatalogueProduct): SearchDoc
export function buildIndex(products: CatalogueProduct[]): SearchIndex
export function searchProducts(index: SearchIndex, q: string, opts?): SearchHit[]
```

Field weights — deliberate, and the reason each one is there:

| Weight | Fields | Why |
|---|---|---|
| 10 | `title`, `shortName` | They typed the name |
| 8 | `category`, swap-group label | "protein", "creatine" as a section |
| 6 | `goals` labels, `SLOT_LABELS[stackSlots]` | "sleep", "recovery", "hydration" |
| 5 | variant `flavour`, `size` | "chocolate", "500g" are real queries |
| 4 | `dietaryTags` labels, `formats` | "vegan", "capsules" |
| 3 | `actives[].name` | "magnesium glycinate", "beta alanine" |
| 2 | `description`, `shortReason` | Last resort, and noisy — hence 2 |

Matching is **prefix-based** so results narrow while typing ("prot" finds
Protein), with a bonus for a whole-token hit and a bonus for matching every
token. Tie-breaks in order: in stock → `topRank` → `recommendationPriority` →
review count. Never margin.

**Typo tolerance, cheaply.** Damerau–Levenshtein distance ≤ 1 on tokens of 4+
characters, run **only when the exact pass returns nothing**. This keeps
"creatiine" working without letting fuzzy matching pollute queries that were
already fine.

### `src/lib/shop/synonyms.ts` — how people actually talk

Two tables, deliberately separate.

**Expansions** add tokens: `pwo | pre workout | preworkout → pre-workout`;
`salts | electrolyte → hydration`; `gains | bulk | mass → muscle-gain`;
`veggie → vegetarian`; `shake → powder`.

**Intents** set structured state rather than text: `no caffeine | caffeine free
| stim free → stimFree: true`; `cheap | budget | under a tenner → sort: price
asc`; `on offer | sale | deal → onDealOnly: true`; `in stock → inStockOnly`;
`£30 | under 30 | 30 quid → priceMax: 30` (a small numeric parser).

Every phrase in both tables is run through `isClaimSafe()` in a unit test. A
synonym is copy: the day someone maps "hangover cure" to electrolytes, we have
published a medical claim in a lookup table where no copy review will ever find
it.

### `src/lib/shop/shop-query.ts` — the filter model

Named to avoid confusion with `lib/catalogue/filters.ts`, which is the *engine's*
filtering and must not grow a shop UI concern.

```ts
export interface ShopQuery {
  q: string
  dietary: DietaryTag[]      // AND — matches today's behaviour
  categories: string[]       // OR within the facet
  goals: Goal[]              // OR
  formats: string[]          // OR
  priceMin: number | null
  priceMax: number | null
  stimFree: boolean
  inStockOnly: boolean
  onDealOnly: boolean
  subscribable: boolean
  minRating: number | null
  sort: 'relevance' | 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'saving'
}

export const EMPTY_QUERY: ShopQuery
export function isEmptyQuery(q: ShopQuery): boolean
export function activeFilterCount(q: ShopQuery): number
export function applyShopQuery(products, index, q): CatalogueProduct[]
export function facetCounts(products, q): FacetCounts
```

**AND across facets, OR within one.** "Vegan + Gluten-free" means both (today's
semantics — changing it would silently alter results for anyone who has learned
the current behaviour). "Protein + Hydration" means either.

`facetCounts` is the detail that decides whether filtering feels good: each
facet's counts are computed with **its own constraint removed**, so the panel
never shows a "Vegan (0)" you can't escape from. Cheap at this catalogue size,
and the thing people notice without being able to name.

There is no "Newest" sort, because `CatalogueProduct` has no created-at field.
Adding a fake one would be worse than the gap.

### `src/lib/shop/query-url.ts` — deep links

Short keys so the URL stays readable: `q`, `d`, `c`, `g`, `f`, `min`, `max`,
`stim`, `stock`, `deal`, `sub`, `r`, `sort`. `decodeShopQuery` must **never
throw** — an unknown key is ignored, a malformed value falls back to
`EMPTY_QUERY`. Someone will hand-edit this URL.

## Components

Built from `@/components/system` (`Input`, `Button`, `Badge`, `Modal`,
`Checkbox`, `Segmented`) per DESIGN.md, and tokens only.

| File | What it is |
|---|---|
| `ShopSearchBar.tsx` | The input. **Merged into the existing `ShopCategoryNav` sticky row** — two stacked sticky bars eat a third of a 360px viewport. Combobox role, clear button, `/` and `⌘K` focus on desktop. |
| `ShopSearchSuggestions.tsx` | While typing: top 5 products (thumb, title, price), then jump rows ("Vegan · 12 products"), then recent searches (localStorage, 5 max, clearable). Full keyboard nav. |
| `ShopFilterChips.tsx` | Replaces `ShopFilterBar`. Active filters as removable chips + a `Filters (3)` button. |
| `ShopFilterSheet.tsx` | Bottom sheet with the full facet set and live counts. Sticky footer: `Show 14 results` / `Clear all`. |
| `ShopResultsGrid.tsx` | A 2-column grid, reusing `ShopProductCard`. A horizontal swipe deck is the wrong shape for a result set. |
| `ShopNoResults.tsx` | "Did you mean creatine?" → relax-a-filter chips → nearest six products. |

## Wiring into `ShopShell`

The shell gains one reducer and two modes:

- **Browse mode** (`isEmptyQuery`) — today's page, unchanged. Hero, trust strip,
  bundles rail, deals rail, category shelves. Nothing regresses.
- **Results mode** — hero collapses, shelves are replaced by one grid, header
  reads `14 results for "vegan protein"` in an `aria-live="polite"` region.

Debounce `q` at 250ms, wrap results in `useDeferredValue`, and sync the URL with
`router.replace(..., { scroll: false })` so search does not fill the back stack
one keystroke at a time.

Bundles participate: in results mode, match bundles on name and constituent
products and show matching bundles above the grid. A search for "recovery"
should surface the Recovery Stack.

## Analytics

Add to `SHOP_EVENTS` in `lib/analytics/events.ts` (and to `events.test.ts`,
which asserts the list):

| Event | Payload | Why it earns its place |
|---|---|---|
| `shop_search` | `q`, `results`, `has_filters` | Baseline usage |
| `shop_search_zero` | `q` | **The merchandising goldmine** — what people ask us for that we don't stock |
| `shop_search_select` | `q`, `id`, `rank` | The only real measure of relevance |
| `shop_filter_apply` | `facet`, `value`, `on`, `results` | Which facets are worth keeping |
| `shop_sort_change` | `sort` | Ditto |

The query is free text a human typed, so it gets treated as such: normalised,
truncated to 64 characters, and dropped entirely if it matches an email or a
long digit run. `/api/analytics` takes no PII today and this must not be the
thing that changes that.

## Performance

Build the index once per catalogue load, `useMemo`-keyed on product count plus a
cheap id fingerprint. Scoring is O(products × tokens) over tens of products —
sub-millisecond, no worker, no index library. If the catalogue ever passes ~2,000
products this decision is worth revisiting, and only then.

## Testing

**Unit** — `search.test.ts`: tokenisation, prefix matching, weight ordering,
synonym expansion, intent extraction (`"stim free"` → `stimFree: true`), typo
fallback firing *only* on zero results, and an explicit assertion that a
high-`marginPriority` product does not outrank a better textual match.
`synonyms.test.ts`: every phrase passes `isClaimSafe`. `shop-query.test.ts`:
facet counts exclude their own facet, AND/OR semantics, sort stability.
`query-url.test.ts`: round-trip, unknown keys ignored, malformed input never
throws.

**Component (RTL)** — typing shows suggestions; Enter commits; Escape clears;
the result count is announced.

**E2E** — extend `e2e/specs/02-shop.spec.ts`: search narrows the page; a deep
link `/shop?q=protein&d=vegan` restores state on load; the zero-results state
recovers into an add-to-basket; the filter sheet applies and clears.

**A11y** — keyboard-only path from search box to basket; combobox roles;
`prefers-reduced-motion` respected in the results transition.

## Phasing

| Phase | Scope | Shippable alone? |
|---|---|---|
| **SS1** | `search.ts`, `synonyms.ts`, `shop-query.ts` + tests; search bar; results grid; zero state | **Built** — see below |
| **SS2** | Filter sheet with live facet counts, sort, chips, URL deep links, analytics | **Built** — see below |
| **SS3** | Suggestions dropdown, recent searches, typo tolerance, `⌘K` | **Built** — see below |
| **SS4** | The features in Part B, individually | Each on its own |

Rough sizing: SS1 a day, SS2 a day, SS3 half a day.

## What the build changed about this plan

Three things came out differently in the build, and the reasons are worth
keeping.

**The browse/results switch is not `isEmptyQuery`.** The plan had any active
filter flipping the page into a results grid, which would have been a regression:
the dietary chips have always narrowed every shelf *in place*, and that works.
`needsResultsView()` is the real switch — dietary filters keep you on the
shelves, and text, price, sort, stock, deals or a category selection move you to
the grid, because those are what a horizontal deck genuinely cannot express.

**A dietary word is removed from the search text, not kept.** The plan argued for
keeping "vegan" in the text so a product titled "Vegan Protein" still matched.
In practice that double-counted: the word matched the product's own dietary tag
as *text* while the filter was already enforcing it, so "vegan protein" returned
every vegan product in the shop rather than the vegan proteins. The tag is the
source of truth for the question; a title that claims it without the tag behind
it is a catalogue bug, not a match.

**The search bar is a plain `type="search"`, not a combobox.** `role="combobox"`
without a listbox promises a keyboard contract to a screen reader that nothing
can honour. The combobox semantics land in SS3, with the suggestion list they
describe.

One smaller one: the empty state's reset is labelled **"Start over"** rather
than "Clear search", because the input already has a Clear button and two
controls sharing a name in one view is a real ambiguity.

### SS2

**One control row, not two.** The plan had `ShopFilterChips` replacing
`ShopFilterBar`, which would have demoted the dietary chips — by far the
most-used filter, and the one the shop already had — from one tap to two. Instead
`ShopFilterBar` grew into the whole control row: `Filters (n)` · sort · what your
search implied · what you set · the dietary quick-toggles, in one scrolling line.
It sits inside the sticky bar with the search box above it and the category chips
below, which is the order the page reads in.

**The URL is synced through `window.history`, not `router.replace`.** Two
reasons, both concrete. `/shop` is a statically rendered route, and
`useSearchParams` inside it forces the whole shell behind a Suspense boundary;
and `router.replace` fetches an RSC payload on every call, which for a query that
changes as you type is a request per settled keystroke to learn nothing.
`replaceState` also keeps typing "magnesium" from leaving nine history entries
between the shopper and wherever they came from.

**An inferred chip is removed by editing the search text.** Dismissing "Vegan" on
a search for "vegan protein" deletes the word from the box (`stripPhrase`) rather
than suppressing the rule behind the scenes. Suppression would leave a hidden
piece of state contradicting text the shopper can read.

**The filter sheet applies live.** It covers the results, so the footer count is
the feedback — "Show 23 results" answers "did that do anything" as you tap. A
draft-then-apply model would leave that button lying until you committed. A
side-effect worth knowing: because a zero-count option is disabled, no sequence
of taps in the sheet can reach an empty shop; only the price box can.

**A bare `£30` still sets no price bound** — reversing what the SS1 note implied.
Visibility makes a guess *correctable*, but that was never the only test: the
guess also has to be right more often than not, and "protein £30" means "around
£30" at least as often as "under £30". A removable chip is not a reason to add a
filter nobody asked for.

### F2 — split in two, and the gap half deliberately declawed

**Coverage went to the basket drawer, not a floating ring.** The plan wanted a
persistent collapsible ring on the shelf. The bottom of a phone already carries
the compare tray, a suggestion and the basket bar; a fourth would be one too
many. The drawer is also where the reading belongs — it is about what you have,
and it is the last look before paying.

**The overlap half travels separately, as a nudge, and outranks everything.**
`bestNudge` now returns an overlap before a bundle or the delivery ladder. A shop
that would rather sell a bundle than mention you are buying magnesium twice has
answered what it is for, and answered it badly. It renders without the accent and
with nothing to tap, because it is information rather than an offer.

**"Nothing for hydration" is a fact; "you need hydration" is a pitch.** The plan
framed uncovered slots as gaps to close. We know nothing here about who is
shopping — the quiz is the thing that asks — so coverage is stated as a map:
what is in the basket, what is not, and an uncovered slot offered as somewhere to
look rather than something missing from their life. Slots the shop sells nothing
for are omitted entirely: a dead end is not information.

**The overlap sentence is arithmetic, never advice.** It says what is in the
basket and what the labels add up to. No dose is called too much, nothing is
called unsafe, nobody is told to stop — all three are claims, and a test asserts
the sentence stays clear of them as well as passing `isClaimSafe`. It also
withholds the total rather than understating it when a product does not state its
dose, because low is the one direction that figure must never round.

This added a `slots` facet to `ShopQuery` so tapping an uncovered slot filters
the shop exactly. It is set by the radar rather than the filter sheet — slots and
goals overlap heavily and a panel offering both asks the same question twice —
but it shows as a removable chip and clears with Clear all like any other.

### F3 — "the data is entirely in place" was not quite true

Price per serving was the headline of this feature, and computing it the obvious
way would have got it **backwards**.

`servings` is a PRODUCT field describing one container — in practice the first
variant — while the catalogue is full of products sold in several sizes:

| | `servings` | variants |
|---|---|---|
| Whey | 30 | 1kg £34.99, **2kg £59.99** |
| Omega-3 | 90 | 90 softgels £14.99, **180 £26.99** |
| Vitamin D3 + K2 | 60 | 60 caps £12.99, **120 caps £22.99** |

`variant.price / product.servings` prices the 2kg tub at £2.00 a serving against
the 1kg tub's £1.17 — declaring the bigger tub *worse* value. A headline number
that is confidently inverted is worse than no number.

`per-serving.ts` therefore scales servings by container size, on the one
assumption that holds within a single product: the same product at a different
size is taken at the same dose. Across different products no such assumption is
made. Where a size cannot be read, or two sizes are not the same unit, it returns
null and the sheet shows an em dash — silence is the right answer to a question
we cannot answer.

**And a consolation has to be true.** Every scored row was carrying a note
naming what the losing column is better for — "Costs less up front", "May go
further per serving". Rendering the sheet showed Vitamin D3 (22p a serving,
£12.99) beating a multivitamin (57p, £16.99) on *both* money rows, with both
consolations still printed and both false. They are now conditional on the
figures, and when one product simply wins on the money there is no consolation
at all. Boilerplate reassurance is how a comparison starts lying.

Smaller ones: a row is only scored where "better" is a fact, so format, dietary,
onset and actives carry both values and no crown — crowning a preference invents
a verdict. A crown is named in text as well as coloured, so it survives without
the accent. Both products are compared at the variant the shelf card prices. And
picking a third product replaces the oldest rather than being refused, because a
control that silently does nothing reads as broken.

Two a11y bugs of the same family as SS2's and SS3's, found by driving the real
page: the sheet scrim and the header button shared the name "Close comparison"
(so did the filter sheet's, from SS2 — both scrims are now unlabelled divs, since
the header button and Escape are the real ways out), and the two "Add" buttons
in the duel footer were both just "Add".

### F1 — and a pricing finding worth acting on

**There is currently no bundle in the shop that is cheaper than its own products
bought à la carte.** This surfaced while building the nudge and it changed what
the feature says.

`BundlePriceSummary.saving` — the number behind "Save £6.48 vs buying
separately" on the bundle cards — is `oneOffSubtotal − oneOffTotal`, i.e. the
sum of the parts minus the same sum with the **£50+ bundle tier (8%)** applied.
But `priceBasket` applies that identical tier to the shop basket. So a shopper
who buys the three products loose gets the same 8%, and the "bundle saving" is a
discount they were getting anyway.

The nudge therefore computes its own figure (`bundleEdge`): the bundle price
against the same products priced *through the basket*, so the tier is on both
sides and cancels. Against the live catalogue that comes out at **zero for every
bundle**, and the nudge leads on what the bundle *is* instead — "2 of the 3 in
the Big Night, Big Morning. Add CHRGD Creatine Monohydrate for the full stack."
No invented saving.

Two consequences worth a decision, neither of which this branch takes:

1. **The bundle cards' own "Save £X vs buying separately" is the same
   comparison**, and is arguably misleading for the same reason. Changing it is
   a copy and pricing question for the founder, not a refactor.
2. **If bundles are meant to be cheaper, they are not priced that way.** The
   nudge will start quoting a real saving automatically the day one is, with no
   code change.

Three smaller decisions: a bundle qualifies as "nearly" only when the basket
holds at least as many of its products as it is missing — without that, one whey
protein is "one of the three in the Early Shift" and every basket of one thing
gets a bundle pitched at it. The nudge links out rather than adding to the
basket, because `BundleLandingPage` checks out through `useStackCheckout` and not
the shop basket: adding the missing product would not get the bundle price, and
buying the bundle does not empty the basket — so the copy says bundles are bought
on their own page. And only ONE suggestion shows at a time; the drawer takes
bundles only, since it already draws the delivery ladder itself.

### SS3

**The combobox role arrived with the listbox, as promised.** Through SS1 and SS2
the input stayed a plain `type="search"`; `role="combobox"` promises a screen
reader a popup, arrow keys and an `aria-activedescendant`, and claiming that with
nothing to honour it is worse than not claiming it. The role, the listbox and the
keyboard landed together. (This renamed the role in every test that addressed the
box — `getByRole('searchbox')` became `getByRole('combobox')`.)

**Suggestions are undebounced, unlike results.** They track the BOX, not the
query: a dropdown that lags a keystroke behind the text above it reads as broken,
and the work is a few hundred string comparisons.

**A recent search is recorded when it is ACTED on**, not when it settles — a
product opened, a shelf jumped to, or Enter pressed. Recording every settled
keystroke would fill the list with the prefixes someone typed on the way to the
thing they wanted.

**Recents never leave the device.** `localStorage` only, and deliberately not an
analytics event: a search history in a supplement shop is a list of what someone
thinks is wrong with them, and `shop_search` already answers the only question
the business has, in aggregate, with contact-shaped queries dropped.

**Option names are explicit `aria-label`s.** A product row holds three separate
facts and the gaps between them are flex `gap`, so the browser's default name
came out as "CHRGD Whey ProteinProtein£30.00" — the third time this trap has
appeared in this feature, after the filter chips in SS2. Worth stating as a rule:
in this codebase, a row built from several spans needs its name written down.

**A product suggestion goes straight to its sheet**, and a shelf suggestion
becomes the filter it names and clears the text. Most searches here are for a
thing, so routing the common case through a one-row results grid would add a
step; and a jump that leaves visible, removable state is better than one that
silently re-runs a search.

---

## Two decisions worth making before starting

**SEO.** `/shop` is a client component under a server page with metadata.
`?q=` results will not exist in server HTML. That is fine — search result pages
are not an SEO surface. If ranking for "vegan protein" matters commercially, the
answer is a real category landing page, not making search server-rendered.

**Where search lives.** Recommended: inside the sticky nav row. The alternative
(its own bar above the shelves) is easier to build and costs a permanent band of
vertical space on the phone where most of the traffic is.

---

# Part B — Five features nobody else in this category has

Ordered by how strongly I'd argue for them. Each is buildable from data we
already hold, and each is claim-safe: they talk about slots, doses on the label,
price and format, never about outcomes.

## F1 — Basket Alchemy
**Live bundle discovery as the basket fills.**

`BasketDrawer` already runs a free-delivery progress bar
(`qualifiesForFreeDelivery`, `£X away from free delivery`). It is the right idea
in the wrong place and doing only half the job: it lives behind a tap, and it
only knows about postage.

Two extensions:

**It knows about bundles.** We hold curated bundles with blueprints
(`bundle.blueprint.slots`) and a real pricing engine (`priceBasket`). Nothing
compares the basket against them. Detect when a basket is **one or two products
short of a real bundle** and say so, once, dismissibly:

> Add Magnesium and this becomes the **Recovery Stack** — £6.40 less than buying
> the three separately.

**It works while you shop, not only at the till.** The threshold line lives in
the drawer, where the decision has already been made. Promote a slim version into
the existing sticky basket bar on the shelf, where there is still something to
add.

Every number comes from the real engine, so it cannot over-promise, and the
bundle it names is one we genuinely sell at that price.

*Why first:* clearest revenue case (basket size), smallest new surface area, no
new data — most of the pricing work is already written and just needs a second
caller.

## F2 — Stack Radar
**Build a stack from the shop, with honest gap and overlap detection.**

The quiz thinks in `StackSlot`s. The shop does not — it is a wall of products.
Give the shop a persistent, collapsible ring that fills as you add things, drawn
on the axes `selectShopAxes()` already computes and the `ChargeMeter` primitive
already renders.

Two things it says that no supplement shop says:

- **Gaps, structurally.** "Protein and performance covered. Nothing for
  hydration." Tap the gap → the shop filters to that slot.
- **Overlaps, honestly.** Read `actives[]` across the basket: *"Both of these
  give you 5g creatine — you probably only need one."* Telling someone to buy
  less is the single most trust-building thing a supplement shop can do, and we
  are one of very few that hold the ingredient data to do it.

*Why:* it is the quiz's intelligence, applied to browsing, for people who will
never take the quiz. Most on-brand item on the list.

## F3 — The Shelf Duel
**Swipe-to-compare, as top trumps.**

`ShopSection` already computes shared stat axes per category and its own comment
says the cards "compare like top-trumps". Make it literal. Tap **Compare** on two
cards → a head-to-head sheet with the winning cell on each row lit:

price per serving · servings per unit · rating · format · dietary · onset window
· key actives · in stock

**Price per serving is the headline.** `variant.price / consumption.servingsPerUnit`
is computable right now, it is the number that actually decides value in this
category, and essentially nobody displays it. A £54 tub can be the cheap one.

The losing column is never disparaged — each row ends "…better if you want X".
A gsap card-flip makes it feel like a duel; reduced motion gets a straight
reveal.

*Why:* the data is entirely in place. Cheapest of the five to build.

**Built.** With a correction to that claim — see below.

## F4 — Say It, Don't Sort It
**The intent bar: type a sentence, get a shelf.**

The marquee version of Part A. Type or dictate:

> vegan, no caffeine, under £30, something for sleep

and the shop rebuilds as a custom shelf with the parse shown as **editable
chips**: `Vegan ×` `Stim-free ×` `Under £30 ×` `Sleep ×`. Tap a chip to drop it
and watch the shelf change.

The common cases need no AI at all — that is what `synonyms.ts` is. Long or odd
queries can fall back to a server call in the shape of `/api/personalise-stack`,
with the same chips as output so the interface is identical either way.

The reason this beats every "AI search" box on the internet is principle 4: the
machine shows its reading of your sentence and lets you correct it. Most NL
search asks you to trust a black box and start over when it is wrong.

*Why:* the most distinctive thing on the list, but it is only as good as the
synonym table, which is ongoing editorial work. Build SS1–SS3 first; the intent
table will have been half-written by then.

## F5 — Flavour Roulette
**A wheel, with real merchandising behind it.**

Every product has flavour variants. A "Feeling lucky?" pull spins a wheel and
lands on a flavour of a product that matches your **active filters**, at its real
price, with `canvas-confetti` (already a dependency) on the landing.

The novelty is the front; the back is inventory. Bias the wheel toward genuinely
discounted lines, overstocked variants and higher `marginPriority` — this is the
one place margin *may* influence what surfaces, because nobody is asking it a
question. It is a game, not an answer.

Guardrails that keep it honest: it only ever lands on something **in stock** and
**compatible with your dietary filters**, and the price shown is the price
charged. A wheel that lands on something you can't eat is a broken toy.

*Why last:* highest delight-to-utility ratio, and the only one that could read as
gimmicky if the rest of the shop weren't already good. Build it when SS1–SS3 and
F1 are in.

---

## Suggested order

`SS1 → SS2 → F1 → F3 → SS3 → F2 → F4 → F5`

Search first because it is the actual complaint. Then Basket Alchemy and the
Shelf Duel, which are the cheapest wins from data already sitting in the
catalogue. The two big personality pieces — Stack Radar and the intent bar —
after there is a search log (`shop_search_zero`, `shop_search_select`) to tell us
what people were really asking for.
