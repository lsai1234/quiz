import { getPricingConfig, priceOneOffLines, unitCostOf, type OneOffPricing } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { CheckoutLineItem } from '@/lib/stack-blueprint/checkout'
import type { BasketLine, ResolvedBasketLine } from './types'

/** Upper bound per line so a stuck stepper can't send absurd quantities. */
export const MAX_LINE_QTY = 99

const sameLine = (l: BasketLine, productId: string, variantId: string) =>
  l.productId === productId && l.variantId === variantId

/**
 * Add `qty` of a product+variant. Merges into an existing line (clamped to
 * MAX_LINE_QTY) or appends a new one. Pure — returns a new array.
 */
export function addLine(lines: BasketLine[], productId: string, variantId: string, qty = 1): BasketLine[] {
  if (qty <= 0) return lines
  const existing = lines.find((l) => sameLine(l, productId, variantId))
  if (existing) {
    return lines.map((l) =>
      sameLine(l, productId, variantId)
        ? { ...l, quantity: Math.min(MAX_LINE_QTY, l.quantity + qty) }
        : l,
    )
  }
  return [...lines, { productId, variantId, quantity: Math.min(MAX_LINE_QTY, qty) }]
}

/** Set an exact quantity. A quantity of 0 (or less) removes the line. */
export function setLineQty(lines: BasketLine[], productId: string, variantId: string, qty: number): BasketLine[] {
  if (qty <= 0) return removeLine(lines, productId, variantId)
  return lines.map((l) =>
    sameLine(l, productId, variantId) ? { ...l, quantity: Math.min(MAX_LINE_QTY, qty) } : l,
  )
}

/** Remove a line entirely. */
export function removeLine(lines: BasketLine[], productId: string, variantId: string): BasketLine[] {
  return lines.filter((l) => !sameLine(l, productId, variantId))
}

/** Total number of items (sum of quantities) — for the basket-count badge. */
export function basketItemCount(lines: BasketLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0)
}

/**
 * Join basket lines against the catalogue. Lines whose product or variant no
 * longer exists are dropped, so a stale persisted basket self-heals.
 */
export function resolveBasket(lines: BasketLine[], products: CatalogueProduct[]): ResolvedBasketLine[] {
  const resolved: ResolvedBasketLine[] = []
  for (const line of lines) {
    const product = products.find((p) => p.id === line.productId)
    if (!product) continue
    const variant = product.variants.find((v) => v.id === line.variantId)
    if (!variant) continue
    resolved.push({ product, variant, quantity: line.quantity, lineTotal: variant.price * line.quantity })
  }
  return resolved
}

/** Basket subtotal BEFORE any bundle discount, rounded to pennies. */
export function basketSubtotal(resolved: ResolvedBasketLine[]): number {
  return Math.round(resolved.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100
}

/**
 * What the basket actually costs: the bundle tier applied, margin-floored.
 *
 * Uses `priceOneOffLines` — the same function `/api/cart` bills Stripe from — so
 * the number in the drawer and the number on the card are the same number. The
 * shop previously showed a raw subtotal and never applied the configured tiers
 * at all, so customers who had earned "£90+ bundle, 15% off" were quietly
 * charged full price.
 */
export function priceBasket(
  resolved: ResolvedBasketLine[],
  config = getPricingConfig(),
  /** A validated partner code rate, 0–1 — stacks on top of the bundle tier. */
  partnerPct = 0,
): OneOffPricing {
  return priceOneOffLines(
    resolved.map(({ product, variant, quantity }) => ({
      price: variant.price,
      cost: unitCostOf(product, variant.price, config),
      quantity,
    })),
    config,
    partnerPct,
  )
}

/**
 * Map a resolved basket to checkout line items. Mirrors the stack
 * checkout's mapping: `variantId` is the catalogue variant's own id. Every line
 * is tagged so ops can tell shop orders from quiz orders.
 */
export function basketToCheckoutLines(resolved: ResolvedBasketLine[]): CheckoutLineItem[] {
  return resolved.map(({ product, variant, quantity }) => ({
    variantId: variant.id,
    quantity,
    attributes: [
      { key: 'source', value: 'shop' },
      { key: 'product', value: product.title },
    ],
  }))
}
