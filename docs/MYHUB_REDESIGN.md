# myhub — UI consistency redesign

**Status:** delivered. All eight phases shipped on `claude/myhub-ui-design-consistency-fb82q5`, one commit each so any phase can be reverted on its own. The audit below is kept as written, in the present tense, because it is the record of what was wrong and why — see §7 for what each phase actually did.
**Scope:** `/myhub` (`src/components/hub/**`, 19 files, ~2,900 lines) + the block underneath the printed receipt on the order-confirmation screen (`src/components/order/OrderConfirmation.tsx`, `src/components/stack-review/CheckoutSuccess.tsx`).
**Rule:** behaviour-preserving. This is a presentation-layer change. No pricing maths, no store logic, no API routes move. Every phase ships and reverts on its own.

---

## 0. The problem, stated precisely

The quiz (`src/components/scroll/Act2Quiz.tsx`), the stack reveal (`src/components/stack-review/**`) and the printed receipt (`src/components/receipt/ReceiptPrinter.tsx`) were designed. The hub was assembled. They share a colour and a font and nothing else.

That is not a vague impression — the two halves of the app use materially different construction techniques, and the hub uses the cheaper one in every single case:

| Dimension | Quiz / reveal (good) | myhub (bad) |
|---|---|---|
| Icons | `QuizIcon` — 42 monoline SVG glyphs, `currentColor`, stroke 1.6 | OS emoji (`😞 😐 😄 🌱 ⚡ 💪`) and typed characters (`✕ ▲ ▼ + − ←`) |
| Surfaces | Hairline glass — `bg-white/[0.015]`, `border-white/[0.08]` | Solid fills — `bg-[var(--color-surface-2)]`, `border-[var(--color-border)]` on everything |
| Selection | `border-[#00D4FF]/55 bg-[#00D4FF]/[0.07]` + animated `CheckMark` | Solid accent fill swap, no check, no animation |
| Type | `font-medium` 13–15px, hierarchy carried by colour | `font-black` on nearly every string; eyebrow caps above every block |
| Products | Always anchored by `ProductTile` (photo, or slot-hued glyph tile) | Text only. The hub never shows a product |
| Data | `StatBars` — what it supports, as bars | Prose |
| Motion | `transition-all duration-200`, `active:scale-[0.98]`, `focus-visible:ring` | Sheets appear instantly; no focus rings anywhere |
| Tokens | Local, but consistent | `const ACCENT = '#00D4FF'` re-declared in **15 of the 19 hub files** (78 repo-wide) |

The result is exactly what the screenshots show: the quiz looks like a product, the hub looks like an admin panel someone styled in a hurry — and the hub is where retention actually happens.

---

## 1. What "good" is made of

Before rebuilding anything, the house language has to be written down, because right now it only exists as an implicit pattern inside `Act2Quiz.tsx`. These are the rules the good screens follow.

**1.1 Icons are drawn, never typed.** `src/components/quiz/QuizIcon.tsx` — one 24×24 viewBox, `fill="none"`, `stroke="currentColor"`, `strokeWidth={1.6}`, round caps and joins, `aria-hidden`. Colour comes from the parent. Its own doc comment calls it *"the premium replacement for emojis"* — the hub simply never got the memo.

**1.2 Surfaces are hairlines on black, not grey boxes.** `Act2Quiz.tsx:340-342`:
```
selected  → border-[#00D4FF]/55 bg-[#00D4FF]/[0.07]
resting   → border-white/[0.08]  bg-white/[0.015]
hover     → border-white/20      bg-white/[0.04]
```
Alpha over the page background, so cards *recede*. The hub uses opaque `--color-surface-2` for everything, so every card sits at the same visual weight and nothing has a hierarchy.

**1.3 One radius per role.** Rows `rounded-xl`, cards `rounded-2xl`, sheets `rounded-t-3xl`, pills `rounded-full`. The hub mixes `rounded-lg`, `rounded-xl`, `rounded-2xl` and `rounded-3xl` on adjacent elements with no rule.

**1.4 Weight is rationed.** `font-black` in the good screens is reserved for numbers and page headings. Body and option labels are `font-medium`/`font-semibold`, and hierarchy is carried by opacity (`text-white/80` → `/70` → `/35`).

