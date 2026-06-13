// MVP scoring rules — replace with ML-based scoring in v2

import type { QuizAnswers, Goal } from '@/lib/types'
import { PERFORMANCE_GOALS } from '@/lib/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { StackBlueprint, StackSlotEntry } from './types'
import { calculateStackPrice, calculateSubscriptionPrice } from './helpers'

const SLOT_ORDER = ['protein', 'performance', 'energy', 'hydration', 'recovery', 'health', 'sleep'] as const
type SlotType = typeof SLOT_ORDER[number]

// Wellbeing stacks are built goal-first: each selected wellbeing goal gets its
// own named slot, filled by the best product tagged with that goal. This means
// the final stack mirrors exactly what the user asked for instead of generic
// slot types.
const WELLBEING_GOAL_SLOTS: Array<{ goal: Goal; slotType: SlotType; title: string; description: string }> = [
  { goal: 'sleep-better',    slotType: 'sleep',    title: 'Sleep',               description: 'Improves sleep quality and overnight recovery' },
  { goal: 'less-stress',     slotType: 'sleep',    title: 'Stress',              description: 'Helps you stay calm and wind down' },
  { goal: 'focus',           slotType: 'health',   title: 'Focus',               description: 'Supports brain health and steady concentration' },
  { goal: 'immune',          slotType: 'health',   title: 'Immunity',            description: 'Strengthens everyday immune resilience' },
  { goal: 'skin-hair-nails', slotType: 'recovery', title: 'Skin, Hair & Nails',  description: 'Collagen and nutrients for skin, hair and nail health' },
  { goal: 'health',          slotType: 'health',   title: 'Daily Health',        description: 'Covers everyday vitamin and mineral gaps' },
]

type Archetype = 'muscle' | 'fat-loss' | 'performance' | 'health' | 'wellbeing'

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

// Goal → slot relevance: which slot types does each goal suggest?
// Intentionally does NOT map energy → performance (creatine is not an energy product)
// and does NOT map health/cutting → protein (protein shouldn't dominate non-muscle stacks).
const GOAL_SLOT_RELEVANCE: Partial<Record<Goal, SlotType[]>> = {
  muscle:      ['protein', 'performance', 'recovery'],
  bulking:     ['protein', 'performance', 'recovery'],
  cutting:     ['energy', 'health'],
  energy:      ['energy', 'health'],
  performance: ['performance', 'energy', 'protein'],
  hydration:   ['hydration', 'recovery'],
  recovery:    ['recovery', 'health'],
  health:      ['health', 'recovery'],
}

/** Returns required slot types based on which goals the user actually chose. */
function getRequiredSlots(goals: Goal[]): SlotType[] {
  const required: SlotType[] = []
  const needsProtein = goals.some(g => ['muscle', 'bulking'].includes(g))
  const needsPerformance = goals.some(g => ['muscle', 'bulking', 'performance'].includes(g))
  if (needsProtein) required.push('protein')
  if (needsPerformance) required.push('performance')
  return required
}

/** Returns SLOT_ORDER sorted so goal-relevant slots come first. */
function sortedSlotsByGoalRelevance(goals: Goal[]): SlotType[] {
  const scores: Record<string, number> = {}
  for (const slot of SLOT_ORDER) scores[slot] = 0
  for (const goal of goals) {
    const relevant = GOAL_SLOT_RELEVANCE[goal] ?? []
    relevant.forEach((slot, idx) => {
      // Earlier positions in the relevance array earn more points
      scores[slot] = (scores[slot] ?? 0) + (relevant.length - idx)
    })
  }
  return [...SLOT_ORDER].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))
}

function hasPerformanceGoals(goals: Goal[]): boolean {
  return goals.some(g => PERFORMANCE_GOALS.includes(g))
}

function getArchetype(goals: Goal[]): Archetype {
  if (goals.includes('muscle') || goals.includes('bulking')) return 'muscle'
  if (goals.includes('cutting')) return 'fat-loss'
  if (goals.includes('performance') || goals.includes('energy')) return 'performance'
  if (!hasPerformanceGoals(goals) && goals.some(g => g !== 'health')) return 'wellbeing'
  return 'health'
}

