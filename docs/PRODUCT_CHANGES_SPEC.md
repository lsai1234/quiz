# Product changes on subscriptions — requirements & build spec

How the platform handles a subscribed product **going away** (out of stock,
delisted) or **changing price** at the supplier, on both sides of the business:

- **Member side** — what they choose at checkout, what happens to their bundle
  and their forward billing, what they're told, and what they agreed to.
- **Founders Hub side** — how those events surface as a **requires-action**
  queue, how a founder resolves them, and how the member is notified.
- **Legal** — the terms that make price changes and substitutions enforceable,
  plus the not-medical-advice / allergen liability position.

Everything is mock-first (works with no supplier, Stripe or email keys) and
swaps to live providers behind the same interfaces, matching how
`src/lib/supplier`, `src/lib/payments` and `src/lib/catalogue` already work.

---

## 1. What exists today (the starting line)

| Piece | Where | State |
|---|---|---|
| Per-line substitution consent (boolean) | `MemberSubscriptionLine.allowSubstitution` | Built |
| Consent capture | `CheckoutSuccess.tsx` → `PATCH /api/hub/substitution` | **Post**-checkout only, binary |
| Daily stock check | `src/lib/stock/check.ts` → `stock_exceptions` table | Built (on-demand button) |
| Founder resolution | `src/lib/stock/service.ts` (substitute / skip / notify) | Built, no email, no re-price |
| Billing-impact maths | `lineEconomics`, `computeRemoveImpact`, `computeSwapImpact` (`recharge/mock.ts`) | Built |
| Margin guardrails | `PRICING_CONFIG.marginFloorPct`, `unitCostOf`, `discountWithFloor` | Built |
| Supplier price feed | `SupplierStockLevel.wholesalePrice` / `.rrp` | Feed exists, **nothing consumes price changes** |

**Gaps this spec closes:** no *remove-and-reduce-billing* option; no distinction
between temporarily out of stock and permanently discontinued; no price-change
domain at all; no email/notification layer; no consent record, no T&Cs, no
medical/allergen disclaimer; "notify member" is a label that sends nothing.

---

## 2. Architecture

Three new domains, each mirroring the existing module conventions (pure
functions + typed provider + `__tests__/` alongside).

```
src/lib/changes/     ← the unified change-event domain (supersedes lib/stock)
  types.ts             ChangeEvent, ChangePolicy, Resolution, BillingChange
  policy.ts            pure: resolve a member's policy → an intended action
  detect.ts            pure: catalogue+supplier snapshot → ChangeEvent[]
  apply.ts             pure: (subscription, resolution) → next subscription + BillingChange
  repo.ts              persistence (subscription_changes table)
  service.ts           orchestration: detect → auto-resolve → queue → notify
  __tests__/

src/lib/notify/      ← outbound member comms
  types.ts             NotificationProvider, Notification, TemplateId
  templates/           typed template fns → { subject, html, text } (pure)
  outbox.ts            queue + audit (notifications table), retry, dedupe
  providers/mock.ts    writes to the outbox only (default; visible in the hub)
  providers/resend.ts  live adapter (RESEND_API_KEY)
  __tests__/

src/lib/legal/       ← versioned terms + consent evidence
  content.ts           TERMS (versioned sections), DISCLAIMER, hash per version
  consent.ts           recordConsent / getConsents (consents table)
  __tests__/
```

### 2.1 The change event

One shape covers every reason a subscribed line has to change. `stock_exceptions`
is superseded by `subscription_changes` (migration v4 creates it and back-fills
open rows from v3; the old table is left in place, unread).

```ts
export type ChangeKind =
  | 'out-of-stock'      // temporarily unavailable at the supplier
  | 'discontinued'      // gone for good — delisted / absent N syncs running
  | 'price-increase'    // supplier wholesale/RRP up beyond the threshold
  | 'price-decrease'    // supplier price down (optional pass-down)

export type ChangeStatus =
  | 'requires-action'   // in the founder's queue, with an intended action + a deadline
  | 'auto-resolved'     // the member's policy decided it; no founder needed
  | 'scheduled'         // resolved, but takes effect at a future billing date
  | 'applied'           // subscription + billing updated
  | 'cancelled'         // supplier recovered / founder dismissed

export type ChangeResolution =
  | { type: 'substitute'; replacementProductId: string }
  | { type: 'remove' }                       // drop the line, reduce forward billing
  | { type: 'hold' }                         // founder-only: skip this line's next box
  | { type: 'absorb' }                       // price rise: we eat it
  | { type: 'pass-on'; newUnitPrice: number } // price rise: member pays, after notice
  | { type: 'dismiss' }
```

