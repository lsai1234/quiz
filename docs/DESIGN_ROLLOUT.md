# Design system rollout — what is left, in phases

`DESIGN.md` describes the system. `docs/DESIGN_AUDIT.md` is the evidence behind
it. This is the remaining work, ordered so that each phase unblocks the next and
nothing large is attempted before the decision that would invalidate it.

Two commits are already on master:

- `2d8ee0e` — tokens, primitives, `/styleguide`, `/styleguide/compare`, and the
  Founders Hub shell, dashboard, modals, palette and focus floor
- `025207f` — three subscription delivery fixes

Phases 0 and 1 are done on `claude/liquid-glass-design-system-hxqlsp` and not yet
merged. Everything below them is what is *not* done.

---

## Where it actually stands

Measured on master, across the 61 Founders Hub files:

| | Count |
|---|---|
| Hex literals | **0** |
| Old `--color-*` references | **0** |
| Files importing `@/components/system` | 8 |
| Raw `<button>` | 131 |
| Raw `<input>` / `<select>` / `<textarea>` | 95 |
| Files carrying at least one raw control | 31 |

The palette is done and locked by `founder-hub.test.ts` — including for two
components written after the migration, by other work, which the test held to
the rule without anyone having to remember it. What is left is **structural**:
controls that are the right colour but not the right component.

The work is concentrated rather than spread. Five files carry 48% of it:

| File | Raw controls |
|---|---|
| `BundleEditor.tsx` | 39 |
| `PartnerDetail.tsx` | 29 |
| `founderhub/pricing/page.tsx` | 16 |
| `Outbox.tsx` | 14 |
| `CompetitionSettings.tsx` | 11 |

---

## Phase 0 — Re-baseline — **done**

Small, and everything else depends on it.

Master has moved 25 commits since the design work merged (the share-card and
competition feature), and `package.json` changed in that batch. Install, run the
suite on current master, confirm green.

**Done when:** `npx tsc --noEmit` is clean and the full suite passes on master as
it stands today. Any failure here belongs to whoever is closest to it, not to
this rollout — but it has to be known before anything is built on top.

**Outcome:** branch re-baselined on current master, `npx tsc --noEmit` clean,
2595 tests across 175 suites green. Nothing in `src/components/system` or
`src/app/system.css` was touched by the intervening commits. One thing changed
for anyone running tests by hand: `package.json` now passes
`--experimental-vm-modules`, so `node node_modules/jest/bin/jest.js` no longer
works on its own — use `npm test`.

---

## Phase 1 — Close the primitive gap — **done**

Small, and it is the blocker on the largest part of Phase 2.

`Input` and `Select` render a label above the control. That is right for a form
and wrong for a dense table row, and the Founders Hub is full of dense table
rows: 16px-wide right-aligned number inputs inside rows that already name them.
Dropping the current `Input` into those puts a second label above every one and
breaks the layout that makes those pages readable.

Add a compact variant that takes its accessible name from an existing label
rather than drawing its own. Render it on `/styleguide`.

**Blocks:** roughly 60 of the 95 raw fields — `BundleEditor`, `PartnerDetail`,
the pricing screens and the new settings screens.

**Gate:** this is a change to the primitive layer, so it wants approval on
`/styleguide` before rollout rather than after.

**Done when:** the variant exists, is on the styleguide, and
`tokens-only.test.ts` still passes.

**Outcome:** `compact` and `align` on `Input` and `Select`. No label, hint or
error line is drawn; the name moves to `aria-label` and the messages to
`sr-only`, still referenced by `aria-describedby`, so a screen reader gets what
the stacked field gives. `align="right"` also switches on tabular figures.
Written up in `DESIGN.md` and shown on `/styleguide` under **Compact fields**,
both in a dense line-item table and beside the stacked version of the same field.

Two calls worth knowing before Phase 2 leans on this:

- Compact sits at `--control-sm` (36px), not the ~30px the raw fields use, so the
  pricing screens will get slightly taller. A number box nobody can hit is not an
  improvement on a tall one — but it is a visible change, and it is the one to
  look at on `/styleguide` first.
- Building the styleguide row surfaced a real bug in the existing `Input`: with a
  `prefix` or `suffix` the box is a wrapper, and the caller's `className` was
  landing on the bare input inside it. A `w-24` on a unit field sized the text and
  left the box full-bleed. Fixed, and covered by a test.

---

## Phase 2 — Founders Hub controls

