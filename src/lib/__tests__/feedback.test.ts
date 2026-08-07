import {
  basisForSlot,
  basisForProduct,
  dimensionForSlot,
  recommendForSubscription,
  recommendReplacements,
  effectOnsetForProduct,
  onsetForSlot,
  onsetWindowDays,
  buildCheckInQuestions,
  type FeedbackCheckIn,
} from '../feedback'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'

const makeProduct = (o: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  id: 'p', title: 'P', handle: 'p', description: '', imageUrl: null, category: 'X',
  stackSlots: ['protein'], goals: [], dietaryTags: [], formats: ['powder'], variants: [],
  basePrice: 30, compareAtPrice: null, subscriptionEligible: true, servings: 30,
  swapGroup: 'protein-whey', recommendationPriority: 5, marginPriority: 5,
  isCoreEligible: true, isBoosterEligible: false, hasStimulants: false, shortReason: '',
  warnings: [], ...o,
})

const line = (o: Partial<MemberSubscriptionLine>): MemberSubscriptionLine => ({
  id: 'l1', productId: 'p', productTitle: 'P', variantTitle: '', slotTitle: 'Protein',
  stackSlot: 'protein', quantity: 1, deliveryIntervalMonths: 1, pricePerDelivery: 25,
  swapGroup: 'protein-whey', addedAt: new Date().toISOString(), deliveriesMade: 0, ...o,
})

const sub = (lines: MemberSubscriptionLine[]): MemberSubscription => ({
  id: 's', status: 'active', customerEmail: 'a@b.c', flatMonthly: 0, dispatchDayOfMonth: 15,
  minMonths: 4, monthsActive: 2, startedAt: '', paymentMethod: null, lines,
})

const checkIn = (ratings: FeedbackCheckIn['ratings']): FeedbackCheckIn => ({
  id: 'f', date: new Date().toISOString(), ratings, noticedImprovements: false,
})

describe('basis derivation', () => {
  it('treats protein/performance/health as objective, energy/sleep/recovery as subjective', () => {
    expect(basisForSlot('protein')).toBe('objective')
    expect(basisForSlot('performance')).toBe('objective')
    expect(basisForSlot('health')).toBe('objective')
    expect(basisForSlot('hydration')).toBe('objective')
    expect(basisForSlot('energy')).toBe('subjective')
    expect(basisForSlot('sleep')).toBe('subjective')
    expect(basisForSlot('recovery')).toBe('subjective')
  })

  it('honours an explicit product override', () => {
    expect(basisForProduct(makeProduct({ stackSlots: ['protein'], recommendationBasis: 'subjective' }))).toBe('subjective')
    expect(basisForProduct(makeProduct({ stackSlots: ['energy'] }))).toBe('subjective')
  })

  it('maps slots to feedback dimensions', () => {
    expect(dimensionForSlot('energy')).toBe('energy')
    expect(dimensionForSlot('gut')).toBe('digestion')
    expect(dimensionForSlot('protein')).toBeNull()
  })
})

describe('onset derivation', () => {
  it('derives onset from the stack slot', () => {
    expect(onsetForSlot('energy')).toBe('immediate')
    expect(onsetForSlot('sleep')).toBe('short')
    expect(onsetForSlot('health')).toBe('long')
    expect(onsetForSlot('protein')).toBe('none')
  })

  it('honours an explicit product onset', () => {
    expect(effectOnsetForProduct(makeProduct({ stackSlots: ['energy'], effectOnset: 'long' }))).toBe('long')
    expect(effectOnsetForProduct(makeProduct({ stackSlots: ['energy'] }))).toBe('immediate')
  })

  it('orders windows immediate < short < long < never', () => {
    expect(onsetWindowDays('immediate')).toBe(0)
    expect(onsetWindowDays('short')).toBeLessThan(onsetWindowDays('long'))
    expect(onsetWindowDays('none')).toBe(Infinity)
  })
})

