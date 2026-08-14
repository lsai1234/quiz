/**
 * Delivery schedule — projects the flat-monthly subscription into discrete,
 * dated deliveries (the HelloFresh-style calendar) and supports per-box edits.
 *
 * Billing stays flat monthly: this only governs WHAT ships WHEN. Skipping a box
 * banks a credit; adding to a box is a full-price one-off. So none of these
 * edits change the recurring price — they're shipping, not billing.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { SLOT_LABELS } from '@/lib/catalogue/types'
import type { MemberSubscription, MemberSubscriptionLine, DeliveryOverride } from './types'
import { effectiveNextDispatch } from './mock'
import { getPricingConfig, discountWithFloor, unitCostOf } from '@/lib/stack-blueprint/pricing'
import { shipsAtCycle } from './clock'

const round = (n: number) => Math.round(n * 100) / 100

export interface DeliveryItem {
  /** Recurring line id, or null for a one-off product added to this box only. */
  lineId: string | null
  productId: string
  productTitle: string
  slotTitle: string
  units: number
  price: number
  /** True for a one-off addition (charged in full, not part of the recurring plan). */
  oneOff?: boolean
}

export interface Delivery {
  /** Stable id for this delivery slot — `YYYY-MM`. */
  id: string
  date: string // ISO
  items: DeliveryItem[]
  /** Value of everything in the box (recurring + one-offs). */
  total: number
  /** Of which, charged as one-offs now. */
  oneOffTotal: number
  status: 'scheduled' | 'skipped' | 'shipped'
  /** The next box that will actually ship (first non-skipped scheduled). */
  isNext: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deliveryId(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`
}

/**
 * The calendar month a billing cycle falls in, as a `deliveryOverrides` key.
 *
 * Dispatch counts in CYCLES (0 = signup, 1 = first renewal); the member's
 * calendar — and therefore every skip they make — is keyed by calendar month.
 * This is the join between the two, so a box the member skipped is a box that
 * does not ship.
 *
 * Derived from `startedAt` rather than from today, because a cycle's month is a
 * fact about when the plan began, not about when the question is asked.
 */
/**
 * The billing cycle a calendar month belongs to.
 *
 * The inverse of `deliveryIdForCycle`, and the join the schedule needs: the
 * calendar walks months from today, dispatch counts cycles from signup, and the
 * two have to agree about which box is which.
 *
 * Null before the plan began — there is no cycle 0 in a month that predates it.
 */
export function cycleForMonth(
  sub: Pick<MemberSubscription, 'startedAt'>,
  year: number,
  monthIndex0: number,
  now: Date = new Date(),
): number | null {
  const start = new Date(sub.startedAt)
  const from = Number.isNaN(start.getTime()) ? now : start
  const cycle = (year - from.getFullYear()) * 12 + (monthIndex0 - from.getMonth())
  return cycle >= 0 ? cycle : null
}

export function deliveryIdForCycle(sub: Pick<MemberSubscription, 'startedAt'>, cycle: number): string | null {
  const start = new Date(sub.startedAt)
  if (Number.isNaN(start.getTime())) return null
  const at = new Date(start.getFullYear(), start.getMonth() + Math.max(0, cycle), 1)
  return deliveryId(at.getFullYear(), at.getMonth())
}

/** Whether the member skipped the box for this billing cycle. */
export function cycleIsSkipped(sub: MemberSubscription, cycle: number): boolean {
  const id = deliveryIdForCycle(sub, cycle)
  return id != null && sub.deliveryOverrides?.[id]?.skipped === true
}

/**
 * Lines the member pulled out of the box for this billing cycle.
 *
 * The twin of `cycleIsSkipped`, and it exists for the same reason: dispatch
 * counts cycles, the member's overrides are keyed by calendar month, and a
 * removal only means anything if both ends agree about which box is which.
 *
 * Until this existed, `removedLineIds` was read by the hub's own calendar and by
 * nothing else — so pulling an item out of a box removed it from the picture of
 * the box, and the supplier shipped it anyway. `subscriptionOrderLines` is the
 * side that actually packs it.
 */
export function removedLinesAtCycle(sub: MemberSubscription, cycle: number): string[] {
  const id = deliveryIdForCycle(sub, cycle)
  return (id != null ? sub.deliveryOverrides?.[id]?.removedLineIds : undefined) ?? []
}

function dispatchDateInMonth(day: number, year: number, monthIndex0: number): Date {
  return new Date(year, monthIndex0, Math.min(Math.max(Math.round(day), 1), 28))
}

/** Full-price one-off unit price for a product added to a box. */
export function oneOffUnitPrice(product: CatalogueProduct, config = getPricingConfig()): number {
  const variant = product.variants.find((v) => v.available) ?? product.variants[0]
  const unitPrice = variant?.price ?? product.basePrice
  const cost = unitCostOf(product, unitPrice, config)
  return round(discountWithFloor(unitPrice, config.subscriptionDiscount, cost, config))
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

/**
 * Build the upcoming delivery calendar. `catalogue` is used to render any
 * one-off products added to a box.
 */
export function buildDeliverySchedule(
  sub: MemberSubscription,
  catalogue: CatalogueProduct[] = [],
  monthsAhead = 6,
  now: Date = new Date(),
): Delivery[] {
  const overrides = sub.deliveryOverrides ?? {}
  const deliveries: Delivery[] = []
  let nextAssigned = false

  for (let m = 0; m < monthsAhead; m++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() + m, 1)
    const year = monthDate.getFullYear()
    const monthIndex0 = monthDate.getMonth()
    const id = deliveryId(year, monthIndex0)
    const ov: DeliveryOverride = overrides[id] ?? {}

    let date = m === 0 ? effectiveNextDispatch(sub, now) : dispatchDateInMonth(sub.dispatchDayOfMonth, year, monthIndex0)
    if (ov.dateOverride) {
      const d = new Date(ov.dateOverride)
      if (!Number.isNaN(d.getTime())) date = d
    }

    const items: DeliveryItem[] = []

    /**
     * Recurring lines due this month — read from the SAME function dispatch uses.
     *
     * This used to run its own cadence, staggering multi-month items across
     * boxes by a hash of the line id so a member with three quarterly tubs did
     * not get all three at once. A nice idea, and a fiction: nothing in dispatch
     * implemented it, so the calendar said a tub was coming in April while the
     * fulfilment order shipped it in March. Two answers to "when does this
     * arrive", and the exit settlement bills against the other one.
     *
     * The calendar is a promise about what will actually turn up, so it defers
     * to whatever actually ships. Staggering can come back if it is built in
     * `shipsAtCycle`, where both sides would read it.
     */
    const cycle = cycleForMonth(sub, year, monthIndex0, now)
    for (const line of sub.lines) {
      if (cycle == null || !shipsAtCycle(line, cycle)) continue
      if (ov.removedLineIds?.includes(line.id)) continue
      items.push({
        lineId: line.id,
        productId: line.productId,
        productTitle: line.productTitle,
        slotTitle: line.slotTitle,
        units: line.quantity,
        price: line.pricePerDelivery,
      })
    }

    // One-off products added to this box only.
    let oneOffTotal = 0
    for (const pid of ov.addedProductIds ?? []) {
      const product = catalogue.find((p) => p.id === pid)
      if (!product) continue
      const price = oneOffUnitPrice(product)
      oneOffTotal = round(oneOffTotal + price)
      items.push({
        lineId: null,
        productId: product.id,
        productTitle: product.title,
        slotTitle: SLOT_LABELS[product.stackSlots[0]] ?? product.category,
        units: 1,
        price,
        oneOff: true,
      })
    }

    const skipped = !!ov.skipped
    const isNext = !skipped && !nextAssigned && items.length > 0
    if (isNext) nextAssigned = true

    deliveries.push({
      id,
      date: date.toISOString(),
      items,
      total: round(items.reduce((s, it) => s + it.price, 0)),
      oneOffTotal,
      status: skipped ? 'skipped' : 'scheduled',
      isNext,
    })
  }

  return deliveries
}

/** The next box that will actually ship. */
export function nextDelivery(deliveries: Delivery[]): Delivery | null {
  return deliveries.find((d) => d.isNext) ?? null
}

/** The credit banked by skipping a box (the value of its recurring items). */
export function skipCredit(delivery: Delivery): number {
  return round(delivery.items.filter((it) => !it.oneOff).reduce((s, it) => s + it.price, 0))
}

/** What the member is actually charged next: the flat monthly, plus this box's one-offs, less credits. */
export interface ChargeBreakdown {
  /** Date of the next charge (the next box that ships), or null. */
  date: string | null
  /** The flat monthly membership amount (what's billed every cycle). */
  plan: number
  /** One-off extras riding on the next box (charged on top). */
  extras: number
  /** Banked credits applied to the next charge (e.g. from skips). */
  credits: number
  /** Net charged next = max(0, plan + extras − credits). */
  net: number
  /** Upcoming boxes that are skipped (no charge those cycles). */
  skippedUpcoming: number
}

export function nextChargeBreakdown(sub: MemberSubscription, deliveries: Delivery[]): ChargeBreakdown {
  const next = nextDelivery(deliveries)
  const plan = sub.flatMonthly
  const extras = next?.oneOffTotal ?? 0
  const credits = round(sub.lines.reduce((s, l) => s + (l.pendingCredit ?? 0), 0))
  return {
    date: next?.date ?? null,
    plan,
    extras,
    credits,
    net: round(Math.max(0, plan + extras - credits)),
    skippedUpcoming: deliveries.filter((d) => d.status === 'skipped').length,
  }
}

// ─── Per-box mutations (pure) ─────────────────────────────────────────────────

function withOverride(sub: MemberSubscription, id: string, patch: Partial<DeliveryOverride>): MemberSubscription {
  const cur = sub.deliveryOverrides?.[id] ?? {}
  return { ...sub, deliveryOverrides: { ...sub.deliveryOverrides, [id]: { ...cur, ...patch } } }
}

/**
 * What a skipped box was worth — the credit the member is owed for it.
 *
 * The Terms say plainly: *"Skipping a box does not cost you a payment — the
 * value of the skipped box is credited against your next one."* Nothing kept
 * that. `skipDelivery` set a flag, dispatch (since the cadence fix) sends
 * nothing, and Stripe billed the full monthly regardless — so a member who
 * skipped paid in full and received an empty month.
 *
 * Priced from the lines actually due in that cycle, using the same `shipsAtCycle`
 * dispatch reads. A box with nothing in it is worth nothing, which is the right
 * answer for a plan of quarterly items skipping a month that was empty anyway.
 */
export function creditForSkippedBox(sub: MemberSubscription, id: string, now: Date = new Date()): number {
  const [year, month] = id.split('-').map(Number)
  if (!year || !month) return 0
  const cycle = cycleForMonth(sub, year, month - 1, now)
  if (cycle == null) return 0
  const removed = sub.deliveryOverrides?.[id]?.removedLineIds ?? []
  return round(
    sub.lines
      .filter((line) => shipsAtCycle(line, cycle) && !removed.includes(line.id))
      .reduce((total, line) => total + line.pricePerDelivery, 0),
  )
}

export function skipDelivery(sub: MemberSubscription, id: string): MemberSubscription {
  return withOverride(sub, id, { skipped: true })
}

export function unskipDelivery(sub: MemberSubscription, id: string): MemberSubscription {
  return withOverride(sub, id, { skipped: false })
}

export function rescheduleDelivery(sub: MemberSubscription, id: string, date: Date): MemberSubscription {
  return withOverride(sub, id, { dateOverride: date.toISOString() })
}

/** Add a one-off of a product to this box only. Stacks — call again for a 2nd extra. */
export function addItemToDelivery(sub: MemberSubscription, id: string, product: CatalogueProduct): MemberSubscription {
  const cur = sub.deliveryOverrides?.[id]?.addedProductIds ?? []
  return withOverride(sub, id, { addedProductIds: [...cur, product.id] })
}

/**
 * Remove an item from one box: a recurring line is pulled for that box; one
 * one-off is undone.
 *
 * Pulling a recurring line banks its value as a credit against the next
 * payment, exactly as "Skip next" does one sheet away — the two controls are
 * the same act described twice, and only one of them used to be worth anything.
 * Without it the member paid the same flat monthly for a box with less in it,
 * which is the opposite of what the Terms promise about a box that doesn't come.
 *
 * Undoing a one-off takes nothing back: it was charged on top of the plan and
 * the charge simply doesn't happen.
 */
export function removeItemFromDelivery(sub: MemberSubscription, id: string, item: DeliveryItem): MemberSubscription {
  if (item.oneOff || item.lineId == null) {
    const cur = sub.deliveryOverrides?.[id]?.addedProductIds ?? []
    const idx = cur.indexOf(item.productId)
    const next = idx >= 0 ? [...cur.slice(0, idx), ...cur.slice(idx + 1)] : cur
    return withOverride(sub, id, { addedProductIds: next })
  }
  const cur = sub.deliveryOverrides?.[id]?.removedLineIds ?? []
  if (cur.includes(item.lineId)) return sub
  const lineId = item.lineId
  const withCredit = {
    ...sub,
    lines: sub.lines.map((l) =>
      l.id === lineId ? { ...l, pendingCredit: round((l.pendingCredit ?? 0) + l.pricePerDelivery) } : l,
    ),
  }
  return withOverride(withCredit, id, { removedLineIds: [...cur, lineId] })
}
