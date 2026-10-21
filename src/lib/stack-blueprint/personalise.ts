import type { QuizAnswers } from '@/lib/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { StackBlueprint } from './types'
import type { SlotOption, BlueprintAIResult } from '@/lib/ai-stack'
import { isInStock } from '@/lib/catalogue/filters'
import { getApprovedClaims } from './approved-claims'
import { getArchetype, scoreProduct, type SlotType } from './factory'
import { budgetCapFor, discountedOneOffTotal, unitCostOf, getPricingConfig, type PricingConfig } from './pricing'

const MAX_OPTIONS_PER_SLOT = 8

/**
 * For each slot, builds the list of eligible products the AI may choose from.
 * Eligibility reuses the factory's own hard gates (score > -Infinity means it
 * passed every hard gate — dietary, stimulant, already-taking, narrow-use
 * exclusions); the soft scoring ranking itself is left to the AI, which sees
 * the full gated pool and weighs goals/lifestyle/budget itself. Products
 * already chosen for other slots are excluded to avoid duplicates.
 */
export function buildSlotOptions(
  blueprint: StackBlueprint,
  answers: QuizAnswers,
  catalogue: CatalogueProduct[],
): SlotOption[] {
  const archetype = getArchetype(answers.goals)

  return blueprint.slots.map(slot => {
    const usedElsewhere = new Set(
      blueprint.slots.filter(s => s.slotId !== slot.slotId).map(s => s.selectedProductId),
    )

    // Out of stock is a hard gate here too. The AI only ever sees what it may
    // choose, so an unavailable option in this list is an unavailable product
    // in the finished stack — the engine's in-stock pick swapped out for one
    // that cannot ship. The current pick is exempt (and re-added below): it is
    // already in the stack, and dropping it silently would leave a slot the AI
    // has no way to write a reason for.
    const scored = catalogue
      .filter(p => p.stackSlots.includes(slot.slotType) && !usedElsewhere.has(p.id))
      .filter(p => isInStock(p) || p.id === slot.selectedProductId)
      .map(p => ({ p, score: scoreProduct(p, slot.slotType as SlotType, answers, archetype) }))
      .filter(({ p, score }) => score > -Infinity || p.id === slot.selectedProductId)
      .sort((a, b) => b.score - a.score)

    // Always keep the engine's current pick in the option set.
    if (!scored.some(({ p }) => p.id === slot.selectedProductId)) {
      const current = catalogue.find(p => p.id === slot.selectedProductId)
      if (current) scored.unshift({ p: current, score: 0 })
    }

    const options = scored.slice(0, MAX_OPTIONS_PER_SLOT).map(({ p }) => ({
      id: p.id,
      name: p.title,
      category: p.category,
      price: p.basePrice,
      vegan: p.dietaryTags.includes('vegan'),
      stimulant: p.hasStimulants,
      reason: p.shortReason || p.description,
      claims: getApprovedClaims(p.swapGroup),
    }))

    return {
      slotId: slot.slotId,
      title: slot.title,
      description: slot.description,
      currentProductId: slot.selectedProductId,
      options,
    }
  })
}

/**
 * Applies validated AI choices onto a blueprint, with no price cap. Choices are
 * only applied when they differ from the current pick and don't duplicate a
 * product already used in another slot. Returns a new blueprint marked
 * personalised.
 *
 * The same as `applyBlueprintAIResultWithinBudget` with no cap, which is what it
 * calls. Pass the catalogue so a swapped slot's reason can be about the product
 * it now holds; see `withProduct`.
 */
export function applyBlueprintAIResult(
  blueprint: StackBlueprint,
  result: BlueprintAIResult,
  catalogue: CatalogueProduct[] = [],
): StackBlueprint {
  return applyBlueprintAIResultWithinBudget(blueprint, result, catalogue, null)
}

/**
 * A slot after the AI's swap was taken.
 *
 * The AI writes no reason, so the slot's reason has to come from somewhere
 * else, and it cannot stay as the engine's: that sentence was written about
 * the product the AI replaced, and a reason under the wrong product is how a
 * sheet headed "Plant Protein" ends up explaining Vitamin C. The new product's
 * own catalogue line is used instead, the same text the engine falls back to
 * for a product it has no template for. A slot the AI left alone keeps the
 * engine's reason untouched.
 */
