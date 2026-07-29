/**
 * Applying a resolution to a member's subscription — the money.
 *
 * Pure: takes a subscription and a resolution, returns the next subscription
 * plus the `BillingChange` that records what moved and when it starts. No I/O,
 * no Stripe, no email; the service layer (P4/P7) does those around this.
 *
 * Four rules are enforced here rather than left to callers, because each one is
 * a promise made to the member at checkout:
 *
 * 1. **A substitution never raises the bill.** If the only safe replacement
 *    costs more, the line is capped at what they already pay and we absorb the
 *    difference. They chose "keep my plan whole", not "keep my plan whole at
 *    any price", and a swap they didn't ask for must never cost them more.
 *
 * 2. **We never charge a settlement on a removal we caused.** The
 *    pay-for-what-shipped settlement in `recharge/mock.ts` exists to stop
 *    someone loading up on a 3-month tub and cancelling — it's aimed at a member
 *    gaming the smoothed monthly. When the SUPPLIER discontinues something,
 *    that reasoning doesn't apply, so the settlement is waived and any
 *    overpayment goes back the other way as a credit.
 *
 * 3. **Reductions start next cycle, never retroactively**, and increases can't
 *    start until the notice period has run.
 *
 * 4. **Nothing goes below the margin floor.** A capped substitution that would
 *    sell at a loss is rejected outright so the caller falls back to removal.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { BillingChange, MemberSubscription } from '@/lib/recharge/types'
import {
  effectiveNextDispatch,
  flatMonthlyOf,
  lineMonthly,
  paidToDate,
  removeLine,
  shippedValueToDate,
  skipNextDelivery,
  subRateOf,
  swapSubscriptionLine,
} from '@/lib/recharge/mock'
import {
  discountWithFloor,
  getPricingConfig,
  unitCostOf,
  type PricingConfig,
} from '@/lib/stack-blueprint/pricing'
import type { ChangeEvent, ChangeKind, ChangeResolution } from './types'

const round = (n: number) => Math.round(n * 100) / 100

/**
 * The lowest unit price a product may be sold at: cost × (1 + margin floor),
 * capped at list so a product whose cost already exceeds the floor is simply
 * sold at list rather than marked up. Same rule `discountWithFloor` enforces,
 * stated directly because here we need the floor itself, not a discounted price.
 */
function marginFloorUnit(product: CatalogueProduct, config: PricingConfig): number {
  const unitList = product.variants.find((v) => v.available)?.price ?? product.basePrice
  const cost = unitCostOf(product, unitList, config)
  return Math.min(unitList, cost * (1 + config.marginFloorPct))
}

/**
 * Value the member has paid towards a line but not yet received — the mirror of
 * `lineSettlement`, owed back when WE take the line away rather than them.
 */
export function lineOverpayment(
  line: Parameters<typeof shippedValueToDate>[0],
  sub: MemberSubscription,
): number {
  return round(Math.max(0, paidToDate(line, sub) - shippedValueToDate(line)))
}

export type ApplyRejection =
  /** The line is already gone (a duplicate apply, or a member edit got there first). */
  | 'line-not-found'
  /** The replacement product isn't in the catalogue. */
  | 'replacement-not-found'
  /** Capping the swap to the member's current price would sell below the margin floor. */
  | 'below-margin-floor'
  /** This resolution doesn't change the subscription (hold / dismiss / absorb). */
  | 'no-subscription-change'

export interface ApplyResult {
  subscription: MemberSubscription
  billingChange: BillingChange | null
  /** Set when nothing was applied, and why. `substitute` rejections mean "fall back to remove". */
  rejected?: ApplyRejection
  /** Amount absorbed to keep a pricier substitution from raising the bill (£/delivery). */
  absorbedPerDelivery?: number
}

export interface ApplyOptions {
  /** Catalogue, for looking up a substitution's replacement product. */
  catalogue?: CatalogueProduct[]
  /** The event that caused this, for the audit trail. */
  event?: Pick<ChangeEvent, 'id' | 'kind'>
  now?: Date
  config?: PricingConfig
  /** When notice was given to the member, for changes that require it. */
  noticeSentAt?: string
  /** Deterministic id for the `BillingChange` (tests / idempotent re-runs). */
  billingChangeId?: string
}

