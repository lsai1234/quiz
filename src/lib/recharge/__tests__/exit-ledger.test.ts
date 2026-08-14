/**
 * The exit statement, built from what was recorded rather than from what the
 * plan currently says.
 *
 * Each block below is one of the scenarios the model got wrong (E-2, E-3) or
 * could never see at all (overpayment). They are written as histories rather
 * than as arithmetic, because that is the point: the ledger's correctness comes
 * from reading rows, not from a cleverer formula.
 */
import {
  exitStatement,
  ledgerDivergence,
  ledgerIsComplete,
  settlementToCharge,
  billableSubscriptionOrders,
} from '@/lib/recharge/exit-ledger'
import { PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import type { Order, OrderLine } from '@/lib/orders/types'

let seq = 0

/** One cycle: what shipped, and what the card was charged for it. */
function cycle(
  opts: { ships?: { title: string; price: number; qty?: number }[]; billed?: number | null; status?: Order['status'] } = {},
): Order {
  seq += 1
  const lines: OrderLine[] = (opts.ships ?? []).map((s, i) => ({
    sku: `SKU-${i}`,
    productId: s.title.toLowerCase(),
    title: s.title,
    variantTitle: null,
    quantity: s.qty ?? 1,
    unitPrice: s.price,
    supplierCost: null,
  }))
  return {
    id: `ord_${seq}`,
    reference: `CHRGD-${seq}`,
    channel: 'subscription',
    status: opts.status ?? 'shipped',
    userId: 'u1',
    email: 'm@example.com',
    currency: 'GBP',
    subtotal: lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    shipping: 0,
    total: lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    lines,
    shippingAddress: null,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    review: { state: 'approved', at: '2026-01-01T00:00:00.000Z' },
    supplierOrderId: null,
    supplierStatus: null,
    trackingNumber: null,
    billedAmount: opts.billed === undefined ? 54.94 : opts.billed,
    events: [],
    createdAt: `2026-0${Math.min(9, seq)}-01T00:00:00.000Z`,
    updatedAt: `2026-0${Math.min(9, seq)}-01T00:00:00.000Z`,
  } as Order
}

const PROTEIN = { title: 'Protein', price: 36.54 }
const MAGNESIUM = { title: 'Magnesium', price: 12.74 }
const CREATINE = { title: 'Creatine', price: 16.99 }

beforeEach(() => { seq = 0 })

describe('the worked plan, cycle by cycle', () => {
  it('matches the model when nothing has changed', () => {
    // Signup box has all three; the next two are protein + magnesium only.
    const history = [
      cycle({ ships: [PROTEIN, CREATINE, MAGNESIUM] }),
      cycle({ ships: [PROTEIN, MAGNESIUM] }),
      cycle({ ships: [PROTEIN, MAGNESIUM] }),
    ]
    const one = exitStatement([history[0]])
    expect(one.shippedTotal).toBe(66.27)
    expect(one.paidTotal).toBe(54.94)
    expect(one.rawGap).toBe(11.33)
    expect(one.settlement).toBe(11.33)

    // By the third cycle the tub is paid off and leaving is free.
    const all = exitStatement(history)
    expect(all.shippedTotal).toBe(164.83)
    expect(all.paidTotal).toBe(164.82)
    expect(all.settlement).toBe(0)
  })
})

describe('a price that changed mid-plan (E-2)', () => {
  it('settles history at the prices actually charged, not today’s', () => {
    /**
     * Four months at £30, then a supplier rise to £40 for two. The model would
     * compute six lots of £40 — £240 paid instead of £200 — and understate the
     * balance by £40. The ledger just adds up the rows.
     */
    const history = [
      cycle({ ships: [{ title: 'Protein', price: 30 }], billed: 30 }),
      cycle({ ships: [{ title: 'Protein', price: 30 }], billed: 30 }),
      cycle({ ships: [{ title: 'Protein', price: 30 }], billed: 30 }),
      cycle({ ships: [{ title: 'Protein', price: 30 }], billed: 30 }),
      cycle({ ships: [{ title: 'Protein', price: 40 }], billed: 40 }),
      cycle({ ships: [{ title: 'Protein', price: 40 }], billed: 40 }),
    ]
    const statement = exitStatement(history)
    expect(statement.paidTotal).toBe(200)
    expect(statement.shippedTotal).toBe(200)
    expect(statement.settlement).toBe(0)
  })

  it('does not overcharge when the price FELL', () => {
    // The direction that produces a complaint: today's cheaper monthly applied
    // backwards would understate what they paid and bill them for the gap.
    const history = [
      cycle({ ships: [{ title: 'Protein', price: 40 }], billed: 40 }),
      cycle({ ships: [{ title: 'Protein', price: 40 }], billed: 40 }),
      cycle({ ships: [{ title: 'Protein', price: 30 }], billed: 30 }),
    ]
    const statement = exitStatement(history)
    expect(statement.paidTotal).toBe(110)
    expect(statement.settlement).toBe(0)
  })
})

describe('boxes that never shipped (E-3)', () => {
  it('does not count a skipped cycle as a delivery', () => {
    // A skipped box raises an order with no lines — the payment record for that
    // month. Nothing shipped, so nothing is owed for it.
    const history = [
      cycle({ ships: [PROTEIN, CREATINE, MAGNESIUM] }),
      cycle({ ships: [], billed: 54.94 }),
    ]
    const statement = exitStatement(history)
    expect(statement.shipments).toHaveLength(1)
    expect(statement.payments).toHaveLength(2)
    // Two payments against one box: the balance has gone, and then some.
    expect(statement.rawGap).toBeLessThan(0)
    expect(statement.settlement).toBe(0)
  })

  it('ignores a cancelled or failed cycle entirely', () => {
    const history = [
      cycle({ ships: [PROTEIN, CREATINE, MAGNESIUM] }),
      cycle({ ships: [PROTEIN], status: 'cancelled' }),
      cycle({ ships: [PROTEIN], status: 'failed' }),
    ]
    expect(billableSubscriptionOrders(history)).toHaveLength(1)
    expect(exitStatement(history).shippedTotal).toBe(66.27)
  })

  it('subtracts a refunded cycle from both columns at once', () => {
    const history = [
      cycle({ ships: [PROTEIN, CREATINE, MAGNESIUM] }),
      cycle({ ships: [PROTEIN, MAGNESIUM], status: 'refunded' }),
    ]
    const statement = exitStatement(history)
    // Neither the goods nor the payment count — the money went back.
    expect(statement.shippedTotal).toBe(66.27)
    expect(statement.paidTotal).toBe(54.94)
  })
})

describe('when the member is in credit', () => {
  it('reports an overpayment rather than a zero', () => {
    // Three payments, one small box — a plausible outcome after a pause or a
    // downsize. Quietly returning 0 keeps money that is theirs.
    const history = [
      cycle({ ships: [MAGNESIUM], billed: 54.94 }),
      cycle({ ships: [], billed: 54.94 }),
      cycle({ ships: [], billed: 54.94 }),
    ]
    const statement = exitStatement(history)
    expect(statement.settlement).toBe(0)
    expect(statement.overpayment).toBe(152.08)
  })

  it('reports no overpayment when they are square', () => {
    expect(exitStatement([cycle({ ships: [{ title: 'X', price: 54.94 }] })]).overpayment).toBe(0)
  })
})

describe('the policies, shown as lines rather than applied silently', () => {
  it('reports what the cap took off', () => {
    // £150 of goods against a £70 payment: the raw gap is £80, the cap holds it
    // to £70, and the statement can say which.
    const statement = exitStatement([
      cycle({ ships: [{ title: 'Box', price: 150 }], billed: 70 }),
    ])
    expect(statement.rawGap).toBe(80)
    expect(statement.cappedBy).toBe(10)
    expect(statement.settlement).toBe(70)
  })

  it('reports what the small-balance waiver took off', () => {
    const statement = exitStatement([
      cycle({ ships: [{ title: 'Box', price: 57 }], billed: 54.94 }),
    ])
    expect(statement.rawGap).toBe(2.06)
    expect(statement.waived).toBe(2.06)
    expect(statement.settlement).toBe(0)
  })

  it('does not reclaim the intro discount it was told to keep', () => {
    /**
     * The bug this is the fix for: `settlement.reclaimIntroDiscount` is FALSE,
     * the forecast has always honoured it by measuring against
     * `settlementBasisOf`, and the ledger — the side that actually bills —
     * measured against what the card was CHARGED. The discount therefore fell
     * straight into the balance and was billed back at the exit, to exactly the
     * people most likely to dispute it. `ledgerDivergence` had been reporting
     * the difference to nobody for as long as both paths existed.
     *
     * The real numbers from a member one month in: £68.80 of product in the
     * signup box, £46.86 charged after a £5.32 first-month discount.
     */
    const statement = exitStatement(
      [cycle({ ships: [{ title: 'Signup box', price: 68.8 }], billed: 46.86 })],
      PRICING_CONFIG,
      { introDiscountKept: 5.32 },
    )
    expect(statement.rawGap).toBe(21.94)
    expect(statement.introKept).toBe(5.32)
    expect(statement.settlement).toBe(16.62)
  })

  it('takes the discount off before the cap, not after', () => {
    // Otherwise the cap bites on money we had already decided not to ask for,
    // and the member is charged for the difference between two policies.
    const statement = exitStatement(
      [cycle({ ships: [{ title: 'Box', price: 150 }], billed: 70 })],
      PRICING_CONFIG,
      { introDiscountKept: 20 },
    )
    expect(statement.rawGap).toBe(80)
    expect(statement.introKept).toBe(20)
    // £80 − £20 = £60, which is under the £70 cap, so the cap never bites.
    expect(statement.cappedBy).toBe(0)
    expect(statement.settlement).toBe(60)
  })

  it('never turns a discount bigger than the balance into money owed back', () => {
    const statement = exitStatement(
      [cycle({ ships: [{ title: 'Box', price: 60 }], billed: 55 })],
      PRICING_CONFIG,
      { introDiscountKept: 40 },
    )
    expect(statement.introKept).toBe(5)
    expect(statement.settlement).toBe(0)
    expect(statement.overpayment).toBe(0)
  })

  it('leaves the gap alone when no cap is configured', () => {
    const uncapped: PricingConfig = {
      ...PRICING_CONFIG,
      settlement: { ...PRICING_CONFIG.settlement, maxShareOfPaid: null },
    }
    const statement = exitStatement([cycle({ ships: [{ title: 'Box', price: 150 }], billed: 70 })], uncapped)
    expect(statement.cappedBy).toBe(0)
    expect(statement.settlement).toBe(80)
  })
})

describe('refusing to bill from a half-populated ledger', () => {
  it('will not use the ledger when a cycle has no recorded payment', () => {
    // Plans that predate `billedAmount` would compute as "paid nothing, owes
    // everything" — the most damaging way this could be wrong.
    const history = [cycle({ ships: [PROTEIN], billed: null }), cycle({ ships: [PROTEIN] })]
    expect(ledgerIsComplete(history)).toBe(false)
    expect(settlementToCharge(history, 12.5)).toMatchObject({ amount: 12.5, source: 'forecast', statement: null })
  })

  it('uses the ledger once every cycle carries one', () => {
    const history = [cycle({ ships: [PROTEIN, CREATINE, MAGNESIUM] })]
    expect(ledgerIsComplete(history)).toBe(true)
    const decided = settlementToCharge(history, 99)
    expect(decided.source).toBe('ledger')
    expect(decided.amount).toBe(11.33)
  })

  it('has no ledger at all for a member with no orders', () => {
    expect(ledgerIsComplete([])).toBe(false)
  })
})

describe('divergence from the forecast', () => {
  it('is silent when the two agree', () => {
    const statement = exitStatement([cycle({ ships: [PROTEIN, CREATINE, MAGNESIUM] })])
    expect(ledgerDivergence(statement, 11.33)).toMatchObject({ difference: 0, material: false })
  })

  it('flags a material gap for a founder to look at', () => {
    const statement = exitStatement([cycle({ ships: [PROTEIN, CREATINE, MAGNESIUM] })])
    expect(ledgerDivergence(statement, 40)).toMatchObject({ material: true })
  })

  it('is null rather than alarming when there is no history to compare', () => {
    expect(ledgerDivergence(exitStatement([]), 25)).toBeNull()
  })
})
