/**
 * What a stack product's card and detail sheet show besides its name: the
 * variant on screen, its price, the servings in it, what one serving costs,
 * how long a pack lasts at this person's usage, and the one claim shown.
 *
 * Servings come from `knownServings` (last-chance/pick.ts): a product with no
 * recorded count gets no servings, no cost per serving and no pack length,
 * rather than the 30 that subscription sizing assumes. The pack length is
 * `packMonthsFor`, the figure the last-chance card prints.
 *
 * Pure and client-safe.
 */

import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { Goal, QuizAnswers } from '@/lib/types'
import type { Claim } from '@/lib/consult/claims'
import type { UsageLevel } from '@/lib/stack-blueprint/pricing'
import { knownServings, packMonthsFor } from '@/lib/last-chance/pick'
import { productClaim } from './goal-claims'
import type { ProductExplanation } from './explain'

export interface CardFacts {
  /** The variant the card prices: the slot's pick, else the first in stock, else the first. */
  variant: CatalogueVariant | undefined
  price: number
  /** Servings in that variant, when a count was recorded. */
  servings: number | null
  /** `price / servings`, unrounded; null when the servings are not known. */
  perServing: number | null
  /** How long one pack lasts at their usage, in months; null when unknown. */
  packMonths: number | null
}

/** The variant a stack card shows, resolved the way the card always has. */
export function selectedVariantOf(
  product: CatalogueProduct,
  selectedVariantId: string | null | undefined,
): CatalogueVariant | undefined {
  return (
    product.variants.find((v) => v.id === selectedVariantId) ??
    product.variants.find((v) => v.available) ??
    product.variants[0]
  )
}

/**
 * The usage level that applies to this product. The plan journey keys usage by
 * the product it ships, which on subscription can be the monthly refill rather
 * than the product on the card, so both ids are tried.
 */
export function usageFor(
  usage: Record<string, UsageLevel> | null | undefined,
  product: Pick<CatalogueProduct, 'id'>,
  subscriptionProduct?: Pick<CatalogueProduct, 'id'> | null,
): UsageLevel | undefined {
  if (!usage) return undefined
  return usage[product.id] ?? (subscriptionProduct ? usage[subscriptionProduct.id] : undefined)
}

export function cardFacts(input: {
  product: CatalogueProduct
  selectedVariantId?: string | null
  answers?: QuizAnswers | null
  usage?: UsageLevel
}): CardFacts {
  const { product } = input
  const variant = selectedVariantOf(product, input.selectedVariantId)
  const price = variant?.price ?? product.basePrice
  const servings = variant ? knownServings(product, variant) : null
  const perServing = servings != null && servings > 0 && price > 0 ? price / servings : null
  const packMonths = variant ? packMonthsFor(product, variant, input.answers ?? null, input.usage) : null
  return { variant, price, servings, perServing, packMonths }
}

/** Their goals with the primary one first, the order `productClaim` wants. */
export function goalsPrimaryFirst(answers: Pick<QuizAnswers, 'goals' | 'primaryGoal'> | null | undefined): Goal[] {
  const goals = answers?.goals ?? []
  const primary = answers?.primaryGoal
  return primary ? [primary, ...goals.filter((g) => g !== primary)] : [...goals]
}

/**
 * The one claim a product's card shows: the claim beside its "Built from your
 * answers" line when it has one, so the card and the line always agree; else
 * `productClaim` for their goals; else null (the kind carries no claim).
 * Always the register's entry, worded verbatim.
 */
export function cardClaim(
  product: Pick<CatalogueProduct, 'swapGroup'>,
  explanation: ProductExplanation | null | undefined,
  answers: Pick<QuizAnswers, 'goals' | 'primaryGoal'> | null | undefined,
): Claim | null {
  return explanation?.claim ?? productClaim(product, goalsPrimaryFirst(answers))
}
