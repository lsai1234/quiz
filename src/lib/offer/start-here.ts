/**
 * "Start here" for the read's story (Amp Consult and offer plan, Phase 8): the
 * hero, the classics in the depth the results page opens on, and the free
 * bonus when that depth qualifies for one.
 *
 * Worked out with exactly the helpers the results page uses (`chooseHero`
 * with `dealPerson`, `withHeroFirst`, `consultTierPlans`, `chooseBonus` on the
 * depth's products as priced), so the story never shows a gift, or a stack,
 * the page then doesn't. No code, no partner claim: the story comes straight
 * after the charge-up, before either can be applied.
 *
 * Claims are the approved ones, verbatim: the hero's own, and each classic's
 * from the consult's read (`read.products`), or none.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { consultTierPlans, type ConsultTiers } from '@/lib/consult/tiers'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { withHeroFirst } from '@/lib/stack-blueprint/offer'
import { tierPlanFor } from '@/lib/stack-blueprint/tier-plan'
import type { StackBlueprint } from '@/lib/stack-blueprint/types'
import type { Goal, QuizAnswers, StackLevel } from '@/lib/types'
import { dealPerson } from './results'
import { chooseBonus, chooseHero, costedItemsFor, heroReason, personFromSnapshot, type OfferInputs, type PersonSnapshot } from './select'
import type { OfferSettings } from './settings'
import { CLAIMS } from '@/lib/consult/claims'

/** A claim id as its approved wording, verbatim; null for none, or an id that isn't one. */
const wordingOf = (id: string | null) => (id ? (CLAIMS[id]?.wording ?? null) : null)

export interface StartHereItem {
  product: CatalogueProduct
  /** The approved claim, verbatim, or null. */
  claim: string | null
}

export interface StartHere {
  hero: StartHereItem | null
  classics: StartHereItem[]
  /** The free bonus for this depth, when it qualifies; never priced in. */
  gift: CatalogueProduct | null
  level: StackLevel
}

/** The depth the results page opens on (the store's default). */
export const OPENING_LEVEL: StackLevel = 'performance'

export function startHere(input: {
  blueprint: StackBlueprint
  tiers: ConsultTiers
  snapshot: PersonSnapshot | undefined
  catalogue: CatalogueProduct[]
  answers: QuizAnswers
  settings: OfferSettings
  /** The consult's read: each product's claim, by id (`read.products`). */
  claims: Record<string, { claim: string | null }>
  level?: StackLevel
  /** YYYY-MM-DD; today unless a test says otherwise, as on the results page. */
  today?: string
}): StartHere {
  const config = getPricingConfig()
  const inputs: OfferInputs = { settings: input.settings, catalogue: input.catalogue, config, today: input.today }
  const person = input.snapshot ? personFromSnapshot(input.snapshot) : null
  const choice = person ? chooseHero(inputs, dealPerson(person, config)) : null
  const primary = input.answers.primaryGoal ?? input.blueprint.primaryGoal
  const goals = [primary, ...(input.answers.goals ?? []).filter((g) => g !== primary)].filter(Boolean) as Goal[]
  const reason = choice ? heroReason(choice, goals) : null
  const kind = choice ? input.snapshot?.[choice.product.id]?.kind : undefined
  const sameKind = input.snapshot && kind ? (id: string) => input.snapshot![id]?.kind === kind : undefined
  const blueprint = choice && reason ? withHeroFirst(input.blueprint, choice, reason, sameKind) : input.blueprint
  const plans = consultTierPlans({ blueprint, tiers: input.tiers, heroId: choice?.product.id ?? null, sameKind, catalogue: input.catalogue, answers: input.answers })
  if (!plans.length) return { hero: null, classics: [], gift: null, level: input.level ?? OPENING_LEVEL }
  const plan = tierPlanFor(plans, input.level ?? OPENING_LEVEL)
  const byId = new Map(input.catalogue.map((p) => [p.id, p]))
  const classics = plan.slots
    .map((s) => byId.get(s.selectedProductId))
    .filter((p): p is CatalogueProduct => Boolean(p) && p!.id !== choice?.product.id)
    .map((product) => ({ product, claim: wordingOf(input.claims[product.id]?.claim ?? null) }))
  const bonus = person
    ? chooseBonus(inputs, person, { level: plan.level, items: costedItemsFor(plan.slots.map((s) => ({ productId: s.selectedProductId, variantId: s.selectedVariantId })), input.catalogue) })
    : null
  return {
    hero: choice ? { product: choice.product, claim: choice.claim?.wording ?? null } : null,
    classics,
    gift: bonus?.choice?.product ?? null,
    level: plan.level,
  }
}
