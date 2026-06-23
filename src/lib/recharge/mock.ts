/**
 * Mock subscription service — stands in for Recharge until it's connected.
 *
 * `createMockSubscription` builds a realistic subscription from the quiz engine.
 * The mutation helpers (swap / dispatch date / pause / cancel) are PURE — they
 * take a subscription and return a new one. When Recharge is wired in, the hub
 * store calls Recharge's API here instead; the shapes are deliberately aligned.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint/mock-blueprint'
import {
  buildSubscriptionPlan,
  calculatePricing,
  discountWithFloor,
  unitCostOf,
  PRICING_CONFIG,
} from '@/lib/stack-blueprint/pricing'
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

/** Build a representative active subscription for a logged-in member. */
export function createMockSubscription(
  catalogue: CatalogueProduct[],
  email: string,
  answers?: QuizAnswers | null,
): MemberSubscription {
  const slotTitleById = Object.fromEntries(MOCK_BLUEPRINT.slots.map((s) => [s.slotId, s.title]))
  const plan = buildSubscriptionPlan(MOCK_BLUEPRINT, catalogue, answers)
  const pricing = calculatePricing(MOCK_BLUEPRINT, catalogue, answers)

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
      pricePerDelivery: l.pricePerDelivery,
      swapGroup: l.product.swapGroup,
    }
  })

  const startedAt = new Date()
  startedAt.setMonth(startedAt.getMonth() - 2) // active for 2 months

  return {
    id: 'mock-sub-1',
    status: 'active',
    customerEmail: email,
    flatMonthly: pricing.subscriptionTotal,
    dispatchDayOfMonth: 15,
    minMonths: pricing.subscriptionMinMonths,
    monthsActive: 2,
    startedAt: startedAt.toISOString(),
    paymentMethod: { brand: 'Visa', last4: '4242' },
    lines,
  }
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

export function monthsRemainingOnTerm(sub: MemberSubscription): number {
  return Math.max(0, sub.minMonths - sub.monthsActive)
}

export function canCancel(sub: MemberSubscription): boolean {
  return monthsRemainingOnTerm(sub) === 0
}

// ─── Mutations (pure) ────────────────────────────────────────────────────────

export function setDispatchDay(sub: MemberSubscription, day: number): MemberSubscription {
  return { ...sub, dispatchDayOfMonth: Math.min(Math.max(Math.round(day), 1), 28) }
}

export function pauseSubscription(sub: MemberSubscription): MemberSubscription {
  return sub.status === 'active' ? { ...sub, status: 'paused' } : sub
}

export function resumeSubscription(sub: MemberSubscription): MemberSubscription {
  return sub.status === 'paused' ? { ...sub, status: 'active' } : sub
}

export function cancelSubscription(sub: MemberSubscription): MemberSubscription {
  // Honour the minimum term — Recharge enforces this server-side too.
  return canCancel(sub) ? { ...sub, status: 'cancelled' } : sub
}

/** Swap a line's product (within its swap group) and re-price it + the flat monthly. */
export function swapSubscriptionLine(
  sub: MemberSubscription,
  lineId: string,
  newProduct: CatalogueProduct,
  config = PRICING_CONFIG,
): MemberSubscription {
  const lines = sub.lines.map((line) => {
    if (line.id !== lineId) return line
    const variant = newProduct.variants.find((v) => v.available) ?? newProduct.variants[0]
    const unitPrice = variant?.price ?? newProduct.basePrice
    const cost = unitCostOf(newProduct, unitPrice, config)
    const discountedUnit = discountWithFloor(unitPrice, config.subscriptionDiscount, cost, config)
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

/** Products that can replace a line — same stack slot, excluding subscription-only refills. */
export function swappableForLine(
  line: MemberSubscriptionLine,
  catalogue: CatalogueProduct[],
): CatalogueProduct[] {
  return catalogue.filter(
    (p) => p.stackSlots.includes(line.stackSlot) && p.id !== line.productId && !p.isSubscriptionOnly && p.subscriptionEligible,
  )
}
