# Design audit — Founders Hub, My Hub, Partners Hub

Pass 1 of 3. This document inventories what the three hubs are actually styled
with today, names the duplicates and near-duplicates, and proposes one token set
to replace them. **No component was changed.** The only code landed alongside
this document is `src/app/tokens.css` — a new custom-property layer that nothing
consumes yet, plus a test that locks its contrast guarantees.

Passes 2 and 3 (primitives, then per-hub migration) are described at the end.

---

## 1. Scope and method

| Area | Directories | Files |
|---|---|---|
| Founders Hub | `src/components/portal`, `src/app/founderhub` | 59 |
| My Hub | `src/components/hub`, `src/app/myhub` | 25 |
| Partners Hub | `src/components/partner`, `src/app/(partner-gated)`, `src/app/(partner-open)` | 6 |
| Shared UI | `src/components/ui` | 13 |

The quiz flow, shop, bundles, stack-review, scroll experience and checkout are
out of scope. Tests excluded. ~13,800 lines scanned.

Every figure below is extracted mechanically from source — Tailwind utility
classes, `style={{…}}` props, and colour constants — not sampled by eye.

### Prior art already in the repo

Two consolidation efforts exist and are half-landed. Any new token set has to
absorb them rather than become a third system:

- `src/lib/ui/tokens.ts` — `ACCENT`/`GREEN`/`AMBER`/`RED`, `GLASS`, `RADIUS`,
  `EASE`, `tint()`, `glow()`.
- `src/app/globals.css` `@theme inline` — `--color-*`, `--radius-*`,
  `--ease-brand`, `--font-*`, two fluid heading sizes.
- `src/components/ui/*` — Button, Card, Chip, Sheet, Skeleton, EmptyState,
  IconButton, OptionRow, Note, Eyebrow, Disclosure, Icon, ChargeScale.

**Adoption is wildly uneven, and that is the headline finding:**

| Area | Files | Imports `lib/ui/tokens` | Imports `components/ui` |
|---|---|---|---|
| My Hub | 23 | 20 | 20 |
| Founders Hub | 59 | **0** | **0** |
| Partners Hub | 3 | **0** | **0** |

My Hub is ~87% migrated. Founders Hub and Partners Hub have not started. The
work is therefore far more lopsided than "three hubs" suggests: Founders Hub is
about 80% of the remaining diff.

---

## 2. The inventory

### 2.1 Colour

15 distinct hex literals, 188 occurrences, across 40+ files.

| Hex | Uses | Where | What it is |
|---|---|---|---|
| `#f87171` | 43 | Founders 38, Partners 5 | red |
| `#fbbf24` | 41 | Founders 37, My 3, Partners 1 | amber |
| `#00d4ff` | 40 | Founders 32, My 5, Partners 3 | brand accent |
| `#34d399` | 37 | Founders 34, My 2, Partners 1 | green |
| `#001018` | 13 | Founders 13 | label colour on an accent fill |
| `#fca5a5` | 3 | Founders 3 | lighter red |
| `#a78bfa` | 2 | Founders 2 | violet, one file |
| `#ff6b6b` | 2 | Founders 2 | **a second red** |
| `#1a1200`, `#00180e`, `#00180c`, `#dc2626`, `#fff`, `#0a0a0a`, `#7dd3fc` | 1 each | — | one-offs |

Declared as file-local constants rather than imported:

| Constant | Files declaring it |
|---|---|
| `const ACCENT = '#00D4FF'` | **39** |
| `const AMBER = '#fbbf24'` | 23 |
| `const GREEN = '#34d399'` | 19 |
| `const RED = '#f87171'` | 14 |
| `const RED = '#ff6b6b'` | 2 |

CSS custom properties are used alongside these, 1,347 times:

`--color-muted` 447 · `--color-text` 251 · `--color-border` 212 ·
`--color-text-2` 136 · `--color-surface-2` 101 · `--color-surface` 85 ·
`--color-bg` 46 · `--color-red` 32 · `--color-accent` 28 ·
`--color-border-2` 7 · `--color-amber` 2

