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
