/**
 * Which ONE product to put in front of somebody who scrolled past their whole
 * stack without buying it.
 *
 * ── The ranking ─────────────────────────────────────────────────────────────
 * The engine already said how well each slot fits this person
 * (`confidenceScore`, 0–100) and which ones the stack cannot do without
 * (`required`). Those lead. On top, a lean towards things you will actually
 * notice — "the one you'll see a difference with" is the pitch, and a
 * pre-workout felt in twenty minutes keeps that promise in a way a vitamin
 * working quietly for months does not — and the founders' own priority.
 *
 * ── The filter, before any of that ──────────────────────────────────────────
 * The product has to be buyable on its own at a profit: in stock, not a
 * subscription-only refill, and `quoteOffer` viable — which is also what keeps
 * a £12.99 vitamin, whose parcel costs more than it makes, off the card
 * however well it fits. A product that does not pass is skipped, not
 * discounted harder.
 *
 * Pure and client-safe.
 */
import type { CatalogueProduct, CatalogueVariant, EffectOnset } from '@/lib/catalogue/types'
import type { StackSlotEntry } from '@/lib/stack-blueprint/types'
import { getApprovedClaims } from '@/lib/stack-blueprint/approved-claims'
import { effectOnsetForProduct, onsetWindowLabel } from '@/lib/feedback'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { offerProductFor, quoteOffer, type OfferQuote } from './economics'

export interface HeroOffer {
  slotId: string
  slotType: string
  product: CatalogueProduct
  variant: CatalogueVariant
  quote: OfferQuote
  /** The engine's own sentence for why this is in their stack. */
  reason: string
  /** What it does, in the approved wording for its kind — at most two. */
  claims: string[]
  /** "within a few weeks" — when the benefit is typically noticeable. */
  noticeable: string
  /** The kind of effect — `none` is one you never consciously feel (protein, vitamins). */
  onset: EffectOnset
  /** How long one pack lasts at their usage (months), when known. */
  packMonths: number | null
  /** Why it ranked first, for tests and the hub. */
  score: number
}

const ONSET_BONUS: Record<string, number> = { immediate: 12, short: 8, long: 3, none: 0 }

function variantFor(product: CatalogueProduct, slot: StackSlotEntry): CatalogueVariant | null {
  return (
    product.variants.find((v) => v.id === slot.selectedVariantId && v.available) ??
    product.variants.find((v) => v.available) ??
    null
  )
}

/** How well a slot's product answers "the one you'll see a difference with". */
export function impactScore(slot: StackSlotEntry, product: CatalogueProduct): number {
  const onset = effectOnsetForProduct(product)
  return (
    Math.max(0, Math.min(100, slot.confidenceScore)) +
    (slot.required ? 15 : 0) +
    (ONSET_BONUS[onset] ?? 0) +
    Math.max(0, Math.min(10, product.recommendationPriority)) +
    (product.topRank ? Math.max(0, 11 - Math.min(10, product.topRank)) : 0)
  )
}

/**
 * The hero, or null when no product in the stack can be sold on its own at a
 * profit — in which case the section does not render at all.
 *
 * `packMonthsByProductId` comes from the page's subscription plan (one unit
 * covers 1 ÷ monthlyUnits months at their usage); absent, the card simply does
 * not say how long a pack lasts.
 */
export function pickHeroOffer(
  slots: readonly StackSlotEntry[],
  products: readonly CatalogueProduct[],
  opts: { packMonthsByProductId?: Record<string, number> } = {},
  config: PricingConfig = getPricingConfig(),
): HeroOffer | null {
  // One product is not a "smaller sale" of a stack of one.
  if (slots.length < 2) return null

  const candidates: HeroOffer[] = []
  for (const slot of slots) {
    const product = products.find((p) => p.id === slot.selectedProductId)
    if (!product || product.isSubscriptionOnly) continue
    const variant = variantFor(product, slot)
    if (!variant) continue
    const quote = quoteOffer(offerProductFor(product, variant, config), {}, config)
    if (!quote.viable) continue
    const months = opts.packMonthsByProductId?.[product.id]
    candidates.push({
      slotId: slot.slotId,
      slotType: slot.slotType,
      product,
      variant,
      quote,
      reason: slot.reason || product.shortReason,
      claims: getApprovedClaims(product.swapGroup).slice(0, 2),
      noticeable: onsetWindowLabel(effectOnsetForProduct(product)),
      onset: effectOnsetForProduct(product),
      packMonths: months && Number.isFinite(months) && months > 0 ? Math.round(months * 10) / 10 : null,
      score: impactScore(slot, product),
    })
  }
  if (candidates.length === 0) return null

  // Highest impact first; then the one that leaves more margin; then the cheaper,
  // because the point of the section is a smaller yes.
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      b.quote.contribution - a.quote.contribution ||
      a.quote.total - b.quote.total,
  )
  return candidates[0]
}