And `GLASS.*` from `tokens.ts` 95 times: `hairline` 49, `surface` 31,
`raised` 11, `hairlineStrong` 4.

### 2.2 Type

13 distinct font sizes, 963 uses:

| Class | Computed | Uses |
|---|---|---|
| `text-xs` | 12px | 263 |
| `text-[11px]` | 11px | 260 |
| `text-sm` | 14px | 232 |
| `text-[10px]` | 10px | 124 |
| `text-lg` | 18px | 26 |
| `text-2xl` | 24px | 23 |
| `text-3xl` | 30px | 9 |
| `text-[9px]` | 9px | 9 |
| `text-base` | 16px | 8 |
| `text-xl` | 20px | 6 |
| `text-[12px]` / `text-[12.5px]` / `text-[15px]` | — | 1 each |

4 weights, 460 uses: `font-bold` 302 · `font-black` 96 · `font-semibold` 56 ·
`font-medium` 6.

Two font families, applied via an inline `fontFamily: 'var(--font-display)'`
repeated on essentially every heading and button.

### 2.3 Radius

9 distinct values, 391 uses:

`rounded-xl` 139 · `rounded-2xl` 113 · `rounded-full` 66 · `rounded-lg` 51 ·
`rounded` 13 · `rounded-t-3xl` 4 · `rounded-3xl` 3 · `rounded-t-2xl` 1 ·
`rounded-md` 1

### 2.4 Spacing

**92 distinct values, 1,472 uses** — 51 padding, 35 margin, 6 gap.

The long tail is the problem, not the head. `px-3` (89) and `py-2` (71) are
fine; `pb-1.5`, `pt-0.5`, `mb-2.5`, `mx-5`, `mb-7`, `mt-7`, `pr-24`, `mb-px`
each appear exactly once.

### 2.5 Elevation, blur, motion

This is where there is almost nothing to inventory, which is itself the finding.

- **Shadows:** zero `shadow-*` utility classes in scope. Three inline
  `boxShadow` values, all accent glows, all in My Hub / shared UI. There is no
  elevation system.
- **`backdrop-filter`:** two uses in the entire scope — `blur(12px)` on the My
  Hub sticky header, `blur(6px)` on the shared `Sheet` scrim.
- **Transitions:** 53 uses. `transition-all` 41 · `transition-colors` 8 ·
  `transition` 2 · `transition-transform` 2. Only 22 carry an explicit
  `duration-200`; the rest inherit Tailwind's 150ms default.
- **Easing:** one `cubic-bezier(0.34,1.56,0.64,1)` in shared UI, `ease-out` and
  `ease-in` once each. `--ease-brand` is defined in `globals.css` and referenced
  from `tokens.ts` as `EASE`, but appears in only a handful of call sites.
- **Opacity:** `opacity-40` 41 · `opacity-50` 6 · `opacity-30` 5 ·
  `opacity-25` 1 — four values for what is one state (disabled).

### 2.6 Composed colour

`color-mix(in srgb, C N%, transparent)` is the house idiom for tints, borders
and glows. It is called with **16 different percentages**:

40% (19) · 14% (17) · 35% (16) · 12% (14) · 30% (12) · 8% (9) · 10% (6) ·
45% (3) · 7% (2) · 6% (2) · 20% (2) · plus 22%, 25%, 28%, 55%, 60% via
`tint()`.

---

## 3. Duplicates and near-duplicates

Ranked by how much they cost.

### D1 — Two different reds, and the two token systems disagree

`src/lib/ui/tokens.ts` exports `RED = '#ff6b6b'`.
`src/app/globals.css` defines `--color-red: #f87171`.

They are different colours. 14 files hard-code `#f87171`; 2 files hard-code
`#ff6b6b`; 32 call sites use `var(--color-red)`. A component picking "the red"
gets a different answer depending on which import it reached for. `#fca5a5` and
`#dc2626` are two further reds in the same screens.

### D2 — The accent is declared 39 times

`const ACCENT = '#00D4FF'` is redeclared as a file-local constant in 39 files,
while `--color-accent` and `tokens.ts`'s `ACCENT` both already exist. Same for
amber (23), green (19), red (14). This is 95 opportunities for the drift in D1
to happen again, and it already has.

