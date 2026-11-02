import { rewardLadder } from '../ladder'
import { customerDeliveryCharge } from '@/lib/pricing/delivery'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'

const config = getPricingConfig()
const gift = { title: 'Vitamin C + Zinc', minimum: 40 }

describe('build your stack: the rewards ladder', () => {
  it('lists the gift, the delivery bands, the bundle discount and free delivery, in order', () => {
    const l = rewardLadder({ plan: 'oneoff', listSubtotal: 94.95, monthly: 72.21, gift, config })
    expect(l.rungs.map((r) => [r.at, r.label, r.reached])).toEqual([
      [40, 'Delivery £2.95, not £4.95', true],
      [40, 'Free Vitamin C + Zinc', true],
      [50, '8% off', true],
      [100, 'Free delivery', false],
    ])
    expect(l.next).toMatchObject({ kind: 'free-delivery', toGo: 5.05 })
    expect(l.progress).toBeCloseTo(0.95, 2)
  })

  it('agrees with checkout: delivery drops exactly where customerDeliveryCharge says it does', () => {
    for (const value of [39.99, 40, 99.99, 100]) {
      const l = rewardLadder({ plan: 'oneoff', listSubtotal: value, monthly: 0, gift: null, config })
      const free = l.rungs.find((r) => r.kind === 'free-delivery')!
      const cheaper = l.rungs.find((r) => r.kind === 'delivery')!
      const charge = customerDeliveryCharge(value, 'uk-1', config)
      expect([value, free.reached]).toEqual([value, charge === 0])
      expect([value, cheaper.reached]).toEqual([value, charge < 4.95])
    }
  })

  it('agrees with checkout on the bundle discount', () => {
    const at = (subtotal: number) => rewardLadder({ plan: 'oneoff', listSubtotal: subtotal, monthly: 0, gift: null, config }).rungs.find((r) => r.kind === 'bundle')!.reached
    expect([at(49.99), at(50)]).toEqual([false, true])
  })

  it('subscribed: delivery on the monthly total, no one-off bundle discount, the gift as before', () => {
    const l = rewardLadder({ plan: 'subscription', listSubtotal: 94.95, monthly: 72.21, gift, config })
    expect(l.rungs.some((r) => r.kind === 'bundle')).toBe(false)
    expect(l.rungs.find((r) => r.kind === 'free-delivery')).toMatchObject({ condition: 'from £100.00 a month', toGo: 27.79 })
    expect(l.rungs.find((r) => r.kind === 'gift')?.reached).toBe(true)
  })

  it('takes the offer’s own word on the gift: over the minimum but not on this depth is not unlocked', () => {
    const l = rewardLadder({ plan: 'oneoff', listSubtotal: 94.95, monthly: 0, gift: { ...gift, has: false }, config })
    expect(l.rungs.find((r) => r.kind === 'gift')?.reached).toBe(false)
  })

  it('has no gift rung for someone with no gift, and nothing next once everything is reached', () => {
    const l = rewardLadder({ plan: 'oneoff', listSubtotal: 150, monthly: 0, gift: null, config })
    expect(l.rungs.some((r) => r.kind === 'gift')).toBe(false)
    expect(l.next).toBeNull()
    expect(l.progress).toBe(1)
  })
})