function getStackName(archetype: Archetype, trainingFrequency: string | null): string {
  const highFreq = trainingFrequency === '5-6x' || trainingFrequency === 'daily'
  const names: Record<Archetype, [string, string]> = {
    'muscle':      ['Performance Core Stack', 'Strength Engine Stack'],
    'fat-loss':    ['Lean Power Stack', 'Fat Loss Protocol'],
    'performance': ['Endurance Edge Stack', 'Athletic Performance Stack'],
    'health':      ['Daily Charge Stack', 'Foundation Health Stack'],
    'wellbeing':   ['Daily Reset Stack', 'Everyday Wellbeing Stack'],
  }
  return highFreq ? names[archetype][0] : names[archetype][1]
}

const ARCHETYPE_SUMMARIES: Record<Archetype, string> = {
  'muscle':      'Built to maximise muscle growth, strength, and recovery.',
  'fat-loss':    'Designed to support fat loss while preserving lean muscle.',
  'performance': 'Optimised for endurance, energy, and athletic output.',
  'health':      'A smart daily foundation for energy, recovery, and long-term health.',
  'wellbeing':   'A daily routine built around how you actually feel — sleep, stress, and everyday resilience.',
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

  // Don't recommend vitamins/minerals the user already takes
  const taking = new Set([...answers.currentSupplements, ...answers.currentVitamins])
  if (taking.has('multivitamin') && product.swapGroup === 'multivitamin') score -= 30
  if (taking.has('vitamin-d') && product.swapGroup === 'vitamin-d') score -= 30
  if (taking.has('omega-3') && product.swapGroup === 'omega-3') score -= 30
  if (taking.has('magnesium') && product.swapGroup === 'magnesium') score -= 30

  // Archetype boosts
  if (archetype === 'muscle' && (slotType === 'protein' || slotType === 'performance')) score += 20
  if (archetype === 'fat-loss' && (slotType === 'energy' || slotType === 'health')) score += 15
  if (archetype === 'health' && (slotType === 'health' || slotType === 'sleep' || slotType === 'recovery')) score += 15
  if (archetype === 'wellbeing' && (slotType === 'sleep' || slotType === 'health')) score += 15

  // Wellbeing follow-up refinements
  const wb = answers.wellbeingAnswers ?? {}
  if (slotType === 'sleep') {
    // "Hard to switch off" / "wired in the evening" → the theanine/ashwagandha blend
    if (wb.sleepQuality === 'switch-off' || wb.stressPattern === 'evening-wired') {
      if (product.swapGroup === 'sleep-support') score += 15
    }
    // "Wake during the night" / "wake tired" → magnesium glycinate
    if (wb.sleepQuality === 'wake-night' || wb.sleepQuality === 'wake-tired') {
      if (product.swapGroup === 'magnesium') score += 15
    }
    // Sleep is fine → deprioritise the whole slot
    if (wb.sleepQuality === 'fine' && !answers.goals.includes('sleep-better')) score -= 20
  }
  // Vegetarian/vegan answer on the collagen follow-up excludes bovine collagen
  if (wb.collagenOk === 'veggie' && product.swapGroup === 'collagen') return -Infinity

  // Wellbeing lifestyle context
  if (answers.lifestyle.includes('run-down') && product.goals.includes('immune')) score += 10
  if (answers.lifestyle.includes('desk-job') && product.swapGroup === 'vitamin-d') score += 8
  if (answers.lifestyle.includes('shift-work') && (product.goals.includes('sleep-better'))) score += 8

  // Goal-specific product affinity boosts — ensures the most clinically targeted
  // product wins when multiple products cover the same goal.
  //
  // immune → Vitamin D3 is most evidence-based; multivitamin is solid secondary
  if (answers.goals.includes('immune') && product.swapGroup === 'vitamin-d') score += 18
  if (answers.goals.includes('immune') && product.swapGroup === 'multivitamin') score += 10
  // focus → Omega-3 (EPA/DHA) is the primary brain-health pick; multivitamin B-vitamins are secondary
  if (answers.goals.includes('focus') && product.swapGroup === 'omega-3') score += 18
  if (answers.goals.includes('focus') && product.swapGroup === 'multivitamin') score += 8
  // skin-hair-nails → collagen is the direct pick (already excluded for vegans elsewhere)
  if (answers.goals.includes('skin-hair-nails') && product.swapGroup === 'collagen') score += 25
  // less-stress → ashwagandha/theanine blend is primary; magnesium is good secondary
  if (answers.goals.includes('less-stress') && product.swapGroup === 'sleep-support') score += 18
  if (answers.goals.includes('less-stress') && product.swapGroup === 'magnesium') score += 10
  // sleep-better → magnesium glycinate is primary (unless follow-up says switch-off)
  if (answers.goals.includes('sleep-better') && product.swapGroup === 'magnesium' && !wb.sleepQuality) score += 12
  // recovery → BCAA/aminos are primary; collagen for joint/tendon support is secondary
  if (answers.goals.includes('recovery') && product.swapGroup === 'aminos') score += 15
  if (answers.goals.includes('recovery') && product.swapGroup === 'collagen') score += 8
  // health → multivitamin is the anchor; omega-3 is an excellent second pick
  if (answers.goals.includes('health') && product.swapGroup === 'multivitamin') score += 15
  if (answers.goals.includes('health') && product.swapGroup === 'omega-3') score += 10

  // Deprioritise performance (creatine) and protein slots when the user's
  // goals don't call for them — prevents creatine appearing for energy/health users
  const muscleGoals: Goal[] = ['muscle', 'bulking', 'performance']
  if (slotType === 'performance' && !answers.goals.some(g => muscleGoals.includes(g))) score -= 60
  if (slotType === 'protein' && !answers.goals.some(g => ['muscle', 'bulking', 'recovery'].includes(g))) score -= 50

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
    if (answers.goals.includes('skin-hair-nails') && product.swapGroup === 'collagen') suffixes.push('— collagen chosen for your skin, hair and nails goal')
    else if (freq === '5-6x' || freq === 'daily') suffixes.push('— training this frequently, recovery is your biggest performance lever')
    else if (goalOverlap.includes('recovery')) suffixes.push('— picked because recovery is one of your stated priorities')
  } else if (slotType === 'health') {
    if (answers.goals.includes('immune')) suffixes.push('— picked because immune support is one of your goals')
    else if (answers.goals.includes('focus')) suffixes.push('— supports brain health and steady daily focus')
    else if (answers.goals.includes('skin-hair-nails')) suffixes.push('— chosen for your skin, hair and nails goal')
    else if (answers.lifestyle.includes('desk-job')) suffixes.push('— particularly useful if you spend long hours at a desk')
    else if (answers.lifestyle.includes('high-stress')) suffixes.push('— supports immunity and energy under high stress')
    else suffixes.push('— covers the micronutrient gaps most active people have')
  } else if (slotType === 'sleep') {
    if (answers.goals.includes('sleep-better')) suffixes.push('— added because better sleep is one of your goals')
    else if (answers.goals.includes('less-stress')) suffixes.push('— helps you wind down and switch off in the evening')
    else if (answers.lifestyle.includes('poor-sleep')) suffixes.push('— added because you flagged sleep as a problem area')
    else suffixes.push('— quality sleep is when most muscle repair actually happens')
  }

  const suffix = suffixes.length > 0 ? ` ${suffixes[0]}` : ''
  const greeting = name ? `Chosen for ${name}${suffix}` : null

  return greeting ?? `${base}${suffix}`
}

