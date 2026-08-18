# The design system

Read this before styling anything outside the quiz flow. It describes what the
three hubs — Founders Hub, My Hub, Partners Hub — are built from, and the rules
that keep the surfaces readable. `docs/DESIGN_AUDIT.md` is the evidence behind
every number here.

Everything below is enforced by tests, not convention:
`src/app/__tests__/tokens.test.ts` and
`src/components/system/__tests__/tokens-only.test.ts`.

---

## The short version

1. **Build from `@/components/system`.** Never hand-roll a button, field, badge,
   modal, tab strip or progress bar.
2. **Use tokens for every design value.** No hex, no `rgba()`, no literal `px`,
   no Tailwind colour / type / radius / spacing utility.
3. **Glass on nav and modals. Solid on buttons, inputs and list rows.** Nothing
   else blurs.
4. **Small text is the constraint.** Every ink and tone clears AA on every
   surface, but only because the specular is a band — see below.
5. **If a primitive can't express it, say so** rather than inventing a one-off.

---

## Why it looks the way it does

Glass only reads as glass when there is something worth blurring behind it. On a
flat background, `backdrop-filter: blur()` is grey haze — the surface has nothing
to refract, so it reads as a slightly lighter rectangle and the effect looks like
a mistake.

The design is a stack, and each layer depends on the one below:

1. **A lit ground** — three blooms (cyan, violet, teal) drifting independently on
   long cycles over a near-black base, with a vignette pulling the corners down
   and film grain over everything. `<Ground>`. Separate elements rather than one
   gradient, because what makes it read as weather instead of wallpaper is that
   the three move independently. The grain is not decoration: large soft
   gradients band visibly on an 8-bit display, and grain is what breaks the bands
   up and gives the black something to be made of.
2. **Translucent surfaces at three elevations** — `--surface-1`/`-2`/`-3`, white
   at 5/8/11% over the ground.
3. **A specular band on the top edge** — a bright hairline where the light
   catches, and a short gradient falling away beneath it. `.system-glass`. This
   is the single detail that makes a surface read as a physical sheet rather than
   a lighter box, and §"The specular invariant" below is why it can be as strong
   as it is.
4. **Solid controls that behave like objects** — a `primary` button is a vertical
   gradient, an inset white highlight along its top edge, and a coloured bloom
   underneath. On hover it lifts, the bloom grows, and a band of light crosses
   the face once (`.system-sheen`).
5. **Spring easing** — things enter on `--ease-spring` and leave on
   `--ease-exit`. Linear motion makes a translucent panel read as a texture being
   dragged rather than an object arriving.

Remove any layer and the one above it stops working. A glass card on a flat page
is just a grey box; a lit ground under flat cards is just a gradient.

## The specular invariant

The one rule the whole design rests on, and the one that is not obvious:

> **`--specular-depth` equals the tightest card padding.**

Text therefore begins exactly where the highlight has finished, and the plane
that carries words is the plain surface. That is what buys everything else — the
blooms can run at 12% and the highlight at 14% without either being paid for in
legibility.

Break the equality and the numbers stop meaning anything, silently. Measured on
the deepest plane over the brightest ground:

| Specular treatment | Worst text contrast |
|---|---|
| Band, finishing at the padding | **4.88:1** — passes |
| Falloff of 20px past a 12px padding | 4.17:1 |
| Falloff of 56px (a wash) | 3.65:1 |

`padding="none"` is the exception: the caller owns the inset, so the caller owns
this rule.

---

## The cap: where glass is allowed

`backdrop-filter` costs a full-surface recomposite every frame it changes. The
budget is **three blurred surfaces composited at once**, all of them persistent
chrome.

| Element | Surface | Blur |
|---|---|---|
| Sticky header / nav | `--surface-2` | `--blur-nav` |
| Modal panel | `--surface-3` | `--blur-panel` |
| Modal scrim | `--surface-scrim` | `--blur-scrim` |
| Card, standalone | `--surface-1` | **none** |
| Card in a scrolling list | `--surface-solid` | **none** |
| Button | solid fill | **none** |
| Input, select, textarea | `--surface-input` | **none** |

