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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CheckoutLineItem {
  /** Shopify merchandiseId (GID) — e.g. "gid://shopify/ProductVariant/1234567" */
  merchandiseId: string
  quantity: number
  /** Shopify cart line attributes — surfaced in the order for ops/personalisation */
  attributes: { key: string; value: string }[]
}

export type ValidationError =
  | { type: 'no-variant'; slotId: string; slotTitle: string }
  | { type: 'no-shopify-id'; slotId: string; slotTitle: string; variantTitle: string }
  | { type: 'unavailable'; slotId: string; slotTitle: string; variantTitle: string }

export type CheckoutValidation =
  | { ok: true; lines: CheckoutLineItem[] }
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

/** Human-readable message for a ValidationError. */
export function validationErrorMessage(err: ValidationError): string {
  switch (err.type) {
    case 'no-variant':
      return `Please choose a flavour or size for your ${err.slotTitle} before checking out.`
    case 'unavailable':
      return `${err.slotTitle} — ${err.variantTitle} is currently out of stock. Please swap to a different option.`
    case 'no-shopify-id':
      return `${err.slotTitle} isn't connected to the store yet. Try refreshing or contact support.`
  }
}