/** Personalised reason for a wellbeing goal slot — references the user's own
 *  follow-up answers wherever possible so the pick feels earned, not generic. */
function buildWellbeingReason(goal: Goal, product: CatalogueProduct, answers: QuizAnswers): string {
  const wb = answers.wellbeingAnswers ?? {}
  const name = answers.name ? answers.name.split(' ')[0] : null
  const base = product.shortReason || product.description

  let suffix = ''
  if (goal === 'sleep-better') {
    if (wb.sleepQuality === 'switch-off') suffix = ' You said you find it hard to switch off — this is formulated for exactly that.'
    else if (wb.sleepQuality === 'wake-night') suffix = ' Chosen because you wake during the night — magnesium glycinate supports staying asleep.'
    else if (wb.sleepQuality === 'wake-tired') suffix = ' Picked to improve sleep depth, since you wake unrested even with enough hours.'
  } else if (goal === 'less-stress') {
    if (wb.stressPattern === 'evening-wired') suffix = ' Matched to your evening wind-down struggle.'
    else if (wb.stressPattern === 'all-day') suffix = ' Chosen for the all-day tension you described.'
    else if (wb.stressPattern === 'morning-fog' || wb.stressPattern === 'afternoon-crash') suffix = ' Supports steadier energy through the dips you described.'
  } else if (goal === 'focus') {
    suffix = ' Chosen for your focus and brain fog goal.'
  } else if (goal === 'immune') {
    if (wb.immuneBaseline === 'often') suffix = ' You said you catch everything going round — this is the foundation to build from.'
    else if (wb.immuneBaseline === 'rarely') suffix = ' A light insurance pick, since you said you rarely get ill.'
    else suffix = ' Chosen for your immune support goal.'
  } else if (goal === 'skin-hair-nails') {
    const isVeganOrVeggie = answers.lifestyle.includes('vegan') || (answers.wellbeingAnswers ?? {}).collagenOk === 'veggie'
    if (isVeganOrVeggie) suffix = ' Collagen is bovine so we\'ve swapped to the best plant-friendly alternative for skin and hair health.'
    else suffix = ' Collagen peptides are the most direct support for skin, hair and nails.'
  } else if (goal === 'health') {
    suffix = ' A daily foundation pick for general health.'
  }

  const reason = `${base}${suffix}`
  return name ? `For ${name}: ${reason}` : reason
}

