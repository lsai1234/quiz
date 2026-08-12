/**
 * A skipped box, and what it is worth.
 *
 * The Terms say: *"Skipping a box does not cost you a payment — the value of the
 * skipped box is credited against your next one."* Nothing kept that promise.
 * The skip set a flag, dispatch (once the cadence fix landed) sends nothing, and
 * Stripe billed the full monthly regardless — so a member who skipped paid in
 * full for an empty month.
 *
 * These pin the pricing. Getting it wrong in either direction is real money: too
 * high and we credit for products that were never due, too low and we keep part
 * of a payment for a box we did not send.
 */
import { creditForSkippedBox, buildDeliverySchedule } from '@/lib/recharge/schedule'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'

const NOW = new Date('2026-03-15T00:00:00.000Z')

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

/** Started January 2026: cycle 0 = Jan, 1 = Feb, 2 = Mar, 3 = Apr. */
function plan(over: Partial<MemberSubscription> = {}): MemberSubscription {
  return {
    id: 'sub_1',
    startedAt: '2026-01-10T00:00:00.000Z',
    status: 'active',
    flatMonthly: 54.94,
    monthsActive: 2,
    dispatchDayOfMonth: 10,
    lines: [
      line({ productId: 'protein', pricePerDelivery: 36.54, deliveryIntervalMonths: 1 }),
      line({ productId: 'creatine', productTitle: 'Creatine', pricePerDelivery: 16.99, deliveryIntervalMonths: 3 }),
      line({ productId: 'magnesium', productTitle: 'Magnesium', pricePerDelivery: 12.74, deliveryIntervalMonths: 1 }),
    ],
    ...over,
  } as MemberSubscription
}

describe('what a skipped box is worth', () => {
  it('is the value of the lines actually due that month', () => {
    // April is cycle 3 — the quarterly tub is due again, so all three.
    expect(creditForSkippedBox(plan(), '2026-04', NOW)).toBe(66.27)
  })

  it('excludes items that were not due anyway', () => {
    // February is cycle 1: monthly items only. Crediting the tub as well would
    // be paying someone for a product that was never coming.
    expect(creditForSkippedBox(plan(), '2026-02', NOW)).toBe(49.28)
  })

  it('is nothing when the box was empty', () => {
    const quarterlyOnly = plan({ lines: [line({ productId: 'creatine', deliveryIntervalMonths: 3 })] })
    // Cycle 1 — nothing due, so nothing to credit.
    expect(creditForSkippedBox(quarterlyOnly, '2026-02', NOW)).toBe(0)
  })

  it('does not credit a line the member had already removed from that box', () => {
    const withRemoval = plan({
      deliveryOverrides: { '2026-02': { removedLineIds: ['line-magnesium'] } },
    })
    expect(creditForSkippedBox(withRemoval, '2026-02', NOW)).toBe(36.54)
  })

  it('is nothing for a month before the plan existed', () => {
    expect(creditForSkippedBox(plan(), '2025-11', NOW)).toBe(0)
  })

  it('is nothing for an id it cannot read', () => {
    expect(creditForSkippedBox(plan(), 'nonsense', NOW)).toBe(0)
  })
})

describe('the calendar and dispatch now agree', () => {
  it('shows a quarterly item only in the months it actually ships', () => {
    /**
     * The calendar used to stagger multi-month lines by a hash of the line id,
     * so it could show a tub arriving in a month dispatch would not send one —
     * two answers to "when does this arrive", with the exit settlement billing
     * against the other. It reads `shipsAtCycle` now, like everything else.
     */
    const schedule = buildDeliverySchedule(plan(), [], 6, NOW)
    const hasTub = (index: number) => schedule[index].items.some((i) => i.productId === 'creatine')

    // March is cycle 2 — no tub. April is cycle 3 — tub.
    expect(hasTub(0)).toBe(false)
    expect(hasTub(1)).toBe(true)
    expect(hasTub(2)).toBe(false)
    expect(hasTub(3)).toBe(false)
    expect(hasTub(4)).toBe(true)
  })

  it('puts the monthly items in every box', () => {
    const schedule = buildDeliverySchedule(plan(), [], 4, NOW)
    for (const delivery of schedule) {
      expect(delivery.items.some((i) => i.productId === 'protein')).toBe(true)
    }
  })
})