**Nothing ever waits on a member.** Every event carries an `intendedAction`
(derived from the member's policy) and an `autoApplyAt` deadline from the moment
it's detected. A founder can override inside that window; if nobody does, the
system applies the intended action and emails the member. `requires-action` is
therefore a *review* state, never a blocked one — a founder on holiday delays
nothing.

Each event carries the member (`userId`, `email`), the line, the detected facts
(old/new wholesale + RRP, stock, supplier status), the **member's policy at
detection time**, a suggested replacement, and — critically — a
**`BillingPreview`** computed from the existing `recharge/mock.ts` helpers so
the founder sees `£X/mo → £Y/mo` before doing anything.

### 2.2 Member change policy (replaces the boolean)

```ts
export type ChangePolicy =
  | 'auto-swap'   // swap to the closest equivalent, keep my plan whole
  | 'remove'      // drop it and lower my monthly
```

**Two options only, both of which resolve without the member doing anything.**
There is deliberately no "ask me first": it would leave a subscription in limbo
behind someone's inbox, hold up a delivery, and put the awkward decision on the
member at the worst moment. Instead the member is told *after* the fact and
invited — never required — to adjust it in the hub, where they can already swap
(`ChangeProductFlow`) and add (`AddProductSheet`) products. Control without a
blocking action.

- Lives on `MemberSubscriptionLine.changePolicy`, with
  `MemberSubscription.defaultChangePolicy` as the plan-level default applied to
  lines added later.
- **Back-compat:** readers fall back to `allowSubstitution` (`true → auto-swap`,
  `false → remove`) when `changePolicy` is absent, and writers keep
  `allowSubstitution` in sync, so stored subscriptions and
  `PATCH /api/hub/substitution` keep working unchanged. Note the semantic shift
  for the `false` case: it used to mean "hold and contact me", it now means
  "take it off and lower my bill" — strictly better for the member than a stalled
  box, and consistent with what they'll be offered at checkout from now on.
- **Removal is always the safe fallback.** Any time `auto-swap` can't be
  satisfied — no in-stock same-category product, or none that's compatible with a
  declared allergy or diet — the line is removed and the monthly drops, rather
  than held. Removing something costs the member money they get back; shipping
  the wrong thing could hurt them.

### 2.3 Forward billing

A member's price must never silently move. Every applied change produces a
`BillingChange` record appended to `MemberSubscription.billingHistory`:

```ts
interface BillingChange {
  id: string
  reason: ChangeKind | 'member-edit'
  lineId: string | null
  previousMonthly: number
  newMonthly: number
  oneOffCredit?: number      // e.g. paid-for-but-unshipped value on a removal
  effectiveFrom: string      // ISO — the billing cycle it starts
  noticeSentAt?: string
  changeEventId?: string
}
```

Rules baked into `apply.ts`:

1. **Reductions apply from the next billing cycle** and are never retroactive
   beyond a credit for value paid-for-but-not-shipped (reuses the existing
   `computeRemoveImpact` settlement maths, inverted).
2. **Increases require notice** — `priceChangeNoticeDays` (default 30) must
   elapse between the notice email and `effectiveFrom`, so the event sits in
   `scheduled` until then. A daily job promotes `scheduled → applied`.
3. **Stripe is the source of truth for money.** Applying a change updates the
   Stripe subscription's recurring amount (`updateSubscriptionAmount` added to
   `lib/payments/stripe.ts`, no-op in mock) and only then writes the local
   subscription. A Stripe failure leaves the event `requires-action` with the
   error attached — never a local/remote price mismatch.