function withProduct(
  slot: StackBlueprint['slots'][number],
  productId: string,
  catalogue: CatalogueProduct[],
): StackBlueprint['slots'][number] {
  const product = catalogue.find(p => p.id === productId)
  const reason = product ? (product.shortReason || product.description || slot.reason) : slot.reason
  return { ...slot, selectedProductId: productId, selectedVariantId: null, reason }
}

/** The discounted one-off (price, cost) lines for a blueprint — mirrors how
 *  `calculatePricing` resolves each slot's price, so the budget check here lines
 *  up exactly with the reveal total. */
function oneOffLinesForBlueprint(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  config: PricingConfig,
): { price: number; cost: number }[] {
  const lines: { price: number; cost: number }[] = []
  for (const slot of blueprint.slots) {
    const product = catalogue.find(p => p.id === slot.selectedProductId)
    if (!product) continue
    const variant = slot.selectedVariantId ? product.variants.find(v => v.id === slot.selectedVariantId) : undefined
    const price = variant?.price ?? product.variants.find(v => v.available)?.price ?? product.basePrice
    lines.push({ price, cost: unitCostOf(product, price, config) })
  }
  return lines
}

/**
 * Applies AI choices, GATING every product swap against the bundle's hard price
 * cap: a swap is only kept if the stack's discounted one-off total stays within
 * the cap. Over-budget swaps are dropped (the engine's affordable pick is
 * retained). The engine blueprint is already within budget, so the result
 * always is too. With no cap (top tier) every valid swap is applied.
 *
 * Nothing the model wrote is applied: a result carries product ids only, and a
 * swapped slot's reason is the new product's catalogue line (`withProduct`).
 */
export function applyBlueprintAIResultWithinBudget(
  blueprint: StackBlueprint,
  result: BlueprintAIResult,
  catalogue: CatalogueProduct[],
  cap: number | null,
  config: PricingConfig = getPricingConfig(),
): StackBlueprint {
  const used = new Set(blueprint.slots.map(s => s.selectedProductId))
  const working = blueprint.slots.map(s => ({ ...s }))

  for (let i = 0; i < working.length; i++) {
    const slot = working[i]
    const choice = result.choices[slot.slotId]
    if (choice && choice !== slot.selectedProductId && !used.has(choice)) {
      const candidate = working.map((s, j) =>
        j === i ? { ...s, selectedProductId: choice, selectedVariantId: null } : s,
      )
      const total = cap == null
        ? 0
        : discountedOneOffTotal(oneOffLinesForBlueprint({ ...blueprint, slots: candidate }, catalogue, config), config)
      if (cap == null || total <= cap + 0.001) {
        used.delete(slot.selectedProductId)
        used.add(choice)
        working[i] = withProduct(slot, choice, catalogue)
      }
    }
  }

  return { ...blueprint, slots: working, personalised: true }
}

/**
 * Asks the AI to choose between each slot's eligible products via
 * /api/personalise-stack, falling back to the unchanged blueprint on any error
 * so the flow can never get stuck. Only the product ids in the reply are read.
 * AI swaps are gated to the bundle's hard price cap so personalisation can never
 * push the stack over budget.
 */
export async function personaliseBlueprint(
  answers: QuizAnswers,
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
): Promise<StackBlueprint> {
  const slots = buildSlotOptions(blueprint, answers, catalogue)
  if (slots.length === 0) return blueprint

  const config = getPricingConfig()
  const cap = budgetCapFor(answers.budget, config)

  try {
    const res = await fetch('/api/personalise-stack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, slots }),
    })
    if (!res.ok) throw new Error(`personalise-stack ${res.status}`)
    const data = (await res.json()) as Partial<BlueprintAIResult> & { personalised?: boolean }
    if (!data.personalised) return blueprint
    // Only `choices` is read, so a server still sending `reasons` (a deploy
    // mid-rollout) cannot put them on the page.
    return applyBlueprintAIResultWithinBudget(
      blueprint,
      { choices: data.choices ?? {} },
      catalogue,
      cap,
      config,
    )
  } catch {
    return blueprint
  }
}
