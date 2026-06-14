import type { StackBlueprint } from './types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

// ─── Config ──────────────────────────────────────────────────────────────────
// All discount rates live here so they can be changed without touching UI code.

export const PRICING_CONFIG = {
  /** Subscription discount applied to subscriptionEligible products (0–1). */
  subscriptionDiscount: 0.15,
  /** Label shown on the subscription saving line. */
  subscriptionPlanLabel: 'CHRGD Monthly Stack Plan',
  /**
   * Longest days-of-supply a product can have and still belong in a *monthly*
   * subscription. Products that last much longer (e.g. a 90-day creatine tub)
   * ship too infrequently to subscribe to monthly and are offered one-off instead.
   */
  maxSubscriptionDaysOfSupply: 35,
}

// ─── Subscription qualification ─────────────────────────────────────────────

/**
 * Whether a product belongs in the monthly subscription: it must be flagged
 * subscriptionEligible AND last roughly a month at its recommended dose.
 */
export function qualifiesForSubscription(
  product: Pick<CatalogueProduct, 'subscriptionEligible' | 'daysOfSupply'>,
  config = PRICING_CONFIG,
): boolean {
  return (
    product.subscriptionEligible &&
    product.daysOfSupply <= config.maxSubscriptionDaysOfSupply
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StackPricing {
  /** Sum of selected variant prices (or basePrice fallback). */
  oneOffTotal: number
  /** Sum of compareAtPrice (RRP) across all slots. Equals oneOffTotal when no compare prices exist. */
  rrpTotal: number
  /** rrpTotal − oneOffTotal. 0 when no compare prices exist. */
  bundleSaving: number
  /** bundleSaving / rrpTotal expressed as 0–100. 0 when no compare prices exist. */
  bundleSavingPct: number
  /**
   * Monthly price of the subscription: only products that qualify
   * (see qualifiesForSubscription) are included, each with subscriptionDiscount applied.
   */
  subscriptionTotal: number
  /** Undiscounted one-off price of just the subscription-qualifying products — the baseline for subscriptionSaving. */
  subscriptionItemsOneOffTotal: number
  /** subscriptionItemsOneOffTotal − subscriptionTotal */
  subscriptionSaving: number
  /** subscriptionSaving / subscriptionItemsOneOffTotal expressed as 0–100. */
  subscriptionSavingPct: number
  /** Number of slots whose product qualifies for the monthly subscription. */
  subscriptionItemCount: number
  /** Number of slots excluded from the subscription (one-off only). */
  excludedFromSubscriptionCount: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve the price for a single slot: selected variant → basePrice fallback. */
function slotPrice(slot: StackBlueprint['slots'][number], product: CatalogueProduct): number {
  if (slot.selectedVariantId) {
    const variant = product.variants.find((v) => v.id === slot.selectedVariantId)
    if (variant) return variant.price
  }
  // Fall back to first available variant then basePrice
  const firstAvailable = product.variants.find((v) => v.available)
  return firstAvailable?.price ?? product.basePrice
}

/** Resolve the RRP (compareAtPrice) for a single slot. Falls back to the slot price when absent. */
function slotRrp(slot: StackBlueprint['slots'][number], product: CatalogueProduct): number {
  if (slot.selectedVariantId) {
    const variant = product.variants.find((v) => v.id === slot.selectedVariantId)
    if (variant?.compareAtPrice) return variant.compareAtPrice
  }
  // Try first available variant's compareAtPrice, then product-level, then slot price
  const firstAvailable = product.variants.find((v) => v.available)
  return (
    firstAvailable?.compareAtPrice ??
    product.compareAtPrice ??
    slotPrice(slot, product)
  )
}

// ─── Main calculation ─────────────────────────────────────────────────────────

/**
 * Compute the full pricing breakdown for a StackBlueprint.
 * All values are rounded to 2 dp.
 * Returns zeroed-out pricing when the catalogue is empty or products are missing.
 */
export function calculatePricing(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  config = PRICING_CONFIG,
): StackPricing {
  let oneOffTotal = 0
  let rrpTotal = 0
  let subscriptionTotal = 0
  let subscriptionItemsOneOffTotal = 0
  let subscriptionItemCount = 0
  let excludedFromSubscriptionCount = 0

  for (const slot of blueprint.slots) {
    const product = catalogue.find((p) => p.id === slot.selectedProductId)
    if (!product) continue

    const price = slotPrice(slot, product)
    const rrp = slotRrp(slot, product)

    oneOffTotal += price
    rrpTotal += rrp

    // The subscription only contains products that last roughly a month — others
    // are excluded entirely (the customer buys them one-off, less frequently).
    if (qualifiesForSubscription(product, config)) {
      subscriptionItemsOneOffTotal += price
      subscriptionTotal += price * (1 - config.subscriptionDiscount)
      subscriptionItemCount += 1
    } else {
      excludedFromSubscriptionCount += 1
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100
  const bundleSaving = round(rrpTotal - oneOffTotal)
  const subscriptionSaving = round(subscriptionItemsOneOffTotal - subscriptionTotal)

  return {
    oneOffTotal: round(oneOffTotal),
    rrpTotal: round(rrpTotal),
    bundleSaving,
    bundleSavingPct: rrpTotal > 0 ? Math.round((bundleSaving / rrpTotal) * 100) : 0,
    subscriptionTotal: round(subscriptionTotal),
    subscriptionItemsOneOffTotal: round(subscriptionItemsOneOffTotal),
    subscriptionSaving,
    subscriptionSavingPct:
      subscriptionItemsOneOffTotal > 0
        ? Math.round((subscriptionSaving / subscriptionItemsOneOffTotal) * 100)
        : 0,
    subscriptionItemCount,
    excludedFromSubscriptionCount,
  }
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Format a number as £X.XX — always 2 decimal places, UK currency. */
export function formatGBP(amount: number): string {
  return `£${amount.toFixed(2)}`
}

/** Format a saving amount. Returns empty string when saving is ≤ 0. */
export function formatSaving(amount: number, pct: number): string {
  if (amount <= 0) return ''
  return `Save ${formatGBP(amount)} (${pct}% off)`
}
