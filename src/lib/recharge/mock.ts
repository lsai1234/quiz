/**
 * Mock subscription service — stands in for Recharge until it's connected.
 *
 * `createMockSubscription` builds a realistic subscription from the quiz engine.
 * The mutation helpers (swap / dispatch date / pause / cancel) are PURE — they
 * take a subscription and return a new one. When Recharge is wired in, the hub
 * store calls Recharge's API here instead; the shapes are deliberately aligned.
 */

import { billingDayOf, nextPlanDate } from './billing-day'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { SLOT_LABELS } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'
import type { StackBlueprint } from '@/lib/stack-blueprint'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint/mock-blueprint'
import {
  buildSubscriptionPlan,
  calculatePricing,
  discountWithFloor,
  unitCostOf,
  getPricingConfig,
  getSubscriptionProduct,
  sizeConsumption,
  type UsageLevel,
  type SubscriptionPlanOptions,
} from '@/lib/stack-blueprint/pricing'
import { basisForProduct } from '@/lib/feedback'
import { deliveriesMadeFor, nextBoxCycle, roundInterval, syncDeliveryCounts, withInterval } from './clock'
import { answersFor, ESTIMATED_ROUTINE, routineFromAnswers } from './routine'
import { planRateChange, withPlanRate } from './plan-rate'
import type { ChangePolicy, MemberSubscription, MemberSubscriptionLine, SafetyConstraints } from './types'

const round = (n: number) => Math.round(n * 100) / 100

function variantLabel(v: { flavour: string | null; size: string | null; title: string }): string {
  const parts = [v.flavour, v.size].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : v.title
}

/** Monthly cost = sum of each line's per-delivery price amortised over its cadence. */
export function flatMonthlyOf(lines: MemberSubscriptionLine[]): number {
  return round(lines.reduce((s, l) => s + l.pricePerDelivery / l.deliveryIntervalMonths, 0))
}

/** The member's bundle subscribe-&-save rate, falling back to the base config rate. */
export function subRateOf(sub: MemberSubscription, config = getPricingConfig()): number {
  return sub.subscriptionDiscountRate ?? config.subscriptionDiscount
}

/**
 * Build a `MemberSubscription` from any stack blueprint — the hub's management
 * view of a member's bundle. Used both to seed the demo (from MOCK_BLUEPRINT)
 * and, at checkout, to persist the member's *actual* chosen stack so it shows
 * in the hub when they log back in.
 */
export function buildMemberSubscription(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  email: string,
  answers?: QuizAnswers | null,
  opts: SubscriptionPlanOptions & {
    id?: string
    monthsActive?: number
    dispatchDayOfMonth?: number
    /**
     * @deprecated Superseded by `changePolicyByProductId`. Kept so older callers
     * keep working; `true` maps to `auto-swap`, `false` to `remove`.
     */
    substitutionByProductId?: Record<string, boolean>
    /** The member's plan-wide answer to "what if this becomes unavailable?". */
    defaultChangePolicy?: ChangePolicy
    /** Per-product overrides of that answer, captured at checkout. */
    changePolicyByProductId?: Record<string, ChangePolicy>
    /** Hard dietary/stimulant exclusions, snapshotted at the point of sale. */
    safetyConstraints?: SafetyConstraints
    /**
     * The clock the plan is made by. A plan's start, its day and every date the
     * calendar derives come from it, so a test with a fixed date passes the same
     * date here, or the plan starts on the real day and the test's calendar
     * looks at months before it existed.
     */
    now?: Date
  } = {},
): MemberSubscription {
  const defaultPolicy: ChangePolicy = opts.defaultChangePolicy ?? 'auto-swap'
  /**
   * A line's OWN policy, or undefined when it just follows the plan default.
   *
   * The distinction matters: `setDefaultChangePolicy` deliberately leaves lines
   * with an explicit choice alone, so stamping every line at checkout would
   * quietly make the hub's plan-wide control a no-op. Only a genuine per-product
   * override is recorded on the line.
   */
  const explicitPolicyFor = (productId: string): ChangePolicy | undefined => {
    const explicit = opts.changePolicyByProductId?.[productId]
    if (explicit) return explicit
    const legacy = opts.substitutionByProductId?.[productId]
    if (legacy !== undefined) return legacy ? 'auto-swap' : 'remove'
    return undefined
  }
  const effectivePolicyFor = (productId: string): ChangePolicy => explicitPolicyFor(productId) ?? defaultPolicy
  const slotTitleById = Object.fromEntries(blueprint.slots.map((s) => [s.slotId, s.title]))
  const plan = buildSubscriptionPlan(blueprint, catalogue, answers, getPricingConfig(), opts)
  const pricing = calculatePricing(blueprint, catalogue, answers, getPricingConfig(), opts)

  const monthsActive = opts.monthsActive ?? 0
  const startedAt = new Date(opts.now ?? new Date())
  startedAt.setMonth(startedAt.getMonth() - monthsActive)

  const lines: MemberSubscriptionLine[] = plan.map((l, i) => {
    const variant = l.product.variants.find((v) => v.id === l.variantId) ?? l.product.variants.find((v) => v.available) ?? l.product.variants[0]
    return {
      id: `line-${i}-${l.product.id}`,
      productId: l.product.id,
      productTitle: l.product.title,
      variantTitle: variant ? variantLabel(variant) : '',
      sku: variant?.sku ?? null,
      variantId: variant?.id ?? null,
      slotTitle: slotTitleById[l.coversSlotIds[0]] ?? l.product.category,
      stackSlot: l.product.stackSlots[0],
      quantity: l.unitsPerShipment,
      deliveryIntervalMonths: l.shipEveryMonths,
      usageLevel: l.usageLevel,
      lastsMonths: l.monthsOneUnitLasts,
      pricePerDelivery: l.pricePerDelivery,
      swapGroup: l.product.swapGroup,
      addedAt: startedAt.toISOString(),
      deliveriesMade: deliveriesInMonths(monthsActive, l.shipEveryMonths),
      // What to do if this product becomes unavailable. Set only where the
      // member chose something different for this product; otherwise the line
      // follows `defaultChangePolicy`. `allowSubstitution` carries the EFFECTIVE
      // value either way, for older readers that only understand the boolean.
      changePolicy: explicitPolicyFor(l.product.id),
      allowSubstitution: effectivePolicyFor(l.product.id) === 'auto-swap',
    }
  })

  return {
    id: opts.id ?? 'mock-sub-1',
    status: 'active',
    customerEmail: email,
    flatMonthly: pricing.subscriptionTotal,
    subscriptionDiscountRate: pricing.subscriptionDiscountPct / 100,
    // The day it started, which is the day Stripe bills it (`billing-day`).
    dispatchDayOfMonth: opts.dispatchDayOfMonth ?? billingDayOf(startedAt),
    minMonths: pricing.subscriptionMinMonths,
    introDiscountRate: pricing.subscriptionIntroDiscountPct / 100,
    firstMonth: pricing.subscriptionFirstMonth,
    monthsActive,
    startedAt: startedAt.toISOString(),
    paymentMethod: { brand: 'Visa', last4: '4242' },
    // What every product was sized from, kept so the hub sizes the same way.
    routine: routineFromAnswers(answers) ?? ESTIMATED_ROUTINE,
    defaultChangePolicy: defaultPolicy,
    safetyConstraints: opts.safetyConstraints,
    lines,
  }
}

