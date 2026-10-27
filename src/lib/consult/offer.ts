/**
 * The consult's adapter to the offer (plan Phase 3): what "kept out" and
 * "fits" mean for a consult, and where the hero and the bonus go in its tiers.
 *
 *   Kept out  `consultGate`, the engine's own: the circuit check, caffeine and
 *             stimulant keep-outs (a sleep goal, the caffeine ceiling, 65 and
 *             over), what a confirmed pattern keeps out, plant-based plates,
 *             the tailoring swaps and the shelf. Plus the engine's one rule
 *             that isn't per product: one caffeine source in a stack.
 *   Fits      How much of their needs it meets (`needsFit`).
 *   Tiers     The hero goes first; anything of the same family comes out, and
 *             each tier keeps its size, so Essentials is still three products.
 *
 * With the hero switch off, or no approved hero that fits, the tiers come back
 * exactly as the engine made them and `hero` is null: the results page keeps
 * today's top pick.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import type { StackLevel } from '@/lib/types'
import { chooseBonus, chooseHero, costedItemsFor, heroFirst, heroReason, type BonusOutcome, type HeroChoice, type HeroReason, type OfferInputs, type PersonFit } from '@/lib/offer/select'
import { GOAL_TO_QUIZ } from './adapter'
import { consultGate, needsFit, scoreNeeds, type EngineResult } from './engine'
import { SHELF_CAFFEINE, familyOf, ingredientsOf } from './knowledge'
import type { ConsultAnswers } from './types'

export type ConsultTier = keyof EngineResult['tiers']
/** The consult's tier names, as the offer's stack levels. */
export const LEVEL_OF: Record<ConsultTier, StackLevel> = { essentials: 'essentials', standard: 'performance', complete: 'complete' }
const TIERS: ConsultTier[] = ['essentials', 'standard', 'complete']

export function consultPerson(a: ConsultAnswers, stack: readonly CatalogueProduct[]): PersonFit {
  const gate = consultGate(a)
  const needs = scoreNeeds(a)
  const caffeinated = (p: CatalogueProduct) => ingredientsOf(p).has('caffeine')
  const shelfCaffeine = (a.shelf ?? []).some((s) => SHELF_CAFFEINE.includes(s))
  return {
    keepOut(product) {
      const out = gate.keepOut(product)
      if (out) return out
      if (caffeinated(product) && (shelfCaffeine || stack.some((p) => p.id !== product.id && caffeinated(p)))) {
        return shelfCaffeine ? 'your pre-workout is already a caffeine source' : 'one caffeine source is enough'
      }
      return null
    },
    fit: (product) => needsFit(product, needs),
  }
}

export interface ConsultOffer {
  /** The approved hero, or null: the page keeps today's top pick. */
  hero: { choice: HeroChoice; reason: HeroReason } | null
  /** The tiers, hero first when there is one; exactly the engine's otherwise. */
  tiers: EngineResult['tiers']
  bonuses: Record<ConsultTier, BonusOutcome>
}

export function consultOffer(input: {
  answers: ConsultAnswers
  engine: Pick<EngineResult, 'tiers'>
  catalogue: readonly CatalogueProduct[]
  settings: OfferInputs['settings']
  today?: string
  config?: OfferInputs['config']
}): ConsultOffer {
  const inputs: OfferInputs = { settings: input.settings, catalogue: input.catalogue, today: input.today, config: input.config ?? getPricingConfig() }
  const byId = new Map(input.catalogue.map((p) => [p.id, p]))
  const productsOf = (ids: readonly string[]) => ids.map((id) => byId.get(id)).filter((p): p is CatalogueProduct => Boolean(p))

  const person = consultPerson(input.answers, productsOf(input.engine.tiers.complete))
  const choice = chooseHero(inputs, person)

  let tiers = input.engine.tiers
  let hero: ConsultOffer['hero'] = null
  if (choice) {
    const family = familyOf(choice.product)
    const ranked = heroFirst(input.engine.tiers.complete, choice.product.id, (id) => {
      const p = byId.get(id)
      return Boolean(p) && familyOf(p!) === family
    })
    const size = (t: ConsultTier) => Math.min(input.engine.tiers[t].length, ranked.length)
    tiers = { essentials: ranked.slice(0, size('essentials')), standard: ranked.slice(0, size('standard')), complete: ranked.slice(0, size('complete')) }
    const goals = [...new Set(input.answers.goals.map((g) => GOAL_TO_QUIZ[g]))]
    hero = { choice, reason: heroReason(choice, goals) }
  }

  // The bonus is judged against the tier as it now stands, hero included.
  const tierPerson = consultPerson(input.answers, productsOf(tiers.complete))
  const bonuses = Object.fromEntries(
    TIERS.map((t) => [t, chooseBonus(inputs, tierPerson, { level: LEVEL_OF[t], items: costedItemsFor(tiers[t].map((productId) => ({ productId })), input.catalogue) })]),
  ) as Record<ConsultTier, BonusOutcome>

  return { hero, tiers, bonuses }
}
