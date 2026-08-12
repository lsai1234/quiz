/**
 * Whether we may charge this member anything, and how much.
 *
 * The waivers are the part worth being exhaustive about. Each one is a promise
 * made somewhere else — in the Terms, in a price-increase email, in the
 * Consumer Contracts Regulations — and a settlement that ignores any of them is
 * a charge we would have to give back with an apology.
 */
import { quoteExit, waiverFor, withinCoolingOff, insidePriceIncreaseNotice, followsInvoluntaryChange } from '@/lib/recharge/exit'
import type { MemberSubscription, MemberSubscriptionLine, BillingChange } from '@/lib/recharge/types'
import type { Order } from '@/lib/orders/types'

const NOW = new Date('2026-06-01T00:00:00.000Z')

function line(over: Partial<MemberSubscriptionLine> = {}): MemberSubscriptionLine {
  return {
    id: 'l1',
    productId: 'creatine',
    productTitle: 'Creatine',
    variantTitle: '',
    slotTitle: 'Creatine',
    stackSlot: 'creatine',
    quantity: 1,
    pricePerDelivery: 60,
    deliveryIntervalMonths: 3,
    deliveriesMade: 1,
    joinedAtMonth: 0,
    ...over,
  } as MemberSubscriptionLine
}

function plan(over: Partial<MemberSubscription> = {}): MemberSubscription {
  return {
    id: 'sub_1',
    customerEmail: 'm@example.com',
    status: 'active',
    startedAt: '2026-01-01T00:00:00.000Z',
    flatMonthly: 20,
    firstMonth: 20,
    monthsActive: 0,
    minMonths: 1,
    lines: [line()],
    ...over,
  } as MemberSubscription
}

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'ord_1',
    reference: 'CHRGD-1',
    channel: 'subscription',
    status: 'shipped',
    userId: 'u1',
    email: 'm@example.com',
    currency: 'GBP',
    subtotal: 60,
    shipping: 0,
    total: 60,
    lines: [{ sku: 'S1', productId: 'creatine', title: 'Creatine', quantity: 1, unitPrice: 60 }],
    shippingAddress: null,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    review: { state: 'approved', at: '2026-01-01T00:00:00.000Z' },
    supplierOrderId: null,
    supplierStatus: null,
    trackingNumber: null,
    billedAmount: 20,
    events: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as Order
}

const change = (over: Partial<BillingChange>): BillingChange => ({
  id: 'bc1',
  reason: 'price-increase',
  lineId: null,
  previousMonthly: 20,
  newMonthly: 25,
  effectiveFrom: '2026-07-01T00:00:00.000Z',
  createdAt: '2026-05-25T00:00:00.000Z',
  ...over,
})

describe('the consent gate (E-4)', () => {
  it('charges nothing to a member who was promised there was no fee', () => {
    // The only waiver that is not a kindness. Whatever the arithmetic says, a
    // member on the old terms cannot be billed a balance they were never shown.
    const quote = quoteExit({
      sub: plan(),
      orders: [order()],
      consentCoversSettlement: false,
      now: NOW,
    })
    expect(quote.settlement).toBe(0)
    expect(quote.waiver?.reason).toBe('consent-not-given')
  })

  it('beats every other reason, so the member is told the right one', () => {
    const waiver = waiverFor({
      sub: plan({ startedAt: NOW.toISOString() }),
      orders: [],
      settlement: 40,
      consentCoversSettlement: false,
      now: NOW,
    })
    expect(waiver?.reason).toBe('consent-not-given')
  })
})

describe('the statutory cooling-off period', () => {
  it('runs from the first DELIVERY, not from signup', () => {
    // The regulations start the clock when the goods arrive. A plan that started
    // in January but only shipped in late May is still inside it.
    const sub = plan({ startedAt: '2026-01-01T00:00:00.000Z' })
    expect(withinCoolingOff(sub, [order({ createdAt: '2026-05-25T00:00:00.000Z' })], NOW)).toBe(true)
    expect(withinCoolingOff(sub, [order({ createdAt: '2026-03-01T00:00:00.000Z' })], NOW)).toBe(false)
  })

  it('falls back to the signup date when nothing has shipped', () => {
    expect(withinCoolingOff(plan({ startedAt: '2026-05-28T00:00:00.000Z' }), [], NOW)).toBe(true)
    expect(withinCoolingOff(plan({ startedAt: '2026-01-01T00:00:00.000Z' }), [], NOW)).toBe(false)
  })

  it('waives the balance inside the window', () => {
    const quote = quoteExit({
      sub: plan(),
      orders: [order({ createdAt: '2026-05-25T00:00:00.000Z' })],
      consentCoversSettlement: true,
      now: NOW,
    })
    expect(quote.settlement).toBe(0)
    expect(quote.waiver?.reason).toBe('cooling-off')
    expect(quote.waiver?.explanation).toContain('unopened')
  })
})