/**
 * Builds a StackBlueprint from quiz answers and the product catalogue.
 * Uses archetype-based scoring to select the best product for each slot.
 */
export function buildStackBlueprint(
  answers: QuizAnswers,
  catalogue: CatalogueProduct[]
): StackBlueprint {
  // Use the live catalogue directly — no mock fallback.
  // The Shopify mapper derives goals/slots for all products so stacks are
  // always built from real inventory. If a goal has no matching product,
  // that slot is simply omitted (handled gracefully below).
  const effectiveCatalogue = catalogue.length > 0 ? catalogue : MOCK_CATALOGUE

  const primaryGoal: Goal = answers.goals[0] ?? 'health'
  const secondaryGoals = answers.goals.slice(1)

  const archetype = getArchetype(answers.goals)
  const stackName = getStackName(archetype, answers.trainingFrequency)
  const summary = ARCHETYPE_SUMMARIES[archetype]

  // Cap total slots to match the selected budget / stack size
  const maxSlots = (() => {
    switch (answers.budget) {
      case 'under-30': return 2
      case '30-50':    return 3
      case '50-80':    return 5
      case '80-plus':  return 7
      default: switch (answers.stackPreference) {
        case 'simple':   return 3
        case 'balanced': return 5
        default:         return 7
      }
    }
  })()

  // Wellbeing-only users skip the training-centric slots entirely, and
  // protein/creatine are no longer required.
  const performanceUser = hasPerformanceGoals(answers.goals)
  const requiredSlots: SlotType[] = performanceUser ? getRequiredSlots(answers.goals) : []

  const slots: StackSlotEntry[] = []
  const usedProductIds = new Set<string>()
  let displayOrder = 0

  function pickBest(candidates: CatalogueProduct[], slotType: SlotType): { product: CatalogueProduct; score: number } | null {
    let bestProduct: CatalogueProduct | null = null
    let bestScore = -Infinity
    for (const product of candidates) {
      const score = scoreProduct(product, slotType, answers, archetype)
      if (score > bestScore) {
        bestScore = score
        bestProduct = product
      }
    }
    if (!bestProduct || bestScore < 0) return null
    return { product: bestProduct, score: bestScore }
  }

  function pushSlot(opts: {
    slotId: string; slotType: SlotType; title: string; description: string
    product: CatalogueProduct; score: number; reason: string; required: boolean
  }) {
    const firstAvailableVariant = opts.product.variants.find(v => v.available) ?? null
    usedProductIds.add(opts.product.id)
    slots.push({
      slotId: opts.slotId,
      slotType: opts.slotType as any,
      title: opts.title,
      description: opts.description,
      recommendedProductId: opts.product.id,
      selectedProductId: opts.product.id,
      selectedVariantId: firstAvailableVariant?.id ?? null,
      required: opts.required,
      canRemove: !opts.required,
      canSwap: true,
      swapGroup: opts.product.swapGroup,
      reason: opts.reason,
      confidenceScore: Math.min(100, Math.max(0, Math.round(opts.score / 2))),
      displayOrder: displayOrder++,
    })
  }

  if (performanceUser) {
    // Performance track: fill slots in goal-relevance order so the user's
    // chosen goals drive which products appear first — not a fixed list.
    const orderedSlots = sortedSlotsByGoalRelevance(answers.goals)
    for (const slotType of orderedSlots) {
      if (slots.length >= maxSlots) break
      const candidates = effectiveCatalogue.filter(p => p.stackSlots.includes(slotType as any) && !usedProductIds.has(p.id))
      if (candidates.length === 0) continue
      const best = pickBest(candidates, slotType)
      if (!best) continue
      pushSlot({
        slotId: `slot-${slotType}`,
        slotType,
        title: SLOT_TITLES[slotType],
        description: SLOT_DESCRIPTIONS[slotType],
        product: best.product,
        score: best.score,
        reason: buildPersonalisedReason(best.product, slotType, answers, archetype),
        required: requiredSlots.includes(slotType),
      })
    }
  } else {
    // Wellbeing track: goal-driven. Each selected goal gets its own named slot
    // filled by the best product TAGGED with that goal — never an unrelated
    // training product. Two sleep-adjacent goals can yield two sleep products
    // (e.g. magnesium for sleep + ashwagandha blend for stress).
    // Fill goals with the fewest candidate products first, so a goal whose
    // only product also serves other goals (e.g. collagen = skin + immune)
    // isn't left empty. Display order is restored afterwards.
    const selectedCfgs = WELLBEING_GOAL_SLOTS
      .filter(cfg => answers.goals.includes(cfg.goal))
      .sort((a, b) =>
        effectiveCatalogue.filter(p => p.goals.includes(a.goal)).length -
        effectiveCatalogue.filter(p => p.goals.includes(b.goal)).length)

    for (const cfg of selectedCfgs) {
      if (slots.length >= maxSlots) break
      const candidates = effectiveCatalogue.filter(p => p.goals.includes(cfg.goal) && !usedProductIds.has(p.id))
      if (candidates.length === 0) continue
      const best = pickBest(candidates, cfg.slotType)
      if (!best) continue
      pushSlot({
        slotId: `slot-${cfg.goal}`,
        slotType: cfg.slotType,
        title: cfg.title,
        description: cfg.description,
        product: best.product,
        score: best.score,
        reason: buildWellbeingReason(cfg.goal, best.product, answers),
        required: false,
      })
    }

    // Restore presentation order to match the goal list, not fill order
    const cfgOrder = new Map(WELLBEING_GOAL_SLOTS.map((cfg, i) => [`slot-${cfg.goal}`, i]))
    slots.sort((a, b) => (cfgOrder.get(a.slotId) ?? 99) - (cfgOrder.get(b.slotId) ?? 99))
    slots.forEach((s, i) => { s.displayOrder = i })

    // Never return an empty wellbeing stack (e.g. all picks excluded by
    // dietary answers) — fall back to a daily-health foundation product.
    if (slots.length === 0) {
      const candidates = effectiveCatalogue.filter(p => p.goals.includes('health'))
      const best = pickBest(candidates, 'health')
      if (best) {
        pushSlot({
          slotId: 'slot-health',
          slotType: 'health',
          title: 'Daily Health',
          description: SLOT_DESCRIPTIONS.health,
          product: best.product,
          score: best.score,
          reason: buildWellbeingReason('health', best.product, answers),
          required: false,
        })
      }
    }
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
