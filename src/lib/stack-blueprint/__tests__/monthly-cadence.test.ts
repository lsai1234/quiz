import { buildStackBlueprint } from '../factory'
import { cadenceNote, sizeConsumption, type SubscriptionLine } from '../pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'

/**
 * The monthly-delivery preference, and the line that describes it.
 *
 * Two separate promises, both of which the site used to make and neither of
 * which it kept: that a box mostly refills monthly, and that the caption under
 * the delivery timeline describes the timeline it is under.
 */

const answers = (overrides: Partial<QuizAnswers> = {}): QuizAnswers =>
  ({
    name: '', track: 'performance', ageBracket: '25-34', exactAge: null, gender: 'male',
    goals: ['muscle'], trainingFrequency: '5-6x', trainingType: ['strength'], lifestyle: [],
    diet: 'mostly-good', currentSupplements: [], currentVitamins: [], tryOurs: [],
    wellbeingAnswers: {}, caffeineLevel: 'medium', budget: '50-80', stackPreference: 'balanced',
    trainingExperience: 'intermediate', trainingFocus: null, stimPreference: 'yes',
    trainingTime: null, safetyFlags: [],
    ...overrides,
  }) as unknown as QuizAnswers

const product = (over: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  id: 'p', title: 'P', handle: 'p', description: '', imageUrl: null,
  category: 'Health', stackSlots: ['health'], goals: ['health'], dietaryTags: ['vegan'],
  formats: ['capsule'],
  variants: [{ id: 'v', title: 'One', flavour: null, size: '30', price: 20, compareAtPrice: 25, available: true }],
  basePrice: 20, compareAtPrice: 25, subscriptionEligible: true, servings: 30,
  swapGroup: 'omega-3', recommendationPriority: 8, marginPriority: 5,
  isCoreEligible: true, isBoosterEligible: false, hasStimulants: false,
  shortReason: '', warnings: [],
  ...over,
} as CatalogueProduct)

/** The one field the whole preference reads, isolated. */
const months = (servings: number) =>
  sizeConsumption(product({ servings }), answers()).shipEveryMonths

describe('the monthly preference', () => {
  it('takes the sibling that runs out monthly over one that lasts a quarter', () => {
    // Same job, same goals, near-identical fit — the only thing between them is
    // how often a container empties.
    const quarterly = product({ id: 'quarterly', servings: 90, recommendationPriority: 8 })
    const monthly = product({ id: 'monthly', servings: 30, recommendationPriority: 8 })
    expect(months(90)).toBeGreaterThan(1)
    expect(months(30)).toBe(1)

    const built = buildStackBlueprint(answers({ goals: ['health'] }), [quarterly, monthly])
    expect(built.slots.map((s) => s.selectedProductId)).toContain('monthly')
  })

  /**
   * The guard that matters, and the reason this is not a score bonus.
   *
   * Cadence tracks serving count, which tracks price, so a blanket bonus
   * demotes exactly the cheap long-lasting foundational vitamins. Tried that
   * way it swapped vitamin D out of a plant-based member's box for magnesium
   * and added £7 a month. A monthly product must never displace a DIFFERENT
   * product that fits better.
   */
  it('never lets cadence choose between two products that do different jobs', () => {
    const wellFitting = product({
      id: 'omega', swapGroup: 'omega-3', servings: 120,
      goals: ['health', 'recovery'], recommendationPriority: 10,
    })
    const monthlyOther = product({
      id: 'magnesium', swapGroup: 'magnesium', servings: 30,
      goals: ['health'], recommendationPriority: 8,
    })
    const built = buildStackBlueprint(answers({ goals: ['health', 'recovery'] }), [wellFitting, monthlyOther])
    expect(built.slots[0].selectedProductId).toBe('omega')
  })

  it('leaves a clearly better sibling alone', () => {
    // Six points is the margin; a two-goal gap is fifteen a goal, so this is
    // nowhere near a tie and the long-lasting product keeps its place.
    const betterButLongLasting = product({
      id: 'better', servings: 120, goals: ['health', 'recovery', 'immune'],
      recommendationPriority: 10,
    })
    const monthlyWorse = product({ id: 'worse', servings: 30, goals: [], recommendationPriority: 1 })
    const built = buildStackBlueprint(
      answers({ goals: ['health', 'recovery', 'immune'] }),
      [betterButLongLasting, monthlyWorse],
    )
    expect(built.slots[0].selectedProductId).toBe('better')
  })
})

describe('the delivery caption', () => {
  const line = (shipEveryMonths: number): SubscriptionLine =>
    ({ shipEveryMonths, product: product() }) as unknown as SubscriptionLine

  it('says nothing about an empty plan', () => {
    expect(cadenceNote([])).toBeNull()
  })

  it('claims a monthly refill only when everything actually refills monthly', () => {
    expect(cadenceNote([line(1), line(1)])).toMatch(/Everything here ships every month/)
  })

  /**
   * The bug this replaced: a stack of three-month tubs captioned "most items
   * refill every month" directly under a timeline showing two empty months.
   */
  it('does not claim a monthly refill when nothing refills monthly', () => {
    const note = cadenceNote([line(3), line(4)])!
    expect(note).not.toMatch(/every month/)
    expect(note).toMatch(/Nothing here needs replacing monthly/)
    expect(note).toMatch(/every 4 months/)
  })

  it('counts the mixed case rather than rounding it to "most"', () => {
    const note = cadenceNote([line(1), line(3), line(3)])!
    expect(note).toMatch(/1 of your 3 items ships every month/)
    expect(note).toMatch(/every 3 months/)
  })

  it('never promises the price moves with the deliveries', () => {
    // A flat monthly fee is the product. Every branch has to say so, because
    // the empty months in the timeline are exactly what makes a reader wonder.
    for (const plan of [[line(1)], [line(3)], [line(1), line(2)], [line(1), line(1)]]) {
      expect(cadenceNote(plan)).toMatch(/same|spread evenly/)
    }
  })
})
