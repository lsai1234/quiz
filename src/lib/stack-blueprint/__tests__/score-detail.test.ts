/**
 * scoreProductDetailed: the engine's score with its working.
 *
 * The first guard is the one that matters. `scoreProduct` is now
 * `scoreProductDetailed(...).score`, and every stack the engine builds depends
 * on it returning the same number as before. `legacyScore` below is a verbatim
 * copy of `scoreProduct` as it was before the breakdown existed (commit
 * f53ff13, src/lib/stack-blueprint/factory.ts lines 182-458, renamed only), and
 * the two are compared with Object.is across the catalogue, every slot type,
 * every archetype and a spread of answers, including fractional Top 25 ranks
 * and driver confidences so the floating-point path is exercised too.
 */
import { scoreProduct, scoreProductDetailed, getArchetype, type Archetype } from '../factory'
import type { Contribution, ScoreDetail } from '../explain-types'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import {
  SLOT_ORDER, SCORING, FOUNDATIONAL_SWAP_GROUPS, GOAL_AFFINITY,
  DRIVER_AFFINITY, DRIVER_STIM_PENALTY, type SlotType,
} from '@/lib/quiz-core'
import { DRIVER_IDS, type DriverId } from '@/lib/quiz-v2/drivers'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers, Goal } from '@/lib/types'

// ── The original, verbatim ──────────────────────────────────────────────────
// Do not edit this function. It is the reference the new code is held to.
function legacyScore(
  product: CatalogueProduct,
  slotType: SlotType,
  answers: QuizAnswers,
  archetype: Archetype,
): number {
  let score = product.recommendationPriority * SCORING.priorityBase

  // The founders' Top 25 roster: a preference between products that could both
  // serve this user, ranked so the #1 pick edges out the #25. Nothing off the
  // roster is penalised, so an empty roster leaves scoring exactly as it was.
  if (product.topRank != null && product.topRank > 0) {
    score += Math.max(0, SCORING.topProductBase - (product.topRank - 1) * SCORING.topProductStep)
  }

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

  // Root-cause affinity, from the v2 adaptive interview (see DRIVER_AFFINITY).
  // Read exactly like GOAL_AFFINITY above, and scaled by how confident the
  // interview ended up: a passing hint nudges, a confirmed finding moves.
  //
  // `answers.drivers` is absent on every v1 answer and on anything saved before
  // v2 existed, so this whole block contributes exactly zero there and v1's
  // output is unchanged. That invariant is asserted in driver-map.test.ts.
  for (const [driver, confidence] of Object.entries(answers.drivers ?? {})) {
    const affinity = DRIVER_AFFINITY[driver as DriverId]?.[product.swapGroup]
    if (affinity) score += affinity * confidence
    // A stimulant is the wrong answer for someone whose energy problem IS
    // caffeine, or who is already wired at bedtime. The goal label could never
    // have told us that.
    if (product.hasStimulants) {
      const penalty = DRIVER_STIM_PENALTY[driver as DriverId]
      if (penalty) score += penalty * confidence
    }
  }

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


  /*
   * ── The protein check said they are already over ─────────────────────────
   *
   * The one place the recommendation deliberately loses a line item. The screen
   * that produced these two numbers says "that's plenty — we'll leave protein
   * out of your box", and this is what makes that true rather than a nice
   * sentence next to a tub in the box.
   *
   * Absent on every v1 answer and everything saved before the module existed,
   * so it contributes nothing there — same invariant as `drivers`.
   */
  if (
    slotType === 'protein' &&
    typeof answers.proteinIntakeG === 'number' &&
    typeof answers.proteinTargetHighG === 'number' &&
    // The CEILING, not the floor. Someone at the bottom of a 130–180g range is
    // on the money, and pulling protein out of their box would contradict the
    // sentence the screen had just shown them.
    answers.proteinIntakeG > answers.proteinTargetHighG
  ) {
    score += SCORING.protein.overTarget
  }

  // ── Diet quality → protein and micronutrient necessity ────────────────────
  // A clean, high-protein diet already covers protein needs — the powder adds
  // less marginal value. A poor diet means a multivitamin is more critical.
  if (answers.diet === 'clean' && slotType === 'protein') score += SCORING.diet.cleanProtein
  if (answers.diet === 'poor' && product.swapGroup === 'multivitamin') score += SCORING.diet.poorMultivitamin
  if (answers.diet === 'poor' && product.swapGroup === 'omega-3') score += SCORING.diet.poorOmega
  if (answers.diet === 'inconsistent' && product.swapGroup === 'multivitamin') score += SCORING.diet.inconsistentMultivitamin

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
    if (product.swapGroup === 'joint-support') score += SCORING.lifestyle.jointSupport
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

// ── Inputs ──────────────────────────────────────────────────────────────────
function A(o: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'P', track: 'performance', primaryGoal: null,
    asNeeded: {}, ageBracket: '25-34', exactAge: null, gender: 'male', goals: ['health'],
    trainingFrequency: '3-4x', trainingType: [], lifestyle: [], diet: 'mostly-good',
    currentSupplements: [], currentVitamins: [], tryOurs: [],
    wellbeingAnswers: {}, dynamicAnswers: {}, caffeineLevel: 'medium', budget: '50-80',
    stackPreference: 'balanced', trainingExperience: 'intermediate', trainingFocus: null,
    stimPreference: 'yes', trainingTime: null, ...o,
  }
}

