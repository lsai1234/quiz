import { changeEventId, createChangeEvent } from '@/lib/changes/event'
import { resetPricingOverrides, setPricingOverrides } from '@/lib/stack-blueprint/pricing'
import { line, product, subscriptionWith } from './fixtures'

afterEach(() => resetPricingOverrides())

const NOW = new Date('2026-07-29T09:00:00.000Z')

function eventFor(over: Parameters<typeof createChangeEvent>[0] extends infer T ? Partial<T> : never = {}) {
  const sub = subscriptionWith([
    line({ id: 'l1', pricePerDelivery: 30 }),
    line({ id: 'l2', productId: 'p2', pricePerDelivery: 25 }),
  ])
  return createChangeEvent({
    kind: 'out-of-stock',
    userId: 'u1',
    subscription: sub,
    line: sub.lines[0],
    now: NOW,
    ...over,
  })
}

describe('event identity', () => {
  it('is stable for the same line and problem, so re-detection updates rather than duplicates', () => {
    expect(changeEventId('u1', 'l1', 'out-of-stock')).toBe('chg_u1_l1_out-of-stock')
    expect(eventFor().id).toBe(changeEventId('u1', 'l1', 'out-of-stock'))
  })

  it('separates a discontinuation from an earlier outage on the same line', () => {
    expect(changeEventId('u1', 'l1', 'discontinued')).not.toBe(changeEventId('u1', 'l1', 'out-of-stock'))
  })
})

describe('createChangeEvent', () => {
  it('carries the member’s policy, the intended action and when it lands', () => {
    const event = eventFor({ replacement: product({ id: 'whey-b', price: 30 }) })

    expect(event.policy).toBe('auto-swap')
    expect(event.intendedAction.resolution).toEqual({ type: 'substitute', replacementProductId: 'whey-b' })
    expect(event.suggestedReplacementTitle).toBe('whey-b')
    expect(event.status).toBe('auto-resolved') // routine outage, no review needed
    expect(event.autoApplyAt).toBe(NOW.toISOString())
  })

  it('queues a discontinuation for review with a deadline, not indefinitely', () => {
    setPricingOverrides({ founderReviewHours: 24 })
    const event = eventFor({ kind: 'discontinued', replacement: product({ id: 'whey-b', price: 30 }) })

    expect(event.status).toBe('requires-action')
    expect(event.autoApplyAt).toBe('2026-07-30T09:00:00.000Z')
  })

  it('previews the money the member will actually see', () => {
    const event = eventFor({ replacement: product({ id: 'whey-b', price: 30, cost: 10 }) })
    // £30 list at the default 15% bundle rate = £25.50.
    expect(event.billingPreview).toMatchObject({ currentMonthly: 55, newMonthly: 50.5, monthlyDelta: -4.5 })
  })

  it('previews a removal as a genuine reduction with no settlement charge', () => {
    const event = eventFor({ replacement: null })
    expect(event.intendedAction.resolution).toEqual({ type: 'remove' })
    expect(event.billingPreview).toMatchObject({ currentMonthly: 55, newMonthly: 25, settlement: 0 })
  })

  it('falls back to removal when a swap could only be honoured below the margin floor', () => {
    // The preview and the outcome are derived from the same apply path, so an
    // uneconomic swap is caught here rather than surfacing as a founder-facing
    // number that later turns out to be impossible.
    const event = eventFor({ replacement: product({ id: 'whey-costly', price: 45, cost: 28 }) })

    expect(event.intendedAction.resolution).toEqual({ type: 'remove' })
    expect(event.intendedAction.reason).toBe('replacement-uneconomic')
    expect(event.suggestedReplacementId).toBeNull()
    expect(event.billingPreview?.newMonthly).toBe(25)
  })

  it('distinguishes "nothing left in the category" from "nothing safe for you"', () => {
    expect(eventFor({ replacement: null }).intendedAction.reason).toBe('no-replacement-available')
    expect(eventFor({ replacement: null, unsafeCandidateExists: true }).intendedAction.reason).toBe('no-safe-replacement')
  })

  it('flags a removal that would empty the plan', () => {
    const sub = subscriptionWith([line({ id: 'only', pricePerDelivery: 30 })])
    const event = createChangeEvent({ kind: 'out-of-stock', userId: 'u1', subscription: sub, line: sub.lines[0], now: NOW })

    expect(event.intendedAction.breaksPlan).toBe(true)
    expect(event.status).toBe('requires-action')
  })

  it('absorbs a price rise by default and holds it for review', () => {
    const event = eventFor({
      kind: 'price-increase',
      price: { previousWholesale: 10, newWholesale: 12, previousRrp: 30, newRrp: 34, wholesaleDeltaPct: 0.2 },
    })

    expect(event.intendedAction.resolution).toEqual({ type: 'absorb' })
    expect(event.status).toBe('requires-action')
    expect(event.billingPreview).toBeNull() // nothing moves unless a founder passes it on
    expect(event.price?.wholesaleDeltaPct).toBe(0.2)
  })

  it('preserves the original createdAt when an open event is re-raised', () => {
    const event = eventFor({ createdAt: '2026-07-01T00:00:00.000Z' })
    expect(event.createdAt).toBe('2026-07-01T00:00:00.000Z')
    expect(event.updatedAt).toBe(NOW.toISOString())
  })
})
