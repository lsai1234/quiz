# Shop: type, images and the product route

What changed in the shop, why, and which of the ten recommendations behind it
did not apply here. Written against a review that assumed a React/Vite app with
a Node layer in front of the PowerBody feed; this is Next.js 16 with an existing
enforced token system, so a few of its premises were not true and are recorded
below rather than quietly skipped.

---

## What was built

### 1. One uppercase class

`.label` in `system.css`. Before it, the shop spelled a single uppercase eyebrow
seventeen ways: 8, 9, 10 and 11px against `tracking-wide`, `tracking-widest`,
`tracking-[0.18em]` and `tracking-[0.25em]`, each with its own `font-bold` and a
repeated `fontFamily: var(--font-display)`. All seventeen now read
`className="label"`. A token can be picked wrongly; a class with one definition
cannot, which is the whole reason this is a class and not a fifth text token.

Alongside it, `.type-display`, `.type-title`, `.type-body` and `.type-meta`. They
set size, weight, tracking and leading from the tokens and deliberately set **no
colour** — the app runs two palettes (`--color-*` on the shop and hubs,
`--ink-*` on the migrated primitives) and a type class that picked one would be
unusable in half the app.

### 2. Tabular numerals, no mono face

Prices, totals and counts carry Tailwind's `tabular-nums`, which the hub, the
receipts and the quiz already use. No `.numeric` synonym was added: a second
spelling of one intention is what this work exists to remove.

No monospace font was added either. The advance width is the part that matters —
it stops a column of prices wandering off the decimal and a live total jittering
as it updates — and `font-variant-numeric` gives it on the two families already
loaded. A third webfont to make `£34.99` a pixel narrower is not worth its bytes.

### 3. `ShopProductCard` — photo, name, price

The card used to carry a merchandising badge, a low-stock chip, a one-line
reason, four animated "best for" bars and a `-25%` pill over the photo. Five
competing claims per card, twenty-odd cards a screen; the three things a shopper
is actually choosing between were the smallest elements on it.

Gone from the card: the badge, the stock chip, the reason line, the stat bars,
the discount pill. All of them still exist one tap away, in the sheet and on the
product page, where there is room to read them.

Kept, with reasons:

- **The category chip.** A classification, not a claim, and search results are
  mixed-category — without it a grid of twelve tubs has no structure.
- **The struck-through RRP.** A fact about the price, next to the price. The
  `-25%` pill was the same fact said twice, so that is the one that went.
- **The Add button**, tinted rather than filled. See the trade-off below.

### 4. Grid, not carousel

`ShopSection` was a horizontally scrolling deck: one card and a sliver visible,
the rest of the category behind a gesture nobody makes, and everything past
position three effectively unmerchandised. It is now
`grid-cols-2` at a 12px gap — six products in the vertical space that used to
show one and a half. This only became possible once the card stopped carrying
five claims, so items 3 and 4 are one change, not two.

### 5. `/product/[handle]`

The shop is one statically rendered route whose detail view is a sheet. A sheet
is the right gesture while browsing and the wrong one for everything else: it
cannot be linked to, shared, bookmarked, opened in a new tab, indexed or
advertised against, and the back button does not mean what a shopper expects
inside one.

So the card body is now a real `<a href="/product/…">`. A plain click still opens
the quick view — that is the browse gesture the whole shop is built around — and
a modified click, a long-press or a crawler gets the page. The sheet carries a
link out to it.

Both render the same `ProductDetailBody`, so there is no second description of
the same tub to drift out of date.

The product page has no basket drawer. That component belongs to `ShopShell` and
is wired to its pricing, codes and nudges; a second copy would be a second
implementation of the most correctness-sensitive surface in the app. Its header
links to `/shop#basket`, which opens the real one.

### 6. The image pipeline

`/api/product-image` + `@/lib/images/product-image`. Every supplier photo is
contained inside a square (nothing cropped — a tall pouch keeps its top and
bottom), padded onto white, and re-encoded to WebP at one of five widths the
layout actually uses.

**Why white and not the shelf colour.** Padding onto the dark surface is the
obvious move and it is wrong for this catalogue. Supplement photography is shot
on white and delivered as JPEG with no alpha, so the photo is a white rectangle
whatever we pad around it — a dark pad just puts a white box inside a dark box,
and the box changes shape with the aspect ratio. Committing to white makes every
tile the same object: a white card with the product centred on it.

**Why the boundary is the catalogue, not a list of hostnames.** A route that
fetches a client-supplied URL server-side and returns the bytes is an open proxy
and an SSRF hole, so something has to gate it. The first version of this gated on
a hardcoded list of PowerBody hostnames, and that was wrong twice over: the live
feed serves images from a host that was not on it, so nothing was ever
normalised; and it failed *silently*, falling through to the raw URL, so the only
symptom was cropped photos on a phone.