**1.5 Every product gets a visual anchor.** `ProductTile` (`src/components/stack-review/ProductTile.tsx`) renders the photo when the catalogue has one, and otherwise a slot-hued radial-gradient tile with the slot's monoline glyph from `src/lib/catalogue/slot-visuals.ts`. An image-less catalogue still looks deliberate. The hub does not use it once.

**1.6 State changes are felt.** `check-pop` on selection, `transition-all duration-200`, `active:scale-[0.98]`, `focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40`, and everything guarded by `prefers-reduced-motion`.

**1.7 Elevated chrome is glass.** `DidYouKnowChip` (`Act2Quiz.tsx:~424`): directional gradient, `backdrop-blur-md`, coloured `box-shadow` bloom. The hub's sheets sit on flat `rgba(0,0,0,0.72)` with no blur and no transition.

---

## 2. Defect inventory

Every item below is a specific, fixable thing, with the line it lives on.

### 2.1 Emoji and typed glyphs (the headline complaint)

| File:line | Current | Replacement |
|---|---|---|
| `lib/feedback.ts:184` | `statusIcon: '⚠'` | `'alert-triangle'` |
| `lib/feedback.ts:186` | `statusIcon: '✓'` | `'check'` |
| `lib/feedback.ts:193` | `statusIcon: '↗'` | `'trending-up'` (exists) |
| `lib/feedback.ts:199` | `statusIcon: '◔'` | `'clock'` (exists) |
| `lib/feedback.ts:203` | `statusIcon: '🌱'` | `'leaf'` (exists) |
| `lib/feedback.ts:204` | `statusIcon: '⚡'` | `'bolt'` (exists) |
| `hub/CheckIn.tsx:7,120` | `FACES = ['😞','😕','😐','🙂','😄']` | `<ChargeScale>` — 5 ascending charge segments (§3.3) |
| `hub/StackItemCard.tsx:29-33,101` | `MICRO` 3 emoji faces | `<ChargeScale steps={3}>` |
| `hub/StackItemCard.tsx:107` | `Thanks — logged ✓` | `<Icon name="check">` + text |
| `hub/CheckInJourney.tsx:54` | `Everything's on track. Nice work. 💪` | drop the emoji; tone carried by a `check` glyph in the layout |
| `hub/AddProductSheet.tsx:142` | `…everything available to subscribe to. 💪` | drop the emoji; designed empty state |
| `hub/{AddProductSheet:125, LineManageSheet:91, DeliveryDetailSheet:85, ChangeProductFlow:77, CancelSaveFlow:181, CheckInJourney:61, ReconsentNotice:78}` | text `✕` | `<IconButton icon="x">` |
| `hub/SubscriptionDashboard.tsx:320` | `{showSettings ? '▲' : '▼'}` | `<Icon name="chevron-down">` with a rotate transition |
| `hub/DeliveryDetailSheet.tsx:108,110` | text `−` / `+` | `<Icon name="dash">` / `<Icon name="plus">` |
| `hub/DeliveryDetailSheet.tsx:169,171` | `← A week earlier` / `A week later →` | `<Icon name="arrow-left">` + label |
| `hub/{ChangeProductFlow:101,131, CancelSaveFlow:202,263,283}` | `← Back` underline links | `<Button variant="ghost" icon="arrow-left">` |

**Kept deliberately:** the `→` inside CTA copy (`Sign in →`, `Review change →`, `Checkout →`) and `✦` in `StatBars`. Both are established house tics used by the good screens; they are typography, not iconography.

### 2.2 Structural defects

1. **17 copies of the palette in `hub/` alone** — 15 `const ACCENT` declarations plus two that inline the hex. `SubscriptionDashboard:25`, `StackItemCard:11`, `CheckIn:6`, `CheckInJourney:8`, `ChangeSummary:8`, `BillingImpact:6`, `BillingSummary:9`, `DeliveryCalendar:6`, `DeliveryDetailSheet:12`, `LineManageSheet:21`, `ChangeProductFlow:13`, `CancelSaveFlow:14`, `HubLogin:6`, `ReconsentNotice:6`, `StatusBadge:5-10`, `ExitStatement:6-7`, `ProgressRing:14`. Plus `GREEN`/`AMBER` in six of them. `globals.css` already defines `--color-red` and `--color-amber` and the hub uses neither.

