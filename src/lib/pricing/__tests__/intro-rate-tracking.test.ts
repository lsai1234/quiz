import { PRICING_CONFIG, effectiveIntroDiscount, deepestIntroDiscount, introOutcomesForModelling, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { pricingThresholds } from '@/lib/pricing/thresholds'
import { checkScenarios } from '@/lib/pricing/scenarios'
import { checkLadder } from '@/lib/pricing/ladder'

const clone = (): PricingConfig => JSON.parse(JSON.stringify(PRICING_CONFIG))

/**
 * The card switched back on.
 *
 * It is off in the live config now — a partner's code is the only extra discount
 * — but the mechanism is still there and the model still has to describe it
 * correctly for whenever it comes back, so these tests switch it on explicitly.
 */
function cardOn(): PricingConfig {
  const c = clone()
  c.introOffer.scratchReveal.enabled = true
  return c
}

/** The card switched off, with the flat fallback left wherever it was. */
function cardOffNaive(): PricingConfig {
  const c = cardOn()
  c.introOffer.scratchReveal.enabled = false
  return c
}

/** The card switched off with the flat rate set deliberately. */
function cardOffAt(rate: number): PricingConfig {
  const c = cardOffNaive()
  c.introOffer.scratchReveal.outcomes = []
  c.introOffer.firstMonthDiscount = rate
  return c
}

/**
 * The pricing model has to describe the discount customers actually get.
 *
 * It used to read the scratch card's own config — `effectiveFirstMonthDiscount`
 * (the card's budget) and `scratchReveal.outcomes` — which stay populated after
 * the card is switched off. So every floor and scenario went on assuming a ~15%
 * first month whatever had really replaced it, and with the flat fallback at 50%
 * nothing warned that the giveaway had more than tripled.
 */
describe('the intro rate the model uses follows the one in force', () => {
  it('is the card’s budget while the card runs', () => {
    expect(effectiveIntroDiscount(cardOn())).toBe(PRICING_CONFIG.introOffer.effectiveFirstMonthDiscount)
  })

  it('is the flat rate the moment the card stops running', () => {
    // The naive flip: `enabled: false` and nothing else. What a customer now
    // gets is `firstMonthDiscount`, and that is what the model must say.
    expect(effectiveIntroDiscount(cardOffNaive())).toBe(PRICING_CONFIG.introOffer.firstMonthDiscount)
    expect(effectiveIntroDiscount(cardOffAt(0))).toBe(0)
    expect(effectiveIntroDiscount(cardOffAt(0.15))).toBe(0.15)
  })

  it('reports the deepest first month anyone can get', () => {
    const topCard = Math.max(...PRICING_CONFIG.introOffer.scratchReveal.outcomes.map((o) => o.discount))
    expect(deepestIntroDiscount(cardOn())).toBe(topCard)
    // Off, the flat rate IS the deepest — dropping it left the margin floor
    // checking a discount leg that no longer existed.
    expect(deepestIntroDiscount(cardOffAt(0.5))).toBe(0.5)
    expect(deepestIntroDiscount(cardOffAt(0))).toBe(0)
  })

  it('models a certain flat outcome when there are no cards to deal', () => {
    expect(introOutcomesForModelling(cardOn())).toEqual(PRICING_CONFIG.introOffer.scratchReveal.outcomes)
    expect(introOutcomesForModelling(cardOffAt(0.2))).toEqual([{ discount: 0.2, weight: 1 }])
  })
})

describe('the model notices when the card is switched off', () => {
  it('thresholds move with the real intro rate, not the card’s budget', () => {
    const withCard = pricingThresholds(cardOn())
    const atZero = pricingThresholds(cardOffAt(0))
    const atHalf = pricingThresholds(cardOffAt(0.5))

    // Something in the threshold set has to change; identical numbers across a
    // 0% and a 50% first month is exactly the bug this guards.
    expect(JSON.stringify(atZero)).not.toEqual(JSON.stringify(withCard))
    expect(JSON.stringify(atHalf)).not.toEqual(JSON.stringify(atZero))
  })

  it('the ladder check sees the flat rate as the deepest leg', () => {
    // `clipped` only fires when the margin floor is set to apply to the intro
    // offer (`respectMarginFloor`, currently off — a deep card is meant to lose
    // money). Turn it on and a 50% first month is far past what the floor can
    // absorb, while a 0% one is not.
    const floored = (rate: number) => {
      const c = cardOffAt(rate)
      c.introOffer.respectMarginFloor = true
      return c
    }

    const clipped = checkLadder(34.42, floored(0.5)).clipped
    expect(clipped).not.toBeNull()
    expect(clipped!.advertised).toBeGreaterThan(clipped!.delivered)

    expect(checkLadder(34.42, floored(0)).clipped).toBeNull()
  })

  it('scenarios price the flat first month instead of cards that are never dealt', () => {
    const half = checkScenarios({ listPrice: 103.26, supplierCost: 30 }, cardOffAt(0.5))
    const zero = checkScenarios({ listPrice: 103.26, supplierCost: 30 }, cardOffAt(0))

    const firstMonth = (c: ReturnType<typeof checkScenarios>) =>
      c.scenarios.find((s) => s.id === 'first-month')!

    // A 50% first month must keep materially less than a 0% one. Reading the
    // card's outcomes made these identical.
    expect(firstMonth(half).discount).toBeGreaterThan(firstMonth(zero).discount)
    expect(firstMonth(half).keeps).toBeLessThan(firstMonth(zero).keeps)
  })
})