The exact boundary is the catalogue itself: the route fetches a URL if and only
if that URL appears verbatim as some product's `imageUrl`. It cannot go stale, it
needs no maintenance when a supplier changes CDN, and it is narrower than any
hostname list — `powerbody.co.uk/../../etc/passwd` is not in the catalogue
either. The gate has its own test file, because it is the security boundary.

**`object-contain`, everywhere, with a fallback chain.** `object-cover` only
ever made sense on the assumption that the pipeline had squared the image, and
that assumption broke the moment the pipeline declined one. Contain never crops,
so it is correct whether or not the image was normalised. `ProductTile` then
falls back from the pipeline URL to the supplier's own URL to the designed tile:
an unnormalised photo is a worse-looking card, a broken image is a broken shop.
The same crop existed in `ProductSwapModal` (quiz) and in the Founders Hub
supplier import preview — the screen where somebody checks what the supplier
actually sent — and both are fixed.

**Why the cache key is the source URL and not the SKU.** A SKU is stable across a
photo being *replaced*, which is exactly when a cached image must stop being
served. Keying on the source URL makes the output content-addressed, so the
response can be `immutable` for a year with no invalidation path at all — a
stronger guarantee than a SKU key with a TTL, not a weaker one.

Cached in the CDN and the browser rather than on disk: this app runs on ephemeral
instances, so a filesystem cache would be cold on nearly every request. A small
in-process LRU covers the one warm case that matters — twenty cards on a shelf
asking for the same handful of widths at once.

### 7. Compare, as a word

The duel toggle was a 13px unlabelled glyph in the corner of the photo: two
rounded bars that read as a `#` at that size, on a card with no other icon to
explain it. Nobody who had not been told what it was could find out by looking.

Two rewrites to land it, both worth recording because the first fix created the
second problem:

1. Giving it the word put a high-contrast pill on top of the product on every
   card — the second-brightest thing on the shelf, four times a screen.
2. Moving it into the action row beside Add made it *wider than Add*, because at
   two columns a card is about 166px and "Compare" does not fit next to "Add".
   That inverts the one hierarchy the card has.

It ends up stacked underneath Add, full width, at label size in the muted ink:
available without being offered. Selected, it fills accent and reads "Comparing",
and `ShopCompareBar` takes over from there.

---

## What did not apply

| Recommendation | Why not |
|---|---|
| "Write a `tokens.css`" | `src/app/tokens.css` already exists — 19KB, role-named, documented, and enforced by `tokens.test.ts` and `tokens-only.test.ts`. The gap was never the file; it was that the shop was exempt from it. That is what the type classes address. |
| "Prices in mono with `tabular-nums`" | No mono face ships anywhere in this app. The `tabular-nums` half was worth doing and was done; the font was not. |
| "Replace JS truncation with CSS `line-clamp`" | There is no JS character-slicing anywhere in the shop. `ShopProductCard` already used `line-clamp-2`. |
| "Body default `font-weight: 400`" | `--weight-body` is 500. At 14px on a dark ground this face goes thin enough at 400 to put the second ink tier under the contrast floor `contrast.test.ts` holds. Kept at 500. |
| "Delete the scarcity badges" | Deleted from the *card*, kept in the sheet and on the product page. `StockChip` only ever renders when a real count is known and low — it is a fact, not manufactured urgency. The objection was card noise, and card noise is what was removed. |
| "Delete the per-card Add button" | Kept, deliberately. A card that is only a link is the cleaner object and on a desktop catalogue would be right. This is a phone shop whose basket, bundle nudges and free-delivery line are all built around adding from the shelf; routing every add through a sheet adds a tap to the only action that matters. It is one tinted button below a divider — the trade is noted, not hidden. |
| "Wrap the whole card in the link" | Done for the card body. It cannot wrap the Add and Compare controls: interactive elements may not nest inside an anchor. They are siblings, positioned to look like one object. |

## Still open

The four type classes are defined and used on the new surfaces; the rest of the
shop still sets `text-sm`, `text-xs` and `text-[11px]` directly. Sweeping those
is a mechanical change worth doing as its own pass, with a scoped test to hold
it — the same shape as `tokens-only.test.ts` does for `src/components/system`.


---

# Second pass: the shop on the design system

Feedback from a live phone: *"the whole UI still looks cheap"*, next to a
reference that was — the reviewer was explicit — not about colour.

## The finding

