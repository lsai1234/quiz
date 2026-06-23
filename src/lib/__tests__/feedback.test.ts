import {
  basisForSlot,
  basisForProduct,
  dimensionForSlot,
  recommendForSubscription,
  type FeedbackCheckIn,
} from '../feedback'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'

const makeProduct = (o: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  id: 'p', title: 'P', handle: 'p', description: '', imageUrl: null, category: 'X',
  stackSlots: ['protein'], goals: [], dietaryTags: [], formats: ['powder'], variants: [],
  basePrice: 30, compareAtPrice: null, subscriptionEligible: true, daysOfSupply: 30,
  swapGroup: 'protein-whey', recommendationPriority: 5, marginPriority: 5,
  isCoreEligible: true, isBoosterEligible: false, hasStimulants: false, shortReason: '',
  warnings: [], shopifyProductId: null, ...o,
})

const line = (o: Partial<MemberSubscriptionLine>): MemberSubscriptionLine => ({
  id: 'l1', productId: 'p', productTitle: 'P', variantTitle: '', slotTitle: 'Protein',
  stackSlot: 'protein', quantity: 1, deliveryIntervalMonths: 1, pricePerDelivery: 25,
  swapGroup: 'protein-whey', ...o,
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

describe('recommendForSubscription', () => {
  const protein = makeProduct({ id: 'protein', stackSlots: ['protein'] })
  const preworkout = makeProduct({ id: 'pre', stackSlots: ['energy'] })
  const catalogue = [protein, preworkout]

  it('always keeps objective products, regardless of feedback', () => {
    const s = sub([line({ id: 'l-pro', productId: 'protein', stackSlot: 'protein', slotTitle: 'Protein' })])
    const recs = recommendForSubscription(s, [checkIn({ energy: 1 })], catalogue)
    expect(recs[0].basis).toBe('objective')
    expect(recs[0].action).toBe('keep')
    expect(recs[0].reason).toMatch(/protein/i)
  })

  it('suggests changing a subjective product when its dimension stays low', () => {
    const s = sub([line({ id: 'l-pre', productId: 'pre', stackSlot: 'energy', slotTitle: 'Energy' })])
    const recs = recommendForSubscription(s, [checkIn({ energy: 2 }), checkIn({ energy: 1 })], catalogue)
    expect(recs[0].basis).toBe('subjective')
    expect(recs[0].action).toBe('consider-change')
  })

  it('keeps a subjective product when its dimension is good', () => {
    const s = sub([line({ id: 'l-pre', productId: 'pre', stackSlot: 'energy', slotTitle: 'Energy' })])
    const recs = recommendForSubscription(s, [checkIn({ energy: 4 }), checkIn({ energy: 5 })], catalogue)
    expect(recs[0].action).toBe('keep')
  })

  it('keeps (with a prompt) when there is no feedback for the dimension', () => {
    const s = sub([line({ id: 'l-pre', productId: 'pre', stackSlot: 'energy', slotTitle: 'Energy' })])
    const recs = recommendForSubscription(s, [], catalogue)
    expect(recs[0].action).toBe('keep')
    expect(recs[0].reason).toMatch(/log/i)
  })
})
