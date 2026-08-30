import type { SwapGroup, StackSlot, DietaryTag, SafetyFlag } from '@/lib/catalogue/types'
import type { UsageLevel } from '@/lib/stack-blueprint/pricing'
import type { SupplierAddress } from '@/lib/supplier/types'

/** Subscription as the customer manages it — shaped like a Recharge subscription contract. */

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled'

/**
 * What the member wants done when a product on their plan becomes unavailable at
 * the supplier. Deliberately TWO options, both of which resolve on their own:
 *
 *   • `auto-swap` — put the closest equivalent in its place and keep the plan
 *     (and the flat monthly) whole.
 *   • `remove`    — take it off the plan and lower the monthly from the next
 *     billing cycle.
 *
 * There is no "ask me first". A third option that waits on a reply would park
 * the subscription behind someone's inbox and hold up a delivery, so instead the
 * member is always TOLD what happened and invited — never required — to change
 * it in the hub, where they can already swap and add products.
 *
 * `remove` is also the universal safe fallback: whenever `auto-swap` can't be
 * honoured (nothing in stock in the category, or nothing compatible with a
 * declared allergy or diet) the line comes off rather than being held. Removing
 * costs the member money they get back; shipping the wrong thing might not be
 * undoable.
 */
export type ChangePolicy = 'auto-swap' | 'remove'

/**
 * The member's hard exclusions, snapshotted from their quiz answers at checkout.
 * Held on the subscription so a replacement product can be safety-checked
 * against the SAME rules that picked the original — without needing their quiz
 * answers to still be readable or unchanged.
 *
 * Optional: subscriptions stored before this existed fall back to deriving the
 * constraints from saved quiz answers (see `lib/changes/safety.ts`).
 */
export interface SafetyConstraints {
  /** Tags a product must carry to be eligible, e.g. ['vegan', 'gluten-free']. */
  dietaryTags: DietaryTag[]
  /** True when the member excluded stimulants (caffeine). */
  noStimulants: boolean
  /**
   * Safety-screen flags the member ticked — pregnancy/breastfeeding, prescription
   * medication, shellfish allergy. A product listing any of these in its
   * `contraindications` can never be sent to them.
   *
   * These are the exclusions `scoreProduct` applies when the stack is first
   * built. They were missing from this snapshot until they were added here,
   * which meant an auto-swap months later was judged on diet and stimulants
   * alone and could substitute a product the quiz would have refused —
   * ashwagandha or a hormone-active blend to someone pregnant, for instance.
   *
   * `undefined` means "snapshot taken before this field existed", which is NOT
   * the same as "no flags" and must never be read as an empty list. See
   * `meetsSafetyConstraints`, which treats it as unknown and refuses anything
   * carrying a contraindication at all.
   */
  safetyFlags?: SafetyFlag[]
}

/**
 * An audited change to what the member is billed. Appended to
 * `MemberSubscription.billingHistory` every time the recurring amount moves, so
 * the hub can show a plain history and nothing about a member's price can change
 * without a record of what, why and when.
 */
export interface BillingChange {
  id: string
  /** Why the money moved — a supplier-driven change, or the member's own edit. */
  reason: 'out-of-stock' | 'discontinued' | 'price-increase' | 'price-decrease' | 'member-edit'
  /** The line this concerned; null for plan-wide changes. */
  lineId: string | null
  previousMonthly: number
  newMonthly: number
  /**
   * A one-off credit (positive) banked against the next payment — e.g. the value
   * of a removed line the member had already paid towards but not received.
   */
  oneOffCredit?: number
  /** The billing cycle this takes effect from (ISO). Never retroactive. */
  effectiveFrom: string
  /** When the member was given notice, for changes that require it (ISO). */
  noticeSentAt?: string
  /** The `ChangeEvent` that caused this, when it wasn't a member edit. */
  changeEventId?: string
  createdAt: string
}

