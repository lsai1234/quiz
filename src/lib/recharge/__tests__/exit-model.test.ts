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
import { levelForStackPreference, PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import type { QuizAnswers } from '@/lib/types'

function answers(o: Partial<QuizAnswers> = {}): QuizAnswers {
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

/** The policy we rejected, so the reason for rejecting it stays testable. */
const RECLAIMING: PricingConfig = {
  ...PRICING_CONFIG,
  settlement: { ...PRICING_CONFIG.settlement, reclaimIntroDiscount: true, maxShareOfPaid: null, minimum: 0 },
}

describe('what an intro discount would do if we clawed it back', () => {
  it('would never be amortised — the discount becomes a permanent debt', () => {
    const plan = planFor(BULKING)
    const discounted = withIntroDiscount(plan, 0.5)

    const plainFloor = Math.min(...exitCurve(plan, 14, RECLAIMING).points.map((p) => p.settlement))
    const cardFloor = Math.min(...exitCurve(discounted, 14, RECLAIMING).points.map((p) => p.settlement))

    // Undiscounted touches zero once per cadence. Discounted never does: the
    // whole sawtooth is lifted by the discount, for the life of the plan.
    expect(plainFloor).toBeLessThan(0.5)
    expect(cardFloor).toBeGreaterThan(plan.flatMonthly * 0.4)
  })

  it('would make the month-one balance exceed everything the member had paid', () => {
    const withCard = withIntroDiscount(planFor(BULKING), 0.5)
    expect(exitPointAt(withCard, 0, RECLAIMING).ratioToPaid).toBeGreaterThan(1)
  })
})

describe('what the adopted policy does instead', () => {
  it('settles a card holder against the same basis as everyone else', () => {
    const plan = planFor(BULKING)
    const withCard = withIntroDiscount(plan, 0.5)
    // Same plan, same goods, same months — so the same balance. Taking the offer
    // cannot make leaving more expensive.
    expect(exitPointAt(withCard, 0).settlement).toBeLessThanOrEqual(exitPointAt(plan, 0).settlement)
    expect(exitPointAt(withCard, 0).ratioToPaid).toBeLessThan(1)
  })

  it('keeps a free-exit window even for a card holder', () => {
    const withCard = withIntroDiscount(planFor(BULKING), 0.5)
    const free = exitCurve(withCard, 14).points.filter((p) => p.settlement === 0)
    expect(free.length).toBeGreaterThan(1)
  })

  it('never asks for more than the member has paid', () => {
    for (const rate of [0, 0.1, 0.25, 0.5]) {
      const plan = withIntroDiscount(planFor(BULKING), rate)
      for (const point of exitCurve(plan, 14).points) {
        expect(point.settlement).toBeLessThanOrEqual(point.paid)
      }
    }
  })
})

describe('the cap, in isolation', () => {
  it('is a no-op when no cap is configured', () => {
    const point = exitPointAt(planFor(BULKING), 0)
    expect(cappedSettlement(point, null)).toBe(point.settlement)
  })

  it('bites only where the balance would exceed everything paid', () => {
    const point = exitPointAt(withIntroDiscount(planFor(BULKING), 0.5), 0, RECLAIMING)
    expect(cappedSettlement(point, 1)).toBe(point.paid)
    expect(cappedSettlement(point, 1)).toBeLessThan(point.settlement)
  })
})
