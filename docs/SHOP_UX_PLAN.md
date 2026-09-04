# Making the shop worth being proud of

A plan, not a patch. Written after a refactor that made the shop *correct* and
*consistent* and left it looking like nobody designed it.

---

## What went wrong, honestly

The last brief was a reduction spec: delete the colours, delete the badges,
delete the bars, delete the borders, one button, two weights. I applied it
literally and it worked — there is now one token layer, one button, one chip,
nine colours, and no stray hex anywhere on the shelf.

And it looks worse, because **reduction alone does not produce beauty. It
produces emptiness.**

The reference that was held up as "way more professional" — the tissue app —
is worth looking at again, because it disproves the thing I assumed. Count what
is on one of its product cards: a photo, a title, a subtitle, a price, a struck
price, a discount badge, a star rating, and three feature pills. That is
**more** information than the card I shipped, not less. What makes it look clean
is not scarcity. It is:

- one focal point per card (the photograph, given real size)
- a strict scan order, enforced by size and weight, not by colour
- everything aligned to one grid
- exactly one accent, used once
- generous space *around* the group, tight space *within* it

I removed information when I should have organised it. That is the error, and
everything below follows from correcting it.

### The specific failures, from the screenshots

1. **The white image plate is the loudest object on the screen.** A hard white
   rectangle butted against a near-black card is the highest-contrast edge in
   the UI, and it is on every card, twice per row. The eye goes to the
   rectangles, not the products.
2. **The whites do not match.** Supplier photos are shot on white but not on the
   *same* white — some are `#fff`, some `#fafafa`, some have a soft gradient or
   a drop shadow baked in. Padding them onto our own white leaves a visible seam
   and a ragged top edge.
3. **A card has no scan order.** Title 15/400, price 15/400, both the same
   colour. Nothing leads, so the eye has to read rather than scan.
4. **Two full-width grey buttons per card.** Eight identical grey rectangles per
   screen. That is what makes it read as a form.
5. **The cards are ~700px tall for four lines of content.** Two products visible
   at a time on a phone. A shelf you cannot scan is not a shelf.
6. **Surfaces barely separate.** `--surface #141619` on `--bg #0A0B0D` is 4%
   apart, and with no border and no shadow a card is a vague region rather than
   an object.
7. **There is no information to choose on.** Two creatines at £18.99 and £29.99
   and nothing on the card explains why. No size, no servings, no per-serving
   price, no rating, no form.
8. **Zero icons and zero imagery outside the product photos.** The hero is four
   grey boxes of grey text.
9. **Two floating bars stack at the bottom** — the compare tray and the basket
   bar — over browser chrome, taking ~200px of a 844px viewport.
10. **Mono at body size reads badly.** `£18 . 99` — Geist Mono's digit advance
    is wide and the gaps are visible. Mono earns its place in a column of
    figures, not on a single price.

---

## Part 1 — Fix the photography. This is the whole game.

Dark-mode retail lives or dies on the cutout, and there are exactly three
honest answers. Pick one and commit; the current state is a fourth thing that
is none of them.

**Option A — key the white out (recommended).** At ingest, flood-fill from the
image border, remove connected near-white to transparency, trim, then composite
onto the card's own surface with a soft contact shadow underneath. Products then
*float* on the dark card. This is what every premium dark storefront does, and
it is the single change that will move this from "coded" to "designed".

The risk is real and manageable: white packaging gets eaten. Mitigations, all
cheap:
- flood-fill from the border only, so an interior white label is never touched
- a tolerance around 8–10% rather than an absolute white match
- a bail-out: if more than 55% of pixels would be removed, or if the alpha mask
  touches the image centre, fall back to Option B for that product
- the result is cached per source URL forever, so this runs once per photo

**Option B — a consistent light tile.** Cut-out on a `#F4F5F7` rounded tile,
inset 12px from the card edges, all four corners rounded. Honest, safe, and
still reads as deliberate — but it keeps a bright rectangle on every card.

**Option C — commission or generate a consistent set.** Out of scope now, worth
knowing it is the real answer long-term.