2. **6 copies of the sheet.** The portal + `body.overflow` lock + Escape listener + grab handle + header + close button block is pasted into `AddProductSheet`, `LineManageSheet`, `DeliveryDetailSheet`, `ChangeProductFlow`, `CancelSaveFlow`, `ChangeSummary` — with drifting `maxHeight` (`90dvh` vs `92dvh`) and drifting `z-index` (`50` vs `60`).

3. **`alert()` in production UI.** `SubscriptionDashboard.tsx:367` — `alert('Live, this opens your Recharge billing portal.')`. `src/app/api/hub/billing-portal/route.ts` already exists.

4. **`Hi {sub.customerEmail.split('@')[0]}`** — `SubscriptionDashboard.tsx:166` greets a paying member as "Hi lewissiara".

5. **No shell.** `src/app/myhub/page.tsx` is five lines. The shop has `ShopShell` with a header, trust strip and a CLS-matched `LoadingSkeleton`; the hub has none, so `!hydrated` flashes the login screen at a signed-in member (`HubPage.tsx:20`).

6. **No product ever shown.** `StackItemCard` and `DeliveryCalendar` list titles as strings. `ProductTile` and `StatBars` already exist and already handle image-less catalogues.

7. **Every block shouts.** `text-[10px] font-bold tracking-widest uppercase` eyebrows appear 20+ times across the hub, including above single-sentence blocks, and `font-black` is applied to ordinary body headings. Nothing is emphasised because everything is.

8. **Raw native controls.** `LineManageSheet.tsx:99-103` — an unstyled `<input type="range">` with `accentColor`; `DeliveryDetailSheet.tsx:175` — a bare `<input type="date">`. These are the single cheapest-looking pixels in the app.

9. **No focus-visible styling anywhere in `hub/`.** Keyboard users get the UA default outline over a dark surface, or nothing.

10. **Confetti.** `CheckInJourney.tsx:37` fires `canvas-confetti` on a good check-in. It's the only place in the app that celebrates like that, it isn't reduced-motion guarded, and `globals.css` already has an on-brand alternative (`charge-burst`, `core-flare`, `rail-surge`).

### 2.3 Below the receipt (screenshot 3)

`OrderConfirmation.tsx:295-325` — after the receipt tears off, three generic full-width pills stack up: `PrimaryCta` (:156, solid accent), `BackToShop` (:143, bordered) and a bare bordered `<Link>` reading *"Take the quiz — get a stack matched to your goals"* (:314). Same radius, same weight, same height, no icons, no hierarchy — they read as leftover buttons under a beautifully art-directed piece of paper. `CheckoutSuccess.tsx:82-90` has the same problem with "Back to your stack".

---

## 3. New shared modules

Built once, in `src/components/ui/` and `src/lib/ui/`, then adopted. Nothing in this section is hub-specific — the shop's inline one-off SVGs (`ShopShell.tsx:98,105`) and `BasketDrawer`'s `✕` are downstream beneficiaries.

### 3.1 `src/lib/ui/tokens.ts` + `globals.css` additions

Kill the 17 palette copies. Export the semantic set, and add to the `@theme` block what the good screens currently inline:

```
--color-glass       rgba(255,255,255,0.015)
--color-glass-2     rgba(255,255,255,0.04)
--color-hairline    rgba(255,255,255,0.08)
--color-hairline-2  rgba(255,255,255,0.20)
--color-tone-good / -building / -essential / -review   (from StatusBadge's TONE map)
--radius-row 0.75rem / --radius-card 1rem / --radius-sheet 1.5rem
--ease-brand cubic-bezier(0.22, 1, 0.36, 1)
```
Plus `@keyframes sheet-in` (translateY(24px) → 0, with a backdrop opacity fade), reduced-motion guarded like the existing `.lqd-*` and `.receipt-led-on` rules.

### 3.2 `src/components/ui/Icon.tsx`

Promote `QuizIcon`'s glyph map to a typed `IconName` union and add the ~18 glyphs the hub needs — `x`, `chevron-down`, `chevron-right`, `arrow-left`, `plus`, `dash`, `check`, `alert-triangle`, `calendar`, `box`, `truck`, `credit-card`, `pause`, `play`, `skip-forward`, `sliders`, `swap`, `trash`, `signal-1`…`signal-5`. Same construction rules as the existing 42 (24×24, no fill, stroke 1.6, `currentColor`).

`QuizIcon` stays as a thin re-export so the 12 existing call sites don't move. `LineStatus.statusIcon` changes type from `string` to `IconName` (`feedback.ts:139`) — the only non-presentational edit in this plan, and no test asserts on it (`lib/__tests__/feedback.test.ts` checks `statusLabel` only).