describe('a price rise they have not accepted', () => {
  it('is a waiver while the notice period is still running', () => {
    // The notice email says "you can cancel free of charge any time before that
    // date". Billing them for leaving would be charging for taking us up on it.
    const sub = plan({ billingHistory: [change({ noticeSentAt: '2026-05-25T00:00:00.000Z' })] })
    expect(insidePriceIncreaseNotice(sub, NOW)).toBe(true)
    expect(waiverFor({ sub, orders: [], settlement: 40, consentCoversSettlement: true, now: NOW })?.reason)
      .toBe('price-increase-notice')
  })

  it('stops once the new price has taken effect', () => {
    const sub = plan({
      billingHistory: [change({ noticeSentAt: '2026-03-01T00:00:00.000Z', effectiveFrom: '2026-04-01T00:00:00.000Z' })],
    })
    expect(insidePriceIncreaseNotice(sub, NOW)).toBe(false)
  })

  it('does not apply to a rise that was never notified', () => {
    const sub = plan({ billingHistory: [change({ noticeSentAt: undefined })] })
    expect(insidePriceIncreaseNotice(sub, NOW)).toBe(false)
  })

  it('does not apply to a price DECREASE', () => {
    const sub = plan({
      billingHistory: [change({ reason: 'price-decrease', noticeSentAt: '2026-05-25T00:00:00.000Z' })],
    })
    expect(insidePriceIncreaseNotice(sub, NOW)).toBe(false)
  })
})

describe('a change we made ourselves', () => {
  it('waives the balance for a member leaving after it', () => {
    // `changes/apply.ts` already waives the per-line settlement when we remove
    // something. The same reasoning has to hold when they respond by leaving
    // altogether, or "we swapped your protein" becomes a reason they owe us.
    const sub = plan({
      billingHistory: [change({ reason: 'out-of-stock', createdAt: '2026-05-20T00:00:00.000Z' })],
    })
    expect(followsInvoluntaryChange(sub, NOW)).toBe(true)
    expect(waiverFor({ sub, orders: [], settlement: 40, consentCoversSettlement: true, now: NOW })?.reason)
      .toBe('we-changed-your-plan')
  })

  it('expires, so an old substitution is not a permanent free pass', () => {
    const sub = plan({
      billingHistory: [change({ reason: 'discontinued', createdAt: '2025-11-01T00:00:00.000Z' })],
    })
    expect(followsInvoluntaryChange(sub, NOW)).toBe(false)
  })

  it('does not fire on the member’s own edit', () => {
    const sub = plan({
      billingHistory: [change({ reason: 'member-edit', createdAt: '2026-05-20T00:00:00.000Z' })],
    })
    expect(followsInvoluntaryChange(sub, NOW)).toBe(false)
  })
})

describe('quoting an exit that is genuinely payable', () => {
  const payable = {
    sub: plan({ monthsActive: 0 }),
    orders: [order()],
    consentCoversSettlement: true,
    now: NOW,
  }

  it('bills from the ledger and says so', () => {
    const quote = quoteExit(payable)
    expect(quote.source).toBe('ledger')
    // £60 of goods against a £20 payment, capped at what they paid.
    expect(quote.settlement).toBe(20)
    expect(quote.waiver).toBeNull()
  })

  it('falls back to the forecast when the ledger is incomplete', () => {
    const quote = quoteExit({ ...payable, orders: [order({ billedAmount: null })] })
    expect(quote.source).toBe('forecast')
  })

  it('still produces a statement when nothing is owed, so it can be explained', () => {
    const quote = quoteExit({ ...payable, consentCoversSettlement: false })
    expect(quote.settlement).toBe(0)
    expect(quote.statement).not.toBeNull()
    expect(quote.statement?.shippedTotal).toBe(60)
  })

  it('offers the next free exit as the alternative', () => {
    expect(quoteExit(payable).freeExitMonth).not.toBeNull()
  })

  it('does not offer one when there is nothing to avoid', () => {
    expect(quoteExit({ ...payable, consentCoversSettlement: false }).freeExitMonth).toBeNull()
  })
})