/** Build a representative *demo* subscription (2 months in) from the mock blueprint. */
export function createMockSubscription(
  catalogue: CatalogueProduct[],
  email: string,
  answers?: QuizAnswers | null,
  /** The clock it's made by: tests pass theirs so the plan and the schedule agree. */
  now: Date = new Date(),
): MemberSubscription {
  return buildMemberSubscription(MOCK_BLUEPRINT, catalogue, email, answers, { monthsActive: 2, now })
}

/** Deliveries shipped after `months` for a line shipping every `everyMonths` (first at signup). */
export function deliveriesInMonths(months: number, everyMonths: number): number {
  // The clock's own count (deliveries at ⌊k × every⌋ from signup), so a 2½-month
  // rhythm counts the boxes that really went: 0, 2, 5, 7…
  return deliveriesMadeFor({ deliveryIntervalMonths: everyMonths, joinedAtMonth: 0 }, Math.max(0, months))
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/**
 * The next date the plan's day falls on: the day itself, or a shorter month's
 * last day for a plan started on the 29th–31st, as Stripe bills it
 * (`billing-day`). It used to stop at the 28th, which was right for the days the
 * hub offered and wrong for a plan whose day is the day it was bought.
 */
export function nextDispatchDate(dayOfMonth: number, from: Date = new Date()): Date {
  return nextPlanDate(dayOfMonth, from)
}

export function formatDispatchDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
}

// ─── Minimum-term guard ──────────────────────────────────────────────────────

/** Deliveries the member has skipped — these defer the term, they don't count toward it. */
export function skippedDeliveryCount(sub: MemberSubscription): number {
  return Object.values(sub.deliveryOverrides ?? {}).filter((o) => o.skipped).length
}

/**
 * Months still owed on the minimum commitment. Skipped deliveries and snoozed
 * months push this back — neither is a paid cycle, so the term extends to match.
 */
export function monthsRemainingOnTerm(sub: MemberSubscription): number {
  return Math.max(0, sub.minMonths - sub.monthsActive + skippedDeliveryCount(sub) + (sub.snoozedMonths ?? 0))
}

export function canCancel(sub: MemberSubscription): boolean {
  return monthsRemainingOnTerm(sub) === 0
}

// ─── Mutations (pure) ────────────────────────────────────────────────────────

export function setDispatchDay(sub: MemberSubscription, day: number): MemberSubscription {
  return { ...sub, dispatchDayOfMonth: Math.min(Math.max(Math.round(day), 1), 28) }
}

export function pauseSubscription(sub: MemberSubscription): MemberSubscription {
  // Gated on state, not on policy. Pausing used to be blocked during the minimum
  // term to stop it side-stepping the commitment; now that cancelling is
  // unconditional (see `cancelSubscription`), blocking the gentler action while
  // allowing the drastic one would make no sense to a member.
  return sub.status === 'active' ? { ...sub, status: 'paused' } : sub
}

