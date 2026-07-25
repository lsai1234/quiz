/**
 * Persona → bundle snapshot regression guard (implementation-plan §Testing).
 *
 * Runs the real engine over 14 representative personas across all four paths and
 * snapshots the resulting bundle (products, tiers, totals). This is the safety
 * net for the flow/engine changes: any change that silently moves a
 * recommendation shows up here as a snapshot diff that must be reviewed and
 * explicitly accepted (`jest -u`).
 *
 * Only deterministic fields are captured — the blueprint's `id`/`createdAt`
 * (Date.now-based) are deliberately excluded.
 */
import { buildStackBlueprint } from '../factory'
import { calculatePricing, buildSubscriptionPlan, levelForStackPreference } from '../pricing'
import { buildLqdPlan } from '@/lib/lqd'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { QuizAnswers } from '@/lib/types'

function A(o: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'P', track: 'performance', drinksMode: false, drinksPerDay: null,
    dailyDrinks: null, drinkVariety: null, workoutAddOns: [], primaryGoal: null,
    asNeeded: {}, ageBracket: '25-34', exactAge: null, gender: 'male', goals: ['health'],
    trainingFrequency: '3-4x', trainingType: [], lifestyle: [], diet: 'mostly-good',
    currentSupplements: [], currentVitamins: [], tryOurs: [], preferredFormats: [],
    wellbeingAnswers: {}, dynamicAnswers: {}, caffeineLevel: 'medium', budget: '50-80',
    stackPreference: 'balanced', trainingExperience: 'intermediate', trainingFocus: null,
    stimPreference: 'yes', trainingTime: null, ...o,
  }
}

const PERSONAS: Array<{ n: string; a: QuizAnswers }> = [
  { n: 'perf-muscle-hypertrophy-complete', a: A({ goals: ['muscle'], trainingFrequency: '5-6x', trainingType: ['strength'], trainingFocus: 'hypertrophy', trainingExperience: 'experienced', budget: '80-plus', stackPreference: 'complete', caffeineLevel: 'high', stimPreference: 'yes', trainingTime: 'evening' }) },
  { n: 'perf-bulking-balanced', a: A({ goals: ['bulking'], trainingFrequency: '3-4x', trainingType: ['strength'], budget: '50-80' }) },
  { n: 'perf-cutting-energy-clean', a: A({ goals: ['cutting', 'energy'], diet: 'clean', budget: '30-50', stackPreference: 'simple', caffeineLevel: 'high', stimPreference: 'yes' }) },
  { n: 'perf-performance-hydration-football', a: A({ goals: ['performance', 'hydration'], trainingFrequency: '5-6x', trainingType: ['sport'], trainingFocus: 'football', budget: '80-plus', stackPreference: 'complete', trainingExperience: 'experienced' }) },
  { n: 'perf-recovery-45-joints', a: A({ goals: ['recovery'], ageBracket: '45+', lifestyle: ['joint-issues'], budget: '50-80' }) },
  { n: 'perf-muscle-vegan-noncaffeine', a: A({ goals: ['muscle'], lifestyle: ['vegan'], caffeineLevel: 'none', trainingTime: 'evening', budget: '50-80' }) },
  { n: 'perf-muscle-under30', a: A({ goals: ['muscle'], budget: 'under-30', stackPreference: 'simple' }) },
  { n: 'well-sleep-stress-female', a: A({ track: 'wellbeing', goals: ['sleep-better', 'less-stress'], gender: 'female', ageBracket: '35-44', wellbeingAnswers: { sleepQuality: 'switch-off', stressPattern: 'evening-wired' }, trainingFrequency: null, budget: '50-80' }) },
  { n: 'well-immune-focus-poordiet', a: A({ track: 'wellbeing', goals: ['immune', 'focus'], diet: 'poor', wellbeingAnswers: { immuneBaseline: 'often' }, budget: '30-50', stackPreference: 'simple' }) },
  { n: 'well-skin-veggie', a: A({ track: 'wellbeing', goals: ['skin-hair-nails'], wellbeingAnswers: { collagenOk: 'veggie' }, budget: '30-50', stackPreference: 'simple' }) },
  { n: 'well-menopause-gut-female45', a: A({ track: 'wellbeing', goals: ['menopause', 'gut-health'], gender: 'female', ageBracket: '45+', budget: '80-plus', stackPreference: 'complete' }) },
  { n: 'well-health-under30', a: A({ track: 'wellbeing', goals: ['health'], budget: 'under-30', stackPreference: 'simple' }) },
  { n: 'drinks-perf-muscle-energy', a: A({ drinksMode: true, goals: ['muscle', 'energy'], dailyDrinks: 2, drinksPerDay: 2, drinkVariety: 'staples', workoutAddOns: ['pre-workout', 'protein'], trainingFrequency: '3-4x', budget: null, stackPreference: null }) },
  { n: 'drinks-well-sleep-immune-gut', a: A({ track: 'wellbeing', drinksMode: true, goals: ['sleep-better', 'immune', 'gut-health'], dailyDrinks: 3, drinksPerDay: 3, drinkVariety: 'variety', trainingFrequency: null, budget: null, stackPreference: null }) },
  // Value-first (Phase 2): no budget is asked, so the flow builds the full stack
  // and tiers it on the reveal. These lock the complete (budget: null) build.
  { n: 'valuefirst-perf-muscle-energy', a: A({ goals: ['muscle', 'energy'], trainingFrequency: '5-6x', trainingType: ['strength'], trainingFocus: 'hypertrophy', budget: null, stackPreference: null }) },
  { n: 'valuefirst-well-sleep-stress-immune', a: A({ track: 'wellbeing', goals: ['sleep-better', 'less-stress', 'immune'], trainingFrequency: null, budget: null, stackPreference: null }) },
]

function summarise(a: QuizAnswers) {
  const bp = buildStackBlueprint(a, MOCK_CATALOGUE)
  const pricing = calculatePricing(bp, MOCK_CATALOGUE, a, undefined, { level: levelForStackPreference(a.stackPreference) })
  const summary: Record<string, unknown> = {
    stackName: bp.stackName,
    slots: bp.slots
      .slice()
      .sort((x, y) => x.displayOrder - y.displayOrder)
      .map((s) => ({ title: s.title, productId: s.selectedProductId, swapGroup: s.swapGroup, required: s.required })),
    oneOffTotal: pricing.oneOffTotal,
    subscriptionTotal: pricing.subscriptionTotal,
    subscriptionItemCount: pricing.subscriptionItemCount,
  }
  if (a.drinksMode) {
    const lqd = buildLqdPlan(buildSubscriptionPlan(bp, MOCK_CATALOGUE, a), a)
    summary.lqd = { totalDrinks: lqd.totalDrinks, timed: lqd.timedDrinks, anytime: lqd.anytimeDrinks, fit: lqd.fit }
  }
  return summary
}

describe('persona → bundle regression', () => {
  for (const { n, a } of PERSONAS) {
    it(n, () => {
      expect(summarise(a)).toMatchSnapshot()
    })
  }
})