### 3.3 `src/components/ui/ChargeScale.tsx`

The emoji-face replacement, and the piece of this plan most worth getting right. The brand's entire metaphor is *charge* — `ChargeRail`, `LiquidRail`, `charge-shimmer`, `battery-hum`, `rail-rise` all already exist. So a member rating how a product is landing fills a charge meter rather than picking a cartoon face:

- `steps={5}` (full check-in) or `steps={3}` (inline micro check-in) ascending segments;
- unselected: `--color-hairline` outline; selected: accent gradient fill + `rail-surge` on the leading segment, matching `ChargeRail`;
- end labels stay as they are today ("Not great" / "Brilliant") — the segments carry the scale, so nothing is lost for screen readers, and each button keeps its `aria-label={n} out of 5`.

Same numeric 1–5 payload as `FACES` produced, so `submitFeedback`/`submitDimension` are untouched.

### 3.4 `src/components/ui/Sheet.tsx`

One bottom sheet: portal, scroll lock, Escape, focus trap + restore, grab handle, `slide-in` animation, `backdrop-blur-sm` over `rgba(0,0,0,0.72)`, one `maxHeight`, one z-index scale (`Sheet` 50 / `Sheet` nested 60). Plus `SheetHeader` (eyebrow + title + close `IconButton`) and `SheetFooter` (sticky action row). Deletes ~180 lines of duplication across the six sheets.

### 3.5 `src/components/ui/{Button,IconButton,Card,Eyebrow,Chip,Disclosure,Note,Skeleton}.tsx`

`Button` variants: `primary` (accent fill), `secondary` (hairline), `ghost` (text), `danger` (amber), `tone` (tinted, for the save-flow cards) — one radius per size, one focus ring, one `active:scale`, `icon` and `iconRight` props. This alone normalises the ~40 hand-rolled buttons in `hub/`.

---

## 4. Phases

Ordered by impact ÷ effort. Phase 0 gates everything; after that each phase is independently shippable and revertible.

| Phase | What | Effort | Risk |
|---|---|---|---|
| **0** | Tokens + UI primitives (§3.1, §3.4, §3.5) | 10–14h | Low — additive, nothing adopts them yet |
| **1** | Icon system; delete every emoji | 8–12h | Low — one type change in `feedback.ts` |
| **2** | `StackItemCard` rebuild | 8–10h | Low |
| **3** | Dashboard shell, hero, settings | 12–16h | Med — touches the busiest file |
| **4** | Six sheets onto `Sheet` | 14–18h | Med — behaviour-preserving refactor, wide diff |
| **5** | Calendar + billing surfaces | 8–10h | Low |
| **6** | Login, loading, empty & edge states | 6–8h | Low |
| **7** | Below-the-receipt continuity | 4–6h | Low |
| **8** | Motion, a11y, reduced-motion, QA sweep | 6–8h | Low |

**Total ≈ 76–102h.**

---

### Phase 0 — Tokens and primitives *(gate)*

**Files.** `src/app/globals.css` (extend `@theme`, add `sheet-in`), new `src/lib/ui/tokens.ts`, new `src/components/ui/{Icon,Button,IconButton,Card,Eyebrow,Chip,Disclosure,Note,Skeleton,Sheet,ChargeScale}.tsx`.

**Acceptance.** Every primitive renders in isolation in both a story-style scratch route and a Jest render test; `Sheet` traps focus, restores it on close, locks scroll, closes on Escape and on backdrop click, and animates in — and does none of the animating under `prefers-reduced-motion`. No existing file imports anything yet.

**Rollback.** Delete the directory. Nothing depends on it.

---

### Phase 1 — Icons: no emoji anywhere in the member-facing app

**Files.** `src/lib/feedback.ts` (`:139` type, `:184-204` values), `hub/StatusBadge.tsx`, `hub/CheckIn.tsx`, `hub/StackItemCard.tsx`, `hub/CheckInJourney.tsx`, `hub/AddProductSheet.tsx`, `hub/SubscriptionDashboard.tsx`, `hub/DeliveryDetailSheet.tsx`, `hub/ChangeProductFlow.tsx`, `hub/CancelSaveFlow.tsx`, `hub/ReconsentNotice.tsx`, `hub/LineManageSheet.tsx`.