export function resumeSubscription(sub: MemberSubscription): MemberSubscription {
  return sub.status === 'paused' ? { ...sub, status: 'active', snoozeUntil: undefined } : sub
}

/**
 * Snooze: pause billing + shipping for a set number of months with a clear return
 * date. Allowed even during the minimum term because it DEFERS the term (adds to
 * snoozedMonths) rather than sidestepping it — the strongest "don't cancel" save.
 */
export function snoozeSubscription(sub: MemberSubscription, months: number): MemberSubscription {
  if (sub.status === 'cancelled') return sub
  const m = Math.min(3, Math.max(1, Math.round(months)))
  const until = new Date()
  until.setMonth(until.getMonth() + m)
  return { ...sub, status: 'paused', snoozeUntil: until.toISOString(), snoozedMonths: (sub.snoozedMonths ?? 0) + m }
}

/**
 * Cancel, unconditionally.
 *
 * The offer is "cancel whenever you want, and settle what we've already sent
 * you": the pay-for-what-shipped buy-out (`cancelSettlement`) is what stops the
 * flat monthly being used to bank three months of product for one month's pay,
 * so there is nothing left for a minimum term to protect and no reason to ever
 * refuse the request.
 *
 * This used to be gated on `canCancel(sub)`, which read the minimum term against
 * `monthsActive` — a field that never advanced. For anyone who actually checked
 * out (`monthsActive: 0`) the guard was permanently closed and this function
 * silently returned the subscription unchanged: the member pressed Cancel and
 * nothing happened. Cancelling must never be able to fail quietly again.
 */
export function cancelSubscription(sub: MemberSubscription, reason?: string): MemberSubscription {
  if (sub.status === 'cancelled') return sub
  return {
    ...sub,
    status: 'cancelled',
    cancelReason: reason ?? sub.cancelReason,
    // Stamped here so the retention window can be measured from the ending
    // rather than from the row's `updated_at`, which any later write — a
    // founder opening the exit queue, say — would push forward and quietly
    // extend how long the health answers are kept.
    cancelledAt: new Date().toISOString(),
  }
}

/** Swap a line's product (within its swap group) and re-price it + the flat monthly. */
export function swapSubscriptionLine(
  sub: MemberSubscription,
  lineId: string,
  newProduct: CatalogueProduct,
  config = getPricingConfig(),
): MemberSubscription {
  const rate = subRateOf(sub, config)
  const lines = sub.lines.map((line) => {
    if (line.id !== lineId) return line
    const variant = newProduct.variants.find((v) => v.available) ?? newProduct.variants[0]
    const unitPrice = variant?.price ?? newProduct.basePrice
    const cost = unitCostOf(newProduct, unitPrice, config)
    const discountedUnit = discountWithFloor(unitPrice, rate, cost, config)
    return {
      ...line,
      productId: newProduct.id,
      productTitle: newProduct.title,
      variantTitle: variant ? variantLabel(variant) : '',
      sku: variant?.sku ?? null,
      variantId: variant?.id ?? null,
      pricePerDelivery: round(line.quantity * discountedUnit),
      swapGroup: newProduct.swapGroup,
      // How long the new one lasts, for the words; its schedule stays the line's.
      lastsMonths: sizeConsumption(newProduct, answersFor(sub.routine), config, line.usageLevel ?? 'standard').monthsOneUnitLasts,
    }
  })
  return { ...sub, lines, flatMonthly: flatMonthlyOf(lines) }
}

/**
 * What a swap does to the customer's money. The monthly recurring amount always
 * updates; if the change is applied to the imminent (already-funded) box there's
 * a one-off top-up/credit for that delivery too.
 */
export interface SwapImpact {
  currentMonthly: number
  newMonthly: number
  monthlyDelta: number
  /** One-off charge (+) or credit (−) to apply the change to the next box now. */
  oneOffNow: number
  effectiveFrom: string // ISO date of the next dispatch
}

export function computeSwapImpact(
  sub: MemberSubscription,
  lineId: string,
  newProduct: CatalogueProduct,
  config = getPricingConfig(),
): SwapImpact {
  const oldLine = sub.lines.find((l) => l.id === lineId)
  const newSub = swapSubscriptionLine(sub, lineId, newProduct, config)
  const newLine = newSub.lines.find((l) => l.id === lineId)
  const oneOffNow = oldLine && newLine ? round(newLine.pricePerDelivery - oldLine.pricePerDelivery) : 0
  return {
    currentMonthly: sub.flatMonthly,
    newMonthly: newSub.flatMonthly,
    monthlyDelta: round(newSub.flatMonthly - sub.flatMonthly),
    oneOffNow,
    effectiveFrom: nextDispatchDate(sub.dispatchDayOfMonth).toISOString(),
  }
}