### D3 — Three competing surface systems

Three unrelated ways to paint a card background coexist, often on adjacent
elements:

1. `var(--color-surface)` (85) / `var(--color-surface-2)` (101) — opaque greys.
2. `GLASS.surface` / `GLASS.raised` (42) — translucent white on the page.
3. `color-mix(in srgb, ACCENT 12%, transparent)` — tinted translucency.

And two border systems: `var(--color-border)` (212) versus `GLASS.hairline`
(49). Founders Hub uses (1) exclusively; My Hub uses (2) and (3). A card in
Founders Hub and a card in My Hub are not the same object.

### D4 — 16 alpha percentages doing the work of three

The `color-mix` percentages above collapse to three intents, and nothing more:

- **fill a surface with a tone** — 6, 7, 8, 10, 12, 14% in use → one value
- **draw a tinted border** — 20, 22, 25, 28, 30, 35, 40% in use → one value
- **throw a glow** — 40, 45, 55, 60% in use → one value

12% vs 14% at that alpha is not a perceptible difference; it is just an
un-reviewed decision repeated 31 times.

### D5 — The type scale has four sizes below 12px

9px, 10px, 11px and 12px are all in use for the same job — quiet metadata — with
`text-[11px]` alone appearing 260 times. Three of the four (9/10/11) sit below
the size at which `--color-muted`'s contrast is defensible (see §4).

`text-lg` (18px) and `text-xl` (20px) are both in use for section headings, 26
and 6 times, with no rule distinguishing them.

### D6 — Radius disagrees between adjacent elements

