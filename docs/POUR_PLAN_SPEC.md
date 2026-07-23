# CHRGD LQD — the Pour Plan (build spec)

Status: **spec / not yet built.** This is the design for how the LQD drinks
experience works end-to-end: what the quiz collects, how the bundle is sized so
the customer gets the *right amount* of each drink, the **Pour Plan** they see and
tune, and how the same model produces both a **one-off** and a **monthly** box.

Concept locked with the founder:
- Sizing is **need-driven, appetite-tuned** — each drink is sized to *how it's
  actually consumed*, then shaped by the customer's pace/variety.
- The reveal is **the Pour Plan** — a smart default the customer can make theirs.
- **Flavour is not asked in the quiz** — a sensible default is auto-selected and
  the customer changes it on the Pour Plan.
- **End-editing = swap + flavour** (v1). "Adding more" is handled at intake by the
  existing **workout add-ons**, not a separate add/remove control.

---

## 1. The spine: consumption rhythm

Every drinkable product carries a **rhythm** that says how it's consumed. This one
attribute is what makes the box the right size.

| Rhythm | Meaning | Monthly quantity (occasions/month) | `when` bucket |
|---|---|---|---|
| **daily** | ~every day, an anchor | `daysPerWeek × 4.345` (default 7 → ~30) | Every day |
| **per-workout** | tied to sessions | `sessionsPerWeek × 4.345` | Around training |
| **as-needed** | when a trigger hits; just need *enough* for the month | `triggerPerWeek × 4.345`, clamped `[floor, cap]` | When you need it |

`daily` and `per-workout` already exist as `ConsumptionCadence` in
`src/lib/catalogue/types.ts`; this spec adds **`as-needed`** and the parameters below.

### Product-level additions (`CatalogueProduct.consumption`)
```ts
type ConsumptionCadence = 'daily' | 'per-workout' | 'as-needed'   // + as-needed

interface ProductConsumption {
  cadence: ConsumptionCadence
  servingsPerUnit: number          // pack size (already present)
  daysPerWeek?: number             // daily: 7 = every day, 3–4 = "most days" (greens)
  asNeededTrigger?: AsNeededTrigger // as-needed: which life signal drives frequency
  anchor?: PourAnchor              // when to drink it (for the protocol copy)
}

type AsNeededTrigger = 'sweat' | 'sleep' | 'stress' | 'immunity' | 'digestion'
type PourAnchor =
  | 'morning' | 'midday' | 'evening'          // daily anchors
  | 'pre-workout' | 'post-workout'            // per-workout
  | 'hot-days' | 'wind-down' | 'run-down'     // as-needed moments
```
These are **portal-editable** and can be **seeded by the PowerBody AI autopopulate**
(Phase 1b) from the product's type — e.g. electrolyte → `as-needed/sweat/hot-days`,
multivitamin → `daily/morning`, pre-workout → `per-workout/pre-workout`.

---

## 2. What the quiz collects

Most inputs already exist. Each one earns its place by sizing something specific.

