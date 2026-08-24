/**
 * A box contains what is DUE, not everything on the plan.
 *
 * This is the fix for the bug that made the whole exit-settlement story a
 * fiction. `subscriptionOrderLines` used to map every line on every invoice, so
 * a member paying a third of a tub's price each month was sent a whole tub each
 * month — roughly 2× the goods on every multi-month line — while
 * `deliveriesMadeFor`, which the settlement bills against, insisted it shipped
 * once a quarter. Billing and dispatch disagreed about what had happened.
 *
 * The cases below are the ones that were wrong, plus the two edges that are easy
 * to get wrong in the other direction: the signup box must contain everything,
 * and a cycle where nothing is due must not become a phantom parcel.
 */
import { subscriptionOrderLines, createSubscriptionOrder, awaitingReview } from '@/lib/orders/service'
import { buildFulfilmentQueue } from '@/lib/orders/queue'
import { shipsAtCycle } from '@/lib/recharge/clock'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

const CATALOGUE = [
  { id: 'protein', cost: 18, variants: [{ id: 'v1', sku: 'SKU-PROTEIN', available: true, price: 36.54 }] },
  { id: 'creatine', cost: 8, variants: [{ id: 'v2', sku: 'SKU-CREATINE', available: true, price: 16.99 }] },
  { id: 'magnesium', cost: 6, variants: [{ id: 'v3', sku: 'SKU-MAG', available: true, price: 12.74 }] },
] as unknown as CatalogueProduct[]

function line(over: Partial<MemberSubscriptionLine>): MemberSubscriptionLine {
  return {
    id: `line-${over.productId}`,
    productId: 'protein',
    productTitle: 'Protein',
    variantTitle: '',
    slotTitle: 'Protein',
    stackSlot: 'protein',
    quantity: 1,
    pricePerDelivery: 36.54,
    deliveryIntervalMonths: 1,
    deliveriesMade: 1,
    joinedAtMonth: 0,
    ...over,
  } as MemberSubscriptionLine
}

/** The plan from the worked example: two monthly items and a three-month tub. */
function plan(over: Partial<MemberSubscription> = {}): MemberSubscription {
  return {
    id: 'sub_1',
    customerEmail: 'member@example.com',
    status: 'active',
    flatMonthly: 54.94,
    monthsActive: 0,
    minMonths: 1,
    lines: [
      line({ productId: 'protein', productTitle: 'Protein', pricePerDelivery: 36.54, deliveryIntervalMonths: 1 }),
      line({ productId: 'creatine', productTitle: 'Creatine', pricePerDelivery: 16.99, deliveryIntervalMonths: 3 }),
      line({ productId: 'magnesium', productTitle: 'Magnesium', pricePerDelivery: 12.74, deliveryIntervalMonths: 1 }),
    ],
    ...over,
  } as MemberSubscription
}

const titlesAt = (cycle: number, sub = plan()) =>
  subscriptionOrderLines(sub, CATALOGUE, cycle).map((l) => l.title).sort()