4. **Never below the margin floor.** A pass-on price is re-derived through
   `discountWithFloor` at the member's own `subscriptionDiscountRate`, so their
   bundle rate carries through the re-price.
5. A change that would drop the flat monthly below
   `minSubscriptionMonthly` flags `requires-action` instead of auto-applying.

---

## 3. Feature requirements

### F1 — Checkout: choose what happens if a product becomes unavailable

**Where:** a new step in `SubscriptionJourney` (before "Looks good →"), so the
choice is made *before* payment rather than on the success page.

- Plan-level default, one tap, **two options**: **"Keep my plan whole"**
  (auto-swap) or **"Just take it off my plan"** (remove & pay less).
- Expandable per-product overrides for members who want them — same two options,
  defaulted from the plan choice.
- Each option shows its consequence in plain money, e.g.
  *"We'll swap in the closest match at the same or lower price — your £60.05/mo
  doesn't change"* vs *"Your monthly drops by the value of that item from the
  next payment"*.
- Both options carry the same reassurance line, because it's what makes a
  no-action-required default fair: *"Either way we'll email you, and you can
  change it yourself in your hub any time."*
- **Allergen/dietary safety gate:** if the member declared an allergy or a
  dietary requirement in the quiz, auto-swap is constrained to replacements
  carrying the same `dietaryTags` and passing the same allergen exclusion; when
  no such replacement exists the line is **removed** (and the member emailed with
  the reason and a suggestion to pick something themselves) rather than swapped.
  Safety beats convenience, always.
- Persisted with the subscription at `finalizeCheckout` (server-side, on the
  payload alongside the intro-discount claim), not by a follow-up PATCH.
- Editable forever after in the hub (`LineManageSheet` + a plan-level control on
  `SubscriptionDashboard`); `CheckoutSuccess` keeps a confirmation summary
  rather than being the place the decision is made.

**Acceptance:** a subscription created through checkout has a `changePolicy` on
every line and a `defaultChangePolicy` on the plan; choosing "remove" and then
triggering an out-of-stock event drops the line and lowers `flatMonthly` from
the next cycle with no founder and no member involvement; no code path can leave
an event waiting on a member reply.

### F2 — Terms & conditions with a price-change clause

- `/legal/terms` and `/legal/disclaimer` pages rendered from
  `src/lib/legal/content.ts` (versioned, hashed).
- Terms must cover, in plain English: the flat monthly and what it buys; that
  **prices can change and that change applies to future billing**, with at least
  `priceChangeNoticeDays` notice by email and the right to cancel penalty-free
  in the notice window (including inside any minimum term); that products can
  become unavailable and how their chosen policy handles it; substitutions being
  "closest equivalent, never worse value"; minimum term and cancellation; skip /
  pause / credit behaviour.
- **Consent capture at checkout:** one required checkbox in `AccountGate`
  binding the subscription terms **and** the health disclaimer (F3), blocking
  submit until ticked. Recorded in a `consents` table: `userId`, `version`,
  `contentHash`, `acceptedAt`, `ip`, `userAgent`, `context: 'checkout'`.
- Re-consent when a material term changes: members on an older `TERMS_VERSION`
  get an in-hub notice; the founder can trigger a terms-update email.

**Acceptance:** checkout cannot complete without a stored consent row; the row
resolves to the exact terms text served that day.

### F3 — Not medical advice / allergen & liability disclaimer

Required at three touch points, from one source of truth so wording never drifts:

1. **Checkout** — a short, unmissable panel above the consent checkbox.
2. **Order/subscription confirmation email** and the success screen.
3. **Every substitution email** and the hub's product detail sheet.

Must say, plainly:

- CHRGD sells food supplements. Nothing here is medical advice, diagnosis or
  treatment, and it doesn't replace advice from a doctor or pharmacist.
- Recommendations come from the quiz answers *you* give; we can't verify them.
- Talk to a doctor before starting if you're pregnant, breastfeeding, under 18,
  on medication, or have a medical condition.
- **Allergens and dietary suitability: always read the label on the product you
  receive.** Dietary tags (vegan, gluten-free…) come from supplier data and can
  change between batches or when a formulation changes. We surface them as a
  filter, not a guarantee — the pack in your hand is authoritative.
