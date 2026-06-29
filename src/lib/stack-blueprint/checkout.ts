/**
 * Maps a StackBlueprint to validated Shopify cart line items.
 *
 * Each slot must have:
 *   - a resolved CatalogueProduct
 *   - a CatalogueVariant with a shopifyVariantId (when Shopify is live)
 *
 * Returns a typed result so callers can surface specific errors to the user
 * without any Shopify-specific code leaking into UI components.
 */

import type { StackBlueprint, StackSlotEntry } from './types'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'
import { buildSubscriptionPlan, calculatePricing, type SubscriptionPlanOptions } from './pricing'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CheckoutLineItem {
  /** Shopify merchandiseId (GID) — e.g. "gid://shopify/ProductVariant/1234567" */
  merchandiseId: string
  quantity: number
  /** Shopify selling-plan GID — present on subscription lines, null for one-off. */
  sellingPlanId?: string | null
  /** Shopify cart line attributes — surfaced in the order for ops/personalisation */
  attributes: { key: string; value: string }[]
}

export type ValidationError =
  | { type: 'no-variant'; slotId: string; slotTitle: string }
  | { type: 'no-shopify-id'; slotId: string; slotTitle: string; variantTitle: string }
  | { type: 'unavailable'; slotId: string; slotTitle: string; variantTitle: string }
  | { type: 'no-selling-plan'; slotId: string; slotTitle: string }

export type CheckoutValidation =
  | { ok: true; lines: CheckoutLineItem[] }
  | { ok: false; errors: ValidationError[] }

/** A single recurring line in the subscription checkout. */
export interface SubscriptionCheckoutLine {
  productId: string
  productTitle: string
  /** Cart merchandiseId (Shopify GID when live, internal variant id in mock). */
  merchandiseId: string
  /** Selling plan that makes this line recurring (null until configured). */
  sellingPlanId: string | null
  /** Units sent each delivery. */
  quantity: number
  /** Delivery cadence in months. */
  deliveryIntervalMonths: number
  /** Amount billed each delivery. */
  pricePerDelivery: number
  attributes: { key: string; value: string }[]
}

/** Everything needed to start a subscription — the payload handed to Shopify/Recharge. */
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

// ─── Cart permalink (fallback when Storefront API is not live) ────────────────

/**
 * Builds a Shopify cart permalink from variant IDs and quantities.
 * Format: /cart/VAR_ID:QTY,VAR_ID:QTY
 * Requires numeric Shopify variant IDs (not GIDs).
 */
export function buildCartPermalink(
  domain: string,
  lines: { numericVariantId: string; quantity: number }[],
): string {
  const items = lines.map((l) => `${l.numericVariantId}:${l.quantity}`).join(',')
  return `https://${domain}/cart/${items}`
}

/** Extract numeric ID from a Shopify GID ("gid://shopify/ProductVariant/123" → "123") */
export function gidToNumeric(gid: string): string {
  return gid.split('/').pop() ?? gid
}

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
 * Validate the blueprint and convert to Shopify cart line items.
 *
 * When `requireShopifyIds` is false (mock/dev mode), lines are still returned
 * but merchandiseId will be the internal variant id — useful for mock checkout.
 */
export function validateCheckout(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  options: { requireShopifyIds?: boolean } = {},
): CheckoutValidation {
  const { requireShopifyIds = true } = options
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

    if (requireShopifyIds && !variant.shopifyVariantId) {
      errors.push({
        type: 'no-shopify-id',
        slotId: slot.slotId,
        slotTitle: slot.title,
        variantTitle: variant.title,
      })
      continue
    }

    lines.push({
      merchandiseId: variant.shopifyVariantId ?? variant.id,
      quantity: 1,
      attributes: [
        { key: 'stackId', value: blueprint.id },
        { key: 'stackName', value: blueprint.stackName },
        { key: 'slotType', value: slot.slotType },
        { key: 'reason', value: slot.reason.slice(0, 255) }, // Shopify attribute limit
        { key: 'source', value: 'quiz-stack-builder' },
      ],
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, lines }
}

// ─── Subscription checkout builder ───────────────────────────────────────────

/**
 * Build the subscription checkout payload from a blueprint: the deduplicated,
 * quantity-aware plan lines plus the flat monthly / intro / commitment figures.
 * This is exactly what gets handed to Shopify (cart lines with selling plans)
 * or Recharge at checkout.
 */
export function buildSubscriptionCheckout(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  answers?: QuizAnswers | null,
  options: { requireShopifyIds?: boolean; requireSellingPlans?: boolean } & SubscriptionPlanOptions = {},
): SubscriptionCheckoutResult {
  const { requireShopifyIds = false, requireSellingPlans = false, usageByProductId, level } = options
  const planOpts = { usageByProductId, level }
  const plan = buildSubscriptionPlan(blueprint, catalogue, answers, undefined, planOpts)
  const pricing = calculatePricing(blueprint, catalogue, answers, undefined, planOpts)
  const errors: ValidationError[] = []
  const lines: SubscriptionCheckoutLine[] = []

  for (const line of plan) {
    const slotId = line.coversSlotIds[0] ?? line.product.id
    if (requireShopifyIds && !line.variantId.startsWith('gid://')) {
      errors.push({ type: 'no-shopify-id', slotId, slotTitle: line.product.title, variantTitle: '' })
      continue
    }
    if (requireSellingPlans && !line.sellingPlanId) {
      errors.push({ type: 'no-selling-plan', slotId, slotTitle: line.product.title })
      continue
    }
    lines.push({
      productId: line.product.id,
      productTitle: line.product.title,
      merchandiseId: line.variantId,
      sellingPlanId: line.sellingPlanId,
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
    case 'no-shopify-id':
      return `${err.slotTitle} isn't connected to the store yet. Try refreshing or contact support.`
    case 'no-selling-plan':
      return `${err.slotTitle} doesn't have a subscription plan set up yet. Try refreshing or contact support.`
  }
}