/** Products that can replace a line — same stack slot, excluding subscription-only refills. */
export function swappableForLine(
  line: MemberSubscriptionLine,
  catalogue: CatalogueProduct[],
): CatalogueProduct[] {
  return catalogue.filter(
    (p) => p.stackSlots.includes(line.stackSlot) && p.id !== line.productId && !p.isSubscriptionOnly && p.subscriptionEligible,
  )
}

// ─── Flexibility: add / remove / cadence / skip / one-off ─────────────────────
// Pure mutations + impact previews. Every one keeps the money invariants in
// docs/SUBSCRIPTIONS.md: margin floor (discountWithFloor), pay-for-what-shipped
// settlement on removal, intro discount never re-applied, one-offs at full price.

/** A unit's discounted subscription price for `product` (margin-floored, at the member's bundle rate). */
export function discountedUnitFor(product: CatalogueProduct, config = getPricingConfig(), rate = config.subscriptionDiscount): { unitPrice: number; discountedUnit: number } {
  const variant = product.variants.find((v) => v.available) ?? product.variants[0]
  const unitPrice = variant?.price ?? product.basePrice
  const cost = unitCostOf(product, unitPrice, config)
  return { unitPrice, discountedUnit: discountWithFloor(unitPrice, rate, cost, config) }
}

/** Amortised monthly value of a single line (pricePerDelivery spread over its cadence). */
export function lineMonthly(line: MemberSubscriptionLine): number {
  return round(line.pricePerDelivery / Math.max(1, line.deliveryIntervalMonths))
}

/** The plain economics of a line, for the billing explainer: list → discount → spread. */
export interface LineEconomics {
  /** Undiscounted unit price (RRP-ish), if the product is known. */
  listUnit: number
  /** Discounted unit price actually charged (subscribe & save). */
  discountedUnit: number
  /** Discount applied, 0–100. */
  discountPct: number
  /** Units per delivery. */
  units: number
  /** Ship cadence in months. */
  shipEveryMonths: number
  /** Charged each delivery. */
  perDelivery: number
  /** Amortised monthly contribution. */
  perMonth: number
}

/** Economics for an existing line (pass the product to show the discount vs list price). */
export function lineEconomics(line: MemberSubscriptionLine, product?: CatalogueProduct): LineEconomics {
  const discountedUnit = round(line.pricePerDelivery / Math.max(1, line.quantity))
  const variant = product?.variants.find((v) => v.available) ?? product?.variants[0]
  const listUnit = variant?.price ?? product?.basePrice ?? discountedUnit
  return {
    listUnit: round(listUnit),
    discountedUnit,
    discountPct: listUnit > 0 ? Math.round((1 - discountedUnit / listUnit) * 100) : 0,
    units: line.quantity,
    shipEveryMonths: line.deliveryIntervalMonths,
    perDelivery: line.pricePerDelivery,
    perMonth: lineMonthly(line),
  }
}

/** Economics for a product about to be added (sized & priced like it would join the plan). */
export function projectedEconomics(
  product: CatalogueProduct,
  answers?: QuizAnswers | null,
  config = getPricingConfig(),
): LineEconomics {
  const sizing = sizeConsumption(product, answers, config)
  const variant = product.variants.find((v) => v.available) ?? product.variants[0]
  const listUnit = variant?.price ?? product.basePrice
  const { discountedUnit } = discountedUnitFor(product, config)
  return {
    listUnit: round(listUnit),
    discountedUnit: round(discountedUnit),
    discountPct: listUnit > 0 ? Math.round((1 - discountedUnit / listUnit) * 100) : 0,
    units: sizing.unitsPerShipment,
    shipEveryMonths: sizing.shipEveryMonths,
    perDelivery: round(sizing.unitsPerShipment * discountedUnit),
    perMonth: round((sizing.unitsPerShipment / sizing.shipEveryMonths) * discountedUnit),
  }
}

/** Retail value of everything this line has already shipped. */
export function shippedValueToDate(line: MemberSubscriptionLine): number {
  return round(line.deliveriesMade * line.pricePerDelivery)
}

/** What the member has paid towards this line so far (flat amortised monthly × months active). */
export function paidToDate(line: MemberSubscriptionLine, sub: MemberSubscription): number {
  return round(sub.monthsActive * lineMonthly(line))
}

/**
 * Pay-for-what-shipped settlement: the value of goods already dispatched that the
 * member hasn't yet covered through their flat monthly. 0 before anything ships,
 * 0 once they've paid it off. This is what makes removal exploit-proof.
 */
export function lineSettlement(line: MemberSubscriptionLine, sub: MemberSubscription): number {
  return round(Math.max(0, shippedValueToDate(line) - paidToDate(line, sub)))
}

// ─── Cancel buy-out (whole subscription) ─────────────────────────────────────
// The offer is "cancel whenever you want, and settle what we've already sent".
// These three functions are what makes that honest in both directions.

/** Total retail value of everything the subscription has shipped so far. */
export function shippedValueOf(sub: MemberSubscription): number {
  return round(sub.lines.reduce((s, l) => s + shippedValueToDate(l), 0))
}