describe('which lines go in which box', () => {
  it('puts everything in the signup box', () => {
    expect(titlesAt(0)).toEqual(['Creatine', 'Magnesium', 'Protein'])
  })

  it('leaves the three-month tub out of the months it is not due', () => {
    // THE BUG. Both of these used to contain the creatine as well.
    expect(titlesAt(1)).toEqual(['Magnesium', 'Protein'])
    expect(titlesAt(2)).toEqual(['Magnesium', 'Protein'])
  })

  it('sends the tub again when it is actually due', () => {
    expect(titlesAt(3)).toEqual(['Creatine', 'Magnesium', 'Protein'])
    expect(titlesAt(6)).toEqual(['Creatine', 'Magnesium', 'Protein'])
  })

  it('charges the box for what is in it, not for the whole plan', () => {
    // The order's own total is what dispatched. A month without the tub is a
    // cheaper box than the month with it — which is the entire reason the flat
    // monthly exists, and was invisible while every box held everything.
    const withTub = subscriptionOrderLines(plan(), CATALOGUE, 0)
    const without = subscriptionOrderLines(plan(), CATALOGUE, 1)
    const value = (ls: { unitPrice: number; quantity: number }[]) =>
      Math.round(ls.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100
    expect(value(withTub)).toBe(66.27)
    expect(value(without)).toBe(49.28)
  })

  it('does not credit a line added later with boxes that shipped before it existed', () => {
    const added = plan({
      lines: [
        line({ productId: 'protein', deliveryIntervalMonths: 1 }),
        line({ productId: 'creatine', productTitle: 'Creatine', deliveryIntervalMonths: 3, joinedAtMonth: 4 }),
      ],
    })
    expect(titlesAt(3, added)).toEqual(['Protein'])
    // Ships on the cycle it joined, then on its own cadence from there.
    expect(titlesAt(4, added)).toEqual(['Creatine', 'Protein'])
    expect(titlesAt(5, added)).toEqual(['Protein'])
    expect(titlesAt(7, added)).toEqual(['Creatine', 'Protein'])
  })
})

describe('a cycle where nothing is due', () => {
  const quarterly = plan({
    flatMonthly: 5.66,
    lines: [line({ productId: 'creatine', productTitle: 'Creatine', deliveryIntervalMonths: 3 })],
  })

  it('produces an empty box rather than a phantom parcel', () => {
    expect(subscriptionOrderLines(quarterly, CATALOGUE, 1)).toEqual([])
    expect(subscriptionOrderLines(quarterly, CATALOGUE, 2)).toEqual([])
    expect(subscriptionOrderLines(quarterly, CATALOGUE, 3)).toHaveLength(1)
  })

  it('still raises the order, because it is the record the invoice was processed', async () => {
    const order = await createSubscriptionOrder({
      id: 'ord_inv_empty',
      sub: quarterly,
      catalogue: CATALOGUE,
      cycle: 1,
    })
    expect(order.lines).toEqual([])
    expect(order.status).toBe('paid')
  })

  it('is not put in front of a founder to approve', async () => {
    const order = await createSubscriptionOrder({
      id: 'ord_inv_empty_2',
      sub: quarterly,
      catalogue: CATALOGUE,
      cycle: 2,
    })
    expect(awaitingReview(order)).toBe(false)
    expect(buildFulfilmentQueue([order]).days).toEqual([])
    expect(buildFulfilmentQueue([order]).pending).toBe(0)
  })
})

describe('a box the member skipped', () => {
  // Skips are keyed by calendar month on `deliveryOverrides`; dispatch counts in
  // cycles. `cycleIsSkipped` is the join, derived from `startedAt`.
  const skipped = plan({
    startedAt: '2026-01-10T00:00:00.000Z',
    deliveryOverrides: { '2026-02': { skipped: true } },
  })

  it('does not ship', () => {
    // Cycle 1 is February, which they skipped.
    expect(subscriptionOrderLines(skipped, CATALOGUE, 1)).toEqual([])
  })

  it('does not disturb the months around it', () => {
    expect(titlesAt(0, skipped)).toEqual(['Creatine', 'Magnesium', 'Protein'])
    expect(titlesAt(2, skipped)).toEqual(['Magnesium', 'Protein'])
  })

  it('means the skipped box never reaches the settlement', () => {
    // E-3, fixed by construction: the exit ledger counts orders, and a skipped
    // cycle has no lines to count. Nothing subtracts it afterwards because
    // nothing added it.
    expect(subscriptionOrderLines(skipped, CATALOGUE, 1)).toHaveLength(0)
  })
})

describe('an item the member pulled out of one box', () => {
  // The other half of the same join. `removedLineIds` was read by the hub's own
  // calendar and by nothing else, so "remove from this box" removed it from the
  // member's PICTURE of the box and the supplier shipped it anyway — the member
  // saw a box they had edited and received one they hadn't.
  const pulled = plan({
    startedAt: '2026-01-10T00:00:00.000Z',
    deliveryOverrides: { '2026-02': { removedLineIds: ['line-protein'] } },
  })

  it('is actually left out of the box that ships', () => {
    expect(titlesAt(1, pulled)).toEqual(['Magnesium'])
  })

  it('comes back in the months either side', () => {
    expect(titlesAt(0, pulled)).toEqual(['Creatine', 'Magnesium', 'Protein'])
    expect(titlesAt(2, pulled)).toEqual(['Magnesium', 'Protein'])
  })
})

describe('shipsAtCycle', () => {
  const monthly = { deliveryIntervalMonths: 1, joinedAtMonth: 0 }
  const quarterly = { deliveryIntervalMonths: 3, joinedAtMonth: 0 }

  it('ships a monthly line every cycle', () => {
    for (const c of [0, 1, 2, 3, 4]) expect(shipsAtCycle(monthly, c)).toBe(true)
  })

  it('ships a quarterly line on its cadence only', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((c) => shipsAtCycle(quarterly, c)))
      .toEqual([true, false, false, true, false, false, true])
  })
})


