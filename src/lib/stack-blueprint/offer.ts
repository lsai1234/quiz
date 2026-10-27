/**
 * The quiz's adapter to the offer (plan Phase 3): what "kept out" and "fits"
 * mean for the quiz's answers, and where the hero goes in its stack.
 *
 *   Kept out  The engine's own hard gates (`scoreProductDetailed` →
 *             `excludedBy`: safety flags, goal gates, stimulants, vegan,
 *             gluten-free, already taking, veggie collagen), and the shared
 *             safety check the subscription's swaps use (`meetsSafetyConstraints`),
 *             so nothing the swap job would refuse can be the hero or the bonus.
 *   Fits      The engine's score, but only for a product that serves one of
 *             their goals or is foundational: a score that is only priority
 *             points is not a fit (the same line the engine draws with its
 *             no-goal floor).
 *   Stack     The hero is the first slot, an anchor, so `planTiers` puts it in
 *             every depth. If the stack already has one of its kind, the hero
 *             takes that place rather than sitting beside it.
 *
 * With the hero switch off, or no approved hero that fits, the blueprint comes
 * back untouched and `hero` is null: the page keeps today's top pick.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { meetsSafetyConstraints, safetyConstraintsFrom } from '@/lib/changes/safety'
import { withDeepDiveSignals } from '@/lib/ai-questions'
import { explainProductSafe } from '@/lib/results/explain'
import type { QuizAnswers, StackLevel } from '@/lib/types'
import { chooseBonus, chooseHero, costedItemsFor, heroReason, type BonusOutcome, type HeroChoice, type HeroReason, type OfferInputs, type PersonFit } from '@/lib/offer/select'
import { getArchetype, scoreProductDetailed, type SlotType } from './factory'
import { getPricingConfig } from './pricing'
import { planTiers, type TierPlan } from './tier-plan'
import type { StackBlueprint, StackSlotEntry } from './types'

const slotOf = (p: CatalogueProduct) => (p.stackSlots[0] ?? 'health') as SlotType

export function quizPerson(answers: QuizAnswers): PersonFit {
  const scored = withDeepDiveSignals(answers)
  const archetype = getArchetype(scored.goals ?? [])
  const constraints = safetyConstraintsFrom(answers)
  const detail = (p: CatalogueProduct) => scoreProductDetailed(p, slotOf(p), scored, archetype)
  return {
    keepOut(product) {
      const d = detail(product)
      if (d.excludedBy) return d.excludedBy.reason
      if (!meetsSafetyConstraints(product, constraints)) return 'safety'
      return null
    },
    fit(product) {
      const d = detail(product)
      if (d.excludedBy) return 0
      const servesAGoal = d.contributions.some((c) => c.field === 'goals' && c.points > 0)
      const floored = d.contributions.some((c) => c.rule === 'noGoalFloor')
      return servesAGoal || !floored ? Math.max(0, d.score) : 0
    },
  }
}

/** The blueprint with the hero as its first slot, an anchor; one of its kind already there gives up its place. */
export function withHeroFirst(blueprint: StackBlueprint, hero: HeroChoice, reason: HeroReason): StackBlueprint {
  const p = hero.product
  const variant = p.variants.find((v) => v.id === p.defaultVariantId && v.available) ?? p.variants.find((v) => v.available) ?? p.variants[0]
  const replaced = blueprint.slots.find((s) => s.selectedProductId === p.id) ?? blueprint.slots.find((s) => s.swapGroup === p.swapGroup)
  const heroSlot: StackSlotEntry = {
    slotId: replaced?.slotId ?? `slot-hero-${p.id}`,
    slotType: replaced?.slotType ?? slotOf(p),
    title: replaced?.title ?? 'Your hero',
    description: p.description,
    recommendedProductId: p.id,
    selectedProductId: p.id,
    selectedVariantId: variant?.id ?? null,
    swapGroup: p.swapGroup,
    // The core offer: in every depth, never quietly dropped or swapped out.
    required: true,
    canRemove: false,
    canSwap: false,
    reason: reason.line ?? '',
    confidenceScore: replaced?.confidenceScore ?? 100,
    displayOrder: 0,
    hero: true,
  }
  const rest = [...blueprint.slots]
    .filter((s) => s !== replaced)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((s, i) => ({ ...s, displayOrder: i + 1 }))
  return { ...blueprint, slots: [heroSlot, ...rest] }
}

export interface QuizOffer {
  /** The approved hero, or null: the page keeps today's top pick. */
  hero: { choice: HeroChoice; reason: HeroReason } | null
  /** The blueprint, hero first when there is one; the very same object otherwise. */
  blueprint: StackBlueprint
  tiers: TierPlan[]
  bonuses: Record<StackLevel, BonusOutcome>
}

export function quizOffer(input: {
  answers: QuizAnswers
  blueprint: StackBlueprint
  catalogue: CatalogueProduct[]
  settings: OfferInputs['settings']
  today?: string
  config?: OfferInputs['config']
}): QuizOffer {
  const config = input.config ?? getPricingConfig()
  const inputs: OfferInputs = { settings: input.settings, catalogue: input.catalogue, today: input.today, config }
  const person = quizPerson(input.answers)
  const choice = chooseHero(inputs, person)

  let blueprint = input.blueprint
  let hero: QuizOffer['hero'] = null
  if (choice) {
    const explained = explainProductSafe({ product: choice.product, slotType: slotOf(choice.product), answers: input.answers })
    const reason = heroReason(choice, input.answers.goals ?? [], explained?.kind === 'answer' ? explained.sentence : null)
    blueprint = withHeroFirst(input.blueprint, choice, reason)
    hero = { choice, reason }
  }

  const tiers = planTiers(blueprint, input.catalogue, input.answers, config)
  const bonuses = Object.fromEntries(
    (['essentials', 'performance', 'complete'] as StackLevel[]).map((level) => {
      const plan = tiers.find((t) => t.level === level)
      const items = plan ? costedItemsFor(plan.slots.map((s) => ({ productId: s.selectedProductId, variantId: s.selectedVariantId })), input.catalogue) : []
      return [level, plan ? chooseBonus(inputs, person, { level, items }) : { choice: null, blocked: 'tier' as const }]
    }),
  ) as Record<StackLevel, BonusOutcome>

  return { hero, blueprint, tiers, bonuses }
}
