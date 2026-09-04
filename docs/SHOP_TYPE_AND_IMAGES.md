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
contained inside a square (nothing cropped — a tall bottle keeps its cap),
flattened onto the shelf's own surface colour (no white box on a dark page, no
transparent hole), and re-encoded to WebP at one of five widths the layout
actually uses.

Two decisions worth keeping:

- **The cache key is the source URL and width, not the SKU.** A SKU is stable
  across a photo being *replaced*, which is exactly when a cached image must stop
  being served. Keying on the source URL makes the output content-addressed, so
  the response can be `immutable` for a year with no invalidation path at all —
  a stronger guarantee than a SKU key with a TTL, not a weaker one.
- **The host allowlist is the security boundary.** A route that fetches a
  client-supplied URL server-side and returns the bytes is an open proxy and an
  SSRF hole. `isAllowedImageHost` matches parsed hostnames exactly or as
  subdomains, never as substrings, and refuses anything that is not https.

Cached in the CDN and the browser rather than on disk: this app runs on ephemeral
instances, so a filesystem cache would be cold on nearly every request. A small
in-process LRU covers the one warm case that matters — twenty cards on a shelf
asking for the same handful of widths at once.

It applies to the quiz too, via `ProductTile` and `ProductSwapModal`, which are
shared.

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
