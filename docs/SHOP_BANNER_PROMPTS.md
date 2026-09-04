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

Paste these as-is. Where a prompt says *attach your logo* or *attach a product
photo*, use the image-input / reference-image feature of whichever model you are
using — the logo is `public/` brand art, and product shots come from PowerBody.

### 1. The hero — "start with the quiz"

> A wide 16:9 studio photograph, 1280x720. A near-black background (#0A0B0D)
> with a soft graded falloff. On the RIGHT THIRD of the frame, three matte black
> supplement tubs of different heights arranged in a tight group, shot from
> slightly above eye level, lit from the upper right by a single cool cyan light
> (#00C8F0) that rims their edges. The LEFT HALF of the frame is empty
> near-black negative space with only a faint cyan glow bleeding in from the
> right. Shallow depth of field, the front tub sharp and the back two softly
> out of focus. Fine film grain. No text, no labels, no logos, no people.
> Premium, restrained, editorial — a sports nutrition brand, not a supermarket.

Suggested copy: **"Not sure where to start?"** / "A 2-minute quiz builds a stack
around your goals" → `/`

### 2. Deals

> A wide 16:9 studio photograph, 1280x720. Near-black background (#0A0B0D). On
> the RIGHT of the frame, a loose arrangement of five or six matte black and
> dark grey supplement containers of varying heights, seen at a slight angle,
> receding into shadow. A single cyan light source (#00C8F0) from the top right
> catches the rims and the shoulders of the nearest containers. The LEFT 45% is
> empty dark negative space. Deep shadows, high contrast, shallow depth of
> field, subtle film grain. No text, no labels, no logos, no people.

Suggested copy: **"This week's deals"** / "Up to 28% off across the range" →
`/shop#shop-cat-deals`

### 3. Protein

> A wide 16:9 studio photograph, 1280x720. Near-black background. On the RIGHT
> of the frame, a single large matte black protein tub with its lid off, a
> scoop resting against its base, a soft drift of pale powder on the dark
> surface in front of it. Lit from the right with one cool cyan light
> (#00C8F0); the powder catches the light. LEFT HALF empty dark negative space.
> Macro detail on the powder texture, shallow depth of field, film grain. No
> text, no labels, no logos, no people.

Suggested copy: **"Protein, properly"** / "Whey, isolate and plant — priced per
serving" → `/shop#shop-cat-protein`

### 4. Hydration

> A wide 16:9 studio photograph, 1280x720. Near-black background. On the RIGHT,
> a tall glass of clear water on a dark wet surface, mid-dissolve, with fine
> bubbles rising and a few water droplets on the surface around it. Lit from
> behind and the right by a single cyan light (#00C8F0) so the water glows and
> the droplets are lit points. LEFT HALF empty dark negative space. Very
> shallow depth of field, high contrast, film grain. No text, no labels, no
> logos, no people.

Suggested copy: **"Hydration that holds"** / "Electrolytes for long days and
longer sessions" → `/shop#shop-cat-hydration`

### 5. Sleep and recovery

> A wide 16:9 studio photograph, 1280x720. Near-black background with a deep
> indigo tint. On the RIGHT, a small dark amber glass supplement bottle and a
> few loose capsules on a dark linen surface, shot from a low angle. Lit softly
> from the upper right by one cool cyan light (#00C8F0), very low key, most of
> the frame in shadow. LEFT HALF empty dark negative space. Calm, still, almost
> nocturnal. Shallow depth of field, film grain. No text, no labels, no logos,
> no people.

Suggested copy: **"Wind down properly"** / "Magnesium, glycine and the rest" →
`/shop#shop-cat-sleep`

### 6. Bundles

> A wide 16:9 studio photograph, 1280x720. Near-black background. On the RIGHT,
> four matte black supplement containers of clearly different shapes — a wide
> tub, a tall bottle, a pouch, a small jar — arranged as a considered group on a
> dark surface, overlapping slightly, shot straight on. One cyan light
> (#00C8F0) from the upper right rims each silhouette. LEFT 45% empty dark
> negative space. Shallow depth of field on the back row, fine film grain. No
> text, no labels, no logos, no people.

Suggested copy: **"Built as a set"** / "Prebuilt stacks, cheaper than the parts"
→ `/shop#shop-cat-bundles`

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