/**
 * The postage a subscription order records.
 *
 * It was left at zero, which was wrong in three directions at once: the order's
 * `total` understated what was actually taken, every financial reading of
 * delivery revenue counted subscriptions as contributing nothing, and the
 * fulfilment queue compared a Zone 2 order's full due against a recorded £0 and
 * reported the whole charge as unpaid — when the member had in fact paid the
 * mainland rate and only the surcharge was short.
 */
describe('what a subscription order records for delivery', () => {
  const plan = (flatMonthly: number): MemberSubscription => ({
    id: 'sub-post',
    status: 'active',
    customerEmail: 'a@b.c',
    flatMonthly,
    dispatchDayOfMonth: 15,
    minMonths: 1,
    monthsActive: 0,
    startedAt: new Date().toISOString(),
    paymentMethod: null,
    lines: [line({ productId: 'protein', deliveryIntervalMonths: 1 })],
  }) as unknown as MemberSubscription

  it('records the postage the plan is actually billed', async () => {
    const order = await createSubscriptionOrder({
      id: 'ord_post_1',
      sub: plan(45),
      catalogue: CATALOGUE,
      cycle: 0,
    })
    expect(order.shipping).toBeCloseTo(2.95, 2)
    // And it reaches the total, which is what the ledger and the queue read.
    expect(order.total).toBeCloseTo(order.subtotal + 2.95, 2)
  })

  it('records nothing for a plan that ships free', async () => {
    const order = await createSubscriptionOrder({
      id: 'ord_post_2',
      sub: plan(150),
      catalogue: CATALOGUE,
      cycle: 0,
    })
    expect(order.shipping).toBe(0)
    expect(order.total).toBeCloseTo(order.subtotal, 2)
  })

  it('matches the rate the Stripe line was created at', async () => {
    const { recurringDeliveryOption } = await import('@/lib/pricing/delivery')
    const order = await createSubscriptionOrder({
      id: 'ord_post_3',
      sub: plan(30),
      catalogue: CATALOGUE,
      cycle: 0,
    })
    expect(order.shipping).toBeCloseTo(recurringDeliveryOption(30)!.price, 2)
  })
})

/**
 * The plan terms travel with the box.
 *
 * A subscription delivery is reviewed in the same queue as a one-off, and the
 * founder approving it needs to know whether this is somebody's first month and
 * what they are signing up to pay. None of that can be looked up later: a plan's
 * price and lines move, and a cancelled plan would take the terms with it.
 */
describe('the plan snapshot on a subscription order', () => {
  it('records which delivery this is, so a first box is identifiable', async () => {
    const first = await createSubscriptionOrder({
      id: 'ord_snap_first',
      sub: plan(),
      catalogue: CATALOGUE,
      cycle: 0,
    })
    const renewal = await createSubscriptionOrder({
      id: 'ord_snap_renewal',
      sub: plan(),
      catalogue: CATALOGUE,
      cycle: 4,
    })
    expect(first.subscription?.cycle).toBe(0)
    expect(renewal.subscription?.cycle).toBe(4)
  })

  it('carries the money and the commitment, not just the plan id', async () => {
    const order = await createSubscriptionOrder({
      id: 'ord_snap_terms',
      sub: plan({ minMonths: 3, dispatchDayOfMonth: 12, introDiscountRate: 0.5, firstMonth: 27.47 }),
      catalogue: CATALOGUE,
      cycle: 0,
      billedAmount: 27.47,
    })
    expect(order.subscription).toMatchObject({
      id: 'sub_1',
      monthly: 54.94,
      minMonths: 3,
      dispatchDayOfMonth: 12,
      introDiscountRate: 0.5,
      firstMonth: 27.47,
    })
    // The cycle's own charge stays where it was — the snapshot adds to it
    // rather than replacing it.
    expect(order.billedAmount).toBe(27.47)
  })

  it('leaves a one-off order without one', async () => {
    const { createOrderFromCheckout } = await import('@/lib/orders/service')
    const order = await createOrderFromCheckout({
      channel: 'shop',
      lines: [{ sku: 'SKU-1', productId: 'p', title: 'P', quantity: 1, unitPrice: 10 }],
    })
    expect(order.subscription).toBeNull()
  })
})
