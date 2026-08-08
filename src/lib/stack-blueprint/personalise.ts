import type { QuizAnswers } from '@/lib/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { StackBlueprint } from './types'
import type { SlotOption, BlueprintAIResult } from '@/lib/ai-stack'
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

    const scored = catalogue
      .filter(p => p.stackSlots.includes(slot.slotType) && !usedElsewhere.has(p.id))
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
 * Applies validated AI choices + reasons onto a blueprint. Choices are only
 * applied when they differ from the current pick and don't duplicate a product
 * already used in another slot. Returns a new blueprint marked personalised.
 *
 * A reason is only kept when the slot ends up holding the product that reason
 * was written about — see `reasonAppliesTo`.
 */
export function applyBlueprintAIResult(
  blueprint: StackBlueprint,
  result: BlueprintAIResult,
): StackBlueprint {
  const used = new Set(blueprint.slots.map(s => s.selectedProductId))

  const slots = blueprint.slots.map(slot => {
    const choice = result.choices[slot.slotId]
    const reason = result.reasons[slot.slotId]
    let next = slot

    if (choice && choice !== slot.selectedProductId && !used.has(choice)) {
      used.delete(slot.selectedProductId)
      used.add(choice)
      next = { ...next, selectedProductId: choice, selectedVariantId: null }
    }
    if (reason && reasonAppliesTo(choice, next.selectedProductId)) next = { ...next, reason }
    return next
  })

  return { ...blueprint, slots, personalised: true }
}

/**
 * Whether the AI's reason for a slot describes the product the slot actually
 * ended up with.
 *
 * The AI answers per slot with a product *and* the sentence explaining why that
 * product suits this person. The two are one answer, not two: "a budget-friendly
 * choice that supports Lewis's immune resilience" is only true of the product it
 * was written for. When we reject the AI's pick — because it duplicates another
 * slot, or because it would break the budget cap — its sentence has to go with
 * it, or the sheet shows one product's name above another product's
 * justification. The slot keeps the engine's own reason, which is always about
 * the product that's actually there.
 *
 * No choice for the slot means the AI was writing about the current pick, so the
 * reason stands.
 */
function reasonAppliesTo(choice: string | undefined, selectedProductId: string): boolean {
  return !choice || choice === selectedProductId
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
 * Applies AI choices + reasons like `applyBlueprintAIResult`, but GATES every
 * product swap against the bundle's hard price cap: a swap is only kept if the
 * stack's discounted one-off total stays within the cap. Over-budget swaps are
 * dropped (the engine's affordable pick is retained), and the AI's reason for
 * that slot is dropped with it — it describes the product we didn't take. The
 * engine blueprint is already within budget, so the result always is too. With
 * no cap (top tier) this behaves exactly like the ungated apply.
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
        working[i] = { ...slot, selectedProductId: choice, selectedVariantId: null }
      }
    }
    const reason = result.reasons[slot.slotId]
    if (reason && reasonAppliesTo(choice, working[i].selectedProductId)) {
      working[i] = { ...working[i], reason }
    }
  }

  return { ...blueprint, slots: working, personalised: true }
}

/**
 * Asks the AI to personalise the blueprint's product choices and reasons via
 * /api/personalise-stack, falling back to the unchanged blueprint on any error
 * so the flow can never get stuck. AI swaps are gated to the bundle's hard price
 * cap so personalisation can never push the stack over budget.
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
    const data = (await res.json()) as BlueprintAIResult & { personalised: boolean }
    if (!data.personalised) return blueprint
    return applyBlueprintAIResultWithinBudget(
      blueprint,
      { choices: data.choices ?? {}, reasons: data.reasons ?? {} },
      catalogue,
      cap,
      config,
    )
  } catch {
    return blueprint
  }
}
