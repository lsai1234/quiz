/**
 * A skipped box's credit, both ways: credited when it's skipped, taken back
 * when it's restored, once each, and never from figures the browser sent.
 */
import { boxCreditMoves } from '../skip-credits'
import { creditForSkippedBox } from '@/lib/recharge/schedule'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'

const NOW = new Date('2026-03-15T12:00:00.000Z')
const line = (id: string, price: number, every: number): MemberSubscriptionLine =>
  ({ id, productId: id, productTitle: id, variantTitle: '', slotTitle: '', stackSlot: 'protein', quantity: 1, pricePerDelivery: price, deliveryIntervalMonths: every, deliveriesMade: 1, joinedAtMonth: 0 }) as MemberSubscriptionLine
/** Started 10 January: April is cycle 3, when the quarterly tub is due too. */
const plan = (over: Partial<MemberSubscription> = {}): MemberSubscription =>
  ({ id: 's', status: 'active', startedAt: '2026-01-10T12:00:00.000Z', monthsActive: 2, dispatchDayOfMonth: 10, flatMonthly: 42, lines: [line('protein', 36.54, 1), line('creatine', 16.99, 3)], ...over }) as MemberSubscription

const skip = (sub: MemberSubscription, id: string, skipped = true): MemberSubscription => ({
  ...sub,
  deliveryOverrides: { ...sub.deliveryOverrides, [id]: { ...(sub.deliveryOverrides?.[id] ?? {}), skipped } },
})

describe('a skipped box’s credit', () => {
  it('is the box’s value, credited once, and recorded on the box', () => {
    const previous = plan()
    const { subscription, credits, debits } = boxCreditMoves(previous, skip(previous, '2026-04'), { billed: true, now: NOW })
    expect(credits).toEqual([{ id: '2026-04', amount: creditForSkippedBox(previous, '2026-04', NOW), seq: 1 }])
    expect(credits[0].amount).toBeCloseTo(53.53, 2)
    expect(debits).toEqual([])
    expect(subscription.deliveryOverrides?.['2026-04']).toMatchObject({ skipped: true, skipCredit: { amount: 53.53, seq: 1 }, skipSeq: 1 })
  })

  it('comes back off when the box is restored, exactly the credit it undoes', () => {
    const before = plan()
    const skipped = boxCreditMoves(before, skip(before, '2026-04'), { billed: true, now: NOW }).subscription
    const { subscription, credits, debits } = boxCreditMoves(skipped, skip(skipped, '2026-04', false), { billed: true, now: NOW })
    expect(credits).toEqual([])
    expect(debits).toEqual([{ id: '2026-04', amount: 53.53, seq: 1 }])
    expect(subscription.deliveryOverrides?.['2026-04']).toMatchObject({ skipped: false, skipCredit: null, skipSeq: 1 })
  })

  it('is credited again under a new number when skipped again, so a replay can’t pay it twice', () => {
    let sub = plan()
    sub = boxCreditMoves(sub, skip(sub, '2026-04'), { billed: true, now: NOW }).subscription
    sub = boxCreditMoves(sub, skip(sub, '2026-04', false), { billed: true, now: NOW }).subscription
    const again = boxCreditMoves(sub, skip(sub, '2026-04'), { billed: true, now: NOW })
    expect(again.credits).toEqual([{ id: '2026-04', amount: 53.53, seq: 2 }])
    // The same save sent twice moves nothing the second time.
    expect(boxCreditMoves(again.subscription, again.subscription, { billed: true, now: NOW })).toMatchObject({ credits: [], debits: [] })
  })

  it('keeps the server’s record, whatever the browser sends for it', () => {
    const previous = plan()
    const forged = skip(previous, '2026-04')
    forged.deliveryOverrides!['2026-04'] = { skipped: true, skipCredit: { amount: 999, seq: 7 }, skipSeq: 7 }
    const { credits } = boxCreditMoves(previous, forged, { billed: true, now: NOW })
    expect(credits).toEqual([{ id: '2026-04', amount: 53.53, seq: 1 }])
  })

  it('moves nothing on a plan Stripe doesn’t bill', () => {
    const previous = plan()
    const { credits, debits, subscription } = boxCreditMoves(previous, skip(previous, '2026-04'), { billed: false, now: NOW })
    expect(credits).toEqual([])
    expect(debits).toEqual([])
    expect(subscription.deliveryOverrides?.['2026-04']?.skipCredit).toBeNull()
  })
})