/** The 14 personas in persona-bundles.snapshot.test.ts, as written there. */
const PERSONAS: QuizAnswers[] = [
  A({ goals: ['muscle'], trainingFrequency: '5-6x', trainingType: ['strength'], trainingFocus: 'hypertrophy', trainingExperience: 'experienced', budget: '80-plus', stackPreference: 'complete', caffeineLevel: 'high', stimPreference: 'yes', trainingTime: 'evening' }),
  A({ goals: ['bulking'], trainingFrequency: '3-4x', trainingType: ['strength'], budget: '50-80' }),
  A({ goals: ['cutting', 'energy'], diet: 'clean', budget: '30-50', stackPreference: 'simple', caffeineLevel: 'high', stimPreference: 'yes' }),
  A({ goals: ['performance', 'hydration'], trainingFrequency: '5-6x', trainingType: ['sport'], trainingFocus: 'football', budget: '80-plus', stackPreference: 'complete', trainingExperience: 'experienced' }),
  A({ goals: ['recovery'], ageBracket: '45+', lifestyle: ['joint-issues'], budget: '50-80' }),
  A({ goals: ['muscle'], lifestyle: ['vegan'], caffeineLevel: 'none', trainingTime: 'evening', budget: '50-80' }),
  A({ goals: ['muscle'], budget: 'under-30', stackPreference: 'simple' }),
  A({ track: 'wellbeing', goals: ['sleep-better', 'less-stress'], gender: 'female', ageBracket: '35-44', wellbeingAnswers: { sleepQuality: 'switch-off', stressPattern: 'evening-wired' }, trainingFrequency: null, budget: '50-80' }),
  A({ track: 'wellbeing', goals: ['immune', 'focus'], diet: 'poor', wellbeingAnswers: { immuneBaseline: 'often' }, budget: '30-50', stackPreference: 'simple' }),
  A({ track: 'wellbeing', goals: ['skin-hair-nails'], wellbeingAnswers: { collagenOk: 'veggie' }, budget: '30-50', stackPreference: 'simple' }),
  A({ track: 'wellbeing', goals: ['menopause', 'gut-health'], gender: 'female', ageBracket: '45+', budget: '80-plus', stackPreference: 'complete' }),
  A({ track: 'wellbeing', goals: ['health'], budget: 'under-30', stackPreference: 'simple' }),
  A({ goals: ['muscle', 'energy'], trainingFrequency: '5-6x', trainingType: ['strength'], trainingFocus: 'hypertrophy', budget: null, stackPreference: null }),
  A({ track: 'wellbeing', goals: ['sleep-better', 'less-stress', 'immune'], trainingFrequency: null, budget: null, stackPreference: null }),
]

