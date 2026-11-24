import { guideWithDay } from '../day'
import { buildGuide, normaliseGuideSeed } from '../build'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'

/** "Set your day": the guide's times follow the day they give, and nothing else about it moves. */

const products = MOCK_CATALOGUE.filter((p) => p.variants.some((v) => v.available)).slice(0, 4)
const guide = buildGuide({
  token: 'g_day_test',
  now: '2026-11-24T10:00:00.000Z',
  plan: 'subscription',
  lines: products.map((p, i) => ({ productId: p.id, usage: i === 0 ? 'heavy' : null })),
  seed: normaliseGuideSeed({ firstName: 'Sam', goals: ['muscle'] }),
  catalogue: MOCK_CATALOGUE,
})

describe('setting your day', () => {
  it('rebuilds the times on the day they give, and marks it theirs', () => {
    const early = guideWithDay(guide, { wake: 5 * 60, bed: 21 * 60, trainAt: 6 * 60, trainWeekdays: [0, 2, 4] }, MOCK_CATALOGUE)
    expect(early.routine.day).toMatchObject({ wake: 300, bed: 1260, trainAt: 360, trainWeekdays: [0, 2, 4], assumed: false })
    // Something timed from waking moves with it.
    const timed = guide.routine.items.filter((i) => i.minutes !== null && i.anchor !== 'pre-workout' && i.anchor !== 'post-workout')
    for (const before of timed) {
      const after = early.routine.items.find((i) => i.productId === before.productId)!
      expect(after.minutes).not.toBe(before.minutes)
    }
  })

  it('keeps the products, how much of each, the link and the claims', () => {
    const changed = guideWithDay(guide, { wake: 6 * 60, bed: 22 * 60 }, MOCK_CATALOGUE)
    expect(changed.token).toBe(guide.token)
    expect(changed.products.map((p) => p.id)).toEqual(guide.products.map((p) => p.id))
    expect(changed.products.map((p) => p.amount)).toEqual(guide.products.map((p) => p.amount))
    expect(changed.products.map((p) => p.claims)).toEqual(guide.products.map((p) => p.claims))
    // The products' own lines agree with the routine they now sit in.
    for (const p of changed.products) {
      const item = changed.routine.items.find((i) => i.productId === p.id)!
      expect(p.moment).toBe(item.moment)
      expect(p.daysLabel).toBe(item.daysLabel)
    }
  })

  it('keeps nonsense out of the day', () => {
    const odd = guideWithDay(guide, { wake: -50, bed: 99999, trainAt: 'evening', trainWeekdays: [9, 1, 1] }, MOCK_CATALOGUE)
    expect(odd.routine.day.wake).toBe(0)
    expect(odd.routine.day.bed).toBe(1439)
    expect(odd.routine.day.trainAt).toBeNull()
    expect(odd.routine.day.trainWeekdays).toEqual([1])
  })
})
