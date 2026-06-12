// MVP scoring rules — replace with ML-based scoring in v2

import type { QuizAnswers, Goal } from '@/lib/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { StackBlueprint, StackSlotEntry } from './types'
import { calculateStackPrice, calculateSubscriptionPrice } from './helpers'

const SLOT_ORDER = ['protein', 'performance', 'energy', 'hydration', 'recovery', 'health', 'sleep'] as const
type SlotType = typeof SLOT_ORDER[number]

type Archetype = 'muscle' | 'fat-loss' | 'performance' | 'health'

const SLOT_TITLES: Record<SlotType, string> = {
  protein: 'Protein',
  performance: 'Performance',
  energy: 'Energy / Pre-Workout',
  hydration: 'Hydration',
  recovery: 'Recovery',
  health: 'Health',
  sleep: 'Sleep',
}

const SLOT_DESCRIPTIONS: Record<SlotType, string> = {
  protein: 'Builds and repairs muscle tissue',
  performance: 'Increases strength and power output',
  energy: 'Boosts energy and focus before training',
  hydration: 'Maintains fluid and electrolyte balance',
  recovery: 'Speeds up repair and reduces soreness',
  health: 'Supports general health and wellbeing',
  sleep: 'Improves sleep quality and overnight recovery',
}

const SLOT_DEFAULT_REASONS: Record<SlotType, string> = {
  protein: 'Supports muscle repair and daily protein targets',
  performance: 'Builds strength and power over time — take daily',
  energy: 'Pre-workout energy and focus without the crash',
  hydration: 'Replaces electrolytes lost during training',
  recovery: 'Supports muscle recovery between sessions',
  health: 'Covers everyday vitamin and mineral gaps',
  sleep: 'Helps you wind down and sleep deeper',
}

const REQUIRED_SLOTS: SlotType[] = ['protein', 'performance']

function getArchetype(goals: Goal[]): Archetype {
  if (goals.includes('muscle') || goals.includes('bulking')) return 'muscle'
  if (goals.includes('cutting')) return 'fat-loss'
  if (goals.includes('performance') || goals.includes('energy')) return 'performance'
  return 'health'
}

function getStackName(archetype: Archetype, trainingFrequency: string | null): string {
  const highFreq = trainingFrequency === '5-6x' || trainingFrequency === 'daily'
  const names: Record<Archetype, [string, string]> = {
    'muscle':      ['Performance Core Stack', 'Strength Engine Stack'],
    'fat-loss':    ['Lean Power Stack', 'Fat Loss Protocol'],
    'performance': ['Endurance Edge Stack', 'Athletic Performance Stack'],
    'health':      ['Daily Charge Stack', 'Foundation Health Stack'],
  }
  return highFreq ? names[archetype][0] : names[archetype][1]
}

const ARCHETYPE_SUMMARIES: Record<Archetype, string> = {
  'muscle':      'Built to maximise muscle growth, strength, and recovery.',
  'fat-loss':    'Designed to support fat loss while preserving lean muscle.',
  'performance': 'Optimised for endurance, energy, and athletic output.',
  'health':      'A smart daily foundation for energy, recovery, and long-term health.',
}

function scoreProduct(
  product: CatalogueProduct,
  slotType: SlotType,
  answers: QuizAnswers,
  archetype: Archetype,
): number {
  let score = product.recommendationPriority * 10

  // Goal overlap
  const goalOverlap = answers.goals.filter(g => product.goals.includes(g)).length
  score += goalOverlap * 15

  // Stimulant skip
  if (product.hasStimulants && (answers.stimPreference === 'no' || answers.caffeineLevel === 'none')) {
    return -Infinity
  }

  // Vegan filter
  if (answers.lifestyle.includes('vegan') && !product.dietaryTags.includes('vegan')) {
    return -Infinity
  }

  // Gluten-free filter (answers.dietary is an optional extension not in the base QuizAnswers type)
  const dietary = (answers as unknown as { dietary?: string[] }).dietary
  if (dietary?.includes('gluten-free') && !product.dietaryTags.includes('gluten-free')) {
    return -Infinity
  }

  // Already-taking penalties
  if (answers.currentSupplements.includes('protein') && slotType === 'protein') score -= 25
  if (answers.currentSupplements.includes('creatine') && slotType === 'performance') score -= 25
  if (answers.currentSupplements.includes('pre-workout') && slotType === 'energy') score -= 25

  // Archetype boosts
  if (archetype === 'muscle' && (slotType === 'protein' || slotType === 'performance')) score += 20
  if (archetype === 'fat-loss' && (slotType === 'energy' || slotType === 'health')) score += 15
  if (archetype === 'health' && (slotType === 'health' || slotType === 'sleep' || slotType === 'recovery')) score += 15

  // Budget sensitivity
  if (answers.budget === 'under-50' && product.basePrice > 30) score -= 15

  return score
}