export interface MemberSubscriptionLine {
  /** Stable line id (Recharge subscription line id when live). */
  id: string
  productId: string
  productTitle: string
  variantTitle: string
  /** The stack slot this fulfils, e.g. "Protein". */
  slotTitle: string
  /** Primary stack slot — used to offer same-slot swap alternatives. */
  stackSlot: StackSlot
  /** Units per delivery. */
  quantity: number
  /** Delivery cadence in months. */
  deliveryIntervalMonths: number
  /**
   * How much the member gets through, on the friendly journey scale. Drives the
   * quantity + cadence above (we do the maths). Defaults to 'standard'.
   */
  usageLevel?: UsageLevel
  /** Amount billed each delivery. */
  pricePerDelivery: number
  swapGroup: SwapGroup
  /** When this line joined the subscription (ISO). Drives onset-aware advice. */
  addedAt: string
  /**
   * Deliveries of this line that have already shipped. Drives the
   * pay-for-what-shipped settlement when a line is removed mid-term, and the
   * "next ship" estimate. 0 for a freshly added line that hasn't shipped yet.
   *
   * Re-derived from the subscription clock on every paid cycle — see
   * `lib/recharge/clock.ts`. Stored rather than computed on read so the value a
   * settlement was calculated from stays auditable.
   */
  deliveriesMade: number
  /**
   * The subscription's `monthsActive` when this line joined the plan. 0 (or
   * absent) for everything created at signup. Stops a product added in month
   * four being credited with the four boxes that shipped before it existed.
   */
  joinedAtMonth?: number
  /** Next scheduled ship date for this line (ISO), if it differs from the box default. */
  nextShipAt?: string
  /**
   * A one-off credit banked against the next payment (e.g. from skipping a
   * delivery). Stored on the line so it travels with it. Optional/0 = none.
   */
  pendingCredit?: number
  /**
   * Whether the member allows a same-category substitution for this line if the
   * product goes out of stock at the supplier. `true` → we swap in the closest
   * in-stock product from the same `swapGroup`; `false` → we hold/skip and
   * contact them. Defaults to allowed (see the stock-alerts journey). Optional
   * so existing stored subscriptions read back unchanged.
   *
   * @deprecated Superseded by `changePolicy`, which replaces the "hold and
   * contact them" branch with "take it off and lower the bill". Kept in sync by
   * the policy writers so older readers and `PATCH /api/hub/substitution` keep
   * working; read it through `policyForLine()` rather than directly.
   */
  allowSubstitution?: boolean
  /**
   * What to do with this line if its product becomes unavailable. Falls back to
   * `allowSubstitution`, then the plan's `defaultChangePolicy`, then `auto-swap`
   * — see `policyForLine()` in `lib/changes/policy.ts`, which is the only place
   * that precedence is encoded.
   */
  changePolicy?: ChangePolicy
}

export interface MemberSubscription {
  /** Recharge subscription/contract id when live. */
  id: string
  status: SubscriptionStatus
  customerEmail: string
  /** Flat amount billed every month. */
  flatMonthly: number
  /**
   * The fixed subscribe-&-save discount rate (0–1) for this member's bundle.
   * Added lines and swaps are priced at this rate so the bundle's advertised
   * discount carries through the whole subscription. Defaults to the base rate.
   */
  subscriptionDiscountRate?: number
  /** Day of the month deliveries/charges land (1–28). */
  dispatchDayOfMonth: number
  /**
   * An explicit next-box date (ISO) that overrides the day-of-month rule for the
   * upcoming delivery only — set by "send now" / bring-forward / delay. Cleared
   * back to the day-of-month cadence after that delivery ships.
   */
  nextDispatchOverride?: string
  /** Minimum commitment in months. 1 = none, cancel or pause any time. */
  minMonths: number
  /**
   * The first-month intro discount (0–1) the member claimed at checkout — the
   * rate they revealed on their scratch card. Re-validated server-side when the
   * checkout is finalized (see `claimIntroDiscount`), so this is the granted
   * rate, not the one the browser asked for. 0 = none claimed.
   */
  introDiscountRate?: number
  /**
   * The partner's code this subscription came in on, normalised (`SARAH20`).
   *
   * Kept on the subscription and not only on the first order, because renewals
   * earn commission too and every renewal raises a fresh order months later.
   * Snapshotted, like `introDiscountRate`: a code can be paused or reissued, and
   * the member who signed up on it stays that partner's.
   */
  partnerCode?: string | null
  /** What the partner's code took off the first month, 0–1. */
  partnerDiscountPct?: number | null
  /**
   * Amount actually billed for the first month, after `introDiscountRate` AND
   * any partner code.
   */
  firstMonth?: number
  /** Months the subscription has been active (drives the min-term guard). */
  monthsActive: number
  startedAt: string
  paymentMethod: { brand: string; last4: string } | null
  lines: MemberSubscriptionLine[]
  /** When a snooze ends and deliveries resume (ISO). Set while paused via snooze. */
  snoozeUntil?: string
  /** Total months snoozed — defers the minimum term so a snooze never sidesteps it. */
  snoozedMonths?: number
  /** Reason captured if the member cancelled (for retention insight). */
  cancelReason?: string
  /**
   * Per-delivery edits made from the calendar, keyed by delivery id (`YYYY-MM`).
   * The flat monthly is unaffected — skips bank a credit, added items are
   * one-offs — so this only changes WHAT ships WHEN, never the recurring price.
   */
  deliveryOverrides?: Record<string, DeliveryOverride>
  /**
   * The member's choice at checkout for what happens when a product becomes
   * unavailable. Applied to lines added later, and the fallback for any line
   * without its own `changePolicy`.
   */
  defaultChangePolicy?: ChangePolicy
  /** Hard dietary/stimulant exclusions, snapshotted at checkout. */
  safetyConstraints?: SafetyConstraints
  /** Audit trail of every move in the recurring amount, newest last. */
  billingHistory?: BillingChange[]
  /**
   * How this plan ended, recorded at the moment it did.
   *
   * A snapshot rather than something re-derivable: the whole point of the exit
   * statement is that it describes a history, and a history read back six months
   * later through a changed catalogue is not the one the member agreed to. This
   * is the evidence of what was charged and why.
   */
  exit?: SubscriptionExit
  /**
   * The cycle this plan is scheduled to end on, when the member chose to leave
   * on their next free date rather than settle now.
   *
   * Nothing is charged and nothing stops: the plan runs on exactly as it is —
   * boxes still arrive, payments still go out — and ends by itself when the
   * balance reaches zero. Which is what the smoothing already promised, so it is
   * a scheduled cancellation rather than a payment plan. Clearing it resumes.
   */
  scheduledExitMonth?: number | null
  /** Stripe subscription id, set once the member checks out via Stripe. */
  stripeSubscriptionId?: string
  /** Stripe customer id — used to open the billing portal. */
  stripeCustomerId?: string
  /**
   * Where the monthly box goes, captured by Stripe Checkout at signup.
   *
   * Held on the subscription rather than only on the first order because EVERY
   * renewal raises a fulfilment order and each one needs somewhere to ship to;
   * Stripe only collects the address once. A member changing address updates
   * this, and the next box follows it.
   */
  shippingAddress?: SupplierAddress | null
  /**
   * Set when Stripe tells us a payment failed and it is retrying. Deliberately
   * NOT a `status` — the plan is still active and still shipping while the
   * dunning runs; conflating the two would either stop deliveries too early or
   * hide the problem. Cleared when a payment next succeeds.
   */
  billingStatus?: 'ok' | 'past_due'
}