**Work.** Apply the whole of §2.1. `StatusBadge` renders `<Icon name={icon} size={11}/>` instead of a text span. `CheckIn` and `StackItemCard` adopt `ChargeScale`. The two `💪`s are deleted from copy strings, not translated into glyphs — an emoji in a sentence is a different problem from a missing icon.

**Acceptance.**
- A repo-wide grep for pictographic emoji over `src/components/{hub,order,stack-review,shop,quiz,receipt}` and `src/lib/feedback.ts` returns nothing. Add it as a Jest test so it cannot regress: the same regex the audit used, asserted empty.
- `feedback.test.ts` still passes untouched.
- Every rating control keeps its `aria-label`; the 1–5 payload sent to `submitFeedback` is byte-identical to today's.

**Rollback.** Self-contained per file.

---

### Phase 2 — `StackItemCard`

The card a member sees most, and today the flattest thing in the app.

**Work.**
- `ProductTile` at 56px on the left — photo, or the slot-hued glyph tile. The hub finally shows products.
- `StatBars` (`animate={false}`, `label="What it supports"`) under the title, so the retention screen speaks the same language as the reveal that sold the stack.
- Hairline glass surface; the amber `review` state becomes a tinted hairline + tone-tinted `StatusBadge` rather than a heavy border.
- Type: title 15px `font-medium` display; variant/cadence 12px `--color-muted`; price stays `font-black` accent (numbers earn weight).
- `ProgressRing` only in the `building` phase, sized to sit inside the tile's optical column.
- Actions become `Button` `secondary`/`ghost`; the review state promotes "Find a better fit" to `tone` amber.
- Micro check-in → `ChargeScale steps={3}`, with the confirmation as `<Icon name="check">` + "Logged".

**Acceptance.** Card renders correctly for all five `LinePhase` values and for a product with no image; no `font-black` on non-numeric text; keyboard-reachable with visible focus.

---

### Phase 3 — Dashboard shell, hero, settings

**Files.** `src/app/myhub/page.tsx`, `hub/HubPage.tsx`, `hub/SubscriptionDashboard.tsx`, new `hub/HubShell.tsx`, new `hub/HubSkeleton.tsx`.

**Work.**
- **`HubShell`** — brand mark (`CHRGDBolt`), page title, account menu (sign out as a proper menu item, not a naked underlined link at `:169`), consistent `max-w-lg` gutter. Mirrors `ShopShell`.
- **Skeleton** — `HubPage.tsx:20` currently renders `HubLogin` while `!hydrated`, so a signed-in member sees a login screen flash on every load. Render `HubSkeleton` instead, at matching heights, like `ShopShell`'s `LoadingSkeleton`.
- **Greeting** — use the account first name where we hold one; otherwise "Welcome back". Never `email.split('@')[0]`.
- **Hero next-box card** — keep the accent radial, add a `ProductTile` row of what's actually in the box (the data is already in `next.items`), turn `countdownLabel` into a small charge-meter countdown rather than a caps eyebrow, and make the two CTAs `Button primary`/`secondary`.
- **Eyebrow diet** — `Eyebrow` survives only above true section heads (Stack, Delivery calendar, Plan & billing). The ~12 decorative ones go.
- **Settings** — `Disclosure` with a rotating chevron; the three panels become `Card`s with one radius.
- **Billing** — delete `alert()` at `:367`; call `/api/hub/billing-portal`, with an explicit disabled state + `Note` when the portal isn't configured. Never a browser dialog.
- Keep the GSAP `[data-reveal]` stagger (`:122-126`) — it's the one bit of hub motion that's already right — and guard it with `prefers-reduced-motion`.

**Acceptance.** No `alert()` in `src/components/**`; a hard refresh while signed in never paints the login screen; reduced-motion disables the stagger.

---

### Phase 4 — Sheets

**Files.** `AddProductSheet`, `LineManageSheet`, `DeliveryDetailSheet`, `ChangeProductFlow`, `CancelSaveFlow`, `ChangeSummary`.

