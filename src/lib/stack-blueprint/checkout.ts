/**
 * Maps a StackBlueprint to validated cart line items.
 *
 * Each slot must have:
 *   - a resolved CatalogueProduct
 *   - a CatalogueVariant, identified by its own id
 *
 * Returns a typed result so callers can surface specific errors to the user
 * without any supplier-specific code leaking into UI components.
 */

import type { StackBlueprint, StackSlotEntry } from './types'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'
import {
  buildSubscriptionPlan,
  calculatePricing,
  formatGBP,
  getPricingConfig,
  priceOneOffLines,
  unitCostOf,
  type SubscriptionPlanOptions,
} from './pricing'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CheckoutLineItem {
  /** The catalogue variant being bought. */
  variantId: string
  quantity: number
  /** Line attributes — surfaced in the order for ops/personalisation. */
  attributes: { key: string; value: string }[]
}

export type ValidationError =
  | { type: 'no-variant'; slotId: string; slotTitle: string }
  | { type: 'unavailable'; slotId: string; slotTitle: string; variantTitle: string }
  /**
   * The basket is too small to pay for its own parcel.
   *
   * PowerBody charge us per parcel regardless of what is in it, so below
   * `minOrderValue` there is no basket we can send without losing money — and a
   * one-off order has no renewal behind it to make that back. This is the only
   * validation error that is about money rather than about data.
   */
  | { type: 'below-minimum'; subtotal: number; minimum: number; shortfall: number }

export type CheckoutValidation =
  | { ok: true; lines: CheckoutLineItem[] }
  | { ok: false; errors: ValidationError[] }

/** A single recurring line in the subscription checkout. */
export interface SubscriptionCheckoutLine {
  productId: string
  productTitle: string
  /** The catalogue variant being subscribed to. */
  variantId: string
  /** Selling plan that makes this line recurring (null until configured). */
  /** Units sent each delivery. */
  quantity: number
  /** Delivery cadence in months. */
  deliveryIntervalMonths: number
  /** Amount billed each delivery. */
  pricePerDelivery: number
  attributes: { key: string; value: string }[]
}

/** Everything needed to start a subscription — the payload handed to Stripe. */
export interface SubscriptionCheckout {
  lines: SubscriptionCheckoutLine[]
  /** Flat amount billed every month. */
  flatMonthly: number
  /** First month's price after the intro discount. */
  firstMonth: number
  introDiscountPct: number
  /** Minimum commitment in months. */
  minMonths: number
  /** Total committed across the minimum term. */
  minTermTotal: number
}

export type SubscriptionCheckoutResult =
  | { ok: true; checkout: SubscriptionCheckout }
  | { ok: false; errors: ValidationError[] }

// ─── Validation + line-item builder ──────────────────────────────────────────

/**
 * Resolve the best variant for a slot:
 *   1. slot.selectedVariantId match
 *   2. first available variant
 *   3. first variant (sold out)
 */
function resolveVariant(
  slot: StackSlotEntry,
  product: CatalogueProduct,
): CatalogueVariant | undefined {
  if (slot.selectedVariantId) {
    const v = product.variants.find((v) => v.id === slot.selectedVariantId)
    if (v) return v
  }
  return product.variants.find((v) => v.available) ?? product.variants[0]
}

/**
 * Validate the blueprint and convert it to cart line items.
 *
 * Every catalogue variant carries its own id, so there is nothing to gate on
 * beyond the product existing and being in stock — the old "is it connected to
 * the store yet?" check went with the old storefront integration.
 */
