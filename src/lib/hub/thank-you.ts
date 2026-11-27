/**
 * Thank-you gifts: a product the founders pick, free in a member's third box and
 * their sixth (Settings → Offer → For members on a plan).
 *
 * A gift rather than a discount: a product with a £15 shop price costs us about
 * half that, where £15 off a bill costs all of it. On a schedule rather than at
 * random: a cheaper month nobody expected reads as a mistake, and the founders
 * know what each one costs. Counted in boxes that actually go (`boxesSent`), so
 * a skipped month doesn't bring it forward or push it past.
 *
 * A gift only goes to someone it suits: a product their answers rule out
 * (`meetsSafetyConstraints`), one that's sold out, or one already on their plan
 * is left out rather than swapped for something else nobody chose. Pure.
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { PlanPerkSettings } from '@/lib/offer/settings'
import { constraintsFor, meetsSafetyConstraints } from '@/lib/changes/safety'

export interface ThankYouGift {
  box: number
  product: CatalogueProduct
  variant: CatalogueVariant
}

/** The gift for a member's box number `box`, or null when there isn't one (or it doesn't suit them). */
export function thankYouFor(
  sub: MemberSubscription,
  box: number,
  settings: PlanPerkSettings['gifts'],
  catalogue: readonly CatalogueProduct[],
): ThankYouGift | null {
  if (!settings.on || sub.status === 'cancelled') return null
  const milestone = settings.milestones.find((m) => m.box === box && m.productId)
  if (!milestone) return null
  const product = catalogue.find((p) => p.id === milestone.productId)
  if (!product) return null
  const variant = (milestone.variantId ? product.variants.find((v) => v.id === milestone.variantId) : undefined) ?? product.variants.find((v) => v.available)
  if (!variant || !variant.available) return null
  if (sub.lines.some((l) => l.productId === product.id)) return null
  if (!meetsSafetyConstraints(product, constraintsFor(sub))) return null
  return { box, product, variant }
}

/** The number the next box that goes will be (the box after the last one counted). */
export function nextBoxNumber(sub: Pick<MemberSubscription, 'boxesSent'>): number {
  return (sub.boxesSent ?? 0) + 1
}
