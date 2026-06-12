// MVP scoring rules — replace with ML-based scoring in v2

import type { QuizAnswers, Goal } from '@/lib/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
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
  if ((answers.budget === 'under-30' || answers.budget === '30-50') && product.basePrice > 30) score -= 15

  return score
}

function buildPersonalisedReason(
  product: CatalogueProduct,
  slotType: SlotType,
  answers: QuizAnswers,
  archetype: Archetype,
): string {
  const base = product.shortReason || SLOT_DEFAULT_REASONS[slotType]
  const name = answers.name ? answers.name.split(' ')[0] : null
  const goalOverlap = answers.goals.filter(g => product.goals.includes(g))
  const freq = answers.trainingFrequency

  // Build a personalised suffix based on the user's profile
  const suffixes: string[] = []

  if (slotType === 'protein') {
    if (archetype === 'muscle') suffixes.push('— essential for the muscle-building phase you\'re targeting')
    else if (archetype === 'fat-loss') suffixes.push('— keeps you full and preserves muscle while in a deficit')
    else if (goalOverlap.includes('recovery')) suffixes.push('— speeds up repair between your sessions')
    if (freq === '5-6x' || freq === 'daily') suffixes.push('at high training frequency your protein needs are elevated')
  } else if (slotType === 'performance') {
    if (archetype === 'muscle') suffixes.push('— creatine is the most-studied strength supplement available')
    else if (goalOverlap.includes('performance')) suffixes.push('— directly supports the performance gains you\'re after')
    else suffixes.push('— daily loading improves power output over 2–4 weeks')
  } else if (slotType === 'energy') {
    if (answers.caffeineLevel === 'high') suffixes.push('— formulated for athletes with a high stimulant tolerance')
    else if (answers.caffeineLevel === 'none' || answers.stimPreference === 'no') suffixes.push('— stim-free so you stay in control of your caffeine')
    else if (goalOverlap.includes('energy')) suffixes.push('— matched to your goal of higher energy output')
  } else if (slotType === 'hydration') {
    if (freq === '5-6x' || freq === 'daily') suffixes.push('— daily training at your level means electrolyte loss is significant')
    else if (goalOverlap.includes('hydration')) suffixes.push('— directly addresses the hydration goal you flagged')
  } else if (slotType === 'recovery') {
    if (freq === '5-6x' || freq === 'daily') suffixes.push('— training this frequently, recovery is your biggest performance lever')
    else if (goalOverlap.includes('recovery')) suffixes.push('— picked because recovery is one of your stated priorities')
  } else if (slotType === 'health') {
    if (answers.lifestyle.includes('desk-job')) suffixes.push('— particularly useful if you spend long hours at a desk')
    else if (answers.lifestyle.includes('high-stress')) suffixes.push('— supports immunity and energy under high stress')
    else suffixes.push('— covers the micronutrient gaps most active people have')
  } else if (slotType === 'sleep') {
    if (answers.lifestyle.includes('poor-sleep')) suffixes.push('— added because you flagged sleep as a problem area')
    else suffixes.push('— quality sleep is when most muscle repair actually happens')
  }

  const suffix = suffixes.length > 0 ? ` ${suffixes[0]}` : ''
  const greeting = name ? `Chosen for ${name}${suffix}` : null

  return greeting ?? `${base}${suffix}`
}

/**
 * Builds a StackBlueprint from quiz answers and the product catalogue.
 * Uses archetype-based scoring to select the best product for each slot.
 */
export function buildStackBlueprint(
  answers: QuizAnswers,
  catalogue: CatalogueProduct[]
): StackBlueprint {
  // If the provided catalogue has no slot coverage (e.g. Shopify products without
  // slot:* tags), fall back to the mock catalogue so slots are always populated.
  const hasSlotCoverage = catalogue.some(p => p.stackSlots.length > 0)
  const effectiveCatalogue = hasSlotCoverage ? catalogue : MOCK_CATALOGUE

  const primaryGoal: Goal = answers.goals[0] ?? 'health'
  const secondaryGoals = answers.goals.slice(1)

  const archetype = getArchetype(answers.goals)
  const stackName = getStackName(archetype, answers.trainingFrequency)
  const summary = ARCHETYPE_SUMMARIES[archetype]

  const slots: StackSlotEntry[] = []
  let displayOrder = 0

  for (const slotType of SLOT_ORDER) {
    const candidates = effectiveCatalogue.filter(p => p.stackSlots.includes(slotType as any))
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

    const reason = buildPersonalisedReason(bestProduct, slotType as SlotType, answers, archetype)

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

  const oneOffPrice = calculateStackPrice(partialBlueprint, effectiveCatalogue)
  const subscriptionPrice = calculateSubscriptionPrice(partialBlueprint, effectiveCatalogue)
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
