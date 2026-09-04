# Generating shop banners

Prompts for the artwork that goes at the top of the shop, and the rules the
build enforces so a generation that ignores them gets refused rather than
uploaded.

Upload at **Founders Hub → Settings → Shop banners**.

---

## Where the pictures go

The shop has five fixed places for artwork, each a different shape doing a
different job. The Founders Hub shows one upload section per place, in the order
they appear down the page.

| Place | Shape | Generate at | Where |
|---|---|---|---|
| **Masthead** | 16:9 | 1280x720 | Top of the shop, under the title |
| **Twin tile — left** | 4:5 | 1000x1250 | Left of the pair, under the goal row |
| **Twin tile — right** | 4:5 | 1000x1250 | Right of the pair |
| **First break** | 12:5 | 1440x600 | Between the second and third shelves |
| **Second break** | 12:5 | 1440x600 | Between the fifth and sixth shelves |

Only the masthead has a fallback — if you upload nothing, the shop builds one
from product photography. Every other place is simply **not there** until you
fill it, and the page closes up around it. Nothing ever shows an empty grey
rectangle to a customer.

Upload at **Founders Hub → Settings → Shop banners**.

## The rules the build enforces

Checked in the browser before the upload starts, and again on the server. A
generation that breaks one is refused with the reason.

| | Rule | Why |
|---|---|---|
| **Shape** | the placement's ratio, ±6% | A 16:9 in a 4:5 slot is cropped to a letterbox of itself. |
| **Size** | at least the placement's minimum | Below that it is visibly soft on a 3x phone screen. |
| **Format** | JPEG, PNG or WebP | What a browser will render. Not HEIC, not SVG. |
| **Weight** | under 6MB | It loads on mobile data. |

The tolerance is a fraction of the target rather than a fixed number, so it is
as forgiving on a portrait tile as on a wide one. `1792x1024` — what several
image models emit for "wide" — is inside tolerance for a masthead.

## The one compositional rule

**Leave the space where the words go quiet.**

The headline and subhead are drawn over the artwork as live text, not baked into
the picture. That is deliberate — text generated into an image cannot be edited,
cannot be read by a screen reader, and goes soft on a retina display. But it
means anything important behind the words is lost.

Where the words sit depends on the shape:

- **Wide places** (masthead, breaks): text on the LEFT. Put the subject on the
  RIGHT and leave the left 45% empty.
- **Upright places** (twin tiles): text along the BOTTOM. Put the subject in the
  upper two thirds and let the bottom third fall away to near-black.

The Hub preview draws the real scrim and your real headline over the real
artwork, in the right position for that placement, so check it there before
saving.

## House style

These belong to the same brand as the shop, so the artwork has to look like the
shop: near-black ground, one cyan accent, no clutter.

- **Ground:** near-black, `#0A0B0D`, subtly graded — not flat, not bright
- **Accent:** a single cyan light, `#00C8F0`. One source, not a rainbow
- **No text in the image.** No words, no logos, no packaging labels you invented
- **No people's faces.** Hands and torsos are fine, faces date badly and imply a
  testimonial you do not have
- **Photographic, not illustrated.** Studio product photography, shallow depth
  of field, one clear subject

---

## The prompts

Each one is complete on its own — copy from the first word to the last and paste
it straight into the generator. Nothing here depends on anything above it.

They are grouped by the PLACE they go, because the shape and the composition
rule are different in each. A masthead generation dropped into a twin tile is
refused by the upload, and rightly: it would be cropped to a letterbox of
itself.

---

## Masthead — 16:9, 1280x720

One picture, the top of the shop. The headline sits over the LEFT of the frame.

### M1. The quiz

```
A wide 16:9 studio product photograph, 1280x720 pixels, landscape.
A near-black background, hex #0A0B0D, with a soft graded falloff so it is
not flat. On the RIGHT THIRD of the frame, three matte black supplement tubs
of different heights arranged in a tight overlapping group on a dark
surface, shot from slightly above eye level. A single cool cyan light source,
hex #00C8F0, from the upper right, rimming their edges and shoulders. The
LEFT 45% OF THE FRAME MUST BE EMPTY near-black negative space with only a
faint cyan glow bleeding in from the right — nothing in it, no object, no
detail. Shallow depth of field: the front tub sharp, the back two softly out
of focus. Deep shadows, high contrast, fine film grain. Premium, restrained,
editorial — a sports nutrition brand, not a supermarket shelf.
NO TEXT. NO WORDS. NO LETTERING. NO LABELS. NO LOGOS. NO PEOPLE.
NO WATERMARK. Photographic, not illustrated, not 3D-rendered.
```

