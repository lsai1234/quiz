# Subscriptions — how it works & how it will plug into Shopify

This documents the subscription model the quiz builds today (running on mock
data) and exactly how it will map onto Shopify when you connect it later.

## The two offers

When the stack is revealed the customer chooses between:

- **One-off bundle** — buy the recommended stack once. Saving comes from
  per-product RRP markdowns (an explicit flat `bundleDiscount` knob also exists
  in `PRICING_CONFIG`, default 0).
- **Subscribe monthly** — a recurring plan. Every product is included; nothing
  is ever "unavailable". It bills **one flat amount every month** (the long-run
  average), with a **scratch-to-reveal intro discount on the first month** and a
  **minimum term**. Defaults (all in `PRICING_CONFIG`): flat monthly, a first-
  month discount the member reveals by scratching a card (25% off two-thirds of
  the time, 50% off one-third — see below), 4-month minimum. Example for a
  3–4×/week stack: **£60.05/mo, first month £45.04 (25% off) or £30.03 (50%
  off), 4-month minimum, cancel anytime after.**

  The minimum term is what makes flat monthly billing safe: because the flat
  amount is the smoothed average, a customer can't cancel after one month having
  received a long-lasting item they haven't finished paying for.

### Scratch-to-reveal first-month discount

Instead of a fixed 50% off, the first-month discount is a **scratch-to-reveal**
reward. On the stack review page the member scratches a card
(`src/components/stack-review/ScratchToReveal.tsx`) to reveal their discount,
drawn at random from **weighted outcomes** in
`PRICING_CONFIG.introOffer.scratchReveal`. Defaults: **25% off with weight 2,
50% off with weight 1** — i.e. 25% two-thirds of the time, 50% one-third
(probability = weight ÷ total weight).

- **Nothing is auto-applied.** Until the member scratches, no intro discount is
  applied (`resolveIntroDiscount(null)` → 0). The revealed rate is held in the
  quiz store (`revealedIntroDiscount`) and threaded through pricing and checkout
  via `SubscriptionPlanOptions.introDiscountOverride`.
- **Tamper-proof.** A revealed override is honoured only when it's one of the
  configured outcomes (`isValidScratchDiscount`); anything else falls back to no
  discount, so a client can't invent a bigger reward.
- **Deterministic in tests.** `rollScratchDiscount(config, rng)` takes an
  injectable RNG. The draw and validation are fully unit tested.
- **Portal-tunable / disable-able.** Edit the outcomes/weights in the config, or
  set `scratchReveal.enabled: false` to fall back to the flat
  `introOffer.firstMonthDiscount`.

The **subscribe-&-save discount is fixed per bundle** (stack level): Essentials
10%, Performance 15%, Complete 20% (`PRICING_CONFIG.levelSubscriptionDiscount`,
resolved by `levelSubscriptionRate` / `resolveSubscriptionRate`). It's advertised
as a selling point on each bundle and in the subscribe-&-save area, carried on the
subscription (`MemberSubscription.subscriptionDiscountRate`) so added/swapped lines
keep the bundle's rate, and still margin-floored per line.

All the logic lives in `src/lib/stack-blueprint/pricing.ts` and is fully unit
tested.

## How the monthly plan is sized (the protocol)

Each product has a **consumption protocol**:

- `cadence`: `daily` (protein, creatine, multivitamin…) or `per-workout`
  (pre-workout, electrolytes, BCAA). Derived from the stack slot when not set
  explicitly (energy/hydration → per-workout, else daily).
