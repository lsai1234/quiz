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

/** A stable 0..(cadence-1) offset per line so multi-month items stagger across boxes. */
function lineOffset(line: MemberSubscriptionLine): number {
  let h = 0
  for (let i = 0; i < line.id.length; i++) h = (h * 31 + line.id.charCodeAt(i)) | 0
  return Math.abs(h) % Math.max(1, line.deliveryIntervalMonths)
}

function deliveryId(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`
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

    // Recurring lines due this month (staggered by per-line offset).
    for (const line of sub.lines) {
      const k = m - lineOffset(line)
      if (k < 0 || k % Math.max(1, line.deliveryIntervalMonths) !== 0) continue
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

// ─── Per-box mutations (pure) ─────────────────────────────────────────────────

function withOverride(sub: MemberSubscription, id: string, patch: Partial<DeliveryOverride>): MemberSubscription {
  const cur = sub.deliveryOverrides?.[id] ?? {}
  return { ...sub, deliveryOverrides: { ...sub.deliveryOverrides, [id]: { ...cur, ...patch } } }
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

export function addItemToDelivery(sub: MemberSubscription, id: string, product: CatalogueProduct): MemberSubscription {
  const cur = sub.deliveryOverrides?.[id]?.addedProductIds ?? []
  if (cur.includes(product.id)) return sub
  return withOverride(sub, id, { addedProductIds: [...cur, product.id] })
}

/** Remove an item from one box: a recurring line is pulled for that box; a one-off is undone. */
export function removeItemFromDelivery(sub: MemberSubscription, id: string, item: DeliveryItem): MemberSubscription {
  if (item.oneOff || item.lineId == null) {
    const cur = sub.deliveryOverrides?.[id]?.addedProductIds ?? []
    return withOverride(sub, id, { addedProductIds: cur.filter((pid) => pid !== item.productId) })
  }
  const cur = sub.deliveryOverrides?.[id]?.removedLineIds ?? []
  if (cur.includes(item.lineId)) return sub
  return withOverride(sub, id, { removedLineIds: [...cur, item.lineId] })
}
