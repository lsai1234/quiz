# Share card — the art set

Six images. One per card. **They do not exist yet** — every family currently
falls back to a CHRGD product render from `public/hero/`, and `/styleguide/share`
labels each card as a placeholder until they do.

Dropping the finished files into `src/lib/share-card/art/` and clearing
`placeholder: true` in `ART_SET` (`src/lib/share-card/art.ts`) is the entire
change. No layout work, no new code path.

---

## Why six, and why they are keyed rather than shuffled

The card is about a *stack*, not a product, so a single bottle under a headline
about six supplements is the wrong picture. And a set small enough to art-direct
properly is a set that can look expensive, which is the whole job the image is
doing.

They are keyed to goal families, so a strength stack gets the strength image
every time and two people with the same goals get the same card. The choice is
frozen into the payload at share time (`artKey`), so re-shooting the set never
changes a card somebody has already posted.

---

## The specification

| | |
|---|---|
| **Dimensions** | 1200 × 1600 minimum (4:3 portrait). Rendered at ~520 × 700 on the story card and cropped, so keep the subject central with room around it. |
| **Format** | PNG. Transparent background is fine and preferred — the card paints its own ground behind. |
| **File size** | Under 250KB each after compression. They are read per render on the image route. |
| **Ground** | Near-black (`#07070a`) or transparent. Never a light or busy background — the card's image panel is dark and the picture sits on a cyan bloom. |
| **Lighting** | One hard key, deep shadow, and a cyan rim (`#00d4ff`) somewhere in every image. This is what ties the six together. |
| **Colour** | Cyan and violet only, over near-black. No warm casts, no other accent hues. `wellbeing` may run slightly warmer but stays on the dark ground. |
| **Safe area** | Nothing important in the left 15% — the routine-fit numeral is ghosted over that side. |
| **No text** | No words, logos or numbers baked into the image. The card supplies all of those. |
| **No people's faces** | Bodies and hands are fine, faces are not: a face makes the card about a model rather than about the person posting it. |

---

## The six

### 1. `strength` — muscle, bulking
Heavy, dense, low light. A loaded barbell, plates, or chalked hands. Deep shadow,
one cyan rim light down an edge. Should feel like weight.

### 2. `performance` — performance, cutting
Motion. A body mid-effort, frozen sharp — a sprint, a jump, a pull. Cyan edge
light, dark ground. Speed and output rather than "gym".

### 3. `energy` — energy, focus
Charge. Electric, high contrast, cyan into violet. The most abstract of the six —
an arc, a discharge, a filament. No product, no body.

### 4. `recovery` — recovery, sleep, stress
Stillness after effort. Cool, quiet, low key. Steam, water on skin, a body at
rest, a dark room with one light in it. The calm counterweight to 1 and 2.

### 5. `wellbeing` — health, immune, skin, menopause, gut
Daylight and calm. The one image allowed to be softer and slightly warmer, still
on a near-black ground. Everyday rather than athletic — this card goes to people
who never said the word "training".

### 6. `hydration` — hydration, and every LQD drinks package
Liquid. A pour, a splash, condensation on a cold surface. Cyan through the water,
hard specular highlights. This one carries the whole LQD line, so it should read
as "drink" instantly.

---

## Checking them

Drop the files in, then look at `/styleguide/share`: it renders all six personas
across all three formats from the real image route, so what is on that page is
byte-identical to what a customer downloads. The placeholder label disappears as
each family is cleared.

Two things to check that are easy to miss at full size:

- **At 200px wide.** Most people see the card as a story thumbnail first. If the
  subject is unreadable there, the image is too busy.
- **Against the light panel.** The picture sits directly above a near-white
  panel, and an image with a pale bottom edge loses the join between them.