- Stop and seek advice if you have a reaction.
- Liability is limited to what UK law allows: we don't exclude liability for
  death or personal injury caused by our negligence, fraud, or anything else
  that can't lawfully be excluded (UCTA 1977 / CRA 2015 — an unqualified
  "we aren't liable" clause is void and worse than none).
- Substitutions specifically: *"This is a different product — check the
  ingredients and allergen information before you use it."*

**Acceptance:** the disclaimer text has exactly one definition; a substitution
email that omits the allergen sentence fails a unit test.

### F4 — Unavailability detection (out of stock vs discontinued)

Extend `runStockCheck` into `runChangeDetection`:

- **Out of stock** — SKU present in the supplier feed with `inStock: false`.
  Transient; a recovery clears an open event (`cancelled`) and emails nothing.
- **Discontinued** — SKU absent from `listProducts()` for
  `discontinuedAfterMissedSyncs` (default 3) consecutive syncs, or explicitly
  flagged. Permanent, so `hold` is not offered as a resolution.
- A `SupplierSyncSnapshot` (per-SKU last-seen, stock, wholesale, RRP) persists in
  a `supplier_snapshots` table — it's what makes "missing for 3 syncs" and price
  deltas computable at all.
- Detection is pure (`detect.ts`) over `{ previousSnapshot, currentFeed,
  subscriptions, catalogue }`; the service does the I/O. Fully unit-testable
  with no database.

### F5 — Auto-resolution by member policy

`service.ts` derives an `intendedAction` from the member's policy the moment an
event is detected. It always resolves to something concrete:

- `auto-swap` → pick the best replacement (`suggestReplacement`, tightened: same
  `swapGroup`, in stock, **dietary/allergen-compatible**, unit price within
  `substitutionPriceTolerancePct` (default 15%) of the original). Apply, keep the
  monthly whole where price allows, email the member. **No suitable replacement →
  falls back to `remove`**, with the email explaining why and pointing at the hub.
- `remove` → drop the line, reduce forward billing, credit anything paid-for and
  unshipped, email the member with a "browse replacements" hub link.

Two cases still route to the founder queue rather than applying blind, because
they change the shape of the plan rather than one line of it:

- Removing the **last remaining line**, or dropping the flat monthly below
  `minSubscriptionMonthly` (the plan stops being a viable subscription).
- Any **discontinued** product, if `founderReviewHours > 0` — a permanent loss is
  worth a founder's eye on the replacement choice.

Both still carry the intended action and `autoApplyAt`, so they apply on the
deadline regardless. Every resolution — automatic or founder-made — writes an
event row, so the hub shows what the system did on the founder's behalf, and it
stays reversible from the subscription detail view.

### F6 — Founders Hub: subscriptions + requires-action queue

New portal section `/portal/subscriptions`:

- **List** of every member subscription: status, flat monthly, next dispatch,
  line count, and a health badge — **Requires action** (amber) / **Scheduled** /
  **Healthy** — sorted so the amber ones are first.
- **Detail** view: the member, their lines with per-line policy, their billing
  history, their consent record, open events.
- **Action queue** (`/portal/actions`, replacing `/portal/stock-alerts`): every
  `requires-action` event across all members, filterable by kind, showing:
  product, member, why it flagged, the member's policy, **what the system will do
  and when** ("Removing from plan · auto-applies in 19h"), the suggested
  replacement, and the **billing preview** (`£60.05/mo → £54.39/mo`, one-off
  credit £4.20, effective 1 Sep).
