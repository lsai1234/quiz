# Generating shop banners

Prompts for the artwork that goes at the top of the shop, and the rules the
build enforces so a generation that ignores them gets refused rather than
uploaded.

Upload at **Founders Hub → Settings → Shop banners**.

---

## The four rules the build enforces

Everything below is checked in the browser before the upload starts and again on
the server. A generation that breaks one is refused with the reason.

| | Rule | Why |
|---|---|---|
| **Shape** | 16:9, ±0.06 | The banner slot is 16:9. A square generation letterboxes. |
| **Size** | at least 1024×576, ideally **1280×720** | Below that it is visibly soft on a 3× phone screen. |
| **Format** | JPEG, PNG or WebP | What a browser will render. Not HEIC, not SVG. |
| **Weight** | under 6MB | It loads at the top of the shop, on mobile data. |

`1792×1024` — what several image models emit for "wide" — is inside tolerance
and is accepted. Generate at that if the model will not do 1280×720.

## The one compositional rule

**Leave the left 45% of the frame quiet.**

The headline and subhead are drawn over the artwork as live text, on the left,
with a dark scrim behind them. That is deliberate — text baked into a generated
image cannot be edited, cannot be read by a screen reader, and goes soft on a
retina display. But it means anything important on the left of the picture ends
up behind words.

So: **product on the right, empty space on the left.** Every prompt below is
written that way. The preview in the Founders Hub shows the real scrim and your
real headline over the real artwork, so check it there before saving.

---

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

Where a prompt says *attach your logo* or *attach a product photo*, use the
image-input / reference-image feature of whichever model you are using. See
**Putting the logo in**, below, and read it before you try: asking a model to
draw the logo does not work.

### 1. The hero — "start with the quiz"

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

### 2. Deals

```
A wide 16:9 studio product photograph, 1280x720 pixels, landscape.
A near-black background, hex #0A0B0D. On the RIGHT of the frame, a loose
arrangement of five or six matte black and dark grey supplement containers of
varying heights, seen at a slight angle, the furthest ones receding into
shadow. A single cool cyan light source, hex #00C8F0, from the top right,
catching the rims and shoulders of the nearest containers only. The LEFT 45%
OF THE FRAME MUST BE EMPTY dark negative space — nothing in it, no object, no
detail. Deep shadows, high contrast, shallow depth of field, subtle film
grain. Premium and restrained, not a sale poster.
NO TEXT. NO WORDS. NO LETTERING. NO LABELS. NO PRICE TAGS. NO STARBURSTS.
NO LOGOS. NO PEOPLE. NO WATERMARK. Photographic, not illustrated.
```

Headline **This week's deals** · Subhead *Up to 28% off across the range* ·
Links to `/shop#shop-cat-deals`

### 3. Protein

```
A wide 16:9 studio product photograph, 1280x720 pixels, landscape.
A near-black background, hex #0A0B0D. On the RIGHT of the frame, a single
large matte black protein tub with its lid off, a scoop resting against its
base, and a soft drift of pale powder spilled on the dark surface in front of
it. Lit from the right by one cool cyan light, hex #00C8F0, so the airborne
powder and the drift catch the light. The LEFT 45% OF THE FRAME MUST BE EMPTY
dark negative space — nothing in it, no object, no detail. Macro detail in
the powder texture, very shallow depth of field, fine film grain, deep
shadow.
NO TEXT. NO WORDS. NO LETTERING. NO LABELS. NO NUTRITION PANEL. NO LOGOS.
NO PEOPLE. NO WATERMARK. Photographic, not illustrated.
```

Headline **Protein, properly** · Subhead *Whey, isolate and plant — priced per
serving* · Links to `/shop#shop-cat-protein`

### 4. Hydration

```
A wide 16:9 studio photograph, 1280x720 pixels, landscape.
A near-black background, hex #0A0B0D. On the RIGHT of the frame, a tall glass
of clear water on a dark wet surface, caught mid-dissolve, with fine bubbles
rising through it and scattered water droplets on the surface around its
base. Lit from behind and from the right by a single cyan light, hex #00C8F0,
so the water glows from within and each droplet reads as a small lit point.
The LEFT 45% OF THE FRAME MUST BE EMPTY dark negative space — nothing in it,
no object, no detail. Very shallow depth of field, high contrast, fine film
grain.
NO TEXT. NO WORDS. NO LETTERING. NO LABELS. NO LOGOS. NO PEOPLE.
NO WATERMARK. Photographic, not illustrated.
```

Headline **Hydration that holds** · Subhead *Electrolytes for long days and
longer sessions* · Links to `/shop#shop-cat-hydration`

### 5. Sleep and recovery

```
A wide 16:9 studio photograph, 1280x720 pixels, landscape.
A near-black background, hex #0A0B0D, with a deep indigo tint in the shadows.
On the RIGHT of the frame, a small dark amber glass supplement bottle and a
few loose capsules resting on a dark linen surface, shot from a low angle
close to the surface. Lit softly from the upper right by one cool cyan light,
hex #00C8F0 — very low key, most of the frame falling away into shadow. The
LEFT 45% OF THE FRAME MUST BE EMPTY dark negative space — nothing in it, no
object, no detail. Calm, still, almost nocturnal. Shallow depth of field,
fine film grain.
NO TEXT. NO WORDS. NO LETTERING. NO LABELS. NO LOGOS. NO PEOPLE. NO BEDS.
NO WATERMARK. Photographic, not illustrated.
```

Headline **Wind down properly** · Subhead *Magnesium, glycine and the rest* ·
Links to `/shop#shop-cat-sleep`

### 6. Bundles

```
A wide 16:9 studio product photograph, 1280x720 pixels, landscape.
A near-black background, hex #0A0B0D. On the RIGHT of the frame, four matte
black supplement containers of clearly different shapes — a wide tub, a tall
bottle, a flat pouch, a small jar — arranged as one considered group on a
dark surface, overlapping slightly, shot straight on at eye level. A single
cool cyan light, hex #00C8F0, from the upper right, rimming each silhouette
so the shapes separate from each other and from the background. The LEFT 45%
OF THE FRAME MUST BE EMPTY dark negative space — nothing in it, no object, no
detail. Shallow depth of field falling off on the back row, deep shadow, fine
film grain.
NO TEXT. NO WORDS. NO LETTERING. NO LABELS. NO LOGOS. NO PEOPLE.
NO WATERMARK. Photographic, not illustrated.
```

Headline **Built as a set** · Subhead *Prebuilt stacks, cheaper than the parts*
· Links to `/shop#shop-cat-bundles`

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