/**
 * Builds a StackBlueprint from quiz answers and the product catalogue.
 * Uses archetype-based scoring to select the best product for each slot.
 */
export function buildStackBlueprint(
  answers: QuizAnswers,
  catalogue: CatalogueProduct[]
): StackBlueprint {
  const primaryGoal: Goal = answers.goals[0] ?? 'health'
  const secondaryGoals = answers.goals.slice(1)

  const archetype = getArchetype(answers.goals)
  const stackName = getStackName(archetype, answers.trainingFrequency)
  const summary = ARCHETYPE_SUMMARIES[archetype]

  const slots: StackSlotEntry[] = []
  let displayOrder = 0

  for (const slotType of SLOT_ORDER) {
    const candidates = catalogue.filter(p => p.stackSlots.includes(slotType as any))
    if (candidates.length === 0) continue

    let bestProduct: CatalogueProduct | null = null
    let bestScore = -Infinity

    for (const product of candidates) {
      const score = scoreProduct(product, slotType, answers, archetype)
      if (score > bestScore) {
        bestScore = score
        bestProduct = product
      }
    }

    if (!bestProduct || bestScore < 0) continue

    const isRequired = REQUIRED_SLOTS.includes(slotType as SlotType)

    // Default variant selection: first available variant
    const firstAvailableVariant = bestProduct.variants.find(v => v.available) ?? null
    const selectedVariantId = firstAvailableVariant?.id ?? null

    const reason = bestProduct.shortReason || SLOT_DEFAULT_REASONS[slotType]

    slots.push({
      slotId: `slot-${slotType}`,
      slotType: slotType as any,
      title: SLOT_TITLES[slotType as SlotType],
      description: SLOT_DESCRIPTIONS[slotType as SlotType],
      recommendedProductId: bestProduct.id,
      selectedProductId: bestProduct.id,
      selectedVariantId,
      required: isRequired,
      canRemove: !isRequired,
      canSwap: true,
      swapGroup: bestProduct.swapGroup,
      reason,
      confidenceScore: Math.min(100, Math.max(0, Math.round(bestScore / 2))),
      displayOrder: displayOrder++,
    })
  }

  const userProfileSummary = [
    answers.ageBracket,
    answers.trainingType ? `${answers.trainingType} training` : null,
    answers.trainingFrequency ? `${answers.trainingFrequency}/week` : null,
  ].filter(Boolean).join(', ')

  // Build partial blueprint to calculate prices
  const partialBlueprint: StackBlueprint = {
    id: Date.now().toString(36),
    stackName,
    summary,
    primaryGoal,
    secondaryGoals,
    userProfileSummary,
    slots,
    estimatedOneOffPrice: 0,
    estimatedSubscriptionPrice: 0,
    savingsSummary: '',
    createdAt: new Date().toISOString(),
  }

  const oneOffPrice = calculateStackPrice(partialBlueprint, catalogue)
  const subscriptionPrice = calculateSubscriptionPrice(partialBlueprint, catalogue)
  const savings = Math.round((oneOffPrice - subscriptionPrice) * 100) / 100

  const savingsSummary = savings >= 1
    ? `Save £${savings.toFixed(2)}/month with a subscription`
    : 'Subscription pricing available on selected products.'

  return {
    ...partialBlueprint,
    estimatedOneOffPrice: oneOffPrice,
    estimatedSubscriptionPrice: subscriptionPrice,
    savingsSummary,
  }
}