describe('recommendForSubscription', () => {
  const protein = makeProduct({ id: 'protein', stackSlots: ['protein'] })
  const preworkout = makeProduct({ id: 'pre', stackSlots: ['energy'] })
  // A felt product with a deliberately long onset (e.g. a slow-build energy blend).
  const slowEnergy = makeProduct({ id: 'slow', stackSlots: ['energy'], effectOnset: 'long' })
  const catalogue = [protein, preworkout, slowEnergy]

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

  it('marks never-felt products as unfelt, regardless of feedback', () => {
    const s = sub([line({ id: 'l-pro', productId: 'protein', stackSlot: 'protein', slotTitle: 'Protein' })])
    const recs = recommendForSubscription(s, [checkIn({ energy: 1 })], catalogue)
    expect(recs[0].basis).toBe('objective')
    expect(recs[0].phase).toBe('unfelt')
    expect(recs[0].reason).toMatch(/protein/i)
  })

  it('flags a felt product for review when its dimension stays low (past its window)', () => {
    const s = sub([line({ id: 'l-pre', productId: 'pre', stackSlot: 'energy', slotTitle: 'Energy' })])
    const recs = recommendForSubscription(s, [checkIn({ energy: 2 }), checkIn({ energy: 1 })], catalogue)
    expect(recs[0].phase).toBe('review')
  })

  it('NEVER reviews a slow-build product still inside its onset window', () => {
    // Added today, low energy ratings — but onset is long, so it's too early.
    const s = sub([line({ id: 'l-slow', productId: 'slow', stackSlot: 'energy', slotTitle: 'Energy', addedAt: daysAgo(3) })])
    const recs = recommendForSubscription(s, [checkIn({ energy: 1 }), checkIn({ energy: 1 })], catalogue)
    expect(recs[0].phase).toBe('too-early')
    expect(recs[0].daysUntilFelt).toBeGreaterThan(0)
  })

  it('keeps a felt product when its dimension is good', () => {
    const s = sub([line({ id: 'l-pre', productId: 'pre', stackSlot: 'energy', slotTitle: 'Energy' })])
    const recs = recommendForSubscription(s, [checkIn({ energy: 4 }), checkIn({ energy: 5 })], catalogue)
    expect(recs[0].phase).toBe('working')
  })

  it('prompts a check-in when a felt product is past its window with no feedback', () => {
    const s = sub([line({ id: 'l-pre', productId: 'pre', stackSlot: 'energy', slotTitle: 'Energy' })])
    const recs = recommendForSubscription(s, [], catalogue)
    expect(recs[0].phase).toBe('check')
    expect(recs[0].reason).toMatch(/tell us/i)
  })

  it('attaches clear, benefit-led statuses (no jargon, no catch-all)', () => {
    // Never-felt need → essential.
    const proteinRec = recommendForSubscription(
      sub([line({ productId: 'protein', stackSlot: 'protein', slotTitle: 'Protein' })]),
      [], catalogue,
    )[0]
    expect(proteinRec.statusTone).toBe('essential')
    expect(proteinRec.statusLabel).toBe('Daily essential')

    // Felt + good → good, with the "felt & working" label.
    const preRec = recommendForSubscription(
      sub([line({ productId: 'pre', stackSlot: 'energy', slotTitle: 'Energy' })]),
      [checkIn({ energy: 4 }), checkIn({ energy: 5 })], catalogue,
    )[0]
    expect(preRec.statusTone).toBe('good')

    // Slow-build within window → building, with a progress ring + week count.
    const slowRec = recommendForSubscription(
      sub([line({ productId: 'slow', stackSlot: 'energy', slotTitle: 'Energy', addedAt: daysAgo(7) })]),
      [], catalogue,
    )[0]
    expect(slowRec.statusTone).toBe('building')
    expect(slowRec.statusLabel).toMatch(/building energy · wk/i)
    expect(slowRec.progress?.pct).toBeGreaterThan(0)
  })
})

describe('buildCheckInQuestions', () => {
  const protein = makeProduct({ id: 'protein', stackSlots: ['protein'] })
  const preworkout = makeProduct({ id: 'pre', stackSlots: ['energy'] })
  const slowEnergy = makeProduct({ id: 'slow', stackSlots: ['energy'], effectOnset: 'long' })
  const catalogue = [protein, preworkout, slowEnergy]
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

  it('asks only about felt, past-onset dimensions and reassures about the rest', () => {
    const s = sub([
      line({ id: 'l-pro', productId: 'protein', stackSlot: 'protein', slotTitle: 'Protein' }),
      line({ id: 'l-pre', productId: 'pre', stackSlot: 'energy', slotTitle: 'Energy' }),
    ])
    const plan = buildCheckInQuestions(s, catalogue)
    expect(plan.questions.map((q) => q.dimension)).toEqual(['energy'])
    expect(plan.questions[0].immediate).toBe(true) // pre-workout is felt same session
    expect(plan.expectations.some((e) => e.productTitle === 'P' && e.onset === 'none')).toBe(true)
  })

  it('does not ask about a product still inside its onset window', () => {
    const s = sub([line({ id: 'l-slow', productId: 'slow', stackSlot: 'energy', slotTitle: 'Energy', addedAt: daysAgo(2) })])
    const plan = buildCheckInQuestions(s, catalogue)
    expect(plan.questions).toHaveLength(0)
    expect(plan.expectations).toHaveLength(1)
    expect(plan.expectations[0].daysUntilFelt).toBeGreaterThan(0)
  })
})

describe('recommendReplacements', () => {
  const whey = makeProduct({ id: 'whey', stackSlots: ['protein'], dietaryTags: [], basePrice: 35, recommendationPriority: 10, swapGroup: 'protein-whey' })
  const plant = makeProduct({ id: 'plant', stackSlots: ['protein'], dietaryTags: ['vegan'], basePrice: 37, recommendationPriority: 9, swapGroup: 'protein-plant' })
  const mass = makeProduct({ id: 'mass', stackSlots: ['protein'], dietaryTags: [], basePrice: 43, recommendationPriority: 8, swapGroup: 'protein-mass' })
  const cat = [whey, plant, mass]
  const wheyLine = line({ id: 'l', productId: 'whey', stackSlot: 'protein', swapGroup: 'protein-whey' })

  it('excludes the current product', () => {
    expect(recommendReplacements(wheyLine, 'exploring', cat).map((p) => p.id)).not.toContain('whey')
  })

  it('filters to vegan for the vegan reason', () => {
    expect(recommendReplacements(wheyLine, 'vegan', cat).map((p) => p.id)).toEqual(['plant'])
  })

  it('puts the cheapest first for the cheaper reason', () => {
    expect(recommendReplacements(wheyLine, 'cheaper', cat)[0].id).toBe('plant') // 37 < 43
  })

  it('prefers a different mechanism for "not working"', () => {
    // both plant and mass are different swap groups; ranked by priority → plant (9) first
    expect(recommendReplacements(wheyLine, 'not-working', cat)[0].id).toBe('plant')
  })
})