`rounded-lg` (12px), `rounded-xl` (16px) and `rounded-2xl` (24px) all appear as
"a card". `tokens.ts` already documents this ("the hub currently mixes
`rounded-lg`, `-xl`, `-2xl` and `-3xl` on elements sitting side by side") and
defines `RADIUS`, but `RADIUS` is imported by no file in scope.

### D7 — 151 hand-rolled buttons and 79 hand-rolled inputs

Raw elements outside the primitive layer:

| Area | `<button>` | `<input>` | `<select>` | `<textarea>` |
|---|---|---|---|---|
| Founders Hub (`portal`) | 104 | 58 | 11 | 8 |
| Founders Hub (`app/founderhub`) | 38 | 12 | 1 | 1 |
| Partners Hub | 9 | 6 | 0 | 0 |
| My Hub | 8 | 3 | 0 | 0 |

A `Button` primitive exists and is used by My Hub. Founders Hub instead carries
local class strings that partially reinvent it, e.g.

```
FulfilmentQueue.tsx:  const BTN   = 'text-xs font-bold px-3 py-2 rounded-xl border disabled:opacity-40'
FulfilmentQueue.tsx:  const SMALL = 'text-[11px] font-bold px-2.5 py-1.5 rounded-lg border disabled:opacity-40'
PartnerDetail.tsx:    const BTN   = 'text-xs font-bold px-3 py-2 rounded-xl active:scale-95 transition-all disabled:opacity-40'
PartnerDetail.tsx:    const INPUT = 'w-full px-3 py-2 rounded-xl text-sm outline-none'
pricing/page.tsx:     const SMALL_INPUT = 'w-16 px-2 py-1.5 rounded-lg text-xs text-right outline-none'
```

Two `BTN` constants in two files, differing in radius and press behaviour.
`outline-none` with no replacement focus ring appears on both input constants —
a keyboard user gets no visible focus at all on those fields.

There is **no Input, Select, Modal, Badge or Tabs primitive at all**, which is
why 79 inputs and 151 buttons are hand-drawn.

### D8 — Four modal implementations

`Sheet` (shared, animated, focus-trapped) is used by My Hub. Founders Hub
hand-rolls its own overlays in `ProductEditor`, `AiSuggestPanel`, `BundleEditor`
and `PartnerDetail`, with scrims of `rgba(0,0,0,0.72)` (×3) and
`rgba(0,0,0,0.6)` (×1), none of which animates, traps focus or restores focus on
close.

### D9 — "Disabled" is four opacities

`opacity-40` (41), `opacity-50` (6), `opacity-30` (5), `opacity-25` (1).

---

## 4. The constraint that shapes the whole system: contrast on glass

This is the finding that has to land before any glass is applied, because it
invalidates the current palette.

`--color-muted` (`#7d7d87`) was deliberately lifted from `#71717a` and is locked
by `src/app/__tests__/contrast.test.ts` at **4.88:1 against the flat page
background `#09090b`** — just over AA.

That test only checks the flat background. Glass changes the ground under the
text twice over: a gradient mesh lightens the page, and a translucent panel
lightens it again. Measured, compositing `#7d7d87` over a translucent white
panel on a lit ground:

| Panel (white alpha over lit ground) | `#7d7d87` contrast | AA (4.5:1) |
|---|---|---|
| 3% | 4.10 | ✗ |
| 6% | 3.78 | ✗ |
| 9% | 3.45 | ✗ |
| 12% | 3.13 | ✗ |

**Every one fails.** `--color-muted` is used 447 times, overwhelmingly at 10px
and 11px — the worst possible place to be under AA. Shipping glass with the
current palette would put the app's largest tier of copy below AA everywhere,
and the existing test would stay green throughout.

Solving for the minimum acceptable value, with the mesh capped at 6% and panels
capped at 8%:

| Candidate | Flat bg | 4% panel | 6% panel | 8% panel |
|---|---|---|---|---|
| `#7d7d87` (current) | 4.88 | 4.32 | 4.10 | 3.86 |
| `#8a8a95` | 5.83 | 4.95 | 4.70 | 4.43 |
| **`#909099`** | **6.29** | **5.34** | **5.07** | **4.78** |
| `#94949e` | 6.62 | 5.63 | 5.34 | 5.03 |

`#909099` clears AA on every allowed surface with headroom, and stays darker
than `--color-text-2` (`#a1a1aa`), so the three-tier hierarchy the existing test
asserts still holds.

**Three hard caps fall out of this, and they are what keep the glass honest:**

1. **Mesh brightness ≤ 6% cyan / ≤ 5% violet over `#09090b`.** Brighter and the
   muted tier needs lifting again until it collides with `text-2`.
2. **Glass panels ≤ 8% white.** 9% and above puts `#909099` back under AA.
3. **`--color-muted` must move to `#909099` before any surface goes
   translucent.** Not after.

Everything else on the palette is comfortable: accent 7.9–9.4:1, green 7.3–8.7,
amber 8.4–10.0, red 5.1–6.0, all measured on the same stack.

For labels on an accent fill, `#09090b` gives 11.24:1 on cyan and 11.92:1 on
amber, beating the `#001018` used in 13 Founders Hub files (10.91 / 11.57) — so
that one-off resolves to the existing background token rather than needing a new
one.

---

## 5. Proposed token set

> **Superseded by what shipped.** This section is the pass-1 proposal, kept as
> the record of what was argued for and why. Building the primitives against a
> real background showed the palette was far too timid — and, more importantly,
> that a specular highlight run as a *wash* rather than a *band* costs more
> contrast than the entire mesh does. Confining it bought a much stronger ground
> (blooms at 12%, surfaces at 5/8/11%, brighter cool inks) at no cost in
> legibility. `DESIGN.md` has the shipped values and the measurements behind
> them; §4's method still stands, only its numbers moved.

Landed as `src/app/tokens.css`, imported by `globals.css`, **consumed by
nothing**. It is additive: no existing custom property changes value, so the
rendered app is byte-identical today.

Names are role-based rather than scale-based (`--text-meta`, not `--text-sm`) to
avoid collision with Tailwind's own scale, where `text-sm` means 14px but this
system's quiet tier is 11px. They live in `:root` rather than `@theme` for the
same reason — adding `--spacing-1` to `@theme` would silently redefine the `p-1`
utility across the whole app.

### 5.1 Ground — the thing glass blurs

Backdrop blur over a flat colour is grey haze. The mesh is what makes the
surfaces read as glass, and it is capped by §4.

```
--ground-base      #09090b        the page under everything
--ground-tint-a    accent  6%     top-left bloom
--ground-tint-b    violet  5%     top-right bloom
--ground-tint-c    accent  4%     bottom drift
--ground           the three composited as fixed radial gradients
```

### 5.2 Elevation — three planes, not five

```
--surface-1        white 3%       resting card, list row
--surface-2        white 6%       nav, raised card, hover
--surface-3        white 8%       modal panel, the top of the stack
--surface-hover    white 6%
--surface-press    white 9%       transient only; never carries body text
--surface-solid    #131317       opaque. scrolling lists, virtualised rows
--surface-input    #131317       opaque, per the "solid on inputs" cap
--surface-scrim    black 72%      modal backdrop
```

Replaces: `--color-surface`, `--color-surface-2`, `GLASS.surface`,
`GLASS.raised`, and the 6/7/8/10/12/14% one-off tints (D3, D4).

### 5.3 Edges — the hairline light

```
--edge             white 8%       the default border
--edge-strong      white 16%      hover, or a border meant to be seen
--edge-top         white 14%      top edge only, where the light catches
```

Replaces `--color-border`, `--color-border-2`, `GLASS.hairline`,
`GLASS.hairlineStrong`.

### 5.4 Blur — rationed

```
--blur-nav         16px
--blur-panel       24px
--blur-scrim       8px
```

Budget: **at most three blurred surfaces composited at once**, all of them
persistent chrome — the sticky header, an open modal panel, its scrim. Never on
a card inside a scrolling list; a list of 30 glass cards is 30 backdrop filters
recompositing per frame. `--surface-solid` exists for exactly that case.

### 5.5 Ink

```
--ink-1            #fafafa
--ink-2            #a1a1aa
--ink-3            #909099       lifted from #7d7d87 — see §4
--ink-on-accent    #09090b       replaces the #001018 one-off
```

### 5.6 Accent and tone

One accent, four semantic tones, each with the three derived steps that replace
D4's sixteen percentages.

```
--accent            #00D4FF
--accent-dim        #00AACC
--accent-violet     #7c5cff      mesh only, never text

--tone-positive     #34d399      credits, savings, done
--tone-attention    #fbbf24      needs a decision — never "error"
--tone-critical     #f87171      genuine failure  (resolves the #ff6b6b split)
--tone-info         #7dd3fc

--*-fill            tone at 12%  tinted surface
--*-line            tone at 35%  tinted border
--*-glow            tone at 45%  bloom
```

D1 resolves to `#f87171`: it is the value in `globals.css`, in 14 of the 16
hard-coding files, and measures 5.08:1 on the deepest allowed panel.

### 5.7 Type — 13 sizes to 8

```
--text-micro       10px    badges, uppercase eyebrows      (absorbs 9px, 10px)
--text-meta        11px    quiet metadata                  (the 260-use tier)
--text-body-sm     12px    dense body                      (absorbs text-xs, 12px, 12.5px)
--text-body        14px    default                         (absorbs text-sm)
--text-lead        16px    emphasised body                 (absorbs text-base, 15px)
--text-title       18px    card and section headings       (absorbs text-lg, text-xl)
--text-display     24px    page headings                   (absorbs text-2xl)
--text-hero        clamp() existing fluid heading          (absorbs text-3xl)
```

Weights collapse 4 → 3: `--weight-body` 500, `--weight-strong` 700,
`--weight-display` 900. `font-semibold` (56 uses) folds into `--weight-strong`.

**`--text-micro` and `--text-meta` may only carry `--ink-2` or brighter, or
`--ink-3` on `--surface-1`.** That is the rule §4 exists to enforce.

### 5.8 Radius — 9 to 5

```
--radius-pill      9999px    chips, toggles
--radius-chip      8px       badges, small inputs      (absorbs rounded, rounded-md)
--radius-row       12px      a row inside a card       (absorbs rounded-lg)
--radius-card      16px      a card, a full button     (absorbs rounded-xl)
--radius-sheet     24px      sheet top, modal panel    (absorbs rounded-2xl, -3xl)
```

The last three already existed in the `globals.css` `@theme` block, unused;
they move into `tokens.css` at the same values so the scale lives in one file.

### 5.9 Space — 92 to 7

```
--space-1  4px   --space-2  8px   --space-3 12px   --space-4 16px
--space-5 20px   --space-6 24px   --space-8 32px
```

Plus `--gutter` 20px (page edge) and `--stack` 12px (default vertical rhythm).
The single-use oddities in §2.4 all round to one of these.

### 5.10 Elevation shadow

```
--shadow-card      0 1px 2px black 40%
--shadow-raised    0 8px 24px -12px black 60%
--shadow-panel     0 24px 60px -20px black 70%
--shadow-glow      0 8px 30px -12px <tone> 45%     (replaces glow())
```

### 5.11 Motion — spring, not linear

```
--ease-settle      cubic-bezier(0.22, 1, 0.36, 1)      existing --ease-brand
--ease-spring      cubic-bezier(0.34, 1.56, 0.64, 1)   overshoot; enters and pops
--ease-exit        cubic-bezier(0.4, 0, 1, 1)          leaving is faster than arriving

--duration-fast    120ms   hover, colour
--duration-base    200ms   the default
--duration-slow    320ms   panels, sheets

--disabled-opacity 0.4     replaces the four values in D9
```

All motion tokens are already gated by the repo's `prefers-reduced-motion`
handling and `useReducedMotion`; nothing here changes that.

### 5.12 Where glass is allowed

The cap, stated as a rule so pass 3 can be reviewed against it:

| Element | Surface | Blur |
|---|---|---|
| Sticky header / nav | `--surface-2` | `--blur-nav` |
| Modal panel, sheet | `--surface-3` | `--blur-panel` |
| Modal scrim | `--surface-scrim` | `--blur-scrim` |
| Card, standalone | `--surface-1` | **none** |
| Card in a scrolling list | `--surface-solid` | **none** |
| Button | solid fill | **none** |
| Input, select, textarea | `--surface-input` | **none** |

---

## 6. What lands in passes 2 and 3

**Pass 2 — primitives.** Button (primary/secondary/ghost/destructive), Card,
Input, Select, Modal, Badge, Tabs, consuming only tokens, with
hover/focus/active/disabled/loading states, rendered on a `/styleguide` route
for review before any rollout. `Button`, `Card` and `Sheet` already exist and
get retargeted onto the tokens rather than rewritten. `DESIGN.md` at the end of
the pass.

**Pass 3 — migration, one hub per commit.** My Hub first (already ~87% on the
primitives, so it is the smallest diff and proves the pattern), then Founders
Hub (59 files, 0% adoption — the bulk of the work), then Partners Hub.

The `--color-muted` → `#909099` lift ships with the first hub that turns a
surface translucent, together with an extension to `contrast.test.ts` asserting
the ratio on composited glass rather than only on the flat background.

---

## 7. Verification

`src/app/tokens.css` introduces no `@theme` entries, so it generates no Tailwind
utilities, and no component imports it.

One overlap existed and was resolved rather than duplicated: `--radius-row`,
`--radius-card` and `--radius-sheet` were already declared in the `globals.css`
`@theme inline` block. They moved into `tokens.css` at identical computed values
(`0.75rem`/`1rem`/`1.5rem` → 12/16/24px), which keeps the radius scale in one
file next to the pill and chip sizes those three never covered. Neither the
generated utilities (`rounded-row` and friends) nor the custom properties had a
single call site anywhere in `src`, so the move is inert.

`src/app/__tests__/tokens.test.ts` locks the parts of this that are easy to
break later, reading the values out of the stylesheet rather than restating
them:

- every ink tier clears AA on every glass surface, composited over the
  brightest point of the mesh
- the mesh stays at or under 6% and text-bearing surfaces at or under 8%
- the elevation scale stays ordered and distinct
- `--surface-solid` stays within 0.01 luminance of the glass it substitutes for
  in scrolling lists
- each tone stays readable as text on the deepest panel, and as a label on its
  own fill
- the fill/line/glow alphas stay at 12/35/45
- `tokens.css` and `globals.css` share no custom property names

The rendered output of all three hubs is unchanged by this pass.
