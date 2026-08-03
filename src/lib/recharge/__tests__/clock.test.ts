/**
 * The subscription clock.
 *
 * `monthsActive` and `deliveriesMade` used to be written once at signup and then
 * never move, which left every settlement calculation reading a member as though
 * they had just subscribed no matter how long they had been paying. These tests
 * pin the semantics that the settlement maths depends on — particularly the
 * off-by-one around the first cycle, which silently mis-states what someone owes.
 */
import type { MemberSubscription, MemberSubscriptionLine } from '../types'
import { advanceCycle, deliveriesMadeFor, syncDeliveryCounts } from '../clock'

function line(o: Partial<MemberSubscriptionLine> & { id: string }): MemberSubscriptionLine {
  return {
    productId: o.id,
    productTitle: 'X',
    variantTitle: '',
    slotTitle: 'X',
    stackSlot: 'protein',
    quantity: 1,
    deliveryIntervalMonths: 1,
    pricePerDelivery: 30,
    swapGroup: 'general',
    addedAt: new Date().toISOString(),
    deliveriesMade: 1,
    ...o,
  } as MemberSubscriptionLine
}

function sub(lines: MemberSubscriptionLine[], over: Partial<MemberSubscription> = {}): MemberSubscription {
  return {
    id: 's',
    status: 'active',
    customerEmail: 'a@b.c',
    flatMonthly: 70,
    dispatchDayOfMonth: 15,
    minMonths: 1,
    monthsActive: 0,
    startedAt: new Date().toISOString(),
    paymentMethod: null,
    lines,
    ...over,
  }
}

describe('deliveriesMadeFor', () => {
  it('counts the signup box at month zero', () => {
    expect(deliveriesMadeFor({ deliveryIntervalMonths: 1 }, 0)).toBe(1)
    expect(deliveriesMadeFor({ deliveryIntervalMonths: 3 }, 0)).toBe(1)
  })

  it('advances a monthly line every cycle', () => {
    expect(deliveriesMadeFor({ deliveryIntervalMonths: 1 }, 5)).toBe(6)
  })

  it('advances a three-monthly line only every third cycle', () => {
    const every3 = { deliveryIntervalMonths: 3 }
    expect(deliveriesMadeFor(every3, 1)).toBe(1)
    expect(deliveriesMadeFor(every3, 2)).toBe(1)
    expect(deliveriesMadeFor(every3, 3)).toBe(2)
    expect(deliveriesMadeFor(every3, 6)).toBe(3)
  })

  it('does not credit a line with boxes that shipped before it joined', () => {
    // Added in month 4 of a subscription now in month 6: two cycles on the plan.
    const added = { deliveryIntervalMonths: 1, joinedAtMonth: 4 }
    expect(deliveriesMadeFor(added, 6)).toBe(3)
    expect(deliveriesMadeFor(added, 4)).toBe(1)
    // Defensive: a clock somehow behind the join month owes nothing.
    expect(deliveriesMadeFor(added, 2)).toBe(0)
  })
})

describe('advanceCycle', () => {
  it('moves the clock and re-derives every line', () => {
    const before = sub([
      line({ id: 'a', deliveryIntervalMonths: 1 }),
      line({ id: 'b', deliveryIntervalMonths: 3 }),
    ])
    const after = advanceCycle(before)
    expect(after.monthsActive).toBe(1)
    expect(after.lines.find((l) => l.id === 'a')!.deliveriesMade).toBe(2)
    expect(after.lines.find((l) => l.id === 'b')!.deliveriesMade).toBe(1) // not due yet
  })

  it('is pure — the original is untouched', () => {
    const before = sub([line({ id: 'a' })])
    advanceCycle(before)
    expect(before.monthsActive).toBe(0)
    expect(before.lines[0].deliveriesMade).toBe(1)
  })

  it('never advances a cancelled subscription', () => {
    // Inflating monthsActive after cancellation would shrink a settlement that
    // has already been calculated and shown to someone.
    const cancelled = sub([line({ id: 'a' })], { status: 'cancelled', monthsActive: 3 })
    expect(advanceCycle(cancelled)).toBe(cancelled)
  })

  it('composes across many cycles the way the derived counts say it should', () => {
    let s = sub([line({ id: 'a', deliveryIntervalMonths: 1 }), line({ id: 'b', deliveryIntervalMonths: 3 })])
    for (let i = 0; i < 6; i++) s = advanceCycle(s)
    expect(s.monthsActive).toBe(6)
    expect(s.lines.find((l) => l.id === 'a')!.deliveriesMade).toBe(7)
    expect(s.lines.find((l) => l.id === 'b')!.deliveriesMade).toBe(3)
  })
})

describe('syncDeliveryCounts', () => {
  it('repairs drifted counts without moving the clock', () => {
    const drifted = sub([line({ id: 'a', deliveryIntervalMonths: 1, deliveriesMade: 1 })], { monthsActive: 5 })
    const fixed = syncDeliveryCounts(drifted)
    expect(fixed.monthsActive).toBe(5)
    expect(fixed.lines[0].deliveriesMade).toBe(6)
  })
})