**Work.**
- All six adopt `Sheet` / `SheetHeader` / `SheetFooter`. One `maxHeight`, one z-scale, one animation, focus trapped and restored.
- Product rows inside `AddProductSheet` and `DeliveryDetailSheet` get `ProductTile` + `StatBars`, so "add to your stack" looks like the reveal deck it's selling from.
- `LineManageSheet`'s raw `<input type="range">` (`:99-103`) becomes a three-stop segmented control in the `ChargeScale` idiom — same `UsageLevel` payload.
- `DeliveryDetailSheet`'s bare `<input type="date">` (`:175`) gets a styled trigger row; the native picker still opens.
- `ChangeProductFlow`'s reason list and `CancelSaveFlow`'s reason list become `AnswerOption`-style rows with the `CheckMark` pattern lifted from `Act2Quiz.tsx:308-327`.
- `ChangeProductFlow` gains the quiz's segment progress rail across its three steps.
- `CancelSaveFlow`'s `Primary` tone cards become `Card variant="tone"`.

**Constraint.** Zero behavioural change. Every `onConfirm`, every impact computation, every `fetch` in `CancelSaveFlow` (including the `expectedSettlement` guard) stays exactly as written. This phase moves markup only.

**Acceptance.** All existing hub tests pass unchanged; manual pass over each flow confirms identical outcomes; Escape/backdrop/close-button all still dismiss; `ChangeSummary` still layers above an open sheet.

---

### Phase 5 — Calendar and billing