/** v2 interview answers: every driver, at confidences that are not exact in binary. */
const DRIVER_ANSWERS: QuizAnswers[] = [
  A({ goals: ['health'], track: 'wellbeing', trainingFrequency: null, budget: null, stackPreference: null,
      drivers: { 'sun-exposure-low': 0.9, 'micronutrient-gap': 0.8 } }),
  A({ goals: ['energy', 'sleep-better'], budget: null, stackPreference: null,
      drivers: { 'caffeine-crash': 0.7, 'wired-evening': 1 / 3, 'sleep-onset': 0.45 } }),
  A({ goals: ['muscle', 'less-stress'], budget: null, stackPreference: null, caffeineLevel: 'high',
      drivers: Object.fromEntries(DRIVER_IDS.map((d, i) => [d, ((i * 37) % 100) / 99])) as QuizAnswers['drivers'] }),
]

/** The protein check: over the ceiling, inside the range, under the floor, absent. */
const PROTEIN_ANSWERS: QuizAnswers[] = [
  A({ goals: ['muscle'], proteinTargetG: 130, proteinTargetHighG: 180, proteinIntakeG: 200 }),
  A({ goals: ['muscle'], proteinTargetG: 130, proteinTargetHighG: 180, proteinIntakeG: 135 }),
  A({ goals: ['recovery'], proteinTargetG: 130, proteinTargetHighG: 180, proteinIntakeG: 80 }),
  A({ goals: ['muscle'], proteinTargetG: null, proteinTargetHighG: null, proteinIntakeG: null }),
]

/** Every other branch of the function, at least once. */
const BRANCH_ANSWERS: QuizAnswers[] = [
  A({ goals: ['energy', 'performance'], safetyFlags: ['pregnancy', 'medication'] }),
  A({ goals: ['muscle'], currentSupplements: ['protein', 'creatine', 'pre-workout', 'collagen'], currentVitamins: ['multivitamin', 'vitamin-d', 'omega-3', 'magnesium', 'vitamin-c'] }),
  A({ goals: ['muscle', 'energy'], currentSupplements: ['protein', 'creatine'], currentVitamins: ['vitamin-d'], tryOurs: ['creatine', 'vitamin-d'] }),
  A({ goals: ['muscle'], lifestyle: ['vegan'] }),
  { ...A({ goals: ['health', 'immune'] }), dietary: ['gluten-free'] } as QuizAnswers,
  A({ goals: ['energy'], stimPreference: 'no' }),
  A({ goals: ['energy', 'less-stress'], trainingTime: 'evening', caffeineLevel: 'low' }),
  A({ goals: ['sleep-better'], track: 'wellbeing', wellbeingAnswers: { sleepQuality: 'wake-night' } }),
  A({ goals: ['sleep-better'], track: 'wellbeing', wellbeingAnswers: { sleepQuality: 'wake-tired' } }),
  A({ goals: ['immune'], track: 'wellbeing', wellbeingAnswers: { sleepQuality: 'fine' } }),
  A({ goals: ['sleep-better'], track: 'wellbeing' }),
  A({ goals: ['immune', 'health'], lifestyle: ['run-down', 'desk-job', 'shift-work', 'joint-issues', 'high-stress'] }),
  A({ goals: ['muscle'], trainingFocus: 'powerlifting', trainingExperience: 'new', trainingFrequency: '1-2x' }),
  A({ goals: ['performance'], trainingFocus: 'general', trainingExperience: 'new', trainingFrequency: 'daily' }),
  A({ goals: ['performance'], trainingFocus: 'rugby', trainingExperience: 'experienced' }),
  A({ goals: ['performance'], trainingFocus: 'basketball', diet: 'inconsistent', gender: 'female' }),
  A({ goals: ['cutting'], diet: 'poor', budget: 'under-30', ageBracket: '45+' }),
  A({ goals: ['bulking', 'muscle', 'recovery'], diet: 'clean', ageBracket: '35-44' }),
  A({ goals: ['menopause', 'gut-health', 'skin-hair-nails', 'focus'], gender: 'female', ageBracket: '45+' }),
  A({ goals: [] }),
]

