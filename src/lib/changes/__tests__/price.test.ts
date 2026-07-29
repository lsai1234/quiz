/**
 * Supplier price moves: the margin maths, and the rule that an increase can
 * never reach a member's card before its notice has run.
 */
import {
  breachesFloor,
  marginPct,
  minimumPassOnPct,
  passOnListPrice,
  summarisePriceGroup,
} from '@/lib/changes/price'
import { absorbPriceChange, applyDueChanges, runChangeDetection, schedulePassOn } from '@/lib/changes/service'
import { getChange, listChanges } from '@/lib/changes/repo'
import { changeEventId } from '@/lib/changes/event'
import { listNotifications } from '@/lib/notify/outbox'
import type { FeedEntry } from '@/lib/changes/detect'
import type { ChangeEvent, PriceMove } from '@/lib/changes/types'
import { createUser } from '@/lib/db/users'
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'
import { getPricingConfig, resetPricingOverrides, setPricingOverrides } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import { line, product, subscriptionWith } from './fixtures'

afterEach(() => resetPricingOverrides())

const NOW = new Date('2026-07-29T09:00:00.000Z')

const move = (over: Partial<PriceMove> = {}): PriceMove => ({
  previousWholesale: 10, newWholesale: 12, previousRrp: 30, newRrp: 36, wholesaleDeltaPct: 0.2, ...over,
})

describe('the margin maths', () => {
  it('reports margin as a share of the selling price', () => {
    expect(marginPct(30, 12)).toBe(0.6)
    expect(marginPct(30, 30)).toBe(0)
    expect(marginPct(30, 36)).toBe(-0.2) // selling at a loss
  })

  it('passes on the same proportion the cost moved', () => {
    // A 20% cost rise passed on in full is a 20% price rise; half is 10%.
    expect(passOnListPrice(30, move(), 1)).toBe(36)
    expect(passOnListPrice(30, move(), 0.5)).toBe(33)
    expect(passOnListPrice(30, move(), 0)).toBe(30)
  })

  it('never passes on more than all of it, however the caller asks', () => {
    expect(passOnListPrice(30, move(), 2)).toBe(36)
    expect(passOnListPrice(30, move(), -1)).toBe(30)
  })

  it('passes a cost decrease down as a price cut', () => {
    expect(passOnListPrice(30, move({ wholesaleDeltaPct: -0.1 }), 1)).toBe(27)
  })

  it('knows when a price would breach the floor', () => {
    setPricingOverrides({ marginFloorPct: 0.15 })
    const config = getPricingConfig()
    expect(breachesFloor(30, 12, config)).toBe(false) // floor 13.80
    expect(breachesFloor(30, 28, config)).toBe(true) // floor 32.20
  })

  it('suggests the smallest pass-on that clears the floor', () => {
    setPricingOverrides({ marginFloorPct: 0.15 })
    const config = getPricingConfig()
    // Cost 28 needs a list of at least 32.20; from 30 that's a 7.34% rise, and
    // the move is 40% — so roughly a fifth of it needs passing on.
    const share = minimumPassOnPct(30, move({ previousWholesale: 20, newWholesale: 28, wholesaleDeltaPct: 0.4 }), config)
    expect(share).toBeGreaterThan(0.18)
    expect(share).toBeLessThan(0.2)
  })

  it('suggests nothing when absorbing is already fine', () => {
    expect(minimumPassOnPct(30, move(), getPricingConfig())).toBeNull()
  })
})

