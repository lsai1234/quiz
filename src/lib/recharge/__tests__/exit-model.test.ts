/**
 * D-9: what leaving actually costs, across the plans the quiz really builds.
 *
 * These are not unit tests of arithmetic — `settlement.test.ts` does that. They
 * pin the three SHAPES the modelling found, because each one is a commercial
 * decision that the pricing config can silently undo:
 *
 *  1. The settlement is a **sawtooth**, not a decaying balance. It returns to
 *     ~£0 once per cadence and jumps again on the next dispatch. So "wait for a
 *     free exit" is real advice, and there is always a date to give.
 *  2. An intro discount is **never amortised**. It shifts the whole sawtooth up
 *     permanently, so a member who took 50% off month one still owes that
 *     discount three years later. That is a debt created by a marketing offer.
 *  3. Capping at what they have paid costs **almost nothing**, because the cases
 *     that breach it are rare and small.
 *
 * If a pricing change breaks one of these, the exit journey's copy and its
 * fairness argument both stop being true, and this is where that should surface.
 */
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { buildMemberSubscription } from '@/lib/recharge/mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { cappedSettlement, exitCurve, exitPointAt, withIntroDiscount } from '@/lib/recharge/exit-model'
import { levelForStackPreference } from '@/lib/stack-blueprint/pricing'
import type { QuizAnswers } from '@/lib/types'

function answers(o: Partial<QuizAnswers> = {}): QuizAnswers {
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

/** A real plan, through the real engine — not a hand-built fixture. */
function planFor(a: QuizAnswers) {
  const blueprint = buildStackBlueprint(a, MOCK_CATALOGUE)
  return buildMemberSubscription(blueprint, MOCK_CATALOGUE, 'member@example.com', a, {
    level: levelForStackPreference(a.stackPreference),
  })
}

const BULKING = answers({ goals: ['bulking'], trainingFrequency: '3-4x', trainingType: ['strength'], budget: '50-80' })
const IMMUNE = answers({ track: 'wellbeing', goals: ['immune', 'focus'], diet: 'poor', budget: '30-50', stackPreference: 'simple' })

describe('the shape of the balance over a plan’s life', () => {
  it('is a sawtooth that returns to zero once per cadence, not a balance that runs down', () => {
    const curve = exitCurve(planFor(BULKING), 14)
    const owed = curve.points.map((p) => p.settlement)

    // Peaks on dispatch, falls as it amortises, back to ~0 — then again.
    expect(owed[0]).toBeGreaterThan(10)
    expect(owed[2]).toBeLessThan(0.5)
    expect(owed[3]).toBeGreaterThan(10)
    expect(owed[5]).toBeLessThan(0.5)

    // Which means it is NOT true that leaving becomes permanently free. A member
    // three years in can still owe a full dispatch if they cancel on the wrong
    // day — the member-facing promise has to be "free on this date", not
    // "eventually free".
    expect(owed[12]).toBeGreaterThan(10)
  })

  it('always has a free exit within one cadence, which is the number to show a member', () => {
    for (const a of [BULKING, IMMUNE]) {
      const curve = exitCurve(planFor(a), 14)
      const free = curve.points.filter((p) => p.settlement < 0.5).map((p) => p.month)
      expect(free.length).toBeGreaterThan(1)
      // Never more than six months away — usually one or two.
      expect(Math.min(...free)).toBeLessThanOrEqual(6)
    }
  })
})

describe('what an intro discount does to the exit', () => {
  it('is never amortised — the discount becomes a permanent debt', () => {
    const plan = planFor(BULKING)
    const discounted = withIntroDiscount(plan, 0.5)

    const plainFloor = Math.min(...exitCurve(plan, 14).points.map((p) => p.settlement))
    const discountedFloor = Math.min(...exitCurve(discounted, 14).points.map((p) => p.settlement))

    // The undiscounted plan touches zero. The discounted one never does: the
    // whole sawtooth is lifted by the discount, for the life of the plan.
    expect(plainFloor).toBeLessThan(0.5)
    expect(discountedFloor).toBeGreaterThan(plan.flatMonthly * 0.4)
  })

  it('makes the month-one balance exceed everything the member has ever paid', () => {
    const withCard = withIntroDiscount(planFor(BULKING), 0.5)
    const point = exitPointAt(withCard, 0)
    expect(point.ratioToPaid).toBeGreaterThan(1)
  })

  it('excluding the discount from the shortfall fixes both', () => {
    // The lever: settle against what the plan COSTS, not what the card reduced
    // month one to. The discount was a marketing cost we chose to bear — turning
    // it into a debt at the exit is claiming it back from the people most likely
    // to complain about it.
    const plan = planFor(BULKING)
    const withCard = withIntroDiscount(plan, 0.5)
    const excluded = { ...withCard, firstMonth: plan.flatMonthly }

    expect(exitPointAt(withCard, 0).ratioToPaid).toBeGreaterThan(1)
    expect(exitPointAt(excluded, 0).ratioToPaid).toBeLessThan(0.5)
    expect(exitPointAt(excluded, 0).settlement).toBe(exitPointAt(plan, 0).settlement)
  })
})

describe('capping the settlement at what they have paid', () => {
  it('costs almost nothing on a normal plan', () => {
    const curve = exitCurve(planFor(BULKING), 14)
    const writtenOff = curve.points.reduce((s, p) => s + (p.settlement - cappedSettlement(p, 1)), 0)
    expect(writtenOff).toBe(0)
  })

  it('only bites where the balance would otherwise exceed everything paid', () => {
    const point = exitPointAt(withIntroDiscount(planFor(BULKING), 0.5), 0)
    expect(cappedSettlement(point, 1)).toBe(point.paid)
    expect(cappedSettlement(point, 1)).toBeLessThan(point.settlement)
  })

  it('is a no-op when no cap is configured', () => {
    const point = exitPointAt(planFor(BULKING), 0)
    expect(cappedSettlement(point, null)).toBe(point.settlement)
  })
})