const ANSWER_SETS: QuizAnswers[] = [...PERSONAS, ...DRIVER_ANSWERS, ...PROTEIN_ANSWERS, ...BRANCH_ANSWERS]

/**
 * The mock catalogue three ways: as shipped (no Top 25 ranks, whole-number
 * priorities), ranked 1-25, and with fractional priorities and ranks past the
 * end of the roster, so running totals are not whole numbers. Plus a joint
 * formula, which the mock catalogue does not have.
 */
const JOINT: CatalogueProduct = {
  ...MOCK_CATALOGUE.find((p) => p.id === 'chrgd-collagen')!,
  id: 'test-joint-formula', swapGroup: 'joint-support', goals: ['recovery'], actives: [],
}
const CATALOGUES: CatalogueProduct[] = [
  ...MOCK_CATALOGUE,
  JOINT,
  ...MOCK_CATALOGUE.map((p, i) => ({ ...p, id: `${p.id}~ranked`, topRank: i + 1 })),
  ...MOCK_CATALOGUE.map((p, i) => ({
    ...p,
    id: `${p.id}~fractional`,
    recommendationPriority: p.recommendationPriority + 0.1 * (i % 7),
    topRank: (i * 7) % 33,
  })),
]

const ARCHETYPES: Archetype[] = ['muscle', 'fat-loss', 'performance', 'health', 'wellbeing']

interface Case { p: CatalogueProduct; slot: SlotType; a: QuizAnswers; arch: Archetype; d: ScoreDetail }

/** Every input once, scored once. Tests below check plain conditions and
 *  collect failures, because an `expect` per case is too slow at this size. */
const CASES: Case[] = []
beforeAll(() => {
  for (const a of ANSWER_SETS) {
    for (const arch of ARCHETYPES) for (const slot of SLOT_ORDER) for (const p of CATALOGUES) {
      CASES.push({ p, slot, a, arch, d: scoreProductDetailed(p, slot, a, arch) })
    }
  }
})
const label = (c: Case) => `${c.p.id} ${c.slot} ${c.arch} [${c.a.goals.join('+')}]`

const sum = (cs: Contribution[]) => cs.reduce((s, c) => s + c.points, 0)

// ── Behaviour preserved ─────────────────────────────────────────────────────
describe('scoreProduct is unchanged', () => {
  it('returns exactly the legacy number for every input (Object.is)', () => {
    const mismatches: string[] = []
    for (const c of CASES) {
      const now = scoreProduct(c.p, c.slot, c.a, c.arch)
      const was = legacyScore(c.p, c.slot, c.a, c.arch)
      if (!Object.is(now, was) || !Object.is(c.d.score, was)) mismatches.push(`${label(c)}: ${now} vs ${was}`)
    }
    expect(mismatches).toEqual([])
    expect(CASES.length).toBeGreaterThan(50_000)
  })

  it('the matrix reaches both outcomes, and fractional scores', () => {
    const scored = CASES.filter((c) => c.d.score !== -Infinity)
    expect(scored.length).toBeGreaterThan(1000)
    expect(CASES.length - scored.length).toBeGreaterThan(1000)
    expect(scored.filter((c) => !Number.isInteger(c.d.score)).length).toBeGreaterThan(1000)
  })
})

