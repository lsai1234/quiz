/**
 * Extras at the member's own plan saving, and "try something new": what's
 * offered, at what price, and what never is.
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { createMockSubscription } from '@/lib/recharge/mock'
import { getPricingConfig, discountWithFloor, unitCostOf } from '@/lib/stack-blueprint/pricing'
import { planExtra } from '../next-box'
import { tryOffer } from '../try-new'
import type { MemberSubscription } from '@/lib/recharge/types'

const config = getPricingConfig()
const ON = { on: true, maxPct: 0.25 }
const plan = (over: Partial<MemberSubscription> = {}) => ({ ...createMockSubscription(MOCK_CATALOGUE, 'm@example.com'), ...over })
const product = (fragment: string) => MOCK_CATALOGUE.find((p) => p.title.includes(fragment))!

describe('an extra in the next box', () => {
  it('is at the member’s own plan saving: 13% on a 13% plan, 20% on a 20% plan', () => {
    const omega = product('Sport Multivitamin')
    const v = omega.variants.find((x) => x.available)!
    const at = (rate: number) => discountWithFloor(v.price, rate, v.cost ?? unitCostOf(omega, v.price, config), config, omega.vatRate)
    for (const rate of [0.13, 0.2]) {
      const planned = planExtra({ sub: plan({ subscriptionDiscountRate: rate }), catalogue: MOCK_CATALOGUE, productId: omega.id })
      if (!planned.ok) throw new Error(planned.reason)
      expect(planned.extra.price).toBeCloseTo(at(rate), 2)
      expect(planned.extra.kind).toBeUndefined()
    }
  })
})

describe('try something new', () => {
  it('offers something not on the plan, not a second of a kind they have, below their plan price', () => {
    const sub = plan()
    const offer = tryOffer(sub, MOCK_CATALOGUE, ON)!
    expect(offer).not.toBeNull()
    const p = MOCK_CATALOGUE.find((x) => x.id === offer.productId)!
    expect(sub.lines.some((l) => l.productId === p.id || l.swapGroup === p.swapGroup)).toBe(false)
    const planned = planExtra({ sub, catalogue: MOCK_CATALOGUE, productId: p.id, variantId: offer.variantId })
    if (!planned.ok) throw new Error(planned.reason)
    expect(offer.price).toBeLessThanOrEqual(planned.extra.price - 0.5)
    // Up to 25% off the shop price, never below the floor.
    expect(offer.pct).toBeLessThanOrEqual(0.25 + 1e-9)
  })

  it('offers nothing while switched off, while one is waiting in a box, or once each is tried or turned down', () => {
    const sub = plan()
    expect(tryOffer(sub, MOCK_CATALOGUE, { on: false, maxPct: 0.25 })).toBeNull()
    const first = tryOffer(sub, MOCK_CATALOGUE, ON)!
    const planned = planExtra({ sub, catalogue: MOCK_CATALOGUE, productId: first.productId, variantId: first.variantId, offer: 'try', tryNew: ON })
    if (!planned.ok) throw new Error(planned.reason)
    expect(planned.extra).toMatchObject({ kind: 'try', price: first.price })
    const waiting: MemberSubscription = { ...sub, deliveryOverrides: { [planned.box.id]: { addedItems: [planned.extra] } } }
    expect(tryOffer(waiting, MOCK_CATALOGUE, ON)).toBeNull()
    expect(tryOffer({ ...sub, tried: [first.productId] }, MOCK_CATALOGUE, ON)?.productId).not.toBe(first.productId)
    expect(tryOffer({ ...sub, tryDismissed: [first.productId] }, MOCK_CATALOGUE, ON)?.productId).not.toBe(first.productId)
  })

  it('never offers what their answers rule out', () => {
    const sub = plan({ safetyConstraints: { dietaryTags: [], noStimulants: true, safetyFlags: [] } })
    const seen = new Set<string>()
    let s: MemberSubscription = sub
    for (let i = 0; i < 20; i++) {
      const offer = tryOffer(s, MOCK_CATALOGUE, ON)
      if (!offer) break
      seen.add(offer.productId)
      s = { ...s, tryDismissed: [...(s.tryDismissed ?? []), offer.productId] }
    }
    const stim = MOCK_CATALOGUE.filter((p) => p.hasStimulants).map((p) => p.id)
    expect(stim.length).toBeGreaterThan(0)
    expect(seen.size).toBeGreaterThan(0)
    for (const id of stim) expect(seen.has(id)).toBe(false)
  })

  it('is refused on the server when it isn’t on offer for that product', () => {
    const sub = plan()
    const onPlan = sub.lines[0]
    const planned = planExtra({ sub, catalogue: MOCK_CATALOGUE, productId: onPlan.productId, offer: 'try', tryNew: ON })
    expect(planned).toEqual({ ok: false, reason: 'try-not-offered' })
    const off = planExtra({ sub, catalogue: MOCK_CATALOGUE, productId: tryOffer(sub, MOCK_CATALOGUE, ON)!.productId, offer: 'try', tryNew: { on: false, maxPct: 0.25 } })
    expect(off).toEqual({ ok: false, reason: 'try-not-offered' })
  })
})