/**
 * What the member has actually paid so far: the discounted first month, plus the
 * flat rate for every cycle since.
 *
 * `firstMonth` is the amount genuinely billed at signup (after whatever intro
 * discount they revealed), so it is preferred over re-deriving it — the stored
 * figure is what their card was charged. `introDiscountRate` is the fallback for
 * subscriptions written before `firstMonth` was recorded.
 */
export function paidToDateOf(sub: MemberSubscription): number {
  const firstMonth = sub.firstMonth ?? sub.flatMonthly * (1 - (sub.introDiscountRate ?? 0))
  return round(firstMonth + Math.max(0, sub.monthsActive) * sub.flatMonthly)
}

/**
 * What the settlement is measured against — what the plan COSTS over the months
 * lived, at the full flat monthly, ignoring any intro discount.
 *
 * Distinct from `paidToDateOf`, which is the truthful "what your card was
 * charged" figure and belongs on the member's statement. This is the basis for
 * the shortfall, and the difference between the two is exactly the intro
 * discount we are choosing not to reclaim (`settlement.reclaimIntroDiscount`).
 *
 * Keeping them separate is what lets the exit statement show the discount as a
 * line the member KEEPS — "intro offer, not reclaimed: −£27.47" — rather than
 * silently folding it into a smaller number nobody can account for.
 */
export function settlementBasisOf(sub: MemberSubscription, config = getPricingConfig()): number {
  if (config.settlement.reclaimIntroDiscount) return paidToDateOf(sub)
  return round(sub.flatMonthly * (1 + Math.max(0, sub.monthsActive)))
}

/**
 * The intro discount this member keeps — the gap between what the plan costs and
 * what their card was actually charged.
 *
 * Exactly the difference between the two figures above, named so the LEDGER can
 * honour the same policy the forecast does. `exitStatement` measures shipped
 * goods against what was charged, so without this the discount fell straight
 * into the balance and was billed back at the exit — reclaiming, by arithmetic,
 * the thing `settlement.reclaimIntroDiscount: false` says we never reclaim.
 *
 * Zero when the policy is set to reclaim, because `settlementBasisOf` returns
 * `paidToDateOf` in that case and the two figures coincide.
 */
export function introDiscountKeptOf(sub: MemberSubscription, config = getPricingConfig()): number {
  return round(Math.max(0, settlementBasisOf(sub, config) - paidToDateOf(sub)))
}

/**
 * The cancel BUY-OUT: the outstanding balance on goods already delivered.
 *
 * The flat monthly SPREADS the cost of items that last several months, so a
 * member who cancels early has received more product than they have paid for —
 * three tubs in month one when only one is due in month two. This is that gap,
 * and nothing more.
 *
 * It is a debt for goods received, NOT a cancellation fee — that distinction is
 * the whole basis on which it is chargeable, so keep it in the maths and in the
 * copy (see docs/STRIPE_INTEGRATION_PLAN.md §1).
 *
 * Three policies shape the raw gap, all modelled in
 * `docs/EXIT_JOURNEY_PROPOSAL.md` §9:
 *
 *  1. It is measured against `settlementBasisOf`, so an intro discount is not
 *     clawed back at the exit.
 *  2. It is capped at `settlement.maxShareOfPaid` × what they actually paid, so
 *     it can never exceed everything they have given us.
 *  3. Anything at or below `settlement.minimum` is waived to zero — see
 *     `settlementIsClear`, and do not replace that with a `> 0` test.
 *
 * NOT a smoothly decaying balance, whatever the shape of the word "settlement"
 * suggests. It is a sawtooth: it falls as each dispatch amortises and jumps
 * again on the next one, for the life of the plan. `nextFreeExitMonth` is how a
 * member is told when the next £0 window is.
 */
export function cancelSettlement(sub: MemberSubscription, config = getPricingConfig()): number {
  const raw = Math.max(0, shippedValueOf(sub) - settlementBasisOf(sub, config))
  const cap = config.settlement.maxShareOfPaid
  const capped = cap == null ? raw : Math.min(raw, Math.max(0, paidToDateOf(sub) * cap))
  return settlementIsClear(capped, config) ? 0 : round(capped)
}

/**
 * Whether a balance counts as cleared.
 *
 * Use this instead of `=== 0` or `> 0.005`. The balance never reaches exactly
 * zero: `flatMonthly` is rounded to the penny and the goods it amortises are
 * not, so a plan billing £54.94 against £54.9433 of product leaves the member a
 * third of a penny short every month and the gap drifts up by about 1p per
 * cadence forever. A termination test against zero would never fire — which is
 * precisely how the "pay it off, then stop" exit would run for eternity.
 */
export function settlementIsClear(amount: number, config = getPricingConfig()): boolean {
  return amount <= config.settlement.minimum
}

/**
 * The next month at which leaving would cost nothing, from `from` onwards.
 *
 * The balance is a sawtooth with a £0 window once per cadence, so almost every
 * member is one or two months from a free exit. Telling them which month turns
 * a demand into a choice — and it is the honest thing to do, because we know.
 *
 * `null` when no free window exists inside `horizon`, which in practice means a
 * plan whose cadences never line up rather than one that can never clear.
 */
