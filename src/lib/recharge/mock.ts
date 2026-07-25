/**
 * Mock subscription service — stands in for Recharge until it's connected.
 *
 * `createMockSubscription` builds a realistic subscription from the quiz engine.
 * The mutation helpers (swap / dispatch date / pause / cancel) are PURE — they
 * take a subscription and return a new one. When Recharge is wired in, the hub
 * store calls Recharge's API here instead; the shapes are deliberately aligned.
 */

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
import type { MemberSubscription, MemberSubscriptionLine } from './types'

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
    /** Per-product substitution consent captured at checkout. Missing = allowed. */
    substitutionByProductId?: Record<string, boolean>
  } = {},
): MemberSubscription {
  const slotTitleById = Object.fromEntries(blueprint.slots.map((s) => [s.slotId, s.title]))
  const plan = buildSubscriptionPlan(blueprint, catalogue, answers, getPricingConfig(), opts)
  const pricing = calculatePricing(blueprint, catalogue, answers, getPricingConfig(), opts)

  const monthsActive = opts.monthsActive ?? 0
  const startedAt = new Date()
  startedAt.setMonth(startedAt.getMonth() - monthsActive)

  const lines: MemberSubscriptionLine[] = plan.map((l, i) => {
    const variant = l.product.variants.find((v) => v.id === l.variantId) ?? l.product.variants.find((v) => v.available) ?? l.product.variants[0]
    return {
      id: `line-${i}-${l.product.id}`,
      productId: l.product.id,
      productTitle: l.product.title,
      variantTitle: variant ? variantLabel(variant) : '',
      slotTitle: slotTitleById[l.coversSlotIds[0]] ?? l.product.category,
      stackSlot: l.product.stackSlots[0],
      quantity: l.unitsPerShipment,
      deliveryIntervalMonths: l.shipEveryMonths,
      usageLevel: l.usageLevel,
      pricePerDelivery: l.pricePerDelivery,
      swapGroup: l.product.swapGroup,
      addedAt: startedAt.toISOString(),
      deliveriesMade: deliveriesInMonths(monthsActive, l.shipEveryMonths),
      // Default to allowing a same-category substitution if the product goes out
      // of stock; the member can opt any line out at checkout or in the hub.
      allowSubstitution: opts.substitutionByProductId?.[l.product.id] ?? true,
    }
  })

  return {
    id: opts.id ?? 'mock-sub-1',
    status: 'active',
    customerEmail: email,
    flatMonthly: pricing.subscriptionTotal,
    subscriptionDiscountRate: pricing.subscriptionDiscountPct / 100,
    dispatchDayOfMonth: opts.dispatchDayOfMonth ?? 15,
    minMonths: pricing.subscriptionMinMonths,
    firstMonthDiscountRate: pricing.subscriptionIntroDiscountPct / 100,
    monthsActive,
    startedAt: startedAt.toISOString(),
    paymentMethod: { brand: 'Visa', last4: '4242' },
    lines,
  }
}

/** Build a representative *demo* subscription (2 months in) from the mock blueprint. */
export function createMockSubscription(
  catalogue: CatalogueProduct[],
  email: string,
  answers?: QuizAnswers | null,
): MemberSubscription {
  return buildMemberSubscription(MOCK_BLUEPRINT, catalogue, email, answers, { monthsActive: 2 })
}

