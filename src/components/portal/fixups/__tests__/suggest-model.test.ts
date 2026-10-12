import { needsTags, offersFor, setFor } from '../suggest-model'
import { pendingProduct } from '../../review/__tests__/fixtures'

const untagged = (o = {}) =>
  pendingProduct({ review: undefined, stackSlots: [], goals: [], swapGroup: 'general', shortName: null, recommendationBasis: undefined, ...o })

const SUGGESTION = {
  stackSlots: ['protein', 'recovery'],
  goals: ['muscle', 'recovery'],
  dietaryTags: ['vegan'],
  swapGroup: 'protein-plant',
  shortName: 'Pea Protein',
  hasStimulants: true,
  subscriptionEligible: true,
  recommendationBasis: 'objective',
  servings: 30,
  cost: 9.99,
  consumption: { cadence: 'daily', servingsPerUnit: 30 },
}

describe('needsTags', () => {
  it('is for products missing a stack slot, a goal or a real swap group', () => {
    expect(needsTags(pendingProduct())).toBe(false)
    expect(needsTags(pendingProduct({ goals: [] }))).toBe(true)
    expect(needsTags(pendingProduct({ swapGroup: 'general' }))).toBe(true)
  })
})

describe('offersFor', () => {
  it('offers one chip per tag, by its label, and only for blank fields', () => {
    const offers = offersFor(untagged({ goals: ['energy'] }), SUGGESTION)
    const slots = offers.filter((o) => o.field === 'stackSlots')
    expect(slots.map((o) => o.label)).toEqual(['Protein', 'Recovery'])
    // Goals were already set: nothing is offered over them.
    expect(offers.some((o) => o.field === 'goals')).toBe(false)
    expect(offers.find((o) => o.field === 'swapGroup')?.label).toBe('Plant protein')
  })

  it('never offers a cost, a serving count or a plan that carries one', () => {
    const fields = offersFor(untagged(), SUGGESTION).map((o) => o.field as string)
    expect(fields).not.toContain('cost')
    expect(fields).not.toContain('servings')
    expect(fields).not.toContain('consumption')
  })

  it('includes the short name and stimulants, but stimulants only towards yes', () => {
    const offers = offersFor(untagged(), SUGGESTION)
    expect(offers.find((o) => o.field === 'shortName')?.value).toBe('Pea Protein')
    expect(offers.find((o) => o.field === 'hasStimulants')).toMatchObject({ value: true, defaultOn: true })
    expect(offersFor(untagged({ hasStimulants: true }), { ...SUGGESTION, hasStimulants: false }).some((o) => o.field === 'hasStimulants')).toBe(false)
  })

  it('leaves dietary tags and a subscription change unticked until chosen', () => {
    const offers = offersFor(untagged({ subscriptionEligible: false }), SUGGESTION)
    expect(offers.find((o) => o.field === 'dietaryTags')?.defaultOn).toBe(false)
    expect(offers.find((o) => o.field === 'subscriptionEligible')?.defaultOn).toBe(false)
  })

  it('does not offer "general" as a swap group', () => {
    expect(offersFor(untagged(), { swapGroup: 'general' }).some((o) => o.field === 'swapGroup')).toBe(false)
  })

  it('never offers a tag the save would refuse', () => {
    const offers = offersFor(untagged(), { stackSlots: ['protein', 'teleport'], goals: ['flying'], dietaryTags: ['paleo'], swapGroup: 'unicorn' })
    expect(offers.map((o) => o.key)).toEqual(['stackSlots:protein'])
  })
})

describe('setFor', () => {
  it('turning one chip off drops that one tag, not the field', () => {
    const offers = offersFor(untagged(), SUGGESTION)
    const set = setFor(offers, (o) => o.defaultOn && o.key !== 'stackSlots:recovery')
    expect(set.stackSlots).toEqual(['protein'])
    expect(set.goals).toEqual(['muscle', 'recovery'])
    expect(set).not.toHaveProperty('dietaryTags')
    expect(set).toMatchObject({ swapGroup: 'protein-plant', shortName: 'Pea Protein', hasStimulants: true, recommendationBasis: 'objective' })
  })
})
