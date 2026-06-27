import type { QuizAnswers } from '@/lib/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { StackBlueprint } from './types'
import type { SlotOption, BlueprintAIResult } from '@/lib/ai-stack'
import { getApprovedClaims } from './approved-claims'
import { getArchetype, scoreProduct, type SlotType } from './factory'

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
    if (reason) next = { ...next, reason }
    return next
  })

  return { ...blueprint, slots, personalised: true }
}

/**
 * Asks the AI to personalise the blueprint's product choices and reasons via
 * /api/personalise-stack, falling back to the unchanged blueprint on any error
 * so the flow can never get stuck.
 */
export async function personaliseBlueprint(
  answers: QuizAnswers,
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
): Promise<StackBlueprint> {
  const slots = buildSlotOptions(blueprint, answers, catalogue)
  if (slots.length === 0) return blueprint

  try {
    const res = await fetch('/api/personalise-stack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, slots }),
    })
    if (!res.ok) throw new Error(`personalise-stack ${res.status}`)
    const data = (await res.json()) as BlueprintAIResult & { personalised: boolean }
    if (!data.personalised) return blueprint
    return applyBlueprintAIResult(blueprint, { choices: data.choices ?? {}, reasons: data.reasons ?? {} })
  } catch {
    return blueprint
  }
}