Every blur also carries `saturate(var(--blur-saturate))`. That is the detail that
stops frosted glass going grey: blur alone washes the colour out of what is
behind it, and the saturate pulls it back up so the ground's cyan still reads
through the panel.

**Never blur inside a scrolling list.** Thirty glass rows is thirty backdrop
filters recompositing per scroll frame. `--surface-solid` exists for exactly
this. It is matched by eye against a glass card over an unlit part of the ground,
because that is where most lists actually sit — no single opaque colour can track
a surface whose brightness follows the light beneath it, so what the test asserts
is the part that matters: it sits above the page, below the raised planes, and
text on it clears AA comfortably.

**Buttons and inputs stay solid.** A translucent control over a moving background
loses its edge, and a field is the one surface someone stares at while typing.

---

## The contrast rule, and why the palette moved

This is the part that is easy to break and impossible to see.

`--color-muted` (`#7d7d87`) clears AA at 4.88:1 — but only against the flat page
background, which is all `contrast.test.ts` checked. This design moves the ground
under text twice over, and that value measures **4.10:1** once composited. It is
the app's largest tier of copy, set at 10 and 11px, and the old test stays green
the entire time.

The ink tiers are therefore cool rather than neutral — a warm grey over a
cyan-lit ground reads as dirty — and lifted:

| | | Worst plane |
|---|---|---|
| `--ink-1` | `#f4f6fb` | 10.77:1 |
| `--ink-2` | `#c3c8d2` | 6.94:1 |
| `--ink-3` | `#a2a8b4` | **4.88:1** |

Every tone clears AA as text on all three surfaces, and `--ink-on-accent`
(`#07070a`) clears it on every stop of every gradient fill — both ends, not just
the middle, which is the part nothing else measures.

The caps, all asserted:

- **Overlapping blooms ≤ 12% + 5%** — the brightest point the ground reaches
- **Text-bearing glass ≤ 11% white** (`--surface-1`/`-2`/`-3`)
- **`--specular-depth` ≤ the tightest card padding**

`--surface-press` sits above the cap deliberately: it lasts about 100ms and
nothing rests there to be read.

If you want a brighter ground, re-solve the ink tiers first — and `--ink-3`
cannot rise much further before it collides with `--ink-2` and the three-tier
hierarchy collapses into two.

---

## The primitives

`@/components/system`. Every one consumes tokens and nothing else.

| Primitive | Notes |
|---|---|
| `Ground` | The mesh. Wrap each hub shell in it. |
| `Button` | `primary` / `secondary` / `ghost` / `destructive`; `sm`/`md`/`lg`; `loading`; `icon`/`iconRight`. |
| `Card` | `elevation` 1–3, `solid`, `tone`, `padding`, `interactive`. |
| `Input` | `label` required; `hint`, `error`, `prefix`, `suffix`, `compact`, `align`. |
| `Select` | Native `<select>`, styled. Same label/hint/error shell, same `compact`. |
| `Modal` | + `ModalHeader`/`Body`/`Footer`. Focus-trapped, Escape, scroll lock. |
| `Badge` | `neutral`/`accent`/`positive`/`attention`/`critical`/`info`; `soft`/`solid`. |
| `Tabs` | Real tablist: roving tabindex, arrow keys, Home/End. |
| `ChargeMeter` | The house signature. Any proportion, drawn as liquid. |

Review them at **`/styleguide`** — every primitive in every state, on the real
ground. Approve changes there before rolling them out, and check them there when
a token moves.

**`/styleguide/compare`** is the other half: My Hub's dashboard rendered both
ways — the current design and this one — from one set of data and one set of
copy. A styleguide cannot tell you whether the design is better, because nobody
can prefer a component gallery; a real screen can. Use `?blind=1` when showing it
to anyone, and `&swap=1` for half of them, so you are measuring the design rather
than the label on it. `compare.test.tsx` asserts both arms render identical text,
which is what keeps the answer meaningful.

### `destructive` is not "the member cancelling something"

`destructive` is the critical tone — actual red — for actions that destroy data:
deleting a bundle, removing a product. It is **not** for a member cancelling a
subscription or skipping a delivery. Nothing a member does to their own plan is
an error, and painting it red says "you broke it" about a decision they are
entitled to make. Those are `secondary` with an honest label.