export function nextFreeExitMonth(
  sub: MemberSubscription,
  from = sub.monthsActive,
  horizon = 12,
  config = getPricingConfig(),
): number | null {
  for (let m = Math.max(0, from); m <= from + horizon; m++) {
    const at = syncDeliveryCounts({ ...sub, monthsActive: m })
    if (cancelSettlement(at, config) <= 0) return m
  }
  return null
}

/** Add a product as a new subscription line (sized & priced at the sub rate, no intro). */
export function addLine(
  sub: MemberSubscription,
  product: CatalogueProduct,
  catalogue: CatalogueProduct[],
  answers?: QuizAnswers | null,
  config = getPricingConfig(),
): MemberSubscription {
  const subProduct = getSubscriptionProduct(product, catalogue)
  if (!subProduct.subscriptionEligible) return sub
  // De-dupe: never add a product that's already in the stack.
  if (sub.lines.some((l) => l.productId === subProduct.id)) return sub

  // Sized to the plan's routine (how often they train, their weight), as the
  // rest of the plan is; it used to assume three training days a week for anyone.
  const sizing = sizeConsumption(subProduct, answers ?? answersFor(sub.routine), config)
  const variant = subProduct.variants.find((v) => v.available) ?? subProduct.variants[0]
  const { discountedUnit } = discountedUnitFor(subProduct, config, subRateOf(sub, config))

  const newLine: MemberSubscriptionLine = {
    id: `line-add-${Date.now()}-${subProduct.id}`,
    productId: subProduct.id,
    productTitle: subProduct.title,
    variantTitle: variant ? variantLabel(variant) : '',
    sku: variant?.sku ?? null,
    variantId: variant?.id ?? null,
    slotTitle: SLOT_LABELS[subProduct.stackSlots[0]] ?? subProduct.category,
    stackSlot: subProduct.stackSlots[0],
    quantity: sizing.unitsPerShipment,
    deliveryIntervalMonths: sizing.shipEveryMonths,
    usageLevel: sizing.usageLevel,
    pricePerDelivery: round(sizing.unitsPerShipment * discountedUnit),
    swapGroup: subProduct.swapGroup,
    addedAt: new Date().toISOString(),
    deliveriesMade: 0, // hasn't shipped yet
    // Its first box is the next one still to come. It used to be the current
    // cycle, whose box had already gone: the clock counted a delivery that never
    // happened, and a quarterly product first came three months later.
    joinedAtMonth: nextBoxCycle(sub),
    lastsMonths: sizing.monthsOneUnitLasts,
    rhythm: 'routine',
  }
  const lines = [...sub.lines, newLine]
  return { ...sub, lines, flatMonthly: flatMonthlyOf(lines) }
}

/** Remove a line, returning the new subscription and the pay-for-what-shipped settlement. */
export function removeLine(sub: MemberSubscription, lineId: string): { sub: MemberSubscription; settlement: number } {
  const line = sub.lines.find((l) => l.id === lineId)
  if (!line) return { sub, settlement: 0 }
  const settlement = lineSettlement(line, sub)
  const lines = sub.lines.filter((l) => l.id !== lineId)
  return { sub: { ...sub, lines, flatMonthly: flatMonthlyOf(lines) }, settlement }
}

/**
 * Change how often a line ships (clamped 1–maxDeliveryMonths), counted from its
 * last delivery (`withInterval`). Re-derives the flat monthly.
 */
export function setLineCadence(
  sub: MemberSubscription,
  lineId: string,
  months: number,
  config = getPricingConfig(),
  now: Date = new Date(),
): MemberSubscription {
  const clamped = Math.min(config.maxDeliveryMonths, roundInterval(months))
  const next = nextBoxCycle(sub, now)
  const lines = sub.lines.map((l) => (l.id === lineId ? withInterval(l, clamped, next) : l))
  return { ...sub, lines, flatMonthly: flatMonthlyOf(lines) }
}

/**
 * How often and how many, in one change: the hub's product sheet. Keeps the
 * line's own unit price (a grandfathered price stays), counts the new cadence
 * from the last delivery, and re-derives the flat monthly.
 */
export function setLineSchedule(
  sub: MemberSubscription,
  lineId: string,
  change: { every: number; quantity: number },
  config = getPricingConfig(),
  now: Date = new Date(),
): MemberSubscription {
  return setLineCadence(setLineQuantity(sub, lineId, change.quantity), lineId, change.every, config, now)
}

/** The product sheet's whole choice for one product. */
export interface LineChoice {
  /** How much they take each time (half, one or two servings). */
  usageLevel: UsageLevel
  /** How many come each time. */
  quantity: number
  /** How often, in months (a fraction for a rhythm such as every 2½ months). */
  every: number
  /** True when it's the routine's own rhythm (and so moves with the routine); false for one they chose. */
  follows: boolean
  /** How long one lasts at that usage, for the words. */
  lastsMonths?: number
}

