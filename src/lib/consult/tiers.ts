/**
 * A consult stack's depths on the results page (Amp Consult and offer plan,
 * Phase 5): the consult's own tiers and names, hero first, never re-tiered by
 * price band (`planTiers`).
 *
 *   Essentials  the consult's first three, Standard its first five, Complete
 *               seven or eight: what the engine built, in its order.
 *   Hero        first in each, as `consultOffer` puts it: anything of the same
 *               family comes out and each tier keeps its size.
 *   On screen   swaps follow the slot (the product picked in its place);
 *               products they added themselves are in every depth (as the
 *               quiz's anchors are); products they took out are gone.
 *   Prices      each depth's real total, through the same `calculatePricing`
 *               as the receipt. No band: Essentials costs what its three cost.
 *               The subscription minimum and the bundle discount apply as
 *               everywhere else, so a small depth can still read "Monthly
 *               unavailable".
 *
 * Two depths with the same products fold into one, the shallower kept (a
 * small consult stack can be three products in every tier).
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { calculatePricing, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import type { TierPlan } from '@/lib/stack-blueprint/tier-plan'
import type { StackBlueprint, StackSlotEntry } from '@/lib/stack-blueprint/types'
import type { QuizAnswers, StackLevel } from '@/lib/types'
import { heroFirst } from '@/lib/offer/select'

export type ConsultTiers = { essentials: string[]; standard: string[]; complete: string[] }

/** The consult's names for its depths, by stack level. */
export const CONSULT_TIER_LABEL: Record<StackLevel, string> = { essentials: 'Essentials', performance: 'Standard', complete: 'Complete' }

const LEVELS: [StackLevel, keyof ConsultTiers][] = [
  ['essentials', 'essentials'],
  ['performance', 'standard'],
  ['complete', 'complete'],
]

/** The tiers with the hero first, each keeping its size. */
export function consultTiersWithHero(tiers: ConsultTiers, heroId: string | null, sameKind?: (id: string) => boolean): ConsultTiers {
  if (!heroId) return tiers
  const ranked = heroFirst(tiers.complete, heroId, (id) => id !== heroId && Boolean(sameKind?.(id)))
  const size = (t: keyof ConsultTiers) => Math.min(Math.max(1, tiers[t].length), ranked.length)
  return { essentials: ranked.slice(0, size('essentials')), standard: ranked.slice(0, size('standard')), complete: ranked.slice(0, size('complete')) }
}

/** The slot on screen for a product the consult picked: itself, or what it was swapped for. */
function slotFor(id: string, slots: readonly StackSlotEntry[]): StackSlotEntry | undefined {
  return slots.find((s) => s.selectedProductId === id) ?? slots.find((s) => s.slotId === `slot-consult-${id}` || s.recommendedProductId === id)
}

export function consultTierPlans(input: {
  blueprint: StackBlueprint
  tiers: ConsultTiers
  heroId: string | null
  sameKind?: (id: string) => boolean
  catalogue: CatalogueProduct[]
  answers: QuizAnswers
  config?: PricingConfig
  priceOpts?: Parameters<typeof calculatePricing>[4]
}): TierPlan[] {
  const tiers = consultTiersWithHero(input.tiers, input.heroId, input.sameKind)
  const added = input.blueprint.slots.filter((s) => s.addedByUser === true)
  const plans: TierPlan[] = []
  for (const [level, key] of LEVELS) {
    const picked: StackSlotEntry[] = []
    for (const id of tiers[key]) {
      const slot = slotFor(id, input.blueprint.slots)
      if (slot && !picked.includes(slot)) picked.push(slot)
    }
    for (const slot of added) if (!picked.includes(slot)) picked.push(slot)
    if (picked.length === 0) continue
    const pricing = calculatePricing({ ...input.blueprint, slots: picked, level }, input.catalogue, input.answers, input.config, { ...input.priceOpts, level })
    plans.push({ level, slots: picked, monthly: pricing.subscriptionTotal, oneOff: pricing.oneOffTotal })
  }
  // A depth with exactly the products of the one before it is not a choice.
  const shown: TierPlan[] = []
  for (const plan of plans) {
    const prev = shown[shown.length - 1]
    const same = prev && prev.slots.length === plan.slots.length && prev.slots.every((s) => plan.slots.includes(s))
    if (!same) shown.push(plan)
  }
  return shown
}