**Work.**
- `DeliveryCalendar` cards: hairline glass, `ProductTile` mini-stack of contents instead of a `·`-joined string, tuned next-box glow, and an edge fade on the horizontal scroller so the rail reads as swipeable (the shop's decks already do this).
- `BillingSummary` / `BillingImpact` / `ExitStatement`: borrow the receipt's alignment — dotted leaders, monospaced figures right-aligned on a common axis. These are money screens; making them look like the printed receipt is both prettier and more trustworthy. Tone colours from tokens.

**Acceptance.** Figures unchanged (`nextChargeBreakdown`, `cancelSettlement` untouched); tables align on a single axis at 360px width.

---

### Phase 6 — Login, loading, empty and edge states

**Work.**
- `HubLogin`: brand mark, hairline inputs with a real focus ring, `ProviderButtons` aligned to the same button metrics, the mock-mode paragraph (`:145-150`) as a `Note`.
- Designed states for: cancelled subscription (`SubscriptionDashboard.tsx:174-177`, currently one sentence in a box), paused/snoozed, no upcoming deliveries (`:248`), and `AddProductSheet`'s "nothing left to add" (`:142`).

**Acceptance.** `HubLogin.test.tsx` passes unchanged; every empty state has a glyph, a heading and a next action.

---

### Phase 7 — Below the receipt

**Files.** `src/components/order/OrderConfirmation.tsx`, `src/components/stack-review/CheckoutSuccess.tsx`.

**Work.**
- `Shell`/`Card`/`PrimaryCta`/`BackToShop` (`:118-168`) adopt the shared primitives.
- The "Take the quiz" link (`:314-322`) stops being a third identical pill and becomes a designed card in the `DidYouKnowChip` language: `sparkle` glyph in a tinted disc, a headline, one line of sub, a chevron. It is a genuinely different kind of thing from "Continue shopping" and should not look identical to it.
- Spacing under the receipt's zigzag tear tightens so the next block reads as a continuation of the same artefact, not a new page.
- `CheckoutSuccess`'s "Back to your stack" gets the same treatment.
- Analytics unchanged — `track('confirmation_cta', …)` fires from exactly the same places.

**Acceptance.** All `cta` analytics values are byte-identical; receipt rendering untouched.

---

### Phase 8 — Motion, accessibility, QA

- `focus-visible` rings on every interactive element in `hub/` (currently: none).
- Every animation guarded by `prefers-reduced-motion`, matching the existing `.lqd-*` / `.receipt-led-on` pattern.
- Confetti (`CheckInJourney.tsx:37`) → the brand's own `charge-burst`/`rail-surge`, reduced-motion aware.
- Contrast audit: `--color-muted` (#71717a) on `--color-bg` is ~4.1:1 — below AA for the 10–11px sizes the hub uses it at. Either lift the token or stop using it under 12px.
- Tap targets ≥ 44px (`StackItemCard`'s 32px micro buttons and the 28px `−`/`+` in `DeliveryDetailSheet` currently fail).
- Regression tests: the emoji grep from Phase 1, plus render tests for `StackItemCard` across all phases and for `Sheet` behaviour.

---

## 5. Order of attack, if only some of this happens

If the whole plan is too much at once, the cheapest route to "it stopped looking cheap" is **Phase 0 → 1 → 2**: tokens, then every emoji gone, then the stack card rebuilt with product imagery. That's roughly 26–36h and covers the two things visible in the screenshots — the emoji and the flat, imageless cards. Phases 3–5 are what make it feel like one app; 7 is small and fixes the specific screen you flagged.

## 6. Risks

- **Phase 4 is a wide diff over money flows.** Mitigated by the hard constraint that only markup moves, and by doing it after the primitives are proven in Phases 2–3.
- **`statusIcon` type change** ripples from `lib/feedback.ts` into `StatusBadge`. Small, and covered by existing tests plus the compiler.
- **Slot glyph coverage.** `slot-visuals.ts` covers all 10 `StackSlot` values with a `hexagon` fallback, so `ProductTile` cannot render broken — but the fallback tile should be reviewed once against real catalogue data before Phase 2 ships.

---

## 7. What shipped

One commit per phase. Nothing in the pricing engine, the change domain or the exit ledger moved: the whole of this is presentation, and the test count going up rather than sideways is the evidence.

| Phase | Commit | What it did |
|---|---|---|
| 0 | *Build the pieces the hub should have been assembled from* | `src/lib/ui/tokens.ts`, `src/components/ui/*` — Icon, Button, IconButton, Sheet, Card, Chip, Note, Eyebrow, Skeleton, Disclosure, ChargeScale; `useReducedMotion`. Nothing imported it yet. |
| 1 | *Stop drawing the interface with characters somebody else designed* | Every emoji and typed glyph gone from the member-facing app. `LineStatus.statusIcon` became `IconName`, so an emoji can no longer reach a status badge. `QuizIcon` collapsed into an adapter over the shared set. |
| 2 | *Show the member the products they're paying for* | `StackItemCard` rebuilt with `ProductTile` + `StatBars` on stack-wide axes. |
| 3 | *Give the hub a shell, and stop it greeting people by their login* | `HubShell`, `HubSkeleton`, the real billing portal in place of `alert()`, the next-box hero, `Disclosure` settings, the eyebrow diet. |
| 4 | *Put the six sheets on one sheet* | All six onto `Sheet` (~190 lines of duplication gone), `OptionRow` for the reason lists, the native range and date inputs replaced, product tiles in both sheets that ask for money. |
| 5 | *Make the money screens look like the receipt they answer to* | `MoneyRow` — dotted leaders, one axis, tabular numerals — across billing summary, change impact and exit statement. Calendar contents as tiles, plus an edge fade. |
| 6 | *(with 7 and 8)* | `HubLogin` on the primitives with real focus rings; `EmptyState` for the four bare "there's nothing here" sentences. |
| 7 | | The block under the receipt: `CtaLink` matching `Button` metrics, and the quiz invitation as a designed aside rather than a third identical pill. |
| 8 | | Focus rings on every remaining control, 44px targets, confetti behind `prefers-reduced-motion` and in-palette, `--color-muted` lifted from 4.12:1 to 4.88:1. |

### The guards

Four tests exist to stop this coming back, and each fails on source rather than on a rendered snapshot, so they survive refactors:

- `src/components/__tests__/no-emoji.test.ts` — no emoji or icon-substitute characters anywhere in the member-facing tree. Comments are exempt; several quote the removed characters deliberately.
- `src/components/hub/__tests__/accessibility.test.ts` — every `<button>` in `hub/` and `ui/` carries `focus-visible`; nothing is drawn under 44px without `hit-target`; anything calling `confetti()` or `gsap` checks `prefers-reduced-motion`.
- `src/components/hub/__tests__/HubPage.test.ts` — no `alert`/`confirm`/`prompt` in the hub, and the login screen never renders before hydration resolves.
- `src/app/__tests__/contrast.test.ts` — reads the palette out of `globals.css` and holds every text tier to AA, while keeping the tiers distinct from each other.

### Left deliberately

- **The founders' portal** keeps its emoji and its hand-rolled controls. It's an internal tool; holding it to the customer-facing bar is a cost with no reader to benefit.
- **`→` in CTA copy** and **`✦` on the stat bars** are house typography the good screens already used. `−` before a negative amount is simply correct.
- **`ProductTile`'s slot-glyph fallback** carries the hub wherever the catalogue has no photograph, which in practice is most of it. Real photography would be the single biggest remaining lift, and it isn't a code change.