- **Resolve** with one control: *Change product* (searchable same-category
  picker, with a hard warning when the replacement's dietary tags don't match
  the member's declared requirements), *Remove from plan*, *Hold next box*, or
  *Dismiss*. Applying updates the subscription, writes the `BillingChange`,
  updates Stripe, and **queues the member email** — one action, not four.
- A founder acting inside the review window is an override, not an unblock:
  doing nothing produces the same outcome a beat later. The queue's empty state
  is therefore the normal state, and the countdown makes that explicit.
- **Bulk resolve** for one SKU affecting many members (accept the suggested
  replacement for all, or remove for all), with a per-member preview and a
  single confirm. This is the difference between usable and unusable when a
  popular SKU dies.
- Every action is **previewed before commit** and **audited after** (who, when,
  what changed, what was sent).

### F7 — Supplier price changes: absorb or pass on

- `runPriceCheck` (same daily job) diffs each subscribed SKU's `wholesalePrice`
  and `rrp` against the stored snapshot; a move beyond
  `priceChangeThresholdPct` (default 2%) raises a `price-increase` /
  `price-decrease` event, **grouped by SKU** rather than one per member.
- The hub shows, per affected SKU: old → new cost, the number of affected
  subscriptions, current blended margin, **margin if absorbed**, **new member
  price and monthly delta if passed on**, and a red flag when absorbing would
  push lines under `marginFloorPct`.
- **Absorb** → update the cost baseline only. Member price and flat monthly
  untouched, no email, margin recorded. One click, whole SKU.
- **Pass on** → recompute the line unit price via `discountWithFloor` at each
  member's own subscription rate, create a `scheduled` `BillingChange` with
  `effectiveFrom = max(next billing date, today + priceChangeNoticeDays)`, and
  queue a notice email per member. Members can cancel penalty-free in the notice
  window even inside a minimum term (F2), and the hub shows opt-out counts.
- **Partial pass-on** — pass on a chosen percentage of the increase; the rest is
  absorbed. Rounded to sensible money and re-floored.
- Price *decreases* default to absorbed-in-our-favour but are surfaced with a
  one-click "pass the saving on", which is worth having for retention.

### F8 — Member notifications

`src/lib/notify` with a provider interface, mock by default (outbox rows only,
rendered in the hub so the flow is demoable without an email key) and a Resend
adapter for live. Templates required:

Because no email ever asks the member to *do* something for their subscription to
keep working, every one of these is a **notice with an open invitation**: here's
what we did, here's what it costs you, change it in your hub if you'd rather.
That invitation only works if the link lands somewhere useful, so each email
deep-links into the flow that already exists rather than the hub's front door:
`/hub?change=<lineId>` opens `ChangeProductFlow` on that line, and
`/hub?add=<swapGroup>` opens `AddProductSheet` pre-filtered to that category.

| Template | Trigger | Must contain |
|---|---|---|
| `product-substituted` | auto-swap or founder swap applied | old → new product, why, **allergen check line**, monthly (unchanged or new), *"prefer something else? change it in your hub"* → `?change=` link |
| `product-removed` | line removed (member's policy, or no safe match) | what went and **why**, **new monthly**, effective date, any credit, *"add a replacement whenever you like"* → `?add=` link with 2–3 suggestions |
| `price-change-notice` | pass-on scheduled | old → new monthly, effective date, **notice period**, right to cancel free, hub link |
| `terms-updated` | material terms change | what changed, when it applies, link |

- Idempotent by `(changeEventId, templateId)` — a re-run of the daily job can
  never double-send.
- Failures retry with backoff and surface in the hub as **Delivery failed** with
  a resend button; a failed email never rolls back an applied billing change,
  but it does keep the event visible.
- Honours a member `notificationPreferences` record; **transactional billing and
  price-change notices are not opt-out-able** (they're a legal requirement).

### F9 — Scheduling

- `POST /api/cron/daily` (secured by `CRON_SECRET`) runs, in order: supplier
  snapshot sync → change detection → auto-resolution → promote due `scheduled`
  changes to `applied` → flush the notification outbox.
- Founders can still run each stage manually from the hub, with a dry-run toggle
  that computes and previews without writing — how you'd sanity-check a
  20-member price rise before firing it.

---

## 4. Configuration (all portal-editable, in `PRICING_CONFIG`)

| Key | Default | Meaning |
|---|---|---|
| `priceChangeThresholdPct` | 0.02 | Supplier move that raises an event |
| `priceChangeNoticeDays` | 30 | Notice before an increase can bill |
| `substitutionPriceTolerancePct` | 0.15 | Max price gap for an auto-swap |
| `discontinuedAfterMissedSyncs` | 3 | Syncs absent before "discontinued" |
| `founderReviewHours` | 24 | Override window before an event auto-applies (0 = apply immediately) |
| `defaultChangePolicy` | `auto-swap` | Plan default offered at checkout |

---

## 5. Delivery plan

Each phase is shippable, tested, and leaves the app working.

| Phase | Scope | Key files |
|---|---|---|
| **P1** | Change-event domain + migration v4 + the **two-option** policy model, `intendedAction`/`autoApplyAt` on the event, back-compat mapping (`allowSubstitution: false → remove`) | `lib/changes/*`, `db/migrations.ts`, `recharge/types.ts` |
| **P2** | Legal content, consent capture, checkout disclaimer + T&Cs (terms describe the two options and the "we'll tell you, change it in your hub" promise) | `lib/legal/*`, `AccountGate`, `/legal/*` |
| **P3** | Checkout two-option step (F1) + hub editing of policy, plan-level and per-line | `SubscriptionJourney`, `LineManageSheet`, `SubscriptionDashboard`, `checkout/finalize` |
| **P4** | Detection (snapshots, out-of-stock vs discontinued) + auto-resolution with **remove as the universal safe fallback**, incl. the allergen gate | `changes/detect.ts`, `changes/policy.ts`, `changes/service.ts` |
| **P5** | Notification domain + templates + outbox, wired to P4. **Includes the hub deep links** (`?change=`, `?add=`) the emails point at — an invitation with a dead link is not a feature | `lib/notify/*`, `HubPage`, `ChangeProductFlow`, `AddProductSheet` |
| **P6** | Founders Hub subscriptions list + action queue with countdown-to-auto-apply + override + bulk resolve | `/portal/subscriptions`, `/portal/actions` |
| **P7** | Price-change detection, absorb / pass-on / partial, scheduled billing + Stripe amount updates | `changes/price.ts`, `payments/stripe.ts` |
| **P8** | Daily cron (detect → auto-resolve → **promote expired review windows** → apply due scheduled changes → flush outbox), dry-run, audit surfaces, docs update | `/api/cron/daily`, `docs/SUBSCRIPTIONS.md` |

The shape of the change from the first draft: P4 gained the fallback chain, P5
gained the hub deep links (previously the emails could have got away with a bare
hub link, because a member could also just reply to an "action needed" mail —
without that path, the link *is* the mechanism), P6 gained the review-window
countdown and lost its role as a blocking gate, and P8 gained the job that
expires review windows. P1–P3 shrank slightly: one fewer option to model, render
and explain.

## 6. Testing

Jest, alongside the existing `__tests__/` layout. Non-negotiable coverage:

- `detect.ts` — OOS vs discontinued vs recovery vs price move, from fixture
  snapshots, no I/O.
- `policy.ts` — every policy × every kind resolves to a concrete action; the
  allergen/dietary gate downgrades `auto-swap` to `remove`; **a property test
  asserting no input combination ever yields "wait for the member"**.
- Review window — an untouched event applies its intended action after
  `founderReviewHours`; a founder override inside the window wins and cancels the
  auto-apply.
- `apply.ts` — monthly recomputation on remove/swap/re-price; margin floor
  respected; `effectiveFrom` never inside the notice window for increases;
  credits match the existing settlement maths.
- `notify` — every template renders with the required clauses; the allergen line
  is asserted; idempotency on `(eventId, template)`.
- `legal` — consent hash matches served content; checkout rejects without it.
- Price pass-on — a worked multi-member example end to end, asserting each
  member's new monthly and notice date.

## 7. Decisions needed before P1

1. **Notice period** for price rises — 30 days assumed.
2. **Default policy** at checkout — `auto-swap` assumed (best retention;
   "remove" is the honest alternative).
3. **Email provider** for live — Resend assumed (cheapest adapter to write);
   Postmark/SES are drop-in alternatives.
4. **Founder review window** — 24h assumed, and only for discontinued products
   and plan-shape changes; out-of-stock events on a healthy plan apply straight
   away. Set `founderReviewHours: 0` to have everything apply immediately.
5. **Price decreases** — absorbed by default, with a one-click pass-down.