### Progress is poured, not filled

`ChargeMeter` is what makes this system read as CHRGD rather than as a competent
dark theme. The quiz already treats progress this way — `LiquidRail`,
`ChargeRail`, `ChargeScale` — and the hubs currently draw a grey bar. Anywhere a
hub shows a proportion (stack completeness, a payout threshold, stock cover, a
partner's progress towards a tier), it takes this shape: a drifting meniscus at
the leading edge, charge travelling through the fill, a bloom the colour of the
level, and a number that rolls rather than snaps.

### `fullWidth` is off by default

At every size. The layer this replaced stretched `md` and `lg` automatically,
which suited My Hub's phone-width column of calls to action and is wrong in a
dense desktop tool — it puts the second button in a dialog footer off the edge of
the panel. Opt in.

---

## Tokens

`src/app/tokens.css`. Roles, not scale values: `--text-meta`, not `--text-sm` —
because `text-sm` means 14px to Tailwind and the quiet tier here is 11px.

They live in `:root` rather than Tailwind's `@theme` on purpose. `@theme`
generates utilities, and its namespaces collide: `--spacing-1` would silently
redefine `p-1` across the whole app.

Read them the way the app already does:

```tsx
<div style={{ background: 'var(--surface-1)', padding: 'var(--space-4)' }} />
<p className="text-[var(--ink-2)]" />
```

| Group | Tokens |
|---|---|
| Ground | `--ground-base`, `--bloom-accent/violet/teal`, `--bloom-1/2/3-alpha`, `--grain-opacity` |
| Elevation | `--surface-1/2/3`, `--surface-hover/press/solid/input/scrim` |
| Specular | `--specular-depth/strength/line` |
| Edges | `--edge`, `--edge-strong`, `--edge-top` |
| Blur | `--blur-nav/panel/scrim`, `--blur-saturate` |
| Ink | `--ink-1/2/3`, `--ink-on-accent` |
| Print | `--surface-print`, `--ink-print`, `--ink-print-2` — the share card only |
| Tone | `--accent`, `--accent-bright/deep`, `--tone-positive/attention/critical/info` |
| Tinted steps | `--{accent,positive,attention,critical,info}-{fill,line,glow}` |
| Fills | `--fill-accent/positive/attention/critical/info/neutral/glass` |
| Type | `--text-micro/meta/body-sm/body/lead/title/display/hero`, `--leading-*`, `--weight-*`, `--tracking-display/title/eyebrow` |
| Radius | `--radius-pill/chip/row/card/sheet` |
| Space | `--space-1/2/3/4/5/6/8`, `--gutter`, `--stack` |
| Controls | `--control-sm/md/lg`, `--focus-ring`, `--focus-ring-critical`, `--modal-sm/md/lg` |
| Shadow | `--shadow-none/card/raised/panel`, `--glow-accent`, `--glow-accent-strong`, `--glow-critical`, `--inset-highlight/hairline/well` |
| Motion | `--ease-settle/spring/exit`, `--duration-fast/base/slow/drift`, `--disabled-opacity` |

### The system owns shapes; components pass colours

A glow's *shape* is a class in `system.css` (`.system-chip-solid`,
`.system-card-glow`, `.system-charge-fill`); the component sets `--tone-glow` and
nothing else. That split is what stops five tones becoming five hand-written
shadow strings every time a component wants one, and it is why the primitives can
be linted for containing no length literals at all.

Resting shadows are applied by `.system-control`, not inline. Inline styles
outrank stylesheet rules, so a button painting its own glow could not have that
glow cancelled by `:disabled` — which is exactly what a disabled primary did:
fully dimmed, still blooming.

### One light surface, and where it is allowed

`--surface-print` is the only light surface in the system, and it exists for the
one thing this app makes that is not a screen: the share card's data panel. A
card leaves the product — it sits in someone's story next to whatever else they
posted — and a dense numbered list is far more legible as black on light than as
light on black.

It is a surface, not a theme. Nothing in the app may use it, and `--ink-print` /
`--ink-print-2` exist only to sit on it.

The rule it adds: **the accent does not clear AA on a print surface.**
`--accent` measures 2.1:1 there and `--accent-deep` 2.6:1, so on that panel the
accent is a graphic fill or display-size type only, never a small label. The card
uses it for the ghosted score and the charge field, and near-black everywhere
words have to be read.