/** How a subscription ended, snapshotted at the exit. */
export interface SubscriptionExit {
  at: string
  /** What the member told us, free text from the cancel flow. */
  reason?: string | null
  /** What we charged (£). Zero when waived. */
  settlement: number
  /** Whether the figure came from the order ledger or the forecast model. */
  source: 'ledger' | 'forecast'
  /** Why nothing was charged, when nothing was. */
  waiver?: string | null
  /** The Stripe invoice raised for it, when there was one. */
  invoiceId?: string | null
  /** False when the card declined — the invoice is still open and payable. */
  paid?: boolean
  /** What we owed THEM at the exit (£), if anything. */
  overpayment?: number
  /**
   * The statement as it stood, so the figure can be explained later without
   * re-deriving it through whatever the catalogue looks like by then.
   */
  statement?: unknown
  /**
   * The member exercised their statutory right to send everything back.
   *
   * A different exit from every other one: nothing is settled, the goods are
   * coming back, and we owe them `refundDue` once it arrives. Recorded rather
   * than inferred from the dates, because "did they say they were returning it?"
   * has to still be answerable in six months when the window has long closed.
   */
  returnRequested?: boolean
  /**
   * The MOST refundable once the goods are back (£) — a full, unopened return.
   * Set with `returnRequested`.
   *
   * A ceiling, not a debt. Opened supplements are not refundable unless they
   * arrived faulty, and nobody can know what is opened until the parcel is, so
   * the amount actually paid out is `refundPaid` and it is set by whoever
   * inspects it. Conflating the two would turn "up to £46.86" into a promise
   * made before anyone had looked in the box.
   */
  refundDue?: number
  // ── Set later, by a founder working the exit queue ────────────────────────
  /** What was actually refunded once the parcel was opened and checked (£). */
  refundPaid?: number | null
  /** When the returned goods came back and the refund actually went out. */
  returnRefundedAt?: string | null
  /** When a founder decided this balance would never be collected. */
  writtenOffAt?: string | null
  /** When the overpayment was actually refunded. */
  refundedAt?: string | null
  /** Why a founder waived or wrote it off, in their words. Audit, not decoration. */
  note?: string | null
  /** Which founder acted, for the same reason. */
  by?: string | null
}

/** A member's edit to a single scheduled delivery (from the calendar). */
export interface DeliveryOverride {
  /** Skip this box entirely (credits its value to the next payment). */
  skipped?: boolean
  /** Move this box to an explicit date (ISO). */
  dateOverride?: string
  /** Product ids added to this box as a one-off (full price). */
  addedProductIds?: string[]
  /** Recurring line ids pulled out of this box only. */
  removedLineIds?: string[]
}