describe('the breakdown adds up', () => {
  it('summing contributions in order gives the score exactly, when not excluded', () => {
    const mismatches = CASES
      .filter((c) => !c.d.excludedBy && !Object.is(sum(c.d.contributions), c.d.score))
      .map((c) => `${label(c)}: ${sum(c.d.contributions)} vs ${c.d.score}`)
    expect(mismatches).toEqual([])
  })

  it('is -Infinity exactly when a gate fired, with no contributions', () => {
    const wrong = CASES.filter((c) =>
      (c.d.score === -Infinity) !== (c.d.excludedBy !== null) ||
      (c.d.excludedBy !== null && c.d.contributions.length > 0))
    expect(wrong.map(label)).toEqual([])
  })

  it('never lists a zero-point term, and every rule key is a known one', () => {
    const known = new Set([
      'priorityBase', 'topProduct', 'goalOverlap', 'noGoalFloor', 'goalAffinity', 'sleepBetterMagnesium',
      'driverAffinity', 'driverStimPenalty', 'budgetOverThreshold', 'protein.overTarget',
      ...Object.keys(SCORING.archetype).map((k) => `archetype.${k}`),
      ...Object.keys(SCORING.wellbeing).map((k) => `wellbeing.${k}`),
      ...Object.keys(SCORING.lifestyle).map((k) => `lifestyle.${k}`),
      ...Object.keys(SCORING.deprioritise).map((k) => `deprioritise.${k}`),
      ...Object.keys(SCORING.mass).map((k) => `mass.${k}`),
      ...Object.keys(SCORING.diet).map((k) => `diet.${k}`),
      ...Object.keys(SCORING.focus).map((k) => `focus.${k}`),
      ...Object.keys(SCORING.gender).map((k) => `gender.${k}`),
      ...Object.keys(SCORING.age).map((k) => `age.${k}`),
      ...Object.keys(SCORING.trainingTime).map((k) => `trainingTime.${k}`),
      ...Object.keys(SCORING.caffeine).map((k) => `caffeine.${k}`),
      ...Object.keys(SCORING.experience).map((k) => `experience.${k}`),
    ])
    const seen = new Set<string>()
    const bad: string[] = []
    for (const c of CASES) for (const t of c.d.contributions) {
      if (t.points === 0 || !known.has(t.rule)) bad.push(`${label(c)}: ${t.rule} ${t.points}`)
      seen.add(t.rule)
    }
    expect(bad).toEqual([])
    // The matrix exercises every term the function has, bar one that cannot
    // fire: the mass-gainer goal gate removes a mass gainer for anyone without
    // a bulking goal before the non-bulking penalty is reached.
    expect([...known].filter((r) => !seen.has(r))).toEqual(['mass.nonBulkingPenalty'])
  })

  it('only the three product-property terms use a product.* field', () => {
    const bad = new Set<string>()
    for (const c of CASES) for (const t of c.d.contributions) {
      if (t.field.startsWith('product.') && !['priorityBase', 'topProduct', 'noGoalFloor'].includes(t.rule)) bad.add(t.rule)
    }
    expect([...bad]).toEqual([])
  })
})

// ── What each term says ─────────────────────────────────────────────────────
const product = (id: string) => MOCK_CATALOGUE.find((p) => p.id === id)!
const detail = (id: string, slot: SlotType, a: QuizAnswers): ScoreDetail =>
  scoreProductDetailed(product(id), slot, a, getArchetype(a.goals))
const byRule = (d: ScoreDetail, rule: string) => d.contributions.filter((c) => c.rule === rule)

