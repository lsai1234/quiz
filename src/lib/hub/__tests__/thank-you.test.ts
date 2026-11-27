import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { createMockSubscription } from '@/lib/recharge/mock'
import { nextBoxNumber, thankYouFor } from '../thank-you'

/** Thank-you gifts: in the boxes the founders picked, and only for someone they suit. */
describe('a thank-you gift', () => {
  const sub = createMockSubscription(MOCK_CATALOGUE, 'm@example.com')
  const gift = MOCK_CATALOGUE.find((p) => !sub.lines.some((l) => l.productId === p.id) && p.variants.some((v) => v.available) && !p.hasStimulants)!
  const on = (productId: string | null) => ({ on: true, milestones: [{ box: 3, productId, variantId: null }, { box: 6, productId: null, variantId: null }] })

  it('goes in the box it was picked for, and no other', () => {
    expect(thankYouFor(sub, 3, on(gift.id), MOCK_CATALOGUE)?.product.id).toBe(gift.id)
    expect(thankYouFor(sub, 2, on(gift.id), MOCK_CATALOGUE)).toBeNull()
    // Box 6 has nothing picked, so nothing goes.
    expect(thankYouFor(sub, 6, on(gift.id), MOCK_CATALOGUE)).toBeNull()
  })

  it('is left out while switched off, when sold out, when on their plan, or when their answers rule it out', () => {
    expect(thankYouFor(sub, 3, { ...on(gift.id), on: false }, MOCK_CATALOGUE)).toBeNull()
    const soldOut = MOCK_CATALOGUE.map((p) => (p.id === gift.id ? { ...p, variants: p.variants.map((v) => ({ ...v, available: false })) } : p))
    expect(thankYouFor(sub, 3, on(gift.id), soldOut)).toBeNull()
    expect(thankYouFor(sub, 3, on(sub.lines[0].productId), MOCK_CATALOGUE)).toBeNull()
    const stim = MOCK_CATALOGUE.find((p) => p.hasStimulants && !sub.lines.some((l) => l.productId === p.id))
    if (stim) {
      const noStim = { ...sub, safetyConstraints: { dietaryTags: [], noStimulants: true, safetyFlags: [] } }
      expect(thankYouFor(noStim, 3, on(stim.id), MOCK_CATALOGUE)).toBeNull()
    }
  })

  it('counts boxes that went: the next is one more than those', () => {
    expect(nextBoxNumber({ boxesSent: 2 })).toBe(3)
    expect(nextBoxNumber({})).toBe(1)
  })
})