describe('summarising a group', () => {
  const p = product({ id: 'whey-a', price: 30, cost: 10 })
  const sub = subscriptionWith([line({ id: 'l1', productId: 'whey-a', pricePerDelivery: 30, quantity: 1 })], {
    customerEmail: 'sam@example.com',
    subscriptionDiscountRate: 0,
  })
  const events = [
    { id: 'e1', userId: 'u1', customerEmail: 'sam@example.com', lineId: 'l1', productId: 'whey-a', productTitle: 'Whey A', sku: 'SKU-A', price: move() } as ChangeEvent,
  ]

  it('shows both sides of the decision', () => {
    const impact = summarisePriceGroup({
      product: p, events, subscriptions: new Map([['u1', sub]]), passOnPct: 1, config: getPricingConfig(),
    })

    expect(impact.marginNow).toBeCloseTo(0.667, 2) // £30 list, £10 cost
    expect(impact.marginIfAbsorbed).toBeCloseTo(0.6, 2) // cost now £12
    expect(impact.passOnUnitPrice).toBe(36)
    expect(impact.affectedCount).toBe(1)
  })

  it('works the money out per member, not blended', () => {
    // Two members on different bundle rates feel the same supplier rise
    // differently — an average would hide exactly the outlier worth seeing.
    const cheap = subscriptionWith([line({ id: 'l1', productId: 'whey-a', pricePerDelivery: 30 })], { subscriptionDiscountRate: 0 })
    const discounted = subscriptionWith([line({ id: 'l1', productId: 'whey-a', pricePerDelivery: 24 })], { subscriptionDiscountRate: 0.2 })

    const impact = summarisePriceGroup({
      product: p,
      events: [
        { ...events[0], id: 'e1', userId: 'u1' } as ChangeEvent,
        { ...events[0], id: 'e2', userId: 'u2' } as ChangeEvent,
      ],
      subscriptions: new Map([['u1', cheap], ['u2', discounted]]),
      passOnPct: 1,
      config: getPricingConfig(),
    })

    expect(impact.members).toHaveLength(2)
    expect(impact.members[0].monthlyAfter).toBe(36) // full price
    expect(impact.members[1].monthlyAfter).toBe(28.8) // 20% off the new list
    expect(impact.totalMonthlyDelta).toBe(10.8)
  })

  it('flags a cost that would put us under water', () => {
    const impact = summarisePriceGroup({
      product: product({ id: 'whey-a', price: 30, cost: 10 }),
      events: [{ ...events[0], price: move({ newWholesale: 32, wholesaleDeltaPct: 2.2 }) } as ChangeEvent],
      subscriptions: new Map([['u1', sub]]),
      config: getPricingConfig(),
    })

    expect(impact.absorbLosesMoney).toBe(true)
    expect(impact.absorbBreachesFloor).toBe(true)
    expect(impact.marginIfAbsorbed).toBeLessThan(0)
  })
})

// ─── End to end ───────────────────────────────────────────────────────────────

function withSku(id: string, sku: string, over: Parameters<typeof product>[0] = { id }): CatalogueProduct {
  const p = product({ ...over, id })
  return { ...p, variants: [{ ...p.variants[0], sku }] }
}

const entry = (sku: string, over: Partial<FeedEntry> = {}): FeedEntry => ({
  sku, stock: 10, inStock: true, wholesalePrice: 10, rrp: 30, ...over,
})

const CATALOGUE = [withSku('whey-a', 'SKU-A', { id: 'whey-a', price: 30, cost: 10 }), withSku('other', 'SKU-OTHER', { id: 'other', swapGroup: 'creatine' })]
const BASELINE = [entry('SKU-A'), entry('SKU-OTHER')].map((e) => ({
  ...e, missedSyncs: 0, lastSeenAt: '2026-07-28T09:00:00.000Z', updatedAt: '2026-07-28T09:00:00.000Z',
}))
/** SKU-A costs 20% more than it did. */
const DEARER = [entry('SKU-A', { wholesalePrice: 12 }), entry('SKU-OTHER')]

async function seedMember(email: string, over: Partial<MemberSubscription> = {}) {
  const user = await createUser({ email })
  const sub = subscriptionWith(
    [line({ id: 'l1', productId: 'whey-a', pricePerDelivery: 30 }), line({ id: 'l2', productId: 'other', pricePerDelivery: 30 })],
    { customerEmail: email, subscriptionDiscountRate: 0, dispatchDayOfMonth: 15, ...over },
  )
  await saveSubscription(user.id, sub)
  return { userId: user.id, subscription: sub }
}

const run = (subs: { userId: string; subscription: MemberSubscription }[]) =>
  runChangeDetection({
    feed: DEARER, previousSnapshots: BASELINE, subscriptions: subs,
    catalogue: CATALOGUE, now: NOW, config: getPricingConfig(),
  })