export function setLineChoice(
  sub: MemberSubscription,
  lineId: string,
  choice: LineChoice,
  config = getPricingConfig(),
  now: Date = new Date(),
): MemberSubscription {
  const scheduled = setLineSchedule(sub, lineId, { every: choice.every, quantity: choice.quantity }, config, now)
  const lines = scheduled.lines.map((l) =>
    l.id === lineId
      ? { ...l, usageLevel: choice.usageLevel, rhythm: (choice.follows ? 'routine' : 'chosen') as 'routine' | 'chosen', lastsMonths: choice.lastsMonths ?? l.lastsMonths }
      : l,
  )
  return { ...scheduled, lines }
}

/** Cadence options a line can move to, given the config bounds. */
export function cadenceOptions(config = getPricingConfig()): number[] {
  return Array.from({ length: config.maxDeliveryMonths }, (_, i) => i + 1)
}

/**
 * Change how many units of a line ship each delivery ("I need an extra one every
 * time"). Keeps the same discounted unit price, re-prices the delivery and the
 * flat monthly. Clamped to 1–6.
 */
/** Units per delivery a member may set on one line. */
export const MAX_LINE_UNITS = 6

export function setLineQuantity(sub: MemberSubscription, lineId: string, quantity: number): MemberSubscription {
  const q = Math.min(MAX_LINE_UNITS, Math.max(1, Math.round(quantity)))
  const lines = sub.lines.map((l) => {
    if (l.id !== lineId) return l
    const unit = l.pricePerDelivery / Math.max(1, l.quantity)
    return { ...l, quantity: q, pricePerDelivery: round(q * unit) }
  })
  return { ...sub, lines, flatMonthly: flatMonthlyOf(lines) }
}

export function computeQuantityImpact(sub: MemberSubscription, lineId: string, quantity: number): PlanChangeImpact {
  const next = setLineQuantity(sub, lineId, quantity)
  return { ...blankImpact(sub), newMonthly: next.flatMonthly, monthlyDelta: round(next.flatMonthly - sub.flatMonthly) }
}

/**
 * Set whether a line may be substituted with a same-category product if it goes
 * out of stock at the supplier. Pure — pricing is unaffected (a substitute is
 * always same category / price band).
 */
export function setLineSubstitution(sub: MemberSubscription, lineId: string, allow: boolean): MemberSubscription {
  const lines = sub.lines.map((l) => (l.id === lineId ? { ...l, allowSubstitution: allow } : l))
  return { ...sub, lines }
}

/**
 * Set a line's usage level (the hub's "how much do you get through" slider). We
 * re-derive the units-per-delivery and ship cadence from `sizeConsumption` — the
 * member never touches quantity or cadence directly; the slider does the maths.
 * Re-prices the line at the member's bundle rate and re-derives the flat monthly.
 */
export function setLineUsage(
  sub: MemberSubscription,
  lineId: string,
  product: CatalogueProduct,
  usageLevel: UsageLevel,
  answers?: QuizAnswers | null,
  config = getPricingConfig(),
): MemberSubscription {
  const sizing = sizeConsumption(product, answers ?? answersFor(sub.routine), config, usageLevel)
  const { discountedUnit } = discountedUnitFor(product, config, subRateOf(sub, config))
  const lines = sub.lines.map((l) =>
    l.id === lineId
      ? {
          ...l,
          usageLevel,
          quantity: sizing.unitsPerShipment,
          deliveryIntervalMonths: sizing.shipEveryMonths,
          lastsMonths: sizing.monthsOneUnitLasts,
          pricePerDelivery: round(sizing.unitsPerShipment * discountedUnit),
        }
      : l,
  )
  return { ...sub, lines, flatMonthly: flatMonthlyOf(lines) }
}

export function computeUsageImpact(
  sub: MemberSubscription,
  lineId: string,
  product: CatalogueProduct,
  usageLevel: UsageLevel,
  answers?: QuizAnswers | null,
  config = getPricingConfig(),
): PlanChangeImpact {
  const next = setLineUsage(sub, lineId, product, usageLevel, answers, config)
  return { ...blankImpact(sub), newMonthly: next.flatMonthly, monthlyDelta: round(next.flatMonthly - sub.flatMonthly) }
}

// ─── Save flow: downsize to essentials ────────────────────────────────────────

export interface DownsizePreview {
  currentMonthly: number
  newMonthly: number
  /** Lines kept (the essentials you won't feel day-to-day). */
  keptLineIds: string[]
  /** Felt "nice-to-have" lines proposed for removal, with their monthly cost. */
  droppedLines: { id: string; productTitle: string; perMonth: number }[]
}

/**
 * A "trim to essentials" proposal for the too-expensive save: drop the felt
 * (subjective) discretionary products, keep the objective essentials (protein,
 * creatine, vitamins). Always keeps at least one line. Margin floor is unaffected
 * — it only removes lines.
 */
export function downsizePreview(sub: MemberSubscription, catalogue: CatalogueProduct[]): DownsizePreview {
  const subjective = sub.lines.filter((l) => {
    const p = catalogue.find((p) => p.id === l.productId)
    return p ? basisForProduct(p) === 'subjective' : false
  })
  // Never drop everything.
  const dropped = subjective.length < sub.lines.length ? subjective : subjective.slice(1)
  const droppedIds = new Set(dropped.map((l) => l.id))
  const kept = sub.lines.filter((l) => !droppedIds.has(l.id))
  return {
    currentMonthly: sub.flatMonthly,
    newMonthly: flatMonthlyOf(kept),
    keptLineIds: kept.map((l) => l.id),
    droppedLines: dropped.map((l) => ({ id: l.id, productTitle: l.productTitle, perMonth: lineMonthly(l) })),
  }
}

