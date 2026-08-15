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
   modal or tab strip.
2. **Use tokens for every design value.** No hex, no `rgba()`, no literal `px`,
   no Tailwind colour / type / radius / spacing utility.
3. **Glass on nav and modals. Solid on buttons, inputs and list rows.** Nothing
   else blurs.
4. **Small text is the constraint.** `--text-micro` and `--text-meta` may only
   carry `--ink-2` or brighter, or `--ink-3` on `--surface-1`.
5. **If a primitive can't express it, say so** rather than inventing a one-off.

---

## Why it looks the way it does

Glass only reads as glass when there is something worth blurring behind it. On a
flat background, `backdrop-filter: blur()` is grey haze — the surface has nothing
to refract, so it reads as a slightly lighter rectangle and the effect looks like
a mistake.

So the design is a stack, in this order, and each layer depends on the one below:

1. **A layered ground** — three damped radial blooms, fixed to the viewport, in
   `<Ground>`. This is the thing that makes translucency legible.
2. **Translucent surfaces at three elevations** — `--surface-1`/`-2`/`-3`, white
   at 3/6/8% over the ground.
3. **A hairline of light on top edges** — `--edge-top`, on the top edge only.
   Drawn on all four sides it stops being a highlight and becomes an outline.
4. **Spring easing** — things enter on `--ease-spring` and leave on
   `--ease-exit`. Linear motion makes a translucent panel read as a texture being
   dragged rather than an object arriving.

Remove any layer and the one above it stops working. A glass card on a flat page
is just a grey box; a mesh with opaque cards on it is just a gradient.

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

**Never blur inside a scrolling list.** Thirty glass rows is thirty backdrop
filters recompositing per scroll frame. `--surface-solid` exists for exactly
this, and is tuned to sit at the same visual weight as `--surface-2` composited
on the ground, so a solid row and a glass card do not read as two different
objects. The test holds them within 0.01 luminance.

**Buttons and inputs stay solid.** A translucent control over a moving background
loses its edge, and a field is the one surface someone stares at while typing.

---

## The contrast rule, and why the palette moved

This is the part that is easy to break and impossible to see.

`--color-muted` (`#7d7d87`) clears AA at 4.88:1 — but only against the flat page
background, which is all `contrast.test.ts` checked. Glass moves the ground
twice: the mesh lightens the page, and a translucent panel lightens it again.
Composited, that value measures **4.10:1 on a 3% panel and 3.45:1 on a 9% one**.
Every elevation fails, in the app's largest tier of copy, set at 10 and 11px.

`--ink-3` is therefore `#909099`, which measures 5.07:1 on a 6% panel and 4.78:1
at the 8% cap, and still sits below `--ink-2` so the hierarchy holds.

Three caps follow, and breaking any one of them puts the quiet tier back under
AA:

- **Mesh ≤ 6%** (`--ground-tint-*`)
- **Text-bearing glass ≤ 8% white** (`--surface-1`/`-2`/`-3`)
- **`--text-micro` and `--text-meta` carry `--ink-2` or brighter**, or `--ink-3`
  on `--surface-1` only

`--surface-press` sits above the cap deliberately: it lasts about 100ms and
nothing rests there to be read.

If you need a brighter ground, you must re-solve the ink tiers first — and
`--ink-3` cannot rise much further before it collides with `--ink-2` and the
three-tier hierarchy collapses into two.

---

## The primitives

`@/components/system`. Every one consumes tokens and nothing else.

| Primitive | Notes |
|---|---|
| `Ground` | The mesh. Wrap each hub shell in it. |
| `Button` | `primary` / `secondary` / `ghost` / `destructive`; `sm`/`md`/`lg`; `loading`; `icon`/`iconRight`. |
| `Card` | `elevation` 1–3, `solid`, `tone`, `padding`, `interactive`. |
| `Input` | `label` required; `hint`, `error`, `prefix`, `suffix`. |
| `Select` | Native `<select>`, styled. Same label/hint/error shell. |
| `Modal` | + `ModalHeader`/`Body`/`Footer`. Focus-trapped, Escape, scroll lock. |
| `Badge` | `neutral`/`accent`/`positive`/`attention`/`critical`/`info`; `soft`/`solid`. |
| `Tabs` | Real tablist: roving tabindex, arrow keys, Home/End. |

Review them at **`/styleguide`** — every primitive in every state, on the real
ground. Approve changes there before rolling them out, and check them there when
a token moves.

### `destructive` is not "the member cancelling something"

`destructive` is the critical tone — actual red — for actions that destroy data:
deleting a bundle, removing a product. It is **not** for a member cancelling a
subscription or skipping a delivery. Nothing a member does to their own plan is
an error, and painting it red says "you broke it" about a decision they are
entitled to make. Those are `secondary` with an honest label.

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
| Ground | `--ground-base`, `--ground-tint-a/b/c`, `--ground` |
| Elevation | `--surface-1/2/3`, `--surface-hover/press/solid/input/scrim` |
| Edges | `--edge`, `--edge-strong`, `--edge-top` |
| Blur | `--blur-nav/panel/scrim` |
| Ink | `--ink-1/2/3`, `--ink-on-accent` |
| Tone | `--accent`, `--accent-dim/hover`, `--tone-positive/attention/critical/info` |
| Tinted steps | `--{accent,positive,attention,critical,info}-{fill,line,glow}` |
| Type | `--text-micro/meta/body-sm/body/lead/title/display/hero`, `--leading-*`, `--weight-*`, `--tracking-eyebrow` |
| Radius | `--radius-pill/chip/row/card/sheet` |
| Space | `--space-1/2/3/4/5/6/8`, `--gutter`, `--stack` |
| Controls | `--control-sm/md/lg`, `--focus-ring`, `--modal-sm/md/lg` |
| Shadow | `--shadow-card/raised/panel/glow-accent` |
| Motion | `--ease-settle/spring/exit`, `--duration-fast/base/slow`, `--disabled-opacity` |

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

Motion is gated on `prefers-reduced-motion`. The one deliberate exception is the
`Button` loading spinner: it is the only signal a press was received, it occupies
a 16px square, and freezing it leaves a reduced-motion user unable to tell a slow
request from a dead one.

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