The bulk: 31 files, 226 raw controls. Split by where the work actually is, not
alphabetically, so each commit is a coherent review.

Every one of these controls already has correct colour and a working focus ring
via the region floor. What changes is that radius, size and press behaviour stop
varying per call site.

**2a — The two big editors.** `BundleEditor` (39) and `PartnerDetail` (29). 30%
of the total in two files, both field-heavy, both dependent on Phase 1.

**2b — The dense screens.** `founderhub/pricing`, `products/review`,
`products/top-25`, `products/dashboard`. The other half of what Phase 1 unblocks.

**2c — The queues and lists.** `Outbox`, `ActionQueue`, `SupplierImport`,
`OrderDetail`, `ExitsPage`, `PartnersPage`. Button-heavy rather than
field-heavy, so these do not depend on Phase 1 and could run in parallel with it.

**2d — The tail.** The remaining ~20 files, a handful of controls each.

**Done when:** raw `<button>` and raw field counts in Founders Hub reach zero,
and `founder-hub.test.ts` gains an assertion holding them there — the same shape
as the palette rule, so the next raw control cannot land unnoticed.

---

## Phase 3 — Decide on My Hub

A decision, not work, and it governs whether Phase 4 happens at all.

`/styleguide/compare` renders My Hub's dashboard both ways from one set of data
and one set of copy, with a test asserting both arms say the same words. It has
never been shown to anyone.

Founders Hub did not need this — it is an internal tool with an audience of
roughly one, so the founder's opinion is the answer. My Hub is customer-facing
and it is the only place where testing earns its keep.

Also unmeasured: real-device performance. Headless Chromium cannot answer it —
layout time is 0.000s and there is no main-thread thrash, but the GPU cost of
`backdrop-filter` plus three composited blooms needs an actual mid-range Android.
Opening `?v=after` on a real phone is five minutes and worth more than any of the
above.

**Done when:** there is an answer to "does this look better to the people who
use it", and a yes/no on Phase 4.

---

## Phase 4 — My Hub

23 files, and smaller than it sounds: ~87% already import the old
`@/components/ui` primitives, so this is a retarget rather than a rewrite.

Gated on Phase 3. Customer-facing, and the one migration where being wrong is
expensive.

---

## Phase 5 — Partners Hub

3 files. Small, no gate, currently entirely on the old palette.

---

## Phase 6 — Delete the old layer

The phase that makes this one design system instead of two.

Only possible once Phases 4 and 5 are done. Remove `@/components/ui`, the
`--color-*` block in `globals.css`, and `src/lib/ui/tokens.ts`.

Until this lands the app runs two visual languages simultaneously, which is the
expected state of a migration in progress and is nonetheless real: a customer
signing into `/myhub` sees the old design while `/founderhub` has the new one.

**Done when:** one palette exists in the codebase.

---

## Separate track — billing decisions

Not design work, and a different reviewer. Neither blocks anything above.

**B1 — Postage notice.** A member who shrinks their plan below the free-delivery
line now starts paying £2.95. It fires on their own action, is not backdated,
and the hub shows the new total before and after — so it is not a unilateral
re-price. But there is no notice email. If you want one it belongs in the change
flow, not the payments sync layer.

**B2 — Zone 2 subscription shortfall.** Subscription members in the Highlands
pay the mainland rate, because Stripe accepts no shipping options in
subscription mode. The fulfilment queue now reports the true shortfall — the
surcharge — instead of the inflated figure it reported before. Whether to
recover it is open, and there are now accurate numbers to decide on.

---

## Open decisions

| # | Decision | Blocks |
|---|---|---|
| 1 | Compact field variant — approve the design on `/styleguide` | Phase 2a, 2b |
| 2 | Does the new design test better with members? | Phase 4 |
| 3 | `--tone-info` for the supplier-in-progress violet — right reading? | Nothing; a one-line change if wrong |
| 4 | Postage notice email — wanted? | B1 |
| 5 | Recover the Zone 2 subscription shortfall? | B2 |
| 6 | Should `/styleguide*` stay reachable on the customer domain? | Nothing; noindex and robots-disallowed either way |

---

## Suggested order

Phase 0, then Phase 1 and Phase 2c in parallel (2c does not need the new
variant), then 2a and 2b once the variant is approved, then 2d. Phase 3 can
happen at any point and should happen early, because a "no" changes what Phases
4 and 6 look like. Phases 5 and 6 last.

The billing track runs whenever, and answers to someone else.