describe('contributions name the answer they came from', () => {
  it('goal overlap is one contribution per matched goal', () => {
    const p = MOCK_CATALOGUE.find((x) => x.goals.length >= 2)!
    const goals = [...p.goals.slice(0, 2), 'menopause'] as Goal[]
    const d = scoreProductDetailed(p, p.stackSlots[0] as SlotType, A({ goals }), getArchetype(goals))
    const matched = goals.filter((g) => p.goals.includes(g))
    expect(byRule(d, 'goalOverlap')).toEqual(
      matched.map((g) => ({ field: 'goals', value: g, points: SCORING.goalOverlap, rule: 'goalOverlap' })),
    )
  })

  it('goal affinity is one contribution per goal that earns it', () => {
    const a = A({ track: 'wellbeing', goals: ['immune', 'health'], trainingFrequency: null })
    const d = detail('chrgd-vitamin-d3-k2', 'health', a)
    const expected = a.goals
      .map((g) => ({ g, pts: GOAL_AFFINITY[g]?.['vitamin-d'] ?? 0 }))
      .filter((x) => x.pts !== 0)
      .map((x) => ({ field: 'goals', value: x.g, points: x.pts, rule: 'goalAffinity' }))
    expect(expected.length).toBeGreaterThan(0)
    expect(byRule(d, 'goalAffinity')).toEqual(expected)
  })

  it('driver affinity and the stimulant penalty are one contribution per driver', () => {
    const drivers = { 'caffeine-crash': 0.7, 'wired-evening': 0.4 } as const
    const a = A({ goals: ['energy'], drivers, caffeineLevel: 'high' })
    const d = detail('chrgd-pre-workout', 'energy', a)
    expect(byRule(d, 'driverStimPenalty')).toEqual([
      { field: 'drivers', value: 'caffeine-crash', points: DRIVER_STIM_PENALTY['caffeine-crash']! * 0.7, rule: 'driverStimPenalty' },
      { field: 'drivers', value: 'wired-evening', points: DRIVER_STIM_PENALTY['wired-evening']! * 0.4, rule: 'driverStimPenalty' },
    ])
    const mag = detail('chrgd-magnesium', 'sleep', A({ goals: ['sleep-better'], drivers }))
    expect(byRule(mag, 'driverAffinity')).toEqual([
      { field: 'drivers', value: 'wired-evening', points: DRIVER_AFFINITY['wired-evening']!.magnesium! * 0.4, rule: 'driverAffinity' },
    ])
  })

  it('training answers carry their field and value', () => {
    const a = A({ goals: ['muscle'], trainingFocus: 'hypertrophy', trainingExperience: 'experienced' })
    const d = detail('chrgd-creatine', 'performance', a)
    expect(byRule(d, 'focus.hypertrophyPerformance')).toEqual([
      { field: 'trainingFocus', value: 'hypertrophy', points: SCORING.focus.hypertrophyPerformance, rule: 'focus.hypertrophyPerformance' },
    ])
    expect(byRule(d, 'experience.expPerformance')).toEqual([
      { field: 'trainingExperience', value: 'experienced', points: SCORING.experience.expPerformance, rule: 'experience.expPerformance' },
    ])
    expect(byRule(d, 'archetype.muscleProteinOrPerformance')).toEqual([
      { field: 'archetype', value: 'muscle', points: SCORING.archetype.muscleProteinOrPerformance, rule: 'archetype.muscleProteinOrPerformance' },
    ])
  })

  it('a term that fires on a missing goal has a null value', () => {
    const d = detail('chrgd-creatine', 'performance', A({ goals: ['sleep-better'] }))
    expect(byRule(d, 'deprioritise.performanceNonMuscle')).toEqual([
      { field: 'goals', value: null, points: SCORING.deprioritise.performanceNonMuscle, rule: 'deprioritise.performanceNonMuscle' },
    ])
  })

  it('the protein check records the intake it read', () => {
    const d = detail('chrgd-whey-protein', 'protein', A({ goals: ['muscle'], proteinTargetG: 130, proteinTargetHighG: 180, proteinIntakeG: 200 }))
    expect(byRule(d, 'protein.overTarget')).toEqual([
      { field: 'proteinIntakeG', value: 200, points: SCORING.protein.overTarget, rule: 'protein.overTarget' },
    ])
  })

  it('a switch-off sleep answer is credited to whichever answer gave it', () => {
    const viaSleep = detail('chrgd-sleep-support', 'sleep', A({ goals: ['sleep-better'], wellbeingAnswers: { sleepQuality: 'switch-off' } }))
    const viaStress = detail('chrgd-sleep-support', 'sleep', A({ goals: ['sleep-better'], wellbeingAnswers: { stressPattern: 'evening-wired' } }))
    expect(byRule(viaSleep, 'wellbeing.switchOffSleepSupport')[0]).toMatchObject({ field: 'wellbeingAnswers.sleepQuality', value: 'switch-off' })
    expect(byRule(viaStress, 'wellbeing.switchOffSleepSupport')[0]).toMatchObject({ field: 'wellbeingAnswers.stressPattern', value: 'evening-wired' })
  })
})