- `servingsPerUnit`: servings in one container (defaults from the product's `servings`).

From the quiz we get **training frequency** → `workoutsPerMonth`
(1-2x≈6, 3-4x≈15, 5-6x≈24, daily≈30). The member can refine this — and how much
they get through per product — in the **subscription customisation journey** (a
per-product "light / as recommended / a lot" usage slider, `UsageLevel`), which
scales servings-per-occasion. The slider range is clamped (`allowedUsageLevels`)
so it can never drop the flat monthly below the minimum order value.

For each line we compute how long one container lasts and ship it on the
nearest sensible cadence:

```
occasionsPerMonth   = cadence === 'daily' ? 30 : workoutsPerMonth
servingsPerMonth    = occasionsPerMonth × usageServingsPerOccasion  // usage slider
monthsOneUnitLasts = servingsPerUnit / servingsPerMonth
shipEveryMonths    = clamp(round(monthsOneUnitLasts), 1, maxDeliveryMonths)   // when ≥ 1 month
monthlyUnits       = unitsPerShipment / shipEveryMonths
pricePerDelivery   = unitsPerShipment × unitPrice × (1 − subscriptionDiscount)
monthlyPrice       = monthlyUnits     × unitPrice × (1 − subscriptionDiscount)
```

Key property: **`monthlyPrice === pricePerDelivery / shipEveryMonths`** — the
headline £/mo always reconciles with the actual delivery schedule ("pay for
what ships"). Worked example for a 3–4×/week trainer:

| Product | Cadence | Servings | Ships | Per delivery | £/mo |
|---|---|---|---|---|---|
| Whey protein | daily | 30 | every 1 month | £29.74 | £29.74 |
| Creatine | daily | 100 | every 3 months | £16.99 | £5.66 |
| Pre-workout | per-workout (15/mo) | 30 | every 2 months | £25.49 | £12.75 |
| Electrolytes | per-workout (15/mo) | 30 | every 2 months | £15.29 | £7.65 |
| Omega-3 | daily | 90 | every 3 months | £12.74 | £4.25 |

Long-lasting products **stay the same product and ship less often** rather than
swapping to a smaller SKU. (A `subscriptionProductId` mapping to a different
monthly product is still supported for the portal, with de-duplication when two
slots resolve to the same product — but it is not used by default.)

- `subscriptionMinMonths` — minimum commitment, from `PRICING_CONFIG`
  (default 1 → "cancel anytime"), raised by any product's
  `minSubscriptionMonths` override.

## Pricing rules & profit guardrails (portal-controlled)

All discount/margin rules live in `PRICING_CONFIG` as data, ready for the portal
to edit. They're profit-aware so discounts can't quietly lose money.

**Tiered discounts (min order values).**
- `bundleTiers` — one-off bundle discounts that unlock at order-value (or item)
  thresholds; the best-qualifying tier wins. Defaults: £60+ → 7.5%, £90+ →
  12.5%, £120+ → 15%.
- `subscriptionTiers` — optional extra subscribe-&-save on top of the base
  `subscriptionDiscount` (15%) for bigger monthly orders. Empty by default.

**Margin protection.**
- Every product has a `cost` (cost of goods); when unset it's estimated as
  `price × defaultCostRatio` (0.35). Read from the `chrgd.cost` metafield live.
- `marginFloorPct` (0.15) — a discount never takes a line below
  `cost × (1 + floor)`, capped at list price. So a deep tier or sale can't sell
  below margin.

**Profit on cancel (the key one).** `calculatePricing` reports, for the portal:
- `subscriptionMonthlyMargin` — margin per month.
- `subscriptionCommittedMargin` — margin across the whole minimum term
  (committed revenue − cost of goods actually shipped during the term).
- `subscriptionProfitableOnCancel` — true when that committed margin is ≥ 0, i.e.
  even a customer who cancels at the earliest allowed point has been profitable.
  This is what couples the intro discount + minimum term + costs together: the
  portal can tune any of them and immediately see whether the offer still
  profits on the worst-case cancel.

**Minimum order to subscribe.** `minSubscriptionMonthly` (£25) — the flat monthly
must clear this for the Subscribe option to be offered.

These are PORTAL-facing numbers (margins aren't shown to customers); the final
phase exposes them as editable controls + a profitability readout.

## Product data → Shopify metafields

All of this is mock-first today and reads from `chrgd.*` metafields the moment
you go live. The Storefront query (`src/lib/shopify/operations.ts`), the mapper
(`src/lib/shopify/catalogue.ts`) and the seeder
(`scripts/seed-shopify-tags.mjs`) already handle:

| App field | Shopify metafield (`chrgd.*`) | Type |
|---|---|---|
| `subscriptionEligible` | `subscription_eligible` | boolean |
| `servings` | `servings` | number_integer |
| `consumption.cadence` | `consumption_cadence` | `daily` / `per-workout` |
| `consumption.servingsPerUnit` | `servings_per_unit` | number_integer |
| `minSubscriptionMonths` | `min_subscription_months` | number_integer |
| `cost` | `cost` | number_decimal |
| `recommendationBasis` | `recommendation_basis` | `objective` / `subjective` |
| `effectOnset` | `effect_onset` | `immediate` / `short` / `long` / `none` |
| `subscriptionProductId` | `subscription_product_handle` | text (handle) |
| `isSubscriptionOnly` | `subscription_only` | boolean |

Run `node scripts/seed-shopify-tags.mjs` to write these to your products.

## Connecting Shopify subscriptions — decided approach: Recharge

The subscription engine and billing run on **Recharge** (Shopify subscription
app). We build **our own branded customer portal** (the Phase 3 hub) on top of
**Recharge's API** — Recharge owns the billing engine (card vaulting, recurring
charges, retries/dunning, Shopify order sync), we own the experience. We do NOT
rebuild billing ourselves.

### How the model maps to Recharge

The plan is a **flat-price monthly membership**, not lumpy per-delivery charges:

- **Flat monthly charge** = `StackPricing.subscriptionTotal` — a single
  recurring price (the smoothed average of all items). In Recharge this is one
  subscription billed monthly at a fixed price.
- **First-month intro** = `subscriptionFirstMonth` — a Recharge **first-order
  discount** at the member's **scratch-revealed** rate (25% or 50%, see the
  scratch-to-reveal section above), or 0 if they never scratched.
- **Minimum term** = `subscriptionMinMonths` — Recharge **minimum cycles**
  before cancellation (default 4). This is enforced by Recharge refusing early
  cancellation (clearly disclosed at checkout), NOT by charging an exit fee.
- **What ships when** = each `SubscriptionLine`'s `shipEveryMonths` /
  `unitsPerShipment`. Items still arrive on their own cadence (whey monthly,
  creatine every 3 months…) even though billing is one flat monthly amount.
- **Commitment total** = `subscriptionMinTermTotal` — disclose this up front.

### Checkout (Phase 2 — built, mock-first)

The checkout flow is wired end to end and works today on mock data:

- `buildSubscriptionCheckout()` (in `checkout.ts`) turns the stack into the
  payload: recurring lines (`merchandiseId`, `sellingPlanId`, `quantity` =
  units/delivery, `deliveryIntervalMonths`, `pricePerDelivery`) plus the flat
  monthly / first month / minimum-term figures.
- `useStackCheckout` is plan-aware: one-off → `POST /api/cart`, subscription →
  `POST /api/subscribe`.
- `POST /api/subscribe` — in mock mode returns a confirmation; in live mode it
  creates a Shopify cart whose lines carry `sellingPlanId` + quantity, so
  Shopify checkout starts the subscription and **Recharge picks it up**.
- Variant `sellingPlanId` is read from Storefront `sellingPlanAllocations`
  (null until Recharge selling plans are configured).

To go live: configure Recharge selling plans on the products (so each variant
gets a selling-plan allocation), set `NEXT_PUBLIC_DATA_SOURCE=shopify`, and the
same flow creates real subscriptions. The intro discount, flat membership price
and minimum cycles are configured on the Recharge plan to match `PRICING_CONFIG`.

### The Phase 3 hub — built, mock-first

The subscriber hub lives at `/hub` and works today on mock data:

- **Login** — email sign-in gate (`HubLogin`). Live, this is Shopify Customer
  Account login; any email loads a sample subscription in mock mode.
- **Dashboard** (`SubscriptionDashboard`) — status, flat monthly, next dispatch
  date, payment method, and the stack with per-line delivery cadence.
- **Manage** — add or remove products, change how often each ships, skip a box,
  get one now, swap a product (`ChangeProductFlow`, same-slot alternatives),
  move the next box (send now / delay), change the dispatch day, pause/resume,
  and cancel (blocked until the minimum term is met, with months-left shown).
  See Phase 5 below for the flexibility model.
- **Billing** — links out to the Recharge billing portal (placeholder in mock).

The data layer (`src/lib/recharge/`) is shaped like a Recharge subscription
contract. `createMockSubscription` builds it from the quiz pricing engine, and
the mutation helpers (add / remove / cadence / skip / one-off / swap / dispatch
day / next-box date / pause / cancel) are pure functions.
The hub store (`src/lib/hub-store.tsx`) calls these today; when Recharge is
connected, each action calls Recharge's customer API instead — same surface.
(Skio/Awtomic are comparable alternatives, but Recharge is the chosen default.)

### Phase 4 — onset-aware feedback & keep-vs-change advice (built, mock-first)

The check-in is **adaptive and onset-aware** (`src/components/hub/CheckIn.tsx`,
engine in `src/lib/feedback.ts`). Two product axes drive it:

- **`recommendationBasis`** (`objective` | `subjective`) — *whether* feelings
  should drive a change.
- **`effectOnset`** (`immediate` | `short` | `long` | `none`) — *when* a benefit
  is even noticeable. `immediate` = pre-workout/electrolytes (same session);
  `short` = sleep/recovery/gut (~3 wks); `long` = omega-3, vitamin C/D, collagen,
  multivitamin (~6 wks, often barely felt); `none` = protein/creatine (never
  consciously felt). Derived from the stack slot, overridable via the
  `chrgd.effect_onset` metafield / the portal.

`buildCheckInQuestions` asks **only** about dimensions the current stack targets
**and** that are past their onset window — slow-build / unfelt items become
reassurance cards instead of questions, so a member is never asked to rate
something that can't be felt yet. `recommendForSubscription` returns a per-line
**phase**: `unfelt` (keep, works in the background), `too-early` (set
expectations + ETA, never judged), `working` (keep), `review` (the *only* phase
that suggests a change — past its window **and** the feeling stayed low), or
`check` (past its window, prompt a rating). This is what stops a vitamin C or
omega-3 being churned before it's had a fair chance.

The advice is deterministic (works offline); an AI pass via
`/api/personalise-stack` can refine the wording. Feedback history lives in the
hub store today; live it would persist in the app database.

**Interactive everywhere.** Each product card (`StackItemCard`) shows its phase
and — for felt, past-onset lines — an inline "Feeling it?" micro check-in
(`submitDimension`). After a check-in, `CheckInJourney` groups the stack into
*Worth a look* / *Working for you* / *Still settling in*, celebrating with
confetti when nothing needs a change.

**Change flow.** The **Change** action opens `ChangeProductFlow`: 1. **Why** —
reason chips. 2. **Pick** — replacements ranked for that reason
(`recommendReplacements`), each showing its monthly delta. 3. **Confirm** — the
pricing impact and when it applies. `computeSwapImpact` returns the new flat
monthly, the monthly delta and a one-off top-up/credit for the imminent box.

### Phase 5 — full flexibility (add / remove / move / one-off)

The hub lets a member reshape the stack and react to how fast they get through
things, with the money model kept exploit-proof. Pure helpers + impact previews
live in `src/lib/recharge/mock.ts`; the UI is `AddProductSheet` and
`LineManageSheet`.

- **Add** (`addLine` / `computeAddImpact`) — a new line sized & priced at the
  subscribe-&-save rate (margin-floored); the intro discount is **never**
  re-applied. Flat monthly rises by its amortised monthly.
- **Remove** (`removeLine` / `computeRemoveImpact`) — free before anything
  ships; once a delivery has gone out, a **pay-for-what-shipped settlement**
  (`lineSettlement = max(0, shippedValueToDate − paidToDate)`) recovers the value
  already sent that the member hasn't paid off. This kills the "add a 3-month tub,
  get it cheap on the smoothed rate, cancel" arbitrage.
- **Ship more / less often** (`setLineCadence`) — clamped `[1, maxDeliveryMonths]`;
  only the frequency changes, the per-unit price (and its floor) never moves; flat
  monthly is re-derived from `flatMonthlyOf`.
- **Get one now** (`oneOffCharge` / `computeOneOffImpact`) — a one-off at the full
  per-unit price, charged up front; the recurring plan is untouched.
- **Skip next** (`skipNextDelivery`) — pushes the next ship date out and banks a
  credit equal to the box value, so nobody pays for a box they didn't get.
- **Next-box date** (`sendNow` / `bringForward` / `delayDispatch`) — an explicit
  `nextDispatchOverride` for the upcoming delivery, on top of the day-of-month
  cadence.

Live, these map onto Recharge: add/remove = subscription line changes, settlement
and "get one now" = one-time line items, skip = a skipped charge with credit,
cadence = the line's order-interval, and the date controls = reschedule/charge-now.

### Phase 6 — the delivery calendar (HelloFresh-style, built mock-first)

The hub centres on a **delivery calendar** (`src/components/hub/DeliveryCalendar.tsx`)
— a horizontal timeline of upcoming boxes. Billing stays **flat monthly**; the
calendar only governs *what ships when*.

- `buildDeliverySchedule(sub, catalogue, monthsAhead, now)`
  (`src/lib/recharge/schedule.ts`) projects the flat plan into dated `Delivery`
  boxes. Each line is due in a month when `(m − offset(line)) % cadence === 0`,
  with a stable per-line `offset` so multi-month items **stagger** into different
  boxes (realistic, varied deliveries). The `m=0` box honours `nextDispatchOverride`.
- Per-box edits are stored on `MemberSubscription.deliveryOverrides` (keyed
  `YYYY-MM`) and applied by `buildDeliverySchedule`. Pure mutations:
  `skipDelivery` / `unskipDelivery`, `rescheduleDelivery(date)`,
  `addItemToDelivery(product)` (a full-price one-off), `removeItemFromDelivery(item)`.
  **None change the flat monthly** — skips bank a credit (`skipCredit`), adds are
  one-offs. The detail sheet (`DeliveryDetailSheet`) is where you open a box and
  add/remove/move/skip — bundle- and product-level, like HelloFresh.

Live, this maps onto Recharge: skip = a skipped charge with credit, reschedule =
a rescheduled charge, add to a box = a one-time line item on that order.

**Skipping defers the term.** A skipped box isn't a paid cycle, so
`monthsRemainingOnTerm` adds `skippedDeliveryCount` — the minimum term simply
moves back a month per skip (no charge, no month burned).

**Extras: this delivery vs every delivery.** Each box item has − / + to remove or
add an extra of it to that box (a one-off). The add flow offers, per product,
**"Just this box"** (a full-price one-off, `addItemToDelivery` — stacks) or
**"Every delivery"** (joins the recurring plan, `addLine`). `setLineQuantity`
bumps how many of a line ship every time. All at the subscribe-&-save rate, above
the margin floor.

**What you're actually billed.** `nextChargeBreakdown` + the `BillingSummary`
card (`src/components/hub/BillingSummary.tsx`) state it plainly: the flat monthly
is the charge; each box's value is what *ships* (not a separate charge); one-off
extras add to that month's bill; skips credit/pause that cycle. The calendar
labels its amounts as box *value*, not charges.

**Billing model & Recharge mapping (important, honest status).** The customer-
facing model is a **flat monthly membership** that ships different items on
different cadences. Native Shopify/Recharge subscriptions bill **per delivery per
line**, not one smoothed amount — so the flat monthly is an app-side abstraction.
Two ways to realise it on Recharge, to be decided when integration is built:
1. **Membership plan (recommended for the flat-monthly UX):** one Recharge
   subscription to a single membership/bundle SKU at `flatMonthly`; the calendar's
   box contents drive *fulfilment* (Recharge bundles / a build-a-box), not separate
   per-line charges. Matches the "one predictable bill" promise.
2. **Per-line subscriptions:** each product is its own Recharge subscription on its
   own interval; the customer is billed per delivery (variable) and "flat monthly"
   becomes display-only.

Today the checkout seams exist — `buildSubscriptionCheckout` emits cart lines with
`sellingPlanId` + quantity, and `POST /api/subscribe` creates a Shopify cart that
Recharge picks up (mock returns a placeholder) — but **all hub mutations
(add/remove/cadence/skip/extras/delivery edits) run on the local mock object; none
call a Recharge customer API yet.** Wiring that adapter (and choosing model 1 vs 2)
is the remaining integration work.

**Billing transparency.** A shared `BillingImpact` panel
(`src/components/hub/BillingImpact.tsx`), fed by `lineEconomics` /
`projectedEconomics` (`src/lib/recharge/mock.ts`), shows every change the same
way: list → discounted unit (with the % saved), units × cadence per box, the
monthly spread, monthly before → after, any one-off/credit/settlement, and the
effective date. Used in the manage, add, swap and delivery sheets.

**Clear status language.** `recommendForSubscription` now returns a member-facing
`LineStatus` (`statusLabel` / `statusIcon` / `statusTone` + optional `progress`),
mapped by `deriveStatus` from the onset phase: "Felt & working", "Daily
essential", "Building {benefit} · wk X of Y" (with a progress ring), "Working
quietly · long-term", "Not landing — let's adjust". No jargon, no catch-all
"working for you" bucket — slow-build items show real progress, never a default.

### Phase 7 — retention "save" flow (built, mock-first)

Cancelling used to be a dead-end gated button. It's now routed through a
reason-led **save flow** (`src/components/hub/CancelSaveFlow.tsx`) — the highest-
leverage churn lever — offering honest alternatives before an easy exit:

- **Too expensive** → `downsizePreview` (`mock.ts`) proposes trimming the felt
  "nice-to-have" lines to a lower flat monthly (keeps essentials), shown via
  `BillingImpact`.
- **Too much piling up** → skip the next box (defers the term).
- **Not seeing results** → one-tap swap of any `review`-phase product
  (`recommendForSubscription`), or reassurance for still-building items.
- **Break / going away** → `snoozeSubscription(months)`: pauses billing + shipping
  with a return date and **defers the minimum term** (`snoozedMonths` feeds
  `monthsRemainingOnTerm`), so it never sidesteps the commitment. Allowed in-term.
- **Honest exit** always available, still gated by the minimum term (UK DMCC).

No discount bribes — saves reuse pause/skip/trim/swap, so margins are untouched.

This is step 1 of a retention-focused roadmap (next: proactive lifecycle prompts,
consumption-aware right-sizing, and outcomes-over-time; later: the Recharge
customer-API adapter, dunning/account, goals re-stacking).

### UK compliance note

Minimum terms and intro discounts are standard and fine, but disclose clearly
at checkout: the intro price, the ongoing price, the minimum term + total
commitment, and that cancellation is easy after the term (UK DMCC subscription
rules + Consumer Contracts Regs).

---

## Phase 8 — product changes: unavailability & supplier price moves (built)

What happens when a subscribed product goes out of stock, is discontinued, or
moves price at the supplier. Full design in `docs/PRODUCT_CHANGES_SPEC.md`; this
is how it actually behaves.

### The member's choice — two options, never three

At checkout (in the subscription journey, before paying) the member picks what
we should do if something becomes unavailable, plan-wide or per product:

- **Keep my plan whole** (`auto-swap`) — closest equivalent, monthly unchanged.
- **Take it off my plan** (`remove`) — line dropped, monthly falls next cycle.

There is deliberately no "ask me first". A third option that waits on a reply
parks the subscription behind someone's inbox and holds up a delivery, so
instead every change resolves on its own and the member is **told afterwards**
and invited to adjust it in the hub. `ChangePolicyChoice` renders the choice at
checkout and again in the hub, so the wording has one definition.

Stored as `MemberSubscriptionLine.changePolicy` (set only where the member
overrode that product) plus `MemberSubscription.defaultChangePolicy`. The legacy
`allowSubstitution` boolean is kept in step and read as `remove` when false.

### Detection — out of stock vs discontinued

`supplier_snapshots` (migration v6) records what the feed said last time, which
is what makes the distinction possible: a SKU that's present but unbuyable is
out of stock; one absent for `discontinuedAfterMissedSyncs` runs is gone for
good. An absence streak resets the moment a SKU reappears, so a flickering feed
can't accumulate its way to permanently reshaping a plan. The first run only
establishes a baseline.

### Resolution — always concrete, never blocking

`resolveIntendedAction` turns the member's policy into an action, and there is
no input for which it answers "wait and ask someone" (there's a property test).
**Removal is the universal fallback**: whenever a swap can't be honoured — no
in-stock product in the category, or none compatible with a declared allergy or
diet — the line comes off and the bill drops, rather than shipping something
that might not suit them.

Every event carries `autoApplyAt`. A founder can override inside that window
(`founderReviewHours`, default 24, applied to discontinuations and plan-shape
changes); if nobody does, it lands anyway. A quiet queue delays a change, it
never stalls one.

### The money rules (`lib/changes/apply.ts`)

1. **A substitution never raises the bill.** A dearer replacement is capped at
   what the member already pays and the difference absorbed — unless that would
   breach the margin floor, in which case it isn't a viable swap and we remove.
2. **No settlement on a removal we caused.** The pay-for-what-shipped charge
   exists to stop a member gaming the smoothed monthly; when the supplier
   discontinues something that reasoning doesn't apply, so it's waived and any
   overpayment is credited back.
3. **Reductions start next cycle; increases wait out their notice.**
4. **The member's subscribe-&-save rate carries through** any re-price.

### Supplier price moves

Detected from the same snapshot diff, raised per affected member and grouped by
product for the founder. The intended action is **absorb**, so an unattended
queue can never put a price up. `/portal/actions` shows both sides: the margin
if you swallow it, each member's new monthly if you don't, and the smallest
pass-on that clears the margin floor. Partial pass-on is a slider.

A pass-on does **not** touch the plan when scheduled. The event parks as
`scheduled` with `autoApplyAt` set to the effective date, the notice email goes
out immediately, and the ordinary due-changes sweep applies the re-price on the
day — so there is exactly one code path that changes a member's price. Stripe is
updated before the local write, because it's what actually takes the money.

### Telling the member

`lib/notify` renders the email when the change happens and stores it in the
outbox (migration v7), then sends it. Idempotency is a UNIQUE constraint on
`<eventId>:<template>`. Queueing is separate from sending on purpose: a failed
email is a delivery problem to retry, never a reason to undo a billing decision.

Every email deep-links into the flow that can act on it — `/hub?change=<lineId>`
opens the swap flow on that line, `/hub?add=<swapGroup>` opens the add sheet
with an "in place of what you lost" section. Those links are the mechanism by
which a member takes control back, since nothing asks them to.

**Sending is manual by default, and that is a real workflow rather than a stub.**
Every email is written in full and listed in `/portal/emails` for a founder to
copy into their own mail client and tick off. No provider, no API key, no domain
verification — and the promise that a member is told still holds. A change that
has been applied but not yet sent shows `notifiedAt: null` and appears in the
member's record as outstanding, so the debt is visible rather than assumed away.

`NOTIFY_SOURCE=resend` plus a key switches to automatic sending of the same
emails, with nothing else to change. A forced `resend` without a key falls back
to **manual**, never to silently dropping the message.

### The Founders Hub

- `/portal/actions` — the queue. Each row says what will happen and when
  ("Removing from plan · applies in 23h") with the real money beside it.
  Grouped by product with bulk resolve, because one dead SKU is the same
  decision many times — though each member still goes through their own policy.
- `/portal/subscriptions` — every member, sorted by who needs attention soonest.
  The detail view answers "why did my plan change and why didn't anyone tell me"
  without a database console: lines and policies, billing history, every email
  sent, and their consent record.
- `/portal/emails` — **To send** and **Sent**. Each waiting email shows its full
  body with copy buttons for the address, subject and message, a "copy all" for
  the whole batch, and a Mark as sent tick that also closes the loop on the
  member's change record. `sentManually` keeps the audit honest: "a person says
  they sent this" and "a provider confirmed delivery" are different claims.

Supersedes the old `/portal/stock-alerts` and `lib/stock`, both removed.

### Terms, consent and the health disclaimer

`/legal/terms` and `/legal/disclaimer`, built from versioned data in `lib/legal`
so the terms quote the **live** notice period — change `priceChangeNoticeDays`
and the promise changes with it. Consent is captured in the account gate and
recorded server-side with a SHA-256 of the exact text served; `finalizeCheckout`
refuses to store a plan or start a payment without it.

> ⚠️ The legal copy has **not** been reviewed by a solicitor, and the company
> details are placeholders until the `NEXT_PUBLIC_LEGAL_*` env vars are set —
> both pages show a "not ready to publish" banner until they are. Do both before
> taking real money.

### The daily job

`/api/cron/daily` (GET, scheduled in `vercel.json`; POST to trigger by hand) —
detect, auto-resolve, apply anything whose clock came due, flush the outbox.
Guarded by `CRON_SECRET`, compared in constant time; with no secret set it's
open in development and **closed in production**, so a missed env var fails
safe. `?dryRun=1` computes and reports without writing or emailing. Every step
is idempotent, so running it more often than daily is harmless.

### Config (all portal-editable, in `PRICING_CONFIG`)

| Key | Default | Meaning |
|---|---|---|
| `defaultChangePolicy` | `auto-swap` | Pre-selected at checkout |
| `substitutionPriceTolerancePct` | 0.15 | How far a replacement's price may sit from the original |
| `priceChangeThresholdPct` | 0.02 | Supplier move that raises an event |
| `priceChangeNoticeDays` | 30 | Notice before an increase may bill |
| `discontinuedAfterMissedSyncs` | 3 | Syncs absent before "discontinued" |
| `founderReviewHours` | 24 | Override window before a change auto-applies (0 = immediate) |
