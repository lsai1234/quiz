import type { QuizAnswers, Goal } from '@/lib/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { StackBlueprint, StackSlotEntry } from './types'
import { calculateStackPrice, calculateSubscriptionPrice } from './helpers'

const SLOT_ORDER = ['protein', 'performance', 'energy', 'hydration', 'recovery', 'health', 'sleep'] as const
type SlotType = typeof SLOT_ORDER[number]

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

const REQUIRED_SLOTS: SlotType[] = ['protein', 'performance']

const GOAL_STACK_NAMES: Record<Goal, string> = {
  muscle: 'Muscle Building Stack',
  energy: 'Energy & Performance Stack',
  performance: 'Performance Stack',
  hydration: 'Hydration Stack',
  recovery: 'Recovery Stack',
  health: 'General Health Stack',
  cutting: 'Fat Loss Stack',
  bulking: 'Bulk & Mass Stack',
}

const GOAL_SUMMARIES: Record<Goal, string> = {
  muscle: 'A targeted stack to support muscle growth, strength and recovery.',
  energy: 'A stack designed to boost your energy levels and training performance.',
  performance: 'A science-backed stack to enhance training performance and output.',
  hydration: 'A stack focused on maintaining optimal hydration during training.',
  recovery: 'A stack built around faster recovery and reduced muscle soreness.',
  health: 'A balanced stack to support everyday health and active living.',
  cutting: 'A lean stack to support fat loss while preserving muscle mass.',
  bulking: 'A high-calorie stack designed to support serious muscle and mass gain.',
}

function scoreProduct(product: CatalogueProduct, answers: QuizAnswers): number {
  let score = product.recommendationPriority * 10

  // Goal matches
  for (const goal of answers.goals) {
    if (product.goals.includes(goal)) {
      score += 15
    }
  }

  // Stimulant penalty
  if (product.hasStimulants && answers.stimPreference === 'no') {
    return -Infinity
  }

  // Vegan filter
  if (answers.lifestyle.includes('vegan') && !product.dietaryTags.includes('vegan')) {
    return -Infinity
  }

  // Already-taking penalty
  if (
    answers.currentSupplements.includes('protein') &&
    product.stackSlots.includes('protein')
  ) {
    score -= 20
  }
  if (
    answers.currentSupplements.includes('creatine') &&
    product.stackSlots.includes('performance')
  ) {
    score -= 20
  }
  if (
    answers.currentSupplements.includes('pre-workout') &&
    product.stackSlots.includes('energy')
  ) {
    score -= 20
  }

  return score
}

/**
 * Builds a StackBlueprint from quiz answers and the product catalogue.
 * Uses a scoring approach similar to the existing recommendation engine.
 */
export function buildStackBlueprint(
  answers: QuizAnswers,
  catalogue: CatalogueProduct[]
): StackBlueprint {
  const primaryGoal: Goal = answers.goals[0] ?? 'health'
  const secondaryGoals = answers.goals.slice(1)

  const slots: StackSlotEntry[] = []
  let displayOrder = 0

  for (const slotType of SLOT_ORDER) {
    const candidates = catalogue.filter(p => p.stackSlots.includes(slotType as any))
    if (candidates.length === 0) continue

    let bestProduct: CatalogueProduct | null = null
    let bestScore = -Infinity

    for (const product of candidates) {
      const score = scoreProduct(product, answers)
      if (score > bestScore) {
        bestScore = score
        bestProduct = product
      }
    }

    if (!bestProduct || bestScore < 0) continue

    const isRequired = REQUIRED_SLOTS.includes(slotType as SlotType)

    slots.push({
      slotId: `slot-${slotType}`,
      slotType: slotType as any,
      title: SLOT_TITLES[slotType as SlotType],
      description: SLOT_DESCRIPTIONS[slotType as SlotType],
      recommendedProductId: bestProduct.id,
      selectedProductId: bestProduct.id,
      selectedVariantId: null,
      required: isRequired,
      canRemove: !isRequired,
      canSwap: true,
      swapGroup: bestProduct.swapGroup,
      reason: bestProduct.shortReason,
      confidenceScore: Math.min(100, Math.max(0, bestScore)),
      displayOrder: displayOrder++,
    })
  }

  // Build partial blueprint to calculate prices
  const partialBlueprint: StackBlueprint = {
    id: Date.now().toString(36),
    stackName: GOAL_STACK_NAMES[primaryGoal] ?? 'Your Supplement Stack',
    summary: GOAL_SUMMARIES[primaryGoal] ?? 'A personalised supplement stack built around your goals.',
    primaryGoal,
    secondaryGoals,
    userProfileSummary: [
      answers.ageBracket,
      answers.gender,
      answers.trainingType ? `${answers.trainingType} training` : null,
      answers.trainingFrequency ? `${answers.trainingFrequency}/week` : null,
    ].filter(Boolean).join(', '),
    slots,
    estimatedOneOffPrice: 0,
    estimatedSubscriptionPrice: 0,
    savingsSummary: '',
    createdAt: new Date().toISOString(),
  }

  const oneOffPrice = calculateStackPrice(partialBlueprint, catalogue)
  const subscriptionPrice = calculateSubscriptionPrice(partialBlueprint, catalogue)
  const savings = Math.round((oneOffPrice - subscriptionPrice) * 100) / 100

  return {
    ...partialBlueprint,
    estimatedOneOffPrice: oneOffPrice,
    estimatedSubscriptionPrice: subscriptionPrice,
    savingsSummary: `Save £${savings.toFixed(2)}/month with a subscription`,
  }
}