**Also, regardless:** the pipeline needs to actually be running in production.
The gate is now catalogue-membership rather than a hostname list, so it should
be; the way to confirm is the `X-Image-Cache` header on `/api/product-image`.
If that header is missing, the browser is loading the supplier's URL directly
and nothing below will look right.

**And a spotlight.** Even keyed out, a product on a flat dark card floats in a
void. A very soft radial gradient behind the product — 8% white at the centre,
transparent by 70% — gives it a ground to sit on. This is the one exception I
would carve out of "no gradients", and it is worth arguing for.

---

## Part 2 — Rebuild the card around a focal point

At 390px with 16px gutters and a 12px gap, a card is **173px wide**. Every
number below is chosen for that width.

```
┌─────────────────────────┐
│                         │
│      [ product ]        │  173×173, keyed, spotlight behind
│                         │
├─────────────────────────┤  12px padding from here
│ SCITEC NUTRITION        │  10px / 500 / +0.08em / dim / 1 line
│ 100% Creatine           │  13px / 500 / --text / 2 lines clamped
│ Monohydrate             │
│ 500g · 100 servings     │  11px / 400 / dim
│ ★★★★☆ 124              │  11px, stars are icons
│                         │
│ £18.99      £0.19/serv  │  15px/500 --text  ·  11px dim
│                    (+)  │  32px circular add, bottom-right
└─────────────────────────┘
```

Height lands around **300px**, so two and a half rows are visible instead of
one. That is the difference between browsing and scrolling.

**What changed and why:**

- **Padding 12px, not 20px.** 20px was specced for a card and is right for a
  full-width one; at 173px it leaves 133px of content and everything wraps.
- **A brand line.** There is no `brand` field on `CatalogueProduct` today — it
  needs adding to the supplier mapping (PowerBody sends it). This is the single
  highest-value new field: it is how people actually scan a supplement shelf.
- **Size and servings.** Already on the variant (`size`) and the product
  (`servings`). Costs one line and answers the "why is one £11 more" question.
- **Per-serving price.** `lib/shop/per-serving.ts` already computes this
  correctly, including scaling by container size. It is the most useful number
  in the category and it is currently computed and never shown.
- **Rating back, as stars.** Not for social proof theatre — because five small
  gold shapes are the only visual texture in the text block, and because it is
  a real differentiator between two creatines.
- **One action, and it is an icon.** A 32px circular `+` bottom-right. Full-width
  grey buttons are what make the grid read as a form. The whole card is already
  a link to the product page; Add is the one thing that must not be.
- **Compare comes off the card entirely.** See Part 6.

---

## Part 3 — Make the surfaces actually separate

- Raise `--surface` from `#141619` to about `#17191D` and add a **1px inner
  hairline at 6% white on the top edge only**. Not a border — a lit edge. It is
  the cheapest way to make a card read as an object without a shadow.
- Card radius up to **20px**. 16px on a 173px card reads as a rounded rectangle;
  20px reads as a physical tile.
- Grid gap **12px**, gutter **16px**. Currently both 16px, which makes the
  columns feel disconnected from the page.

---

## Part 4 — Give people something to browse

A shop is satisfying to browse when scanning is rewarded. Right now every card
gives the same four facts, so there is nothing to scan *for*.

- **Sort and filter that change the view visibly.** "Price low to high" should
  visibly reorder with a short transition, not just repaint.
- **A per-serving toggle** in the section header — "show price per serving" —
  flips every card's price line. One tap, whole shelf re-frames. This is a
  genuinely novel, genuinely useful control for a supplement shop, and the maths
  already exists.
- **Section headers that do work:** a small category glyph, the name, the count,
  and a "See all →" that filters to that category. Currently just a name and a
  count in grey.
- **Deals shelf gets the struck price back**, as `£24.99` struck + `£18.99`.
  I removed it; it is a fact about the price, not a badge, and it is the main
  reason someone scans a deals rail.

---

## Part 5 — Icons and imagery

The complaint "loads of text in boxes and not enough other things" is exactly
right. The app has an icon set (`QuizIcon`) and uses none of it in the shop.

- **Category chips get glyphs.** Protein, creatine, hydration, sleep — each has
  a slot glyph already defined in `lib/catalogue/slot-visuals`.
