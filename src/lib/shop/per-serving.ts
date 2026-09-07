import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { resolveConsumption } from '@/lib/stack-blueprint/pricing'
import { isAccessory } from '@/lib/catalogue/accessory'

/**
 * What a serving actually costs.
 *
 * The number that decides value in this category, and the one essentially
 * nobody displays: a £59.99 2kg tub is better value than a £34.99 1kg tub, and
 * a shelf price cannot say so.
 *
 * ── Why this is not `variant.price / product.servings` ───────────────────────
 * `servings` is a PRODUCT field describing ONE container — in practice the
 * first variant. The catalogue is full of products whose variants are different
 * sizes of the same thing:
 *
 *   Whey        servings: 30   variants: 1kg £34.99, 2kg £59.99
 *   Omega-3     servings: 90   variants: 90 softgels £14.99, 180 £26.99
 *   Vitamin D   servings: 60   variants: 60 caps £12.99, 120 caps £22.99
 *
 * Dividing every variant by the same `servings` would price the 2kg tub at
 * £2.00 a serving against the 1kg tub's £1.17 — declaring the bigger tub worse
 * value, which is not merely imprecise but backwards. A headline value number
 * that is confidently inverted is worse than no number at all.
 *
 * So servings are scaled by container size, on the one assumption that holds
 * within a single product: the same product at a different size is taken at the
 * same dose, so twice the container is twice the servings. Across DIFFERENT
 * products no such assumption is made — each is measured against its own first
 * variant.
 *
 * When a size cannot be read, or two sizes are not in the same unit, this
 * returns null and the caller shows nothing. Silence is the correct answer to a
 * question we cannot answer.
 */

export type SizeUnit = 'mass' | 'count'

export interface ParsedSize {
  value: number
  unit: SizeUnit
}

/** Grams per kilogram, so mass sizes compare in one unit. */
const G_PER_KG = 1000

const MASS = /^([\d.]+)\s*(kg|g)\b/
const COUNT = /^([\d.]+)\s*(caps?|capsules?|softgels?|gels?|tablets?|tabs?|servings?|sachets?|scoops?|bars?)\b/

/**
 * Read a variant size string — "1kg", "300g", "90 softgels", "60 caps".
 *
 * Mass normalises to grams. Anything unrecognised is null rather than guessed:
 * a size we cannot read is a per-serving figure we should not print.
 */
export function parseSize(size: string | null | undefined): ParsedSize | null {
  if (!size) return null
  const text = size.trim().toLowerCase()

  const mass = text.match(MASS)
  if (mass) {
    const value = Number(mass[1]) * (mass[2] === 'kg' ? G_PER_KG : 1)
    return Number.isFinite(value) && value > 0 ? { value, unit: 'mass' } : null
  }

  const count = text.match(COUNT)
  if (count) {
    const value = Number(count[1])
    return Number.isFinite(value) && value > 0 ? { value, unit: 'count' } : null
  }

  return null
}

/**
 * How many servings this particular variant holds, or null when unknowable.
 *
 * The product's own `servings` describes its FIRST variant; every other variant
 * is scaled from it by size. Same product, same recommended dose — see the
 * module comment for why that assumption is safe here and nowhere else.
 */
export function servingsForVariant(
  product: CatalogueProduct,
  variant: CatalogueVariant,
): number | null {
  // A shaker has no dose, so it has no servings — and a scaled "30 servings"
  // under a bottle is not a rounding error, it is a made-up fact.
  if (isAccessory(product)) return null

  // The supplier's own count for THIS sku, when we have it. It beats every
  // inference below: siblings under one master SKU are usually the same tub in
  // different flavours, but where they are not — 100 vcaps against 454g of the
  // same powder — no ratio taken from the first variant can reach the second.
  if (variant.servings != null && Number.isFinite(variant.servings) && variant.servings > 0) {
    return variant.servings
  }

  const base = product.variants[0]
  if (!base) return null

  const baseServings = resolveConsumption(product).servingsPerUnit
  if (!Number.isFinite(baseServings) || baseServings <= 0) return null
  if (variant.id === base.id) return baseServings

  const from = parseSize(base.size)
  const to = parseSize(variant.size)
  // Different units ("300g" vs "60 caps") are not a ratio anyone should take.
  if (!from || !to || from.unit !== to.unit) return null

  const scaled = baseServings * (to.value / from.value)
  return Number.isFinite(scaled) && scaled > 0 ? scaled : null
}

/**
 * What one serving of this variant costs, or null when the servings are
 * unknowable. Rounded to the penny only at the point of display — see
 * `formatPerServing` — because rounding before a comparison can make two
 * genuinely different prices look identical.
 */
export function pricePerServing(
  product: CatalogueProduct,
  variant: CatalogueVariant,
): number | null {
  const servings = servingsForVariant(product, variant)
  if (servings === null || variant.price <= 0) return null
  return variant.price / servings
}

/**
 * A per-serving price, formatted.
 *
 * Pence below a pound, because "£0.07" reads as noise where "7p" reads as a
 * price; two decimals above it. Servings are cheap enough that the difference
 * between 7p and 12p is the whole comparison.
 */
export function formatPerServing(value: number): string {
  // Rounded FIRST, then given its unit: 99.5p is a pound once rounded, and
  // "100p" is not how anyone writes that.
  const pence = Math.round(value * 100)
  if (pence < 100) return `${pence}p`
  return `£${(pence / 100).toFixed(2)}`
}

/**
 * The variants a plan may offer as a straight swap for the one it chose.
 *
 * ── Why a plan cannot offer every variant ───────────────────────────────────
 * On the shop shelf, showing every size is the whole point: a shopper comparing
 * 100 capsules against a 454g bag is doing the job the page is for. Inside a
 * quiz stack it is a different question. The plan has already decided how much
 * of this product a month needs, priced it, and — on subscription — sized the
 * cadence from the serving count. Switching to a variant with a different count
 * silently changes all three: the same "flavour" swap that used to move
 * somebody from Chocolate to Vanilla would now move them from 33 servings to
 * 454 and quietly reprice their plan.
 *
 * So the rule is deliberately narrow: same product, same number of servings.
 * That is the flavour swap the picker was always for. A different SIZE is a
 * different decision, and it belongs on the product page where the shopper can
 * see what it costs per serving.
 *
 * ── Unknown counts stay interchangeable ─────────────────────────────────────
 * Most products know their servings for the first variant only — the rest are
 * scaled from size, and a flavour has no size to scale. Treating "unknown" as
 * "different" would empty the picker for exactly the products it works best
 * for, so a pair is excluded only when both counts are known AND they differ.
 * Evidence of a difference, never the absence of evidence.
 */
export function interchangeableVariants(
  product: CatalogueProduct,
  selected: CatalogueVariant | undefined,
): CatalogueVariant[] {
  if (!selected) return product.variants
  const target = servingsForVariant(product, selected)
  if (target === null) return product.variants
  return product.variants.filter((v) => {
    const servings = servingsForVariant(product, v)
    return servings === null || Math.round(servings) === Math.round(target)
  })
}