### Three alphas, not sixteen

Tints come in exactly three strengths, and adding a fourth is the failure mode
this replaced — the hubs currently call `color-mix` with sixteen different
percentages doing the work of three intents.

- `*-fill` — 12%, a tinted surface
- `*-line` — 35%, a tinted border
- `*-glow` — 45%, a bloom

### Interaction states

Hover, active and disabled live in `src/app/system.css`, keyed off custom
properties the component sets (`--hover-bg`, `--hover-edge`). Hover is guarded
behind `@media (hover: hover)` throughout — an unguarded `:hover` sticks after a
tap and leaves the last thing pressed looking permanently active.

Motion is gated on `prefers-reduced-motion`: the blooms stop drifting, the sheen
stops sweeping, the meniscus stops moving, the press travel goes entirely, and
the rolling number snaps. The one deliberate exception is the `Button` loading
spinner — it is the only signal a press was received, it occupies a 16px square,
and freezing it leaves a reduced-motion user unable to tell a slow request from a
dead one.

---

## Migration status

`@/components/ui` is the layer being replaced. Both exist during the migration;
the old one is deleted as the last hub lands.

| Area | State |
|---|---|
| My Hub (`src/components/hub`) | on `@/components/ui`, not yet migrated |
| Founders Hub (`src/components/portal`, `src/app/founderhub`) | unmigrated |
| Partners Hub (`src/components/partner`) | unmigrated |

Until a hub is migrated it still runs on the old palette (`--color-*`,
`lib/ui/tokens.ts`, `GLASS`). Do not mix the two systems inside one component.

`Icon` is shared across the line on purpose — it is a drawn glyph set rendering
in `currentColor`, with no design values of its own. It is the only import the
primitive layer is allowed to take from outside itself.

---

## `compact` — the field for a table row

`Input` and `Select` render a label above the control, which is right for a form
and wrong for a dense table row. The Founders Hub pricing screens are full of
narrow right-aligned number inputs sitting inside rows that already name them, and
the stacked field puts a second label above every one.

`compact` draws no label, hint or error line. Nothing is dropped, only moved: the
name goes to `aria-label`, and the hint and error are still rendered, still
referenced by `aria-describedby`, and still announced — as `sr-only`. A screen
reader gets exactly what the stacked field gives. Pair it with `align="right"` on
anything numeric, which also switches on tabular figures so a column does not
shift width as it is typed.

Two things it does not do:

- **It does not shrink below the thumb.** Compact sits at `--control-sm` (36px).
  The raw fields it replaces are around 30px, so the dense pages get slightly
  taller — deliberately. A number box nobody can hit is not an improvement on a
  tall one.
- **It does not invent a label.** `label` is still required. A field with no name
  is a field nobody can use, and in compact mode it is the *only* name there is.

`className` goes on the box: on the control normally, and on the wrapper when
`prefix` or `suffix` means the wrapper is the box. Width is the only thing that
belongs there.

Both variants are on `/styleguide`, side by side, under **Compact fields**.

## The Founders Hub focus floor

`.founder-hub` on the hub's roots, plus a rule in `system.css`, gives every
button, link and field inside the region a focus ring whether or not it has been
converted to a primitive. The hub had none at all — 131 controls, no visible
focus anywhere, including the two password fields guarding it.

It is a floor under a migration in progress, not a licence to skip the
primitives: converting a control changes nothing about how it focuses, and the
floor means a raw control added tomorrow is covered the day it lands.
`founder-hub.test.ts` holds it, along with the ban on hex colours, local palette
constants and retired `--color-*` variables anywhere in the hub.

## If you need something the system doesn't have

In order of preference:

1. **Compose it from existing primitives.** Most "new patterns" are a `Card` with
   a `Badge` in it.
2. **Add a token** and note it here, if the value has a scale the system is
   missing.
3. **Add a primitive**, render it on `/styleguide`, and document it above.

Do not add a one-off style at a call site. That is exactly how the codebase
arrived at 39 file-local copies of the accent colour, 92 spacing values, 13 type
sizes and two different reds.