export function validateCheckout(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
): CheckoutValidation {
  const errors: ValidationError[] = []
  const lines: CheckoutLineItem[] = []

  for (const slot of blueprint.slots) {
    const product = catalogue.find((p) => p.id === slot.selectedProductId)
    if (!product) continue // product missing from catalogue — skip silently

    const variant = resolveVariant(slot, product)

    if (!variant) {
      errors.push({ type: 'no-variant', slotId: slot.slotId, slotTitle: slot.title })
      continue
    }

    if (!variant.available) {
      errors.push({
        type: 'unavailable',
        slotId: slot.slotId,
        slotTitle: slot.title,
        variantTitle: variant.title,
      })
      continue
    }

    lines.push({
      variantId: variant.id,
      quantity: 1,
      attributes: [
        { key: 'stackId', value: blueprint.id },
        { key: 'stackName', value: blueprint.stackName },
        { key: 'slotType', value: slot.slotType },
        { key: 'reason', value: slot.reason.slice(0, 255) }, // keep attributes short
        { key: 'source', value: 'quiz-stack-builder' },
      ],
    })
  }

  // Priced with the same function the cart and the display use, so the number
  // the customer is told they need matches the one they are charged.
  const subtotal = priceOneOffLines(
    blueprint.slots
      .map((slot) => {
        const product = catalogue.find((p) => p.id === slot.selectedProductId)
        if (!product) return null
        const variant = resolveVariant(slot, product)
        const price = variant?.price ?? product.basePrice
        return { price, cost: unitCostOf(product, price) }
      })
      .filter((l): l is { price: number; cost: number } => l != null),
  ).subtotal

  const minimum = getPricingConfig().minOrderValue
  if (subtotal > 0 && minimum > 0 && subtotal < minimum) {
    errors.push({
      type: 'below-minimum',
      subtotal,
      minimum,
      shortfall: Math.round((minimum - subtotal) * 100) / 100,
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, lines }
}

// ─── Subscription checkout builder ───────────────────────────────────────────

/**
 * Build the subscription checkout payload from a blueprint: the deduplicated,
 * quantity-aware plan lines plus the flat monthly / intro / commitment figures.
 * This is exactly what gets handed to Stripe (recurring lines)
 * or Recharge at checkout.
 */
export function buildSubscriptionCheckout(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  answers?: QuizAnswers | null,
  options: SubscriptionPlanOptions = {},
): SubscriptionCheckoutResult {
  const { usageByProductId, level, introDiscountOverride } = options
  const planOpts = { usageByProductId, level, introDiscountOverride }
  const plan = buildSubscriptionPlan(blueprint, catalogue, answers, undefined, planOpts)
  const pricing = calculatePricing(blueprint, catalogue, answers, undefined, planOpts)
  const errors: ValidationError[] = []
  const lines: SubscriptionCheckoutLine[] = []

  for (const line of plan) {
    lines.push({
      productId: line.product.id,
      productTitle: line.product.title,
      variantId: line.variantId,
      quantity: line.unitsPerShipment,
      deliveryIntervalMonths: line.shipEveryMonths,
      pricePerDelivery: line.pricePerDelivery,
      attributes: [
        { key: 'stackId', value: blueprint.id },
        { key: 'stackName', value: blueprint.stackName },
        { key: 'plan', value: 'subscription' },
        { key: 'deliveryEveryMonths', value: String(line.shipEveryMonths) },
        { key: 'source', value: 'quiz-stack-builder' },
      ],
    })
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    checkout: {
      lines,
      flatMonthly: pricing.subscriptionTotal,
      firstMonth: pricing.subscriptionFirstMonth,
      introDiscountPct: pricing.subscriptionIntroDiscountPct,
      minMonths: pricing.subscriptionMinMonths,
      minTermTotal: pricing.subscriptionMinTermTotal,
    },
  }
}

/** Human-readable message for a ValidationError. */
export function validationErrorMessage(err: ValidationError): string {
  switch (err.type) {
    case 'no-variant':
      return `Please choose a flavour or size for your ${err.slotTitle} before checking out.`
    case 'unavailable':
      return `${err.slotTitle} — ${err.variantTitle} is currently out of stock. Please swap to a different option.`
    case 'below-minimum':
      return `Orders start at ${formatGBP(err.minimum)} — add ${formatGBP(err.shortfall)} more to check out.`
  }
}
