/**
 * Cancel buy-out (pay-for-what-shipped).
 *
 * The flat monthly spreads the cost of multi-month items, so a fresh
 * subscription has shipped more value than it's billed. cancelSettlement is that
 * gap — what a canceller owes for goods already delivered — so "cancel anytime"
 * (no minimum term) can't be used to bank multi-month product for one month's pay.
 */
import type { MemberSubscription, MemberSubscriptionLine } from '../types'
import { cancelSettlement, shippedValueOf, paidToDateOf } from '../mock'

function line(o: Partial<MemberSubscriptionLine> & { id: string; pricePerDelivery: number; deliveryIntervalMonths: number; deliveriesMade: number }): MemberSubscriptionLine {
  return {
    productId: o.id, productTitle: 'X', variantTitle: '', slotTitle: 'X', stackSlot: 'protein',
    quantity: 1, swapGroup: 'general', addedAt: new Date().toISOString(), ...o,
  } as MemberSubscriptionLine
}

function sub(lines: MemberSubscriptionLine[], o: Partial<MemberSubscription> = {}): MemberSubscription {
  // flatMonthly = sum of each line's amortised monthly (pricePerDelivery / interval).
  const flatMonthly = Math.round(lines.reduce((s, l) => s + l.pricePerDelivery / l.deliveryIntervalMonths, 0) * 100) / 100
  return {
    id: 's', status: 'active', customerEmail: 'a@b.c', flatMonthly, dispatchDayOfMonth: 15,
    minMonths: 1, monthsActive: 0, startedAt: new Date().toISOString(), paymentMethod: null, lines, ...o,
  }
}

describe('cancelSettlement', () => {
  it('a fresh sub with front-loaded multi-month items owes the un-amortised value', () => {
    // Three items shipped at signup: a monthly £30, and two 3-month £60 tubs.
    // flatMonthly = 30 + 20 + 20 = 70. First box shipped = 30 + 60 + 60 = 150.
    const s = sub([
      line({ id: 'a', pricePerDelivery: 30, deliveryIntervalMonths: 1, deliveriesMade: 1 }),
      line({ id: 'b', pricePerDelivery: 60, deliveryIntervalMonths: 3, deliveriesMade: 1 }),
      line({ id: 'c', pricePerDelivery: 60, deliveryIntervalMonths: 3, deliveriesMade: 1 }),
    ], { monthsActive: 0 })
    expect(shippedValueOf(s)).toBe(150)
    expect(paidToDateOf(s)).toBe(70)      // first month, no intro
    expect(cancelSettlement(s)).toBe(80)  // 150 shipped − 70 paid
  })

  it('accounts for the first-month intro discount (owes more, not less)', () => {
    const base = [
      line({ id: 'a', pricePerDelivery: 30, deliveryIntervalMonths: 1, deliveriesMade: 1 }),
      line({ id: 'b', pricePerDelivery: 60, deliveryIntervalMonths: 3, deliveriesMade: 1 }),
    ]
    const full = sub(base, { monthsActive: 0 })                                // paid 50
    const halfOff = sub(base, { monthsActive: 0, firstMonthDiscountRate: 0.5 }) // paid 25
    expect(paidToDateOf(full)).toBe(50)
    expect(paidToDateOf(halfOff)).toBe(25)
    // Less paid → larger settlement, so the loss-leader can't be banked and bailed.
    expect(cancelSettlement(halfOff)).toBeGreaterThan(cancelSettlement(full))
  })

  it('is zero once the member has paid off everything shipped', () => {
    // A single monthly item, several months in: paid ≥ shipped.
    const s = sub([line({ id: 'a', pricePerDelivery: 30, deliveryIntervalMonths: 1, deliveriesMade: 4 })], { monthsActive: 5 })
    expect(cancelSettlement(s)).toBe(0)
  })
})