Headline **Not sure where to start?** · Subhead *A 2-minute quiz builds a stack
around your goals* · Links to `/`

### M2. The season

```
A wide 16:9 studio product photograph, 1280x720 pixels, landscape.
A near-black background, hex #0A0B0D. On the RIGHT of the frame, a single
large matte black supplement tub standing on a dark wet slate surface, with a
soft reflection beneath it and a fine mist of condensation on its shoulder.
One cool cyan light, hex #00C8F0, raking across from the upper right so only
the edge of the tub is lit and the rest falls into shadow. The LEFT 45% OF
THE FRAME MUST BE EMPTY dark negative space — nothing in it, no object, no
detail. Shallow depth of field, deep shadow, fine film grain. Cinematic and
still.
NO TEXT. NO WORDS. NO LETTERING. NO LABELS. NO LOGOS. NO PEOPLE.
NO WATERMARK. Photographic, not illustrated.
```

Headline **Built for the season** · Subhead *The full range, priced per serving*
· Links to `/shop`

---

## Twin tiles — 4:5, 1000x1250

Two upright pictures side by side, under the goal row. The label sits along the
BOTTOM, so keep the bottom third quiet — the opposite of the masthead rule.
Generate these as a PAIR: they sit beside each other, so they want different
subjects and a shared light.

### T1. Protein (left tile)

```
An upright 4:5 studio product photograph, 1000x1250 pixels, portrait.
A near-black background, hex #0A0B0D, graded darker toward the bottom of the
frame. In the UPPER TWO THIRDS, a single matte black protein tub with its lid
off, seen slightly from above, with a soft drift of pale powder caught in the
light beside it. One cool cyan light, hex #00C8F0, from the upper left,
rimming the tub and catching the powder. The BOTTOM THIRD OF THE FRAME MUST
BE EMPTY dark negative space — nothing in it, no object, no detail, falling
away to near-black at the bottom edge. Shallow depth of field, fine film
grain, deep shadow.
NO TEXT. NO WORDS. NO LETTERING. NO LABELS. NO LOGOS. NO PEOPLE.
NO WATERMARK. Photographic, not illustrated.
```

Label **Protein** · Subhead *Priced per serving* · Links to
`/shop#shop-cat-protein`

### T2. Recovery (right tile)

```
An upright 4:5 studio photograph, 1000x1250 pixels, portrait.
A near-black background, hex #0A0B0D with a deep indigo tint, graded darker
toward the bottom. In the UPPER TWO THIRDS, a small dark amber glass bottle
and a few loose capsules resting on dark linen, shot from a low angle close
to the surface. One cool cyan light, hex #00C8F0, from the upper right, very
low key, most of the frame in shadow. The BOTTOM THIRD OF THE FRAME MUST BE
EMPTY dark negative space — nothing in it, no object, no detail. Calm, still,
nocturnal. Shallow depth of field, fine film grain.
NO TEXT. NO WORDS. NO LETTERING. NO LABELS. NO LOGOS. NO PEOPLE.
NO WATERMARK. Photographic, not illustrated.
```

Label **Recovery** · Subhead *Sleep, joints and the rest* · Links to
`/shop#shop-cat-recovery`

---

## Breaks — 12:5, 1440x600

Wide, short, full-bleed to the screen edges, cut in between two product
shelves. Short is the point: it interrupts without pretending to be the top of
a new page. The headline sits over the LEFT, as on the masthead. A single
subject close up works far better here than a group — there is very little
vertical room.

### B1. Deals

```
A very wide 12:5 studio product photograph, 1440x600 pixels, letterbox
landscape. A near-black background, hex #0A0B0D. On the RIGHT of the frame, a
loose row of four or five matte black and dark grey supplement containers of
varying heights, seen at a slight angle, the furthest receding into shadow. A
single cool cyan light, hex #00C8F0, from the top right, catching only the
rims and shoulders of the nearest containers. The LEFT 45% OF THE FRAME MUST
BE EMPTY dark negative space — nothing in it, no object, no detail. Deep
shadows, high contrast, shallow depth of field, fine film grain. Premium and
restrained, not a sale poster.
NO TEXT. NO WORDS. NO LETTERING. NO LABELS. NO PRICE TAGS. NO STARBURSTS.
NO LOGOS. NO PEOPLE. NO WATERMARK. Photographic, not illustrated.
```