// ── Exclusions ──────────────────────────────────────────────────────────────
describe('excluded products say why', () => {
  const expectExcluded = (d: ScoreDetail, excludedBy: ScoreDetail['excludedBy']) => {
    expect(d.score).toBe(-Infinity)
    expect(d.contributions).toEqual([])
    expect(d.excludedBy).toEqual(excludedBy)
  }

  it('safety, without recording which flag', () => {
    expectExcluded(
      detail('chrgd-pre-workout', 'energy', A({ goals: ['energy'], safetyFlags: ['pregnancy'] })),
      { reason: 'safety', field: 'safetyFlags', value: null },
    )
  })

  it('a narrow product without its goal', () => {
    expectExcluded(detail('chrgd-mass-builder', 'protein', A({ goals: ['muscle'] })),
      { reason: 'goal-gate', field: 'product.swapGroup', value: 'protein-mass' })
    expectExcluded(detail('chrgd-ashwagandha', 'sleep', A({ goals: ['immune'] })),
      { reason: 'goal-gate', field: 'product.swapGroup', value: 'adaptogen' })
    expectExcluded(detail('chrgd-daily-probiotic', 'health', A({ goals: ['muscle'] })),
      { reason: 'goal-gate', field: 'product.swapGroup', value: 'probiotic' })
  })

  it('stimulants, credited to the answer that ruled them out', () => {
    expectExcluded(detail('chrgd-pre-workout', 'energy', A({ goals: ['energy'], caffeineLevel: 'none' })),
      { reason: 'stimulant', field: 'caffeineLevel', value: 'none' })
    expectExcluded(detail('chrgd-pre-workout', 'energy', A({ goals: ['energy'], stimPreference: 'no', caffeineLevel: 'none' })),
      { reason: 'stimulant', field: 'stimPreference', value: 'no' })
  })

  it('vegan and gluten-free', () => {
    expectExcluded(detail('chrgd-whey-protein', 'protein', A({ goals: ['muscle'], lifestyle: ['vegan'] })),
      { reason: 'vegan', field: 'lifestyle', value: 'vegan' })
    const notGf = { ...product('chrgd-omega-3'), dietaryTags: [] }
    const a = { ...A({ goals: ['health'] }), dietary: ['gluten-free'] } as QuizAnswers
    expectExcluded(scoreProductDetailed(notGf, 'health', a, 'health'),
      { reason: 'gluten-free', field: 'dietary', value: 'gluten-free' })
  })

  it('already taking, by swap group and by slot, naming the list it was ticked in', () => {
    expectExcluded(detail('chrgd-vitamin-d3-k2', 'health', A({ goals: ['health'], currentVitamins: ['vitamin-d'] })),
      { reason: 'already-taking', field: 'currentVitamins', value: 'vitamin-d' })
    expectExcluded(detail('chrgd-whey-protein', 'protein', A({ goals: ['muscle'], currentSupplements: ['protein'] })),
      { reason: 'already-taking', field: 'currentSupplements', value: 'protein' })
    expectExcluded(detail('chrgd-creatine', 'performance', A({ goals: ['muscle'], currentSupplements: ['creatine'] })),
      { reason: 'already-taking', field: 'currentSupplements', value: 'creatine' })
  })

  it('"try ours" lifts the already-taking exclusion', () => {
    const d = detail('chrgd-creatine', 'performance', A({ goals: ['muscle'], currentSupplements: ['creatine'], tryOurs: ['creatine'] }))
    expect(d.excludedBy).toBeNull()
    expect(d.score).toBeGreaterThan(0)
  })

  it('collagen for someone who said vegetarian on the follow-up', () => {
    expectExcluded(
      detail('chrgd-collagen', 'recovery', A({ track: 'wellbeing', goals: ['skin-hair-nails'], wellbeingAnswers: { collagenOk: 'veggie' } })),
      { reason: 'collagen-veggie', field: 'wellbeingAnswers.collagenOk', value: 'veggie' },
    )
  })
})