| Signal | Sizes / selects | Rhythm touched | Status |
|---|---|---|---|
| **Goals** | which drinks are in the mix | all | have |
| **Primary goal** (the #1) | *emphasis* — protects/boosts that goal's drinks | all | **add** |
| Diet + restrictions | gap-fillers (vits, greens, omega, protein) | daily | have |
| Training frequency | per-workout quantities | per-workout | have |
| Training type / environment | hydration/electrolyte allowance | as-needed | partial |
| **As-needed triggers** — *"sweat a lot?"* (+ sleep / run-down, mostly inferable from goals + lifestyle) | as-needed pool sizes | as-needed | **add (light)** |
| Daily rhythm (`dailyDrinks`) | overall volume / appetite dial | tuning | have |
| Variety (`drinkVariety`) | breadth vs depth | tuning | have |
| Workout add-ons (`workoutAddOns`) | which per-workout drinks are on | per-workout | have |
| Already taking (`supps`) | exclusions | all | have |
| Caffeine / stim preference | stim vs stim-free pre-workout | per-workout | have |

**Flavour is deliberately NOT collected here** (see §5).

### Quiz additions (the only genuinely new intake)
- **`primaryGoal: Goal | null`** — surfaced as "which matters most?" (a tap on the
  goals step marking one as #1). Drives emphasis in sizing.
- **`asNeeded: Partial<Record<AsNeededTrigger, 'often' | 'sometimes' | 'rarely'>>`** —
  one light question for the highest-value trigger (**sweat/hydration**); the rest
  (`sleep`, `immunity`…) are inferred from existing goals + lifestyle answers so the
  quiz doesn't grow. Maps to `triggerPerWeek`:
  `often → 4`, `sometimes → 2`, `rarely → 1` (per week).

---

## 3. The sizing engine — `buildPourPlan(answers, catalogue)`

Generalises today's `buildLqdPlan` (`src/lib/lqd.ts`) from a two-bucket story into
the full rhythm-sized plan. Pure function; no pricing side-effects.

**Constants (to calibrate):** `WEEKS_PER_MONTH = 4.345`; as-needed `floor = 4`,
`cap = 20`; sensible daily `daysPerWeek` per product.

### Step 1 — select the drinks
Run the existing blueprint/selection from goals + diet + lifestyle + exclusions,
restricted to drinkable products (`isReadyToDrink` / drinkable filter). Result: a
candidate set, each with a rhythm and the goal(s) it serves.

### Step 2 — size each drink (true monthly need)
```
sessionsPerWeek = freqToSessions(answers.trainingFrequency)   // 1–2→1.5, 3–4→3.5, 5+→5.5
triggerPerWeek  = triggerToWeekly(product.asNeededTrigger, answers)  // often 4 / sometimes 2 / rarely 1

occasionsPerMonth(product) =
  daily       → round((product.consumption.daysPerWeek ?? 7) × WEEKS)
  per-workout → round(sessionsPerWeek × WEEKS)
  as-needed   → clamp(round(triggerPerWeek × WEEKS), floor, cap)
```
Each drink is **capped at its own rhythm** — a daily is never >~30, a per-workout
never exceeds their sessions, an as-needed never exceeds its cap. Nothing is
oversupplied, by construction.

### Step 3 — tune breadth vs depth (appetite + variety)
```
rawTotal   = Σ occasionsPerMonth
targetTotal = dailyDrinks × 30           // the appetite dial (1|2|3 a day)
```
- Rank drinks by priority: `primaryGoal` drinks first, then goal-match strength,
  then margin/recommendation priority. Daily anchors for core goals are protected.
- **`variety = 'staples'`** → concentrate: keep the top-priority kinds, drop the
  marginal ones, so the customer drinks a few go-tos more often.
- **`variety = 'variety'`** → spread: keep more kinds; if `rawTotal < targetTotal`,
  add complementary drinks (never pad an existing line past its rhythm).
- Reconcile toward `targetTotal` by **adding/removing kinds**, never by
  over-provisioning a single drink. If need is genuinely below appetite, that's a
  "lighter month" — we don't invent servings.

### Step 4 — assign flavour + anchor + protocol copy
- **Default flavour** per line (see §5).
- `anchor` → a **protocol note** (claim-safe, from a small copy table keyed by
  anchor), e.g. `pre-workout → "20 min before you train"`,
  `hot-days → "on hot or heavy-sweat days"`.

### Output
```ts
interface PourPlan {
  totalDrinks: number
  dailyPace: number                 // dailyDrinks (for "~N a day")
  variety: DrinkVariety
  buckets: PourBucket[]             // grouped by `when`
  monthly: MonthlyBox               // §6
  oneoff: OneOffBox                 // §6
}
interface PourBucket { when: 'everyday' | 'training' | 'asNeeded'; label: string; lines: PourLine[] }
interface PourLine {
  productId: string
  variantId: string                 // the chosen flavour
  title: string
  cadence: ConsumptionCadence
  monthlyCount: number              // occasionsPerMonth
  protocolNote: string              // "when" copy
  swapGroup: SwapGroup
  goalReason: string                // why it's here (claim-safe), for trust
}
```

---

## 4. The Pour Plan (the reveal)

Rebuilds `LqdPourGuide` into the view we prototyped, in this order:

1. **"These are your drinks for the month"** — total drinks, `~N a day`, kinds.
2. **The pool** — every drink as a dot, coloured by drink; reads as a stash you dip
   into, not a schedule. (Reinforces total + mix at a glance.)
3. **What's in it** — the drinks with monthly counts and a small `when` tag; each is
   **tap-to-edit** (swap + flavour).
4. **The protocol ("Pour Plan")** — grouped by `when`:
   - **Every day** (daily anchors)
   - **Around training** (per-workout)
   - **When you need it** (as-needed pool)
   Each line shows its count for the month + the protocol note. Framed as guidance,
   not a timetable: *"it's the monthly total that keeps you covered."*
5. **How you want it** — the Monthly ↔ One-off toggle (§6), reshaping the outcome +
   price + CTA.

### Editing (v1: swap + flavour)
- **Swap** — choose another product in the same `swapGroup`; the line keeps its
  rhythm, so `monthlyCount` recomputes and a default flavour is re-picked. Reuses the
  existing swap-group machinery and the substitution-consent line shape.
- **Flavour** — choose another `variant` of the same product.
- Both edits re-price (subscription) live and persist into the checkout payload /
  `MemberSubscription`. No add/remove/quantity in v1 — "add more" lives in the quiz
  add-ons step.

---

## 5. Default flavour (no quiz question)

- Each product gets a **`defaultVariantId`** (portal-settable — "crowd favourite");
  fall back to the first `available` variant, and to `unflavoured` for functional
  drinks that have one.
- The Pour Plan builds with defaults and makes **"tap to change flavour"** obvious —
  this is now the primary "make it yours" moment, so it must feel effortless and
  a little delightful (the flavour picker shows the real options per drink).

---

## 6. One-off vs monthly — same engine, two outputs

The rhythm-sized quantities give both; the difference is made honest.

### Monthly — servings-based, right-sized
- Ship **exactly `occasionsPerMonth` of each line's flavour**, refreshed monthly.
  This is where "the right amount each month" is literally true.
- Priced as today's subscription (flat monthly, subscribe-&-save). More
  drinks/variety is absorbed at the sized rate — **variety never costs more per
  month**.
- When a physical unit outlasts a month (a 90-serving tub), ship the **monthly refill
  equivalent** — the existing `subscriptionProductId` mapping.
```ts
interface MonthlyBox { lines: { variantId; servings }[]; flatMonthly: number; … }
```

### One-off — pack-based
- v1 = **one pack of each selected drink** (a real sampler of the routine). For each,
  show **how long it lasts at their cadence**: `weeks ≈ servingsPerUnit / (occasionsPerMonth/4.345)`.
- Be explicit that packs **run out at different times** (Daily Vits ~1 month, others
  stretch), so it's front-loaded and you top up bits — the honest reason monthly is
  smoother. (A later "stock up the month" mode can ship `ceil(need / servings)` packs.)
```ts
interface OneOffBox { packs: { variantId; servings; lastsWeeks }[]; total: number }
```

### Quiz-side awareness
On the `dailyDrinks` / `drinkVariety` steps, an adaptive one-liner sets expectations
before the reveal: *"More variety is sized into a monthly box at one flat rate — as a
one-off it's a few more packs to try."*

---

## 7. Mapping to the codebase

| Area | Change |
|---|---|
| `src/lib/catalogue/types.ts` | `ConsumptionCadence += 'as-needed'`; add `daysPerWeek`, `asNeededTrigger`, `anchor`, `defaultVariantId` |
| `src/lib/types.ts` | `QuizAnswers += primaryGoal`, `asNeeded` |
| Quiz (`quiz-flow.ts`, `Act2Quiz.tsx`) | mark #1 goal; one light sweat/as-needed question; adaptive one-off/monthly line on pace/variety steps |
| `src/lib/lqd.ts` → `src/lib/pour-plan/` | generalise `buildLqdPlan` into `buildPourPlan` (rhythm sizing + buckets + protocol) |
| `LqdPourGuide.tsx` | rebuild as the Pour Plan view (pool + what's in it + protocol + toggle + edit) |
| Pricing / `recharge` | monthly lines sized by `occasionsPerMonth` (already the shape); swap+flavour edits update lines; one-off = packs |
| Portal / autopopulate | tag cadence/anchor/trigger/default-flavour; AI seeds them from product type |
| Checkout | monthly → subscription (existing); one-off → pack lines through `/api/cart` |

---

## 8. Phasing

- **P1 — Data model.** `as-needed` cadence + product tags (`daysPerWeek`,
  `asNeededTrigger`, `anchor`, `defaultVariantId`); `primaryGoal` + `asNeeded` quiz
  fields. No behaviour change.
- **P2 — Sizing engine.** `buildPourPlan` with the rhythm formulas + breadth/depth
  reconciliation. Fully unit-tested against personas.
- **P3 — Pour Plan view + editing.** The reveal (pool + protocol buckets), swap +
  flavour, default flavours.
- **P4 — One-off vs monthly outputs.** Wire both boxes to checkout; adaptive
  quiz-side copy.
- **P5 — Tagging + AI seed.** Portal cadence/anchor/flavour tagging; PowerBody
  autopopulate seeds them.

## 9. Testing

Rhythm sizing per cadence (daily/per-workout/as-needed) with the frequency/trigger
maps; breadth/depth reconciliation toward the pace target (staples trims, variety
spreads, nothing oversupplied); `primaryGoal` protection; default-flavour selection
+ fallback; swap recompute keeps the rhythm; one-off pack-duration maths; bucket
grouping + protocol copy; persona end-to-end (the §example totals ~pace × 30).

## 10. Decisions locked

- Name: **Pour Plan**.
- Flavour: **not** in the quiz — default auto-selected, changed on the Pour Plan.
- End-editing: **swap + flavour** (v1). "Add more" = the existing workout add-ons.
- As-needed intake: **one light sweat question**; other triggers inferred from goals
  + lifestyle.
- Sizing: **need-driven, appetite-tuned**; no drink ever oversupplied.