/** Deliveries shipped after `months` for a line shipping every `everyMonths` (first at signup). */
export function deliveriesInMonths(months: number, everyMonths: number): number {
  return Math.floor(Math.max(0, months) / Math.max(1, everyMonths)) + 1
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/** The next calendar date that lands on `dayOfMonth` (capped at 28). */
export function nextDispatchDate(dayOfMonth: number, from: Date = new Date()): Date {
  const day = Math.min(Math.max(dayOfMonth, 1), 28)
  const target = new Date(from.getFullYear(), from.getMonth(), day)
  if (target <= from) target.setMonth(target.getMonth() + 1)
  return target
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
  // Pausing during the minimum term would side-step the commitment — block it.
  return sub.status === 'active' && canCancel(sub) ? { ...sub, status: 'paused' } : sub
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

export function cancelSubscription(sub: MemberSubscription, reason?: string): MemberSubscription {
  // Honour the minimum term — Recharge enforces this server-side too.
  return canCancel(sub) ? { ...sub, status: 'cancelled', cancelReason: reason ?? sub.cancelReason } : sub
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
      pricePerDelivery: round(line.quantity * discountedUnit),
      swapGroup: newProduct.swapGroup,
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
function discountedUnitFor(product: CatalogueProduct, config = getPricingConfig(), rate = config.subscriptionDiscount): { unitPrice: number; discountedUnit: number } {
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

/** Total retail value of everything the subscription has shipped so far. */
export function shippedValueOf(sub: MemberSubscription): number {
  return round(sub.lines.reduce((s, l) => s + shippedValueToDate(l), 0))
}

/**
 * What the member has actually paid so far: the discounted first month, plus the
 * flat rate for each further active month. The flat monthly SPREADS the cost of
 * multi-month items, so a fresh subscription has shipped more value than it's
 * billed — that gap is the settlement below.
 */
export function paidToDateOf(sub: MemberSubscription): number {
  const firstMonth = sub.flatMonthly * (1 - (sub.firstMonthDiscountRate ?? 0))
  return round(firstMonth + Math.max(0, sub.monthsActive) * sub.flatMonthly)
}

/**
 * The cancel BUY-OUT: because the flat monthly spreads the cost of items that
 * last several months, someone who cancels early has received more product than
 * they've paid for (e.g. 3 tubs in month one, only one due in month two). This
 * is the value of goods already dispatched minus everything actually paid — so
 * "cancel anytime" stays honest AND margin-safe: you settle for what we've sent,
 * nothing more. 0 once they've paid off what shipped.
 */
export function cancelSettlement(sub: MemberSubscription): number {
  return round(Math.max(0, shippedValueOf(sub) - paidToDateOf(sub)))
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

  const sizing = sizeConsumption(subProduct, answers, config)
  const variant = subProduct.variants.find((v) => v.available) ?? subProduct.variants[0]
  const { discountedUnit } = discountedUnitFor(subProduct, config, subRateOf(sub, config))

  const newLine: MemberSubscriptionLine = {
    id: `line-add-${Date.now()}-${subProduct.id}`,
    productId: subProduct.id,
    productTitle: subProduct.title,
    variantTitle: variant ? variantLabel(variant) : '',
    slotTitle: SLOT_LABELS[subProduct.stackSlots[0]] ?? subProduct.category,
    stackSlot: subProduct.stackSlots[0],
    quantity: sizing.unitsPerShipment,
    deliveryIntervalMonths: sizing.shipEveryMonths,
    usageLevel: sizing.usageLevel,
    pricePerDelivery: round(sizing.unitsPerShipment * discountedUnit),
    swapGroup: subProduct.swapGroup,
    addedAt: new Date().toISOString(),
    deliveriesMade: 0, // hasn't shipped yet
    nextShipAt: nextDispatchDate(sub.dispatchDayOfMonth).toISOString(),
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

/** Change how often a line ships (clamped 1–maxDeliveryMonths). Re-derives the flat monthly. */
export function setLineCadence(
  sub: MemberSubscription,
  lineId: string,
  months: number,
  config = getPricingConfig(),
): MemberSubscription {
  const clamped = Math.min(config.maxDeliveryMonths, Math.max(1, Math.round(months)))
  const lines = sub.lines.map((l) => (l.id === lineId ? { ...l, deliveryIntervalMonths: clamped } : l))
  return { ...sub, lines, flatMonthly: flatMonthlyOf(lines) }
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
export function setLineQuantity(sub: MemberSubscription, lineId: string, quantity: number): MemberSubscription {
  const q = Math.min(6, Math.max(1, Math.round(quantity)))
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
  const sizing = sizeConsumption(product, answers, config, usageLevel)
  const { discountedUnit } = discountedUnitFor(product, config, subRateOf(sub, config))
  const lines = sub.lines.map((l) =>
    l.id === lineId
      ? {
          ...l,
          usageLevel,
          quantity: sizing.unitsPerShipment,
          deliveryIntervalMonths: sizing.shipEveryMonths,
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

/**
 * Skip a line's next delivery: push its next ship date out by one cadence and
 * bank a credit equal to that delivery's value against the next payment, so the
 * member never pays for a box they didn't receive.
 */
export function skipNextDelivery(sub: MemberSubscription, lineId: string): MemberSubscription {
  const lines = sub.lines.map((l) => {
    if (l.id !== lineId) return l
    const from = l.nextShipAt ? new Date(l.nextShipAt) : nextDispatchDate(sub.dispatchDayOfMonth)
    const next = new Date(from)
    next.setMonth(next.getMonth() + Math.max(1, l.deliveryIntervalMonths))
    return { ...l, nextShipAt: next.toISOString(), pendingCredit: round((l.pendingCredit ?? 0) + l.pricePerDelivery) }
  })
  return { ...sub, lines }
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
  const next = addLine(sub, product, catalogue, answers, config)
  return { ...blankImpact(sub), newMonthly: next.flatMonthly, monthlyDelta: round(next.flatMonthly - sub.flatMonthly) }
}

export function computeRemoveImpact(sub: MemberSubscription, lineId: string): PlanChangeImpact {
  const { sub: next, settlement } = removeLine(sub, lineId)
  return { ...blankImpact(sub), newMonthly: next.flatMonthly, monthlyDelta: round(next.flatMonthly - sub.flatMonthly), settlement }
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

export function computeSkipImpact(sub: MemberSubscription, lineId: string): PlanChangeImpact {
  const line = sub.lines.find((l) => l.id === lineId)
  const next = skipNextDelivery(sub, lineId)
  const nextLine = next.lines.find((l) => l.id === lineId)
  return {
    ...blankImpact(sub),
    credit: line ? round((nextLine?.pendingCredit ?? 0) - (line.pendingCredit ?? 0)) : 0,
    effectiveFrom: nextLine?.nextShipAt ?? blankImpact(sub).effectiveFrom,
  }
}