The shop is not on the design system, and that is documented rather than
accidental. `DESIGN.md` §"Every hub is migrated; the storefront is not" says the
brief was everything *outside* the quiz flow, and the storefront was never in
scope. So the three hubs got a lit ground, translucent surfaces at three
elevations, a specular band that makes a plane read as a sheet catching light,
solid controls with a gradient and a bloom, and spring easing — and the shop got
a flat `#09090b` rectangle with 1px hairline borders.

That is the whole gap. Not spacing, not radii, not the reference's colour: the
shop was drawing boxes on a page while the rest of the app was building objects
in a room.

## What moved

| | Before | Now |
|---|---|---|
| Page | `bg-[var(--color-bg)]`, flat | `<Ground>` — three drifting blooms, vignette, film grain |
| Product card | hand-rolled `div` + hairline | `<Card elevation={1}>` — translucent, specular band, real shadow |
| Add | hand-rolled accent slab | `<Button variant="secondary">` |
| Photo | full-bleed white square | inset white plate, rounded, framed by the card |

The grain is not decoration: large dark gradients band visibly on an 8-bit phone
screen, and grain is what breaks the bands and gives the black something to be
made of. It is the cheapest single thing separating a premium surface from a
flat one, and the shop had none of it.

**`secondary`, not `primary`, on the card.** The system reserves the filled
gradient for the one action a screen is *for*. A shelf's is "go to the basket";
four filled primaries in a viewport stops meaning "press this" and starts
meaning "cyan". Tried it as primary first — it was the brightest thing on the
shelf by a distance.

**The photo as an inset plate.** Supplier cut-outs are baked onto white, so the
plate has to be white or a seam shows. Run edge to edge, that white square *is*
the card: four of them tile the screen and the product is the smallest thing on
its own shelf. Inset by the card's own padding, the dark surface frames each
photo and the cards read as objects holding pictures. A 9% inset inside the
plate gives every product the same margin, so a 2:3 pouch and a square tub look
like one set of objects photographed the same way — which they are not.

## The roulette

**The reel.** It was a `setTimeout` every 70ms swapping the product name for a
random other one. It read as text flickering because that is what it was:
nothing moved, nothing had weight, and the stop was a state change rather than
an arrival.

It is now a real drum. Four things make it physical, none of them a library:

1. **One continuous position, not frames of content.** The strip is a column of
   the actual products the wheel could land on, translated on Y by a number
   that comes from a clock. Nothing swaps; a thing moves.
2. **Deceleration with an overshoot.** Quintic ease-out, then a damped spring
   settles it back onto the detent — so it arrives, bounces once against the
   stop and rests. A pure ease-out lands too politely and reads as a fade.
3. **Motion blur from the actual velocity**, computed per frame, so it smears
   when quick and is perfectly sharp the instant it stops. A fixed blur that
   switches off is what makes cheap slot machines look cheap.
4. **A detent every row**, so the slowing feels like passing over stops rather
   than sliding on ice.

One `requestAnimationFrame` loop over a closed-form position function — no
per-frame React state, no re-render per frame. Plus a sweep across the landed
row at the moment it stops: the visual equivalent of the click, because without
it "stopped" and "broken" look the same.

The decoy rows come from the same eligible pool as the outcome, so everything
that streaks past is a thing the shopper could actually have been given — a reel
padded with out-of-stock or filtered-out products is showing them a shelf we
will not sell them. Two rows continue past the landing so the window's bottom
slot is never empty; without them the drum reads as a list scrolled to its end.

The outcome is still decided by `spin()` before the first frame, under the
guardrails `roulette.test.ts` holds. The reel is only responsible for arriving
there convincingly.

**One bug this surfaced:** the footer read `Add for £29.99` off `entry`, which is
set the moment the pull is decided — so the result was announced in the button
several seconds before the reveal. A reveal cannot survive that.

**The lever.** The trigger was a grey row with an arrow, indistinguishable from a
link, with nothing to suggest a machine behind it. It now has three reel windows
that riffle when pressed, an accent bloom under it, and a band of light that
crosses every six seconds — long gap, short pass, so it reads as something
catching the light occasionally rather than a thing that is always animating.
All of the motion is off under `prefers-reduced-motion`; the shape and the bloom
are what make it read as a control, and those stay.

## Still on the old layer

The migration is the product card, the page ground and the roulette. Not yet
moved: the hero action cards, the trust strip, the category nav and filter bar,
the search bar, the product sheet, the basket drawer, the duel and the bundle
cards. They still use `--color-*` and hairline borders, so the shelf now reads
considerably better than the chrome around it. That unevenness is the honest
state — worth finishing, and the same shape of change each time.