/** Full-price one-off charge for sending `qty` more of a line now (plan unchanged). */
export function oneOffCharge(line: MemberSubscriptionLine, qty = 1): number {
  const perUnit = line.pricePerDelivery / Math.max(1, line.quantity)
  return round(Math.max(1, qty) * perUnit)
}

// ─── Next-box date controls ──────────────────────────────────────────────────

/** The effective next-box date: an explicit override, else the day-of-month rule. */
export function effectiveNextDispatch(sub: MemberSubscription, from: Date = new Date()): Date {
  if (sub.nextDispatchOverride) {
    const d = new Date(sub.nextDispatchOverride)
    if (!Number.isNaN(d.getTime())) return d
  }
  return nextDispatchDate(sub.dispatchDayOfMonth, from)
}

/** Set an explicit next-box date (not before today). */
export function setNextDispatchDate(sub: MemberSubscription, date: Date): MemberSubscription {
  const today = new Date()
  const d = date < today ? today : date
  return { ...sub, nextDispatchOverride: d.toISOString() }
}

/** Ship the next box today. */
export function sendNow(sub: MemberSubscription): MemberSubscription {
  return setNextDispatchDate(sub, new Date())
}

/** Bring the next box forward by `days` (never before today). */
export function bringForward(sub: MemberSubscription, days: number): MemberSubscription {
  const d = effectiveNextDispatch(sub)
  d.setDate(d.getDate() - Math.abs(days))
  return setNextDispatchDate(sub, d)
}

/** Push the next box back by `days`. */
export function delayDispatch(sub: MemberSubscription, days: number): MemberSubscription {
  const d = effectiveNextDispatch(sub)
  d.setDate(d.getDate() + Math.abs(days))
  return setNextDispatchDate(sub, d)
}

// ─── Impact previews (shown before confirming) ───────────────────────────────

/** Unified money impact of a plan change. Fields are 0 when not applicable. */
export interface PlanChangeImpact {
  currentMonthly: number
  newMonthly: number
  monthlyDelta: number
  /** One-off charge (+) due now (e.g. expedite). */
  oneOffNow: number
  /** Settlement charge (+) for goods already shipped (removal). */
  settlement: number
  /** Credit (stored positive) banked to the next payment (e.g. skip). */
  credit: number
  effectiveFrom: string
  /** The plan saving before and after, when the change moves it (`plan-rate`). */
  rate?: { from: number; to: number } | null
}

function blankImpact(sub: MemberSubscription): PlanChangeImpact {
  return {
    currentMonthly: sub.flatMonthly,
    newMonthly: sub.flatMonthly,
    monthlyDelta: 0,
    oneOffNow: 0,
    settlement: 0,
    credit: 0,
    effectiveFrom: effectiveNextDispatch(sub).toISOString(),
  }
}

export function computeAddImpact(
  sub: MemberSubscription,
  product: CatalogueProduct,
  catalogue: CatalogueProduct[],
  answers?: QuizAnswers | null,
  config = getPricingConfig(),
): PlanChangeImpact {
  const added = addLine(sub, product, catalogue, answers, config)
  // The plan saving follows the plan's size, as the server will save it.
  const next = withPlanRate(sub, added, catalogue, config)
  return { ...blankImpact(sub), newMonthly: next.flatMonthly, monthlyDelta: round(next.flatMonthly - sub.flatMonthly), rate: planRateChange(sub, added, catalogue, config) }
}

export function computeRemoveImpact(sub: MemberSubscription, lineId: string, catalogue: CatalogueProduct[] = []): PlanChangeImpact {
  const { sub: removed, settlement } = removeLine(sub, lineId)
  // With the catalogue, the plan saving follows the smaller plan, as the server will save it.
  const next = catalogue.length ? withPlanRate(sub, removed, catalogue) : removed
  return {
    ...blankImpact(sub),
    newMonthly: next.flatMonthly,
    monthlyDelta: round(next.flatMonthly - sub.flatMonthly),
    settlement,
    rate: catalogue.length ? planRateChange(sub, removed, catalogue) : null,
  }
}

export function computeCadenceImpact(
  sub: MemberSubscription,
  lineId: string,
  months: number,
  config = getPricingConfig(),
): PlanChangeImpact {
  const next = setLineCadence(sub, lineId, months, config)
  return { ...blankImpact(sub), newMonthly: next.flatMonthly, monthlyDelta: round(next.flatMonthly - sub.flatMonthly) }
}

export function computeOneOffImpact(sub: MemberSubscription, lineId: string, qty = 1): PlanChangeImpact {
  const line = sub.lines.find((l) => l.id === lineId)
  return { ...blankImpact(sub), oneOffNow: line ? oneOffCharge(line, qty) : 0, effectiveFrom: new Date().toISOString() }
}
