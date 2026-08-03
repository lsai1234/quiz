// Engine scoring + goal map now live as editable data in @/lib/quiz-core — this
// file reads those tables rather than hard-coding weights and relationships.

import type { QuizAnswers, Goal } from '@/lib/types'
import { PERFORMANCE_GOALS } from '@/lib/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { lqdOnly } from '@/lib/catalogue/filters'
import type { StackBlueprint, StackSlotEntry } from './types'
import { calculateStackPrice, calculateSubscriptionPrice } from './helpers'
import { budgetCapFor, discountedOneOffTotal, unitCostOf, getPricingConfig } from './pricing'
import {
  SLOT_ORDER, GOAL_SLOT_RELEVANCE, WELLBEING_GOAL_SLOTS, GOAL_AFFINITY,
  SCORING, FOUNDATIONAL_SWAP_GROUPS, applyBundleRules, type SlotType,
} from '@/lib/quiz-core'

export type { SlotType } from '@/lib/quiz-core'

// Friendly slot titles for budget-driven "extra" wellbeing picks, derived from
// the product's swap group so each added product reads clearly in the stack.
const SWAP_GROUP_LABELS: Record<string, string> = {
  'multivitamin':   'Daily Multivitamin',
  'omega-3':        'Omega-3',
  'vitamin-d':      'Vitamin D',
  'vitamin-c':      'Immune Support',
  'magnesium':      'Magnesium',
  'collagen':       'Collagen',
  'sleep-support':  'Sleep & Recovery',
  'adaptogen':      'Stress Support',
  'probiotic':      'Gut Health',
  'greens':         'Daily Greens',
  'fibre':          'Fibre',
  'menopause':      'Menopause Support',
  'aminos':         'Amino Acids',
  'electrolytes':   'Hydration',
}

export type Archetype = 'muscle' | 'fat-loss' | 'performance' | 'health' | 'wellbeing'

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