- **Trust line gets three small icons** rather than being a run-on sentence.
- **Stars for ratings**, as above.
- **Empty and zero-result states get an illustration**, not a paragraph.
- **The roulette gets its dice/reel glyph back** on the control.

Icons at exactly two sizes — 14px inline, 20px standalone — and always
`--text-dim` unless they are inside an accent fill.

---

## Part 6 — Chrome: one bar, one job

- **Never two floating bars.** The compare tray and the basket bar currently
  stack. The compare tray becomes a **small pill** ("2 selected · Compare") that
  sits *above* the basket bar only while a duel is being assembled, at 36px, or
  better: it replaces the basket bar's content temporarily.
- **Compare leaves the card.** A "Compare" toggle in the section header puts the
  shelf into selection mode: cards get a checkbox affordance, the tray appears,
  and it exits on done. The duel survives, the shelf stops carrying eight grey
  buttons. This is the right answer to the tension we ran into.
- **The basket bar is the one primary.** Keep it accent-filled, 52px, with the
  item count and total.
- **Sticky category bar**: keep, but give it a 1px hairline and let the section
  headings clear it (already fixed at 88px — re-measure once the bar changes).

---

## Part 7 — The hero

Four grey boxes of grey text is the worst screen in the app. Replace with:

1. **One editorial banner** — a real photograph or a rendered stack, full-bleed,
   16:9, with the quiz call to action over it. One image, and the page has a
   reason to exist.
2. **"Shop by goal"** — a horizontal row of 5 circular category tiles with
   glyphs and labels (Muscle, Energy, Recovery, Sleep, Everyday). Tap filters
   the shelf. This is the highest-intent navigation a supplement shop can offer
   and it is currently absent.
3. **Trust as one line with three icons**, 13px dim.
4. **The roulette** as a small labelled control with its glyph, at the end of
   the goal row rather than on its own line.

---

## Part 8 — The details that make it feel finished

- **Image loading**: a 1:1 skeleton at the exact final size, then a 200ms
  cross-fade. No layout shift, ever.
- **Add to basket**: the card's image scales to 0.9 and the basket count bumps.
  It should feel like something happened.
- **Press states**: cards scale to 0.99 on press. Currently only buttons do.
- **Skeletons that match the real layout** — the current one is a different
  shape, so the page jumps when it loads.
- **Scroll restoration** back from a product page to the exact shelf position.
- **`content-visibility: auto`** on off-screen sections; there are 20+ shelves.

---

## Part 9 — Typography corrections

- **Prices in sans with `tabular-nums`**, not mono. Mono stays for the basket,
  the comparison table and the receipt — columns of figures that must align.
- **Type scale needs one more step**: 17px for the product page price and card
  price emphasis. Five sizes is too few; seven is right. (This needs your
  approval — it is a token addition.)
- **Weight 500 for product names**, 400 for meta. Currently names are 400 and
  disappear.

---

## Phasing

**Phase 1 — the shelf (highest impact).** Image keying, the card rebuild,
surface separation, density. This is the one that changes the answer to "does
this look designed".

**Phase 2 — information.** Brand field through the supplier mapping,
per-serving toggle, ratings back, deals pricing, section headers.

**Phase 3 — chrome and hero.** Compare into selection mode, one bottom bar,
the editorial banner and shop-by-goal row.

**Phase 4 — polish.** Motion, skeletons, scroll restoration, the remaining
sheets and drawers still on the old palette (BasketDrawer, ShopFilterSheet,
ShopDuelSheet, ShopRouletteSheet, ShopSearchSuggestions, StarRating).

---

## What I need from you

1. **Image treatment: A, B or C?** A (key the white out) is the recommendation
   and the biggest single win. It is also the one with a real failure mode on
   white packaging, so it is your call.
2. **The spotlight gradient** — a carve-out from "no gradients". Yes or no.
3. **One more type size (17px)** and a slightly lighter `--surface`. Both are
   token additions; the brief said stop and ask.
4. **Is a brand field acceptable?** It means a supplier-mapping change, which is
   not presentation-only. It is the highest-value single addition to the card.
5. **An editorial hero image** — do we have one, or should the banner be a
   rendered product arrangement?
