/**
 * Whether we may charge this member anything, and how much.
 *
 * The waivers are the part worth being exhaustive about. Each one is a promise
 * made somewhere else — in the Terms, in a price-increase email, in the
 * Consumer Contracts Regulations — and a settlement that ignores any of them is
 * a charge we would have to give back with an apology.
 */
import { quoteExit, waiverFor, withinCoolingOff, coolingOffDeadline, refundForReturned, insidePriceIncreaseNotice, followsInvoluntaryChange } from '@/lib/recharge/exit'
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

  it('does NOT waive the balance — it offers a choice instead', () => {
    /**
     * Cooling-off used to be an automatic waiver, which read the regulations as
     * "cancel within 14 days and owe nothing". They say no such thing: the right
     * is to cancel and SEND THE GOODS BACK for a refund. A member who keeps what
     * was sent has not returned it, and keeping goods and paying for them is
     * what the rest of the year already does.
     *
     * Charging nothing meant the whole month-one gap — a full first box against
     * one smoothed payment — was written off in silence, and once the choice was
     * on screen, "keep it" was strictly the better deal in every case.
     */
    const quote = quoteExit({
      sub: plan(),
      orders: [order({ createdAt: '2026-05-25T00:00:00.000Z' })],
      consentCoversSettlement: true,
      now: NOW,
    })
    // £60 sent against £20 paid, capped at everything they have paid.
    expect(quote.settlement).toBe(20)
    expect(quote.waiver).toBeNull()
    expect(quote.coolingOff?.keepSettlement).toBe(20)
  })

  it('still zeroes the keep price when some OTHER waiver applies', () => {
    const quote = quoteExit({
      sub: plan(),
      orders: [order({ createdAt: '2026-05-25T00:00:00.000Z' })],
      consentCoversSettlement: false,
      now: NOW,
    })
    expect(quote.waiver?.reason).toBe('consent-not-given')
    expect(quote.settlement).toBe(0)
    expect(quote.coolingOff?.keepSettlement).toBe(0)
  })

  describe('the choice it gives them', () => {
    /**
     * The regulations give a new member a right the rest of the year does not:
     * send it back and have their money returned. The quote used to report only
     * that nothing was owed, so the flow could offer only the keep half and the
     * return existed as a sentence nobody could act on.
     */
    const inWindow = () =>
      quoteExit({
        sub: plan(),
        orders: [order({ createdAt: '2026-05-25T00:00:00.000Z', billedAmount: 20 })],
        consentCoversSettlement: true,
        now: NOW,
      })

    it('prices both halves, so the decision is made on figures', () => {
      const { coolingOff } = inWindow()
      expect(coolingOff).not.toBeNull()
      // Refund = every payment taken. Keep = everything shipped, so "keep £60 of
      // product for nothing" can be weighed against "get £20 back".
      expect(coolingOff!.returnRefund).toBe(20)
      expect(coolingOff!.keepValue).toBe(60)
    })

    it('says when the right runs out', () => {
      // 14 days from the first delivery, not from signup.
      expect(inWindow().coolingOff!.deadline).toBe('2026-06-08T00:00:00.000Z')
      expect(coolingOffDeadline(plan(), [])).toBe('2026-01-15T00:00:00.000Z')
    })

    it('is offered even when some other waiver got there first', () => {
      // Being let off a balance and being entitled to your money back are not
      // the same thing, and a member should not lose the second because they
      // also happened to qualify for the first.
      const quote = quoteExit({
        sub: plan(),
        orders: [order({ createdAt: '2026-05-25T00:00:00.000Z', billedAmount: 20 })],
        consentCoversSettlement: false,
        now: NOW,
      })
      expect(quote.waiver?.reason).toBe('consent-not-given')
      expect(quote.coolingOff).not.toBeNull()
    })

    it('is gone once the window closes', () => {
      const quote = quoteExit({
        sub: plan(),
        orders: [order({ createdAt: '2026-03-01T00:00:00.000Z' })],
        consentCoversSettlement: true,
        now: NOW,
      })
      expect(quote.coolingOff).toBeNull()
    })
  })
})

describe('what a return is actually worth', () => {
  /**
   * The Terms refuse a refund on opened supplements unless they arrived faulty,
   * on hygiene grounds — so the quoted figure is a ceiling for a whole, unopened
   * box, and the real amount is settled when someone opens the parcel.
   *
   * Proportional to VALUE rather than to item count: the member paid less than
   * the goods are worth (smoothed monthly, discounted first month), so refunding
   * retail would hand back more than was ever taken, and a flat share per item
   * would price a returned £60 tub the same as a returned sachet.
   */
  const inWindow = () =>
    quoteExit({
      sub: plan(),
      orders: [order({ createdAt: '2026-05-25T00:00:00.000Z', billedAmount: 20 })],
      consentCoversSettlement: true,
      now: NOW,
    })

  it('gives everything back when the whole box returns unopened', () => {
    const quote = inWindow()
    // £60 sent, £20 paid — a full return refunds the full £20.
    expect(refundForReturned(quote, quote.coolingOff!.keepValue)).toBe(20)
  })

  it('refunds a part return in proportion to what came back', () => {
    // Half the value returned unopened → half the payment back.
    expect(refundForReturned(inWindow(), 30)).toBe(10)
  })

  it('refunds nothing when everything was opened', () => {
    expect(refundForReturned(inWindow(), 0)).toBe(0)
  })

  it('never hands back more than was ever taken', () => {
    // Retail value exceeds what they paid, so an un-clamped share would pay out
    // more than the card was charged.
    expect(refundForReturned(inWindow(), 999)).toBe(20)
  })

  it('is zero once the window has closed', () => {
    const closed = quoteExit({
      sub: plan(),
      orders: [order({ createdAt: '2026-03-01T00:00:00.000Z', billedAmount: 20 })],
      consentCoversSettlement: true,
      now: NOW,
    })
    expect(closed.coolingOff).toBeNull()
    expect(refundForReturned(closed, 60)).toBe(0)
  })
})

describe('the intro discount, at the exit', () => {
  /**
   * `settlement.reclaimIntroDiscount` is false, and it used to be true of only
   * one of the two arithmetics. The forecast measured against what the plan
   * COSTS; the ledger measured against what the card was CHARGED, which is the
   * discounted figure — so the discount landed in the balance and was billed
   * back. This pins the whole path, from the plan to the charged figure.
   */
  const discounted = () =>
    plan({ flatMonthly: 20, firstMonth: 14, monthsActive: 0 })

  it('is handed to the ledger and shown as its own line', () => {
    const quote = quoteExit({
      sub: discounted(),
      orders: [order({ createdAt: '2026-05-25T00:00:00.000Z', billedAmount: 14 })],
      consentCoversSettlement: true,
      now: NOW,
    })
    // £60 sent, £14 paid → £46 raw. £6 of that is the discount we said we would
    // not reclaim, leaving £40, which the cap then holds to the £14 they paid.
    expect(quote.statement!.introKept).toBe(6)
    expect(quote.statement!.rawGap).toBe(46)
    expect(quote.settlement).toBe(14)
  })

  it('closes the gap between the ledger and the forecast', () => {
    // `ledgerDivergence` exists to catch the two disagreeing. It was reporting
    // exactly this discount, to a founder-only field nothing acted on.
    const quote = quoteExit({
      sub: discounted(),
      orders: [order({ createdAt: '2026-05-25T00:00:00.000Z', billedAmount: 14 })],
      consentCoversSettlement: true,
      now: NOW,
    })
    expect(quote.divergence?.material).toBe(false)
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