export function getArchetype(goals: Goal[]): Archetype {
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

export function scoreProduct(
  product: CatalogueProduct,
  slotType: SlotType,
  answers: QuizAnswers,
  archetype: Archetype,
): number {
  let score = product.recommendationPriority * SCORING.priorityBase

  // Goal overlap
  const goalOverlap = answers.goals.filter(g => product.goals.includes(g)).length
  score += goalOverlap * SCORING.goalOverlap

  // ── Hard eligibility gates ─────────────────────────────────────────────────
  // These products have a specific, narrow use case. Recommending them without
  // the matching goal creates noise and erodes trust. -Infinity means they are
  // excluded entirely from scoring — they never even appear as candidates.
  //
  // Fat burners: thermogenics and cutting products have no benefit for someone
  // who hasn't selected a weight-loss / cutting goal. Recommending them to a
  // sleep or immune-support user is actively wrong.
  // Safety screen: a product contraindicated against anything the user flagged
  // (pregnancy / medication) is removed entirely — safety comes before fit.
  const safetyFlags = answers.safetyFlags ?? []
  if (safetyFlags.length > 0 && (product.contraindications ?? []).some((c) => safetyFlags.includes(c))) {
    return -Infinity
  }
  if (product.swapGroup === 'fat-burner' && !answers.goals.includes('cutting')) return -Infinity
  // Mass gainers: a 600kcal shake is counterproductive outside a bulk phase
  if (product.swapGroup === 'protein-mass' && !answers.goals.includes('bulking')) return -Infinity
  // Menopause blends: hormone-support botanicals are only relevant for menopause
  if (product.swapGroup === 'menopause' && !answers.goals.includes('menopause')) return -Infinity
  // Probiotics and greens: gut-health products should only appear when the user
  // has asked for gut or immune support — not as generic "health" fill
  if ((product.swapGroup === 'probiotic' || product.swapGroup === 'greens' || product.swapGroup === 'fibre') &&
      !answers.goals.some(g => ['gut-health', 'immune', 'health'].includes(g))) return -Infinity
  // Adaptogen/stress blends: ashwagandha should only appear when stress or sleep
  // is a stated goal — not as a generic health add-on
  if (product.swapGroup === 'adaptogen' &&
      !answers.goals.some(g => ['less-stress', 'sleep-better', 'menopause'].includes(g))) return -Infinity

  // ── Goal relevance floor ───────────────────────────────────────────────────
  // If a product has NO goal overlap with the user AND it isn't a foundational
  // supplement (omega-3, vitamin-d, multivitamin have broad evidence for all
  // active people), it needs a meaningful score penalty to prevent priority
  // number alone from pushing irrelevant products into the stack.
  const isFoundational = (FOUNDATIONAL_SWAP_GROUPS as readonly string[]).includes(product.swapGroup)
  if (goalOverlap === 0 && !isFoundational) score += SCORING.noGoalFloor

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

  // Already-taking: hard exclude, not just a penalty.
  // If the user told us they already take this supplement type, recommending it
  // is actively wrong — it erodes trust and wastes their money. Use -Infinity
  // so it never appears regardless of how many goal-affinity boosts it accumulates.
  // EXCEPT items the user flagged "include CHRGD's to try" on the supps
  // follow-up (answers.tryOurs) — those stay recommendable.
  const tryOurs = new Set(answers.tryOurs ?? [])
  const taking = new Set(
    [...answers.currentSupplements, ...answers.currentVitamins].filter((x) => !tryOurs.has(x)),
  )
  if (taking.has('multivitamin') && product.swapGroup === 'multivitamin') return -Infinity
  if (taking.has('vitamin-d')    && product.swapGroup === 'vitamin-d')    return -Infinity
  if (taking.has('omega-3')      && product.swapGroup === 'omega-3')      return -Infinity
  if (taking.has('magnesium')    && product.swapGroup === 'magnesium')    return -Infinity
  if (taking.has('vitamin-c')    && product.swapGroup === 'vitamin-c')    return -Infinity
  if (taking.has('collagen')     && product.swapGroup === 'collagen')     return -Infinity
  if (taking.has('protein')      && slotType === 'protein')               return -Infinity
  if (taking.has('creatine')     && slotType === 'performance')           return -Infinity
  if (taking.has('pre-workout')  && slotType === 'energy')                return -Infinity

  // Archetype boosts
  if (archetype === 'muscle' && (slotType === 'protein' || slotType === 'performance')) score += SCORING.archetype.muscleProteinOrPerformance
  if (archetype === 'fat-loss' && (slotType === 'energy' || slotType === 'health')) score += SCORING.archetype.fatLossEnergyOrHealth
  if (archetype === 'health' && (slotType === 'health' || slotType === 'sleep' || slotType === 'recovery')) score += SCORING.archetype.healthTriad
  if (archetype === 'wellbeing' && (slotType === 'sleep' || slotType === 'health')) score += SCORING.archetype.wellbeingSleepOrHealth

  // Wellbeing follow-up refinements
  const wb = answers.wellbeingAnswers ?? {}
  if (slotType === 'sleep') {
    // "Hard to switch off" / "wired in the evening" → the theanine/ashwagandha blend
    if (wb.sleepQuality === 'switch-off' || wb.stressPattern === 'evening-wired') {
      if (product.swapGroup === 'sleep-support') score += SCORING.wellbeing.switchOffSleepSupport
    }
    // "Wake during the night" / "wake tired" → magnesium glycinate
    if (wb.sleepQuality === 'wake-night' || wb.sleepQuality === 'wake-tired') {
      if (product.swapGroup === 'magnesium') score += SCORING.wellbeing.wakeMagnesium
    }
    // Sleep is fine → deprioritise the whole slot
    if (wb.sleepQuality === 'fine' && !answers.goals.includes('sleep-better')) score += SCORING.wellbeing.sleepFinePenalty
  }
  // Vegetarian/vegan answer on the collagen follow-up excludes bovine collagen
  if (wb.collagenOk === 'veggie' && product.swapGroup === 'collagen') return -Infinity

  // Wellbeing lifestyle context
  if (answers.lifestyle.includes('run-down') && product.goals.includes('immune')) score += SCORING.lifestyle.runDownImmune
  if (answers.lifestyle.includes('desk-job') && product.swapGroup === 'vitamin-d') score += SCORING.lifestyle.deskVitaminD
  if (answers.lifestyle.includes('shift-work') && (product.goals.includes('sleep-better'))) score += SCORING.lifestyle.shiftSleep

  // Goal-specific product affinity boosts (data-driven — see GOAL_AFFINITY). Sums
  // across the user's goals so a product serving two of them earns both. Ensures
  // the most clinically targeted product wins when several cover the same goal.
  for (const goal of answers.goals) {
    score += GOAL_AFFINITY[goal]?.[product.swapGroup] ?? 0
  }
  // sleep-better → magnesium is primary, but only when no sleep follow-up steered
  // us elsewhere (kept in code as it's conditional on the follow-up answer).
  if (answers.goals.includes('sleep-better') && product.swapGroup === 'magnesium' && !wb.sleepQuality) score += SCORING.sleepBetterMagnesium

  // Deprioritise performance (creatine) and protein slots when the user's
  // goals don't call for them — prevents creatine appearing for energy/health users
  const muscleGoals: Goal[] = ['muscle', 'bulking', 'performance']
  if (slotType === 'performance' && !answers.goals.some(g => muscleGoals.includes(g))) score += SCORING.deprioritise.performanceNonMuscle
  if (slotType === 'protein' && !answers.goals.some(g => ['muscle', 'bulking', 'recovery'].includes(g))) score += SCORING.deprioritise.proteinNonMuscle

  // Mass gainer is the primary pick for bulking — it provides calories AND protein.
  // Regular whey is inadequate for someone trying to gain mass who struggles to eat.
  if (answers.goals.includes('bulking') && product.swapGroup === 'protein-mass') score += SCORING.mass.bulkingBonus
  // Conversely, regular whey is the better default for muscle/recovery without bulking
  if (!answers.goals.includes('bulking') && product.swapGroup === 'protein-mass') score += SCORING.mass.nonBulkingPenalty

  // Budget sensitivity
  if ((answers.budget === 'under-30' || answers.budget === '30-50') && product.basePrice > SCORING.budgetThresholdPrice) score += SCORING.budgetOverThreshold

  // ── Diet quality → protein and micronutrient necessity ────────────────────
  // A clean, high-protein diet already covers protein needs — the powder adds
  // less marginal value. A poor diet means a multivitamin is more critical.
  if (answers.diet === 'clean' && slotType === 'protein') score += SCORING.diet.cleanProtein
  if (answers.diet === 'poor' && product.swapGroup === 'multivitamin') score += SCORING.diet.poorMultivitamin
  if (answers.diet === 'poor' && product.swapGroup === 'omega-3') score += SCORING.diet.poorOmega
  if (answers.diet === 'inconsistent' && product.swapGroup === 'multivitamin') score += SCORING.diet.inconsistentMultivitamin

  // ── Format preference → filter by product format ──────────────────────────
  // If the user has a preference and hasn't said "any", penalise products in
  // formats they didn't pick. A preference for capsules should push capsule
  // products up, not hard-exclude powders (some slots only exist as powders).
  const formats = answers.preferredFormats ?? []
  if (formats.length > 0 && !formats.includes('any')) {
    const productFormats = product.formats ?? []
    const formatMatch = productFormats.some(f => formats.includes(f))
    if (!formatMatch) score += SCORING.formatMismatch
  }

  // ── Training focus (strength sub-question) → creatine + protein priority ─
  if (answers.trainingFocus === 'hypertrophy') {
    if (slotType === 'performance') score += SCORING.focus.hypertrophyPerformance  // creatine is most evidence-based for hypertrophy
    if (slotType === 'protein') score += SCORING.focus.hypertrophyProtein
  }
  if (answers.trainingFocus === 'powerlifting') {
    if (slotType === 'performance') score += SCORING.focus.powerliftingPerformance  // creatine even more critical for max-strength
    if (product.swapGroup === 'collagen') score += SCORING.focus.powerliftingCollagen  // joint/tendon load is extreme in powerlifting
  }
  if (answers.trainingFocus === 'general') {
    if (slotType === 'performance') score += SCORING.focus.generalPerformance  // creatine is nice-to-have, not essential
  }

  // ── Sport type → endurance vs power profile ───────────────────────────────
  if (answers.trainingFocus === 'football' || answers.trainingFocus === 'rugby' || answers.trainingFocus === 'basketball') {
    if (slotType === 'energy') score += SCORING.focus.sportEnergy     // sport athletes benefit from pre-workout
    if (slotType === 'hydration') score += SCORING.focus.sportHydration  // high sweat-rate sports need electrolytes
  }

  // ── Gender + age → supplement priorities ─────────────────────────────────
  // Female users have higher iron/B-vitamin needs; both genders 45+ need more
  // vitamin D and bone-support nutrients.
  if (answers.gender === 'female') {
    if (product.swapGroup === 'multivitamin') score += SCORING.gender.femaleMultivitamin  // women's multis cover iron/B9/B12
  }
  if (answers.ageBracket === '45+') {
    if (product.swapGroup === 'vitamin-d') score += SCORING.age.over45VitaminD   // absorption declines with age
    if (product.swapGroup === 'collagen') score += SCORING.age.over45Collagen   // bone + joint health post-45
    if (product.swapGroup === 'omega-3') score += SCORING.age.over45Omega     // cardiovascular + joint
  }
  if (answers.ageBracket === '35-44') {
    if (product.swapGroup === 'vitamin-d') score += SCORING.age.midVitaminD
    if (product.swapGroup === 'omega-3') score += SCORING.age.midOmega
  }

  // ── Training time → stimulant timing ─────────────────────────────────────
  // Caffeine has a 5-6 hour half-life. An evening trainer who takes stim
  // pre-workout at 7pm has caffeine in their system until 1am — bad for
  // sleep recovery. We penalise stim products for evening trainers unless
  // they've explicitly said they want stims (stimPreference: 'yes') and have
  // a high caffeine tolerance.
  if (product.hasStimulants) {
    const eveningTrainer = answers.trainingTime === 'evening'
    const wantsSleep = answers.goals.includes('sleep-better') || answers.goals.includes('less-stress')
    if (eveningTrainer && wantsSleep) score += SCORING.trainingTime.eveningWantsSleep
    if (eveningTrainer && answers.caffeineLevel === 'low') score += SCORING.trainingTime.eveningLowCaffeine
  }

  // ── Caffeine level nuance (4-level, not binary) ───────────────────────────
  // Currently only 'none'/'high' are scored. Add nuance for 'low'/'medium'.
  if (product.hasStimulants) {
    if (answers.caffeineLevel === 'low') score += SCORING.caffeine.low   // one occasional coffee — avoid stimulants
    if (answers.caffeineLevel === 'medium') score += SCORING.caffeine.medium // daily coffee — mild penalty
    // 'high' is neutral; 'none' is already -Infinity from the stimulant gate.
  }

  // ── Lifestyle: joint/injury flag → collagen + omega-3 ────────────────────
  // When the user flags joint issues (captured in lifestyle step), these two
  // products move to the top — they have direct mechanistic support.
  if (answers.lifestyle.includes('joint-issues')) {
    if (product.swapGroup === 'collagen') score += SCORING.lifestyle.jointCollagen
    if (product.swapGroup === 'omega-3') score += SCORING.lifestyle.jointOmega
  }

  // ── Training experience → stack complexity ────────────────────────────────
  if (answers.trainingExperience === 'new') {
    // New athletes benefit most from protein and creatine — the basics
    if (slotType === 'protein') score += SCORING.experience.newProtein
    if (slotType === 'performance') score += SCORING.experience.newPerformance
    // New athletes don't yet need complex multi-supplement stacks
    if (slotType === 'energy' && answers.trainingFrequency !== '5-6x' && answers.trainingFrequency !== 'daily') score += SCORING.experience.newEnergyPenalty
  }
  if (answers.trainingExperience === 'experienced') {
    // Experienced athletes need marginal gains — creatine, recovery, hydration
    if (slotType === 'performance') score += SCORING.experience.expPerformance
    if (slotType === 'recovery') score += SCORING.experience.expRecovery
    if (slotType === 'hydration') score += SCORING.experience.expHydration
  }

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
  } else if (goal === 'gut-health') {
    suffix = ' Chosen to support digestion and a balanced gut microbiome.'
  } else if (goal === 'menopause') {
    suffix = ' Formulated to support hormonal balance and ease menopause symptoms.'
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
  // Subscription-only refills never enter the quiz recommendation — they only
  // exist as monthly subscription resolution targets.
  // CHRGD LQD (drinks mode) sees only PRE-MADE drinks (zero-prep promise);
  // slots with no ready-to-drink candidate fall away via the same graceful
  // omission.
  const effectiveCatalogue = lqdOnly(
    (catalogue.length > 0 ? catalogue : MOCK_CATALOGUE).filter((p) => !p.isSubscriptionOnly),
    answers.drinksMode,
  )

  const primaryGoal: Goal = answers.goals[0] ?? 'health'
  const secondaryGoals = answers.goals.slice(1)

  const archetype = getArchetype(answers.goals)
  const stackName = getStackName(archetype, answers.trainingFrequency)
  const summary = ARCHETYPE_SUMMARIES[archetype]

  // Cap total slots to match the selected budget / stack size.
  // LQD (drinks mode) never asks for a budget — the drinks/day pace IS the
  // package size: a faster pace needs more distinct drinks in the box.
  const maxSlots = (() => {
    if (answers.drinksMode) {
      const pace = answers.drinksPerDay && answers.drinksPerDay > 0 ? answers.drinksPerDay : 2
      return Math.min(2 + pace, 7) // 1/day → 3 drinks … 4+/day → 6 drinks
    }
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

  // ── Budget cap ──────────────────────────────────────────────────────────────
  // Each bundle has a HARD discounted one-off price cap. We track the chosen
  // products' (price, cost) lines and only add a product if the stack's
  // discounted one-off total stays within the cap — picking the most relevant
  // product that fits, so we get as close to the ceiling as possible without
  // ever going over. null cap (top tier) means no upper limit.
  const pricingConfig = getPricingConfig()
  // Drinks mode has no budget question, so no price ceiling — the pace-derived
  // slot cap above is the only sizing control.
  const budgetCap = answers.drinksMode ? null : budgetCapFor(answers.budget, pricingConfig)
  const selectedLines: { price: number; cost: number }[] = []

  function lineFor(product: CatalogueProduct): { price: number; cost: number } {
    const firstAvailable = product.variants.find(v => v.available)
    const price = firstAvailable?.price ?? product.basePrice
    return { price, cost: unitCostOf(product, price, pricingConfig) }
  }

  /** Would adding this product keep the discounted one-off total within the cap? */
  function fitsWithinBudget(product: CatalogueProduct): boolean {
    if (budgetCap == null) return true
    const total = discountedOneOffTotal([...selectedLines, lineFor(product)], pricingConfig)
    return total <= budgetCap + 0.001
  }

  /** Highest-scoring candidate (score ≥ 0). Ignores the budget cap. */
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

  /**
   * The best-scoring candidate that also FITS the budget cap. Candidates are
   * ranked by relevance; we take the highest-scoring one whose addition keeps the
   * stack within the cap (so relevance wins, but the cap is never breached).
   */
  function pickBestAffordable(candidates: CatalogueProduct[], slotType: SlotType): { product: CatalogueProduct; score: number } | null {
    const scored = candidates
      .map(product => ({ product, score: scoreProduct(product, slotType, answers, archetype) }))
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score)
    for (const c of scored) {
      if (fitsWithinBudget(c.product)) return c
    }
    return null
  }

  function pushSlot(opts: {
    slotId: string; slotType: SlotType; title: string; description: string
    product: CatalogueProduct; score: number; reason: string; required: boolean
  }) {
    const firstAvailableVariant = opts.product.variants.find(v => v.available) ?? null
    usedProductIds.add(opts.product.id)
    selectedLines.push(lineFor(opts.product))
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
      const best = pickBestAffordable(candidates, slotType)
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

    // Track which swap groups are already in the stack so a user who selects
    // both "focus" and "immune" can't end up with two multivitamins — the
    // second goal steers to the next-best product in a different category.
    const usedSwapGroups = new Set<string>()

    for (const cfg of selectedCfgs) {
      if (slots.length >= maxSlots) break
      const candidates = effectiveCatalogue.filter(
        p => p.goals.includes(cfg.goal) && !usedProductIds.has(p.id) && !usedSwapGroups.has(p.swapGroup)
      )
      if (candidates.length === 0) continue
      const best = pickBestAffordable(candidates, cfg.slotType)
      if (!best) continue
      usedSwapGroups.add(best.product.swapGroup)
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

    // Budget-driven secondary fill: a higher budget should genuinely deliver a
    // bigger stack. After every selected goal has its primary product, top the
    // stack up with the next best complementary picks for the user's STATED goals
    // only. We intentionally do NOT inject "foundation" goals here — if a user
    // asked for sleep support they should get sleep-related products, not a
    // probiotic they never asked for.
    if (slots.length < maxSlots) {
      const relevantGoals = new Set<Goal>(answers.goals)
      // Foundational supplements (multivitamin, omega-3, vitamin-d) have blanket
      // evidence for anyone who trains — include them as secondary picks regardless
      // of specific goals, but they still go through scoreProduct so they only
      // appear when they score positively.
      const extras = effectiveCatalogue
        .filter(p => !usedProductIds.has(p.id))
        .filter(p => {
          const foundationalSwapGroups = ['omega-3', 'vitamin-d', 'multivitamin', 'vitamin-c', 'magnesium']
          return p.goals.some(g => relevantGoals.has(g)) || foundationalSwapGroups.includes(p.swapGroup)
        })
        .map(p => {
          const slotType = (p.stackSlots[0] ?? 'health') as SlotType
          return { product: p, slotType, score: scoreProduct(p, slotType, answers, archetype) }
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)

      // Extend the primary fill's usedSwapGroups so secondary fill doesn't
      // add a product already represented by a primary slot
      slots.forEach(s => usedSwapGroups.add(s.swapGroup))
      for (const { product, slotType, score } of extras) {
        if (slots.length >= maxSlots) break
        // Don't add two products from the same swap group (e.g. two magnesiums)
        if (usedSwapGroups.has(product.swapGroup)) continue
        // Hard budget cap: only top up while we stay within the bundle ceiling.
        if (!fitsWithinBudget(product)) continue
        usedSwapGroups.add(product.swapGroup)
        pushSlot({
          slotId: `slot-extra-${product.id}`,
          slotType,
          title: SWAP_GROUP_LABELS[product.swapGroup] ?? SLOT_TITLES[slotType] ?? 'Daily Support',
          description: product.shortReason || SLOT_DESCRIPTIONS[slotType],
          product,
          score,
          reason: product.shortReason || SLOT_DESCRIPTIONS[slotType],
          required: false,
        })
      }
    }

    // Restore presentation order to match the goal list, not fill order.
    // Primary goal slots come first (in goal-list order); budget-driven extras
    // follow, preserving their score-ranked order.
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

  // Non-empty guarantee: if the cap was too low for any single product to fit
  // (degenerate — e.g. a £30 cap with no product under £30), still return the one
  // most relevant pick. This is the ONLY case the cap may be exceeded, and only
  // by a single essential product so the user is never shown an empty stack.
  if (slots.length === 0) {
    let fallbackProduct: CatalogueProduct | null = null
    let fallbackScore = -Infinity
    let fallbackSlot: SlotType = 'health'
    for (const product of effectiveCatalogue) {
      const slotType = (product.stackSlots[0] ?? 'health') as SlotType
      const score = scoreProduct(product, slotType, answers, archetype)
      if (score > fallbackScore) { fallbackScore = score; fallbackProduct = product; fallbackSlot = slotType }
    }
    if (fallbackProduct) {
      pushSlot({
        slotId: `slot-${fallbackSlot}`,
        slotType: fallbackSlot,
        title: SLOT_TITLES[fallbackSlot] ?? 'Daily Support',
        description: SLOT_DESCRIPTIONS[fallbackSlot] ?? '',
        product: fallbackProduct,
        score: Math.max(0, fallbackScore),
        reason: fallbackProduct.shortReason || SLOT_DESCRIPTIONS[fallbackSlot] || '',
        required: false,
      })
    }
  }

  // ── Bundle construction rules (Phase 5) ──────────────────────────────────
  // Post-selection pass: drop low-relevance filler, remove active-ingredient
  // duplicates (no double-magnesium / double-ashwagandha), and enforce total
  // dose caps. Required slots are never dropped. Re-sequence display order after.
  const finalSlots = applyBundleRules(slots, effectiveCatalogue)
  finalSlots.forEach((s, i) => { s.displayOrder = i })

  const userProfileSummary = [
    answers.ageBracket,
    answers.trainingType?.length ? `${answers.trainingType.join(' & ')} training` : null,
    answers.trainingFrequency ? `${answers.trainingFrequency}/week` : null,
  ].filter(Boolean).join(', ')

  // Goals the final stack doesn't cover — because a hard gate (safety, dietary)
  // removed the only candidates, or the rules pass dropped the last product for
  // it. Surfaced honestly on the reveal instead of a silent gap.
  const coveredGoals = new Set<Goal>(
    finalSlots.flatMap((s) => effectiveCatalogue.find((p) => p.id === s.selectedProductId)?.goals ?? []),
  )
  const unmetGoals = answers.goals.filter((g) => !coveredGoals.has(g))

  // Build partial blueprint to calculate prices
  const partialBlueprint: StackBlueprint = {
    id: Date.now().toString(36),
    stackName,
    summary,
    primaryGoal,
    secondaryGoals,
    userProfileSummary,
    slots: finalSlots,
    unmetGoals,
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