function billingChangeFor(
  sub: MemberSubscription,
  next: MemberSubscription,
  opts: ApplyOptions,
  fields: Partial<BillingChange> & { lineId: string | null; effectiveFrom: string },
): BillingChange {
  const now = opts.now ?? new Date()
  return {
    id: opts.billingChangeId ?? `bc_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    reason: (opts.event?.kind as ChangeKind) ?? 'member-edit',
    previousMonthly: sub.flatMonthly,
    newMonthly: next.flatMonthly,
    changeEventId: opts.event?.id,
    noticeSentAt: opts.noticeSentAt,
    createdAt: now.toISOString(),
    ...fields,
  }
}

function withBillingChange(sub: MemberSubscription, change: BillingChange): MemberSubscription {
  return { ...sub, billingHistory: [...(sub.billingHistory ?? []), change] }
}

/** The next billing cycle — reductions and swaps take effect here. */
function nextCycle(sub: MemberSubscription, now: Date): string {
  return effectiveNextDispatch(sub, now).toISOString()
}

/**
 * The earliest an INCREASE may bill: the later of the next cycle and the end of
 * the notice period. An increase that lands inside the notice window is the one
 * thing this domain must never produce.
 */
export function earliestIncreaseDate(
  sub: MemberSubscription,
  now: Date = new Date(),
  config: PricingConfig = getPricingConfig(),
): string {
  const noticeEnds = new Date(now)
  noticeEnds.setDate(noticeEnds.getDate() + Math.max(0, config.priceChangeNoticeDays))
  const cycle = effectiveNextDispatch(sub, now)
  return (cycle > noticeEnds ? cycle : noticeEnds).toISOString()
}

// ─── Substitute ───────────────────────────────────────────────────────────────

/**
 * Swap the line to `replacement`, capped so the member's monthly never rises.
 *
 * `swapSubscriptionLine` prices the new product at the member's own bundle rate.
 * If that lands above what they currently pay for the line, we hold the price at
 * the old figure and eat the difference — unless doing so breaks the margin
 * floor, in which case this isn't a viable swap at all and we say so.
 */
export function applySubstitution(
  sub: MemberSubscription,
  lineId: string,
  replacement: CatalogueProduct,
  opts: ApplyOptions = {},
): ApplyResult {
  const config = opts.config ?? getPricingConfig()
  const now = opts.now ?? new Date()
  const oldLine = sub.lines.find((l) => l.id === lineId)
  if (!oldLine) return { subscription: sub, billingChange: null, rejected: 'line-not-found' }

  const swapped = swapSubscriptionLine(sub, lineId, replacement, config)
  const newLine = swapped.lines.find((l) => l.id === lineId)!

  let absorbedPerDelivery = 0
  let lines = swapped.lines

  if (newLine.pricePerDelivery > oldLine.pricePerDelivery) {
    // Cap at what they already pay — but only if the floor allows it.
    const floorPerDelivery = round(newLine.quantity * marginFloorUnit(replacement, config))

    if (oldLine.pricePerDelivery < floorPerDelivery) {
      return { subscription: sub, billingChange: null, rejected: 'below-margin-floor' }
    }
    absorbedPerDelivery = round(newLine.pricePerDelivery - oldLine.pricePerDelivery)
    lines = swapped.lines.map((l) =>
      l.id === lineId ? { ...l, pricePerDelivery: oldLine.pricePerDelivery } : l,
    )
  }

  const next = { ...swapped, lines, flatMonthly: flatMonthlyOf(lines) }
  const change = billingChangeFor(sub, next, opts, {
    lineId,
    effectiveFrom: nextCycle(sub, now),
  })
  return {
    subscription: withBillingChange(next, change),
    billingChange: change,
    absorbedPerDelivery: absorbedPerDelivery || undefined,
  }
}

// ─── Remove ───────────────────────────────────────────────────────────────────

/**
 * Take a line off the plan because its product went away.
 *
 * Involuntary, so the pay-for-what-shipped settlement is waived and anything the
 * member has paid towards goods they'll now never get comes back as a credit
 * against their next payment.
 */
export function applyRemoval(
  sub: MemberSubscription,
  lineId: string,
  opts: ApplyOptions = {},
): ApplyResult {
  const now = opts.now ?? new Date()
  const line = sub.lines.find((l) => l.id === lineId)
  if (!line) return { subscription: sub, billingChange: null, rejected: 'line-not-found' }

  const credit = lineOverpayment(line, sub)
  const { sub: removed } = removeLine(sub, lineId)
  const change = billingChangeFor(sub, removed, opts, {
    lineId,
    oneOffCredit: credit || undefined,
    effectiveFrom: nextCycle(sub, now),
  })
  return { subscription: withBillingChange(removed, change), billingChange: change }
}

// ─── Price pass-on ────────────────────────────────────────────────────────────

/**
 * Re-price a line at a new unit price and schedule it for the next cycle that
 * clears the notice period.
 *
 * The new price still goes through `discountWithFloor` at the member's own
 * bundle rate, so their subscribe-&-save carries through a supplier increase
 * instead of quietly evaporating with it.
 */
export function applyPassOn(
  sub: MemberSubscription,
  lineId: string,
  newUnitListPrice: number,
  opts: ApplyOptions = {},
): ApplyResult {
  const config = opts.config ?? getPricingConfig()
  const now = opts.now ?? new Date()
  const line = sub.lines.find((l) => l.id === lineId)
  if (!line) return { subscription: sub, billingChange: null, rejected: 'line-not-found' }

  const product = opts.catalogue?.find((p) => p.id === line.productId)
  const cost = product
    ? unitCostOf(product, newUnitListPrice, config)
    : newUnitListPrice * config.defaultCostRatio
  const discountedUnit = discountWithFloor(newUnitListPrice, subRateOf(sub, config), cost, config)

  const lines = sub.lines.map((l) =>
    l.id === lineId ? { ...l, pricePerDelivery: round(l.quantity * discountedUnit) } : l,
  )
  const next = { ...sub, lines, flatMonthly: flatMonthlyOf(lines) }

  // Only an increase needs notice; a pass-down can land at the next cycle.
  const isIncrease = next.flatMonthly > sub.flatMonthly
  const change = billingChangeFor(sub, next, opts, {
    lineId,
    effectiveFrom: isIncrease ? earliestIncreaseDate(sub, now, config) : nextCycle(sub, now),
    noticeSentAt: opts.noticeSentAt ?? (isIncrease ? now.toISOString() : undefined),
  })
  return { subscription: withBillingChange(next, change), billingChange: change }
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Apply any resolution. `hold`, `absorb` and `dismiss` leave the subscription
 * untouched by design — they're recorded on the event, not the plan.
 */
export function applyResolution(
  sub: MemberSubscription,
  lineId: string,
  resolution: ChangeResolution,
  opts: ApplyOptions = {},
): ApplyResult {
  switch (resolution.type) {
    case 'substitute': {
      const replacement = opts.catalogue?.find((p) => p.id === resolution.replacementProductId)
      if (!replacement) {
        return { subscription: sub, billingChange: null, rejected: 'replacement-not-found' }
      }
      return applySubstitution(sub, lineId, replacement, opts)
    }
    case 'remove':
      return applyRemoval(sub, lineId, opts)
    case 'pass-on':
      return applyPassOn(sub, lineId, resolution.newUnitPrice, opts)
    case 'hold':
      return applyHold(sub, lineId)
    case 'absorb':
    case 'dismiss':
      return { subscription: sub, billingChange: null, rejected: 'no-subscription-change' }
  }
}

/**
 * Keep the line but skip its next box — the honest answer to a temporary outage
 * a founder expects to clear before the following delivery.
 *
 * The recurring price doesn't move, so there's no `BillingChange`: skipping
 * banks a credit against the next payment via the existing skip helper, which
 * is the same mechanism a member gets when they skip a box themselves. Nobody
 * pays for a box they didn't receive.
 */
export function applyHold(sub: MemberSubscription, lineId: string): ApplyResult {
  if (!sub.lines.some((l) => l.id === lineId)) {
    return { subscription: sub, billingChange: null, rejected: 'line-not-found' }
  }
  return { subscription: skipNextDelivery(sub, lineId), billingChange: null }
}

// ─── Guards the caller needs before deciding ─────────────────────────────────

/**
 * Whether removing this line would stop the plan being a viable subscription —
 * either it was the last line, or what's left falls under the minimum monthly.
 * Feeds `wouldBreakPlan` on the intended action.
 */
export function removalWouldBreakPlan(
  sub: MemberSubscription,
  lineId: string,
  config: PricingConfig = getPricingConfig(),
): boolean {
  const remaining = sub.lines.filter((l) => l.id !== lineId)
  if (remaining.length === 0) return true
  return flatMonthlyOf(remaining) < config.minSubscriptionMonthly
}

/** The monthly a line contributes — what the member stops paying if it goes. */
export { lineMonthly }