describe('detecting a supplier increase', () => {
  it('raises an event per affected member, absorbed by default', async () => {
    const member = await seedMember('price-detect@example.com')
    const result = await run([member])

    const event = await getChange(changeEventId(member.userId, 'l1', 'price-increase'))
    expect(event).toMatchObject({ kind: 'price-increase', status: 'requires-action' })
    expect(event!.intendedAction.resolution).toEqual({ type: 'absorb' })
    expect(event!.price!.wholesaleDeltaPct).toBeCloseTo(0.2, 5)
    // Nobody's plan moved, and nobody was emailed.
    expect((await getSubscription(member.userId))!.flatMonthly).toBe(60)
    expect(result.notified).toBe(0)
  })

  it('leaves the member’s price alone when the queue is never opened', async () => {
    // The whole reason absorb is the default: an unattended queue costs the
    // member nothing, and the sweep applying it changes no money.
    const member = await seedMember('price-unattended@example.com')
    await run([member])
    await applyDueChanges({ now: new Date('2026-08-05T09:00:00.000Z'), config: getPricingConfig(), catalogue: CATALOGUE })

    expect((await getSubscription(member.userId))!.flatMonthly).toBe(60)
  })
})

describe('absorbing', () => {
  it('closes the events and records the new cost, leaving prices alone', async () => {
    const member = await seedMember('absorb@example.com')
    await run([member])

    const resolved = await absorbPriceChange('whey-a', { now: NOW })

    expect(resolved.length).toBeGreaterThan(0)
    expect(resolved[0].resolution).toEqual({ type: 'absorb' })
    expect((await getSubscription(member.userId))!.flatMonthly).toBe(60)
    expect(await listNotifications({ userId: member.userId })).toHaveLength(0)

    const { getProductOverride } = await import('@/lib/portal/store')
    expect((await getProductOverride('whey-a'))?.cost).toBe(12)
  })
})

describe('passing it on', () => {
  it('never bills before the notice has run, and never touches the plan early', async () => {
    // The invariant that matters most in this whole phase.
    setPricingOverrides({ priceChangeNoticeDays: 30 })
    const member = await seedMember('passon@example.com')
    await run([member])

    const { scheduled, notified } = await schedulePassOn('whey-a', 1, {
      now: NOW, config: getPricingConfig(), catalogue: CATALOGUE,
    })

    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].status).toBe('scheduled')

    const noticeEnds = new Date(NOW)
    noticeEnds.setDate(noticeEnds.getDate() + 30)
    expect(new Date(scheduled[0].autoApplyAt).getTime()).toBeGreaterThanOrEqual(noticeEnds.getTime())

    // Told now; charged later. That gap is the entire point.
    expect(notified).toBe(1)
    expect((await getSubscription(member.userId))!.flatMonthly).toBe(60)
  })

  it('sends a notice that states old, new, when, and the free way out', async () => {
    setPricingOverrides({ priceChangeNoticeDays: 30 })
    const member = await seedMember('passon-notice@example.com')
    await run([member])
    await schedulePassOn('whey-a', 1, { now: NOW, config: getPricingConfig(), catalogue: CATALOGUE })

    const sent = await listNotifications({ userId: member.userId })
    expect(sent[0].template).toBe('price-change-notice')
    expect(sent[0].rendered.text).toContain('£60.00')
    expect(sent[0].rendered.text).toContain('£66.00') // +20% on the £30 line
    expect(sent[0].rendered.text).toMatch(/cancel free of charge/i)
    expect(sent[0].rendered.text).toMatch(/inside a minimum term/i)
  })

  it('applies at the effective date, through the same path as everything else', async () => {
    setPricingOverrides({ priceChangeNoticeDays: 30 })
    const member = await seedMember('passon-apply@example.com')
    await run([member])
    const { scheduled } = await schedulePassOn('whey-a', 1, { now: NOW, config: getPricingConfig(), catalogue: CATALOGUE })

    const dueDate = new Date(scheduled[0].autoApplyAt)
    dueDate.setDate(dueDate.getDate() + 1)
    await applyDueChanges({ now: dueDate, config: getPricingConfig(), catalogue: CATALOGUE })

    const stored = await getSubscription(member.userId)
    expect(stored!.flatMonthly).toBe(66)
    expect(stored!.billingHistory).toHaveLength(1)
    expect(stored!.billingHistory![0]).toMatchObject({ previousMonthly: 60, newMonthly: 66, reason: 'price-increase' })
  })

  it('passes on only the share the founder chose', async () => {
    setPricingOverrides({ priceChangeNoticeDays: 30 })
    const member = await seedMember('passon-half@example.com')
    await run([member])
    const { scheduled } = await schedulePassOn('whey-a', 0.5, { now: NOW, config: getPricingConfig(), catalogue: CATALOGUE })

    // Half of a 20% rise on a £30 line: £33, so £63/mo.
    expect(scheduled[0].resolution).toEqual({ type: 'pass-on', newUnitPrice: 33 })

    const dueDate = new Date(scheduled[0].autoApplyAt)
    dueDate.setDate(dueDate.getDate() + 1)
    await applyDueChanges({ now: dueDate, config: getPricingConfig(), catalogue: CATALOGUE })

    expect((await getSubscription(member.userId))!.flatMonthly).toBe(63)
  })

  it('does nothing for a product with no open price events', async () => {
    expect(await schedulePassOn('nothing-here', 1, { catalogue: CATALOGUE })).toEqual({ scheduled: [], notified: 0 })
  })
})