Headline **This week's deals** · Subhead *Up to 28% off across the range* ·
Links to `/shop#shop-cat-deals`

### B2. Bundles

```
A very wide 12:5 studio product photograph, 1440x600 pixels, letterbox
landscape. A near-black background, hex #0A0B0D. On the RIGHT of the frame,
four matte black supplement containers of clearly different shapes — a wide
tub, a tall bottle, a flat pouch, a small jar — arranged as one considered
group on a dark surface, overlapping slightly, shot straight on at eye level.
One cool cyan light, hex #00C8F0, from the upper right, rimming each
silhouette so the shapes separate from each other and from the background.
The LEFT 45% OF THE FRAME MUST BE EMPTY dark negative space — nothing in it,
no object, no detail. Shallow depth of field on the back row, deep shadow,
fine film grain.
NO TEXT. NO WORDS. NO LETTERING. NO LABELS. NO LOGOS. NO PEOPLE.
NO WATERMARK. Photographic, not illustrated.
```

Headline **Built as a set** · Subhead *Prebuilt stacks, cheaper than the parts*
· Links to `/shop#shop-cat-bundles`

### B3. Hydration (an alternative for either break)

```
A very wide 12:5 studio photograph, 1440x600 pixels, letterbox landscape.
A near-black background, hex #0A0B0D. On the RIGHT of the frame, a tall glass
of clear water on a dark wet surface, mid-dissolve, fine bubbles rising
through it and scattered droplets on the surface around its base. Lit from
behind and from the right by a single cyan light, hex #00C8F0, so the water
glows from within and each droplet reads as a lit point. The LEFT 45% OF THE
FRAME MUST BE EMPTY dark negative space — nothing in it, no object, no
detail. Very shallow depth of field, high contrast, fine film grain.
NO TEXT. NO WORDS. NO LETTERING. NO LABELS. NO LOGOS. NO PEOPLE.
NO WATERMARK. Photographic, not illustrated.
```

Headline **Hydration that holds** · Subhead *Electrolytes for long days and
longer sessions* · Links to `/shop#shop-cat-hydration`

---

## Putting the logo in

Do **not** ask the model to draw the logo. Image models reproduce a supplied
logo as a smeared approximation, and a wrong wordmark on your own storefront is
worse than none.

Two ways that work:

**A — as a physical object in the scene (best).** Attach the logo and prompt:

> Attach: the CHRGD logo (black rounded battery outline with a cyan lightning
> bolt through it).
>
> Use the attached logo EXACTLY as supplied, unmodified, as a small embossed
> mark on the front of the nearest black supplement tub in the right of the
> frame. Do not redraw it, do not change its proportions, do not add text.
> Match its perspective to the tub. Keep it small — no wider than a fifth of the
> tub.

**B — composite it afterwards.** Generate the artwork without any logo, then
place the real logo file over it in any editor, bottom-right, at about 8% of the
frame width. This is the reliable one, and the only one that guarantees the mark
is correct.

## Putting real products in

Attach a PowerBody product photograph and prompt:

> Attach: the product photograph.
>
> Place the attached product, unmodified and unretouched, standing on a dark
> surface in the RIGHT THIRD of a 16:9 1280x720 frame. Keep its label and
> packaging exactly as supplied — do not redraw, restyle or relabel it. Build a
> near-black studio environment (#0A0B0D) around it with a single cool cyan
> light (#00C8F0) from the upper right rimming its edge, deep shadow elsewhere,
> and a soft reflection on the surface beneath it. Leave the LEFT HALF of the
> frame as empty dark negative space. Photographic, shallow depth of field,
> fine film grain. No text, no added logos, no people.

Check the result against the real product before uploading. A model asked to
"keep it exactly as supplied" will still occasionally invent a flavour name or
change a claim on the label, and a made-up claim on a supplement is not a
cosmetic problem.

---

## Before you save

The Founders Hub preview draws the real scrim and your real headline over the
artwork. Three things to look at:

1. **Is the headline readable?** If the artwork is bright on the left, it will
   not be. Regenerate with more negative space rather than shortening the
   headline.
2. **Does the description say what the picture is?** It is read aloud, and it is
   what shows if the image fails to load. "Three black supplement tubs lit in
   cyan on a dark background" — not "banner" or "hero image".
3. **Does the link go where the headline promises?** A banner that says "deals"
   and lands on the homepage is the fastest way to lose the tap.
