/**
 * Cancel buy-out (pay-for-what-shipped).
 *
 * The offer is "cancel whenever you want, and settle what we've already sent
 * you". The flat monthly spreads the cost of multi-month items, so a fresh
 * subscription has shipped more value than it has billed; `cancelSettlement` is
 * that gap. It is what lets there be no minimum term at all without the
 * smoothing being exploitable — you cannot bank three months of product for one
 * month's pay.
 *
 * The month-6 and month-12 cases are the ones that matter most: before the
 * subscription clock advanced, the settlement was frozen at its month-zero value
 * for the life of the plan, and a long-standing member who cancelled would have
 * been charged a balance they had cleared long ago.
 */
import type { MemberSubscription, MemberSubscriptionLine } from '../types'
import { cancelSettlement, shippedValueOf, paidToDateOf } from '../mock'
import { advanceCycle } from '../clock'

function line(
  o: Partial<MemberSubscriptionLine> & {
    id: string
    pricePerDelivery: number
    deliveryIntervalMonths: number
    deliveriesMade: number
  },
): MemberSubscriptionLine {
  return {
    productId: o.id,
    productTitle: 'X',
    variantTitle: '',
    slotTitle: 'X',
    stackSlot: 'protein',
    quantity: 1,
    swapGroup: 'general',
    addedAt: new Date().toISOString(),
    ...o,
  } as MemberSubscriptionLine
}

/** flatMonthly = the sum of each line's amortised monthly (price ÷ interval). */
function sub(lines: MemberSubscriptionLine[], over: Partial<MemberSubscription> = {}): MemberSubscription {
  const flatMonthly = Math.round(lines.reduce((s, l) => s + l.pricePerDelivery / l.deliveryIntervalMonths, 0) * 100) / 100
  return {
    id: 's',
    status: 'active',
    customerEmail: 'a@b.c',
    flatMonthly,
    dispatchDayOfMonth: 15,
    minMonths: 1,
    monthsActive: 0,
    startedAt: new Date().toISOString(),
    paymentMethod: null,
    lines,
    ...over,
  }
}

/** The worked example from the terms: £30/mo protein + two £60 three-month tubs. */
function exampleSub(over: Partial<MemberSubscription> = {}): MemberSubscription {
  return sub(
    [
      line({ id: 'a', pricePerDelivery: 30, deliveryIntervalMonths: 1, deliveriesMade: 1 }),
      line({ id: 'b', pricePerDelivery: 60, deliveryIntervalMonths: 3, deliveriesMade: 1 }),
      line({ id: 'c', pricePerDelivery: 60, deliveryIntervalMonths: 3, deliveriesMade: 1 }),
    ],
    over,
  )
}

describe('cancelSettlement', () => {
  it('matches the worked example published in the terms', () => {
    // flatMonthly = 30 + 20 + 20 = £70. First box = 30 + 60 + 60 = £150.
    const s = exampleSub()
    expect(s.flatMonthly).toBe(70)
    expect(shippedValueOf(s)).toBe(150)
    expect(paidToDateOf(s)).toBe(70)
    expect(cancelSettlement(s)).toBe(80)
  })

  it('accounts for the first-month intro discount — less paid means MORE owed', () => {
    const full = exampleSub()
    const halfOff = exampleSub({ introDiscountRate: 0.5, firstMonth: 35 })
    expect(paidToDateOf(full)).toBe(70)
    expect(paidToDateOf(halfOff)).toBe(35)
    // The loss-leader can't be banked and bailed on.
    expect(cancelSettlement(halfOff)).toBeGreaterThan(cancelSettlement(full))
    expect(cancelSettlement(halfOff)).toBe(115)
  })

  it('prefers the recorded firstMonth over re-deriving it', () => {
    // firstMonth is what the card was actually charged; introDiscountRate is
    // only the fallback for subscriptions written before it was recorded.
    const recorded = exampleSub({ firstMonth: 40, introDiscountRate: 0.9 })
    expect(paidToDateOf(recorded)).toBe(40)
    const derivedOnly = exampleSub({ introDiscountRate: 0.5 })
    expect(paidToDateOf(derivedOnly)).toBe(35)
  })

  // ── The cases the frozen clock used to get wrong ────────────────────────────

  it('falls as payments catch up with what was shipped', () => {
    // Six cycles in: the monthly line has shipped 7 boxes, each tub 3.
    let s = exampleSub()
    for (let i = 0; i < 6; i++) s = advanceCycle(s)

    expect(s.monthsActive).toBe(6)
    expect(shippedValueOf(s)).toBe(7 * 30 + 3 * 60 + 3 * 60) // £570
    expect(paidToDateOf(s)).toBe(70 + 6 * 70) // £490
    expect(cancelSettlement(s)).toBe(80)
  })

  it('tracks the real position a year in, rather than freezing at signup', () => {
    let s = exampleSub()
    for (let i = 0; i < 12; i++) s = advanceCycle(s)

    expect(s.monthsActive).toBe(12)
    expect(shippedValueOf(s)).toBe(13 * 30 + 5 * 60 + 5 * 60) // £990
    expect(paidToDateOf(s)).toBe(70 + 12 * 70) // £910
    // Still owed a little, because a fresh tub landed at month 12 — but far less
    // than the £80 the frozen clock would have charged forever, and it is a real
    // debt for a real box rather than an artefact of a stale field.
    expect(cancelSettlement(s)).toBe(80)
  })

  it('is zero once a simple monthly plan has been paid for', () => {
    let s = sub([line({ id: 'a', pricePerDelivery: 30, deliveryIntervalMonths: 1, deliveriesMade: 1 })])
    for (let i = 0; i < 5; i++) s = advanceCycle(s)
    // 6 boxes shipped at £30 = £180; 6 payments at £30 = £180.
    expect(shippedValueOf(s)).toBe(180)
    expect(paidToDateOf(s)).toBe(180)
    expect(cancelSettlement(s)).toBe(0)
  })

  it('never goes negative — an overpaying member owes nothing, and is not owed by this', () => {
    const s = sub([line({ id: 'a', pricePerDelivery: 10, deliveryIntervalMonths: 1, deliveriesMade: 1 })], {
      monthsActive: 20,
      flatMonthly: 10,
    })
    expect(paidToDateOf(s)).toBeGreaterThan(shippedValueOf(s))
    expect(cancelSettlement(s)).toBe(0)
  })

  it('does not charge for a line added but not yet shipped', () => {
    const s = sub([
      line({ id: 'a', pricePerDelivery: 30, deliveryIntervalMonths: 1, deliveriesMade: 1 }),
      line({ id: 'new', pricePerDelivery: 40, deliveryIntervalMonths: 1, deliveriesMade: 0 }),
    ])
    expect(shippedValueOf(s)).toBe(30)
  })
})