describe('a cost decrease', () => {
  it('is raised as its own kind and absorbed in our favour by default', async () => {
    const member = await seedMember('cheaper@example.com')
    await runChangeDetection({
      feed: [entry('SKU-A', { wholesalePrice: 8 }), entry('SKU-OTHER')],
      previousSnapshots: BASELINE,
      subscriptions: [member],
      catalogue: CATALOGUE,
      now: NOW,
      config: getPricingConfig(),
    })

    const event = await getChange(changeEventId(member.userId, 'l1', 'price-decrease'))
    expect(event!.kind).toBe('price-decrease')
    expect(event!.intendedAction.resolution).toEqual({ type: 'absorb' })
  })

  it('can be passed down at the next cycle, without a notice period', async () => {
    setPricingOverrides({ priceChangeNoticeDays: 30 })
    const member = await seedMember('passdown@example.com')
    await runChangeDetection({
      feed: [entry('SKU-A', { wholesalePrice: 8 }), entry('SKU-OTHER')],
      previousSnapshots: BASELINE, subscriptions: [member], catalogue: CATALOGUE,
      now: NOW, config: getPricingConfig(),
    })

    const { scheduled } = await schedulePassOn('whey-a', 1, { now: NOW, config: getPricingConfig(), catalogue: CATALOGUE })
    const dueDate = new Date(scheduled[0].autoApplyAt)
    dueDate.setDate(dueDate.getDate() + 1)
    await applyDueChanges({ now: dueDate, config: getPricingConfig(), catalogue: CATALOGUE })

    // 20% off the cost → 20% off the list: £24, so £54/mo.
    expect((await getSubscription(member.userId))!.flatMonthly).toBe(54)
  })
})

describe('the open queue', () => {
  it('keeps price events separate from availability ones', async () => {
    const member = await seedMember('mixed@example.com')
    await run([member])

    const open = (await listChanges({ userId: member.userId })).map((e) => e.kind)
    expect(open).toContain('price-increase')
    expect(open).not.toContain('out-of-stock')
  })
})

describe('a decision already made', () => {
  it('stops offering itself as an open choice', async () => {
    // Otherwise a founder could absorb something a member has already been
    // given 30 days' notice of a rise on.
    setPricingOverrides({ priceChangeNoticeDays: 30 })
    const member = await seedMember('decided@example.com')
    await run([member])
    await schedulePassOn('whey-a', 1, { now: NOW, config: getPricingConfig(), catalogue: CATALOGUE })

    const { isUndecided } = await import('@/lib/changes/service')
    const event = await getChange(changeEventId(member.userId, 'l1', 'price-increase'))
    expect(event!.status).toBe('scheduled') // still open — it hasn't billed
    expect(isUndecided(event!)).toBe(false) // but no longer a choice

    // A second pass-on, or an absorb, finds nothing left to decide.
    expect(await schedulePassOn('whey-a', 1, { now: NOW, config: getPricingConfig(), catalogue: CATALOGUE }))
      .toEqual({ scheduled: [], notified: 0 })
    expect(await absorbPriceChange('whey-a', { now: NOW })).toEqual([])
  })
})
