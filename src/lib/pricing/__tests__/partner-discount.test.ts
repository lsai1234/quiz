/**
 * A partner's code REPLACES the discount the order had earned. It does not
 * stack on top of it.
 *
 * That is a decision, not an oversight — `docs/PARTNER_PROGRAMME_BUILD.md` §0 D2.
 * Stacking was the single most expensive thing in the programme: on the deepest
 * subscription rung it came to 36% off AND a commission, and an attributed
 * subscriber returned a fifth of what an unattributed one did over its life.
 *
 * Replacing is also the version a partner can state honestly. "25% off" is what
 * a follower gets, full stop — not "25% off, compounded with a rate you would
 * have to work out from the receipt".
 *
 * What must NOT happen is a line going under cost, so the margin floor still
 * sits under whatever rate wins.
 */
import { priceOneOffLines, firstMonthRate, PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { claimIntroDiscount, firstMonthDiscountOf } from '@/lib/checkout/finalize'
import { unitEconomics } from '@/lib/pricing/unit-economics'
import type { MemberSubscription } from '@/lib/recharge/types'

const cfg = (over: Partial<PricingConfig> = {}): PricingConfig => ({ ...PRICING_CONFIG, ...over })

/** The programme-wide follower discount. */
const CODE = PRICING_CONFIG.partners.codeDiscountPct

/** Three £30 products at cost £15 — a typical quiz box, priced by the rule. */
const BOX = [
  { price: 30, cost: 15 },
  { price: 30, cost: 15 },
  { price: 30, cost: 15 },
]

describe('a partner code on a one-off order', () => {
  it('replaces the tier the basket earned rather than compounding with it', () => {
    const plain = priceOneOffLines(BOX, cfg())
    const coded = priceOneOffLines(BOX, cfg(), CODE)

    expect(plain.tierPct).toBeGreaterThan(0) // a £90 box does earn a tier
    expect(coded.partnerPct).toBe(CODE)
    expect(coded.combinedPct).toBe(CODE)
    // Not 1 − (1 − tier)(1 − code), which is what it used to be.
    expect(coded.combinedPct).toBeLessThan(1 - (1 - plain.tierPct) * (1 - CODE))
    expect(coded.total).toBe(90 * (1 - CODE))
  })

  it('never leaves someone worse off than the discount they had earned', () => {
    // A founder is free to set a code below the bundle tier. That must read as
    // "no better than what you already had", never as a penalty for using it.
    const tier = priceOneOffLines(BOX, cfg()).tierPct
    const shallow = priceOneOffLines(BOX, cfg(), tier / 2)
    expect(shallow.combinedPct).toBe(tier)
    expect(shallow.total).toBe(priceOneOffLines(BOX, cfg()).total)
  })

  it('does not change which tier the basket qualified for', () => {
    // The tier is what the basket earned; a code is not part of earning it.
    // Judging qualification on the discounted total would let a code push an
    // order down a tier and take the bundle discount away with the same click.
    expect(priceOneOffLines(BOX, cfg(), CODE).tierPct).toBe(priceOneOffLines(BOX, cfg()).tierPct)
    expect(priceOneOffLines(BOX, cfg(), CODE).subtotal).toBe(priceOneOffLines(BOX, cfg()).subtotal)
  })

  it('never sells a line below the margin floor, however deep the rate', () => {
    const floor = 15 * (1 + PRICING_CONFIG.marginFloorPct)
    // 90% off is far past anything the programme offers — the point is that the
    // floor is what stops it, not the size of the rate.
    for (const line of priceOneOffLines(BOX, cfg(), 0.9).lines) {
      expect(line.discountedUnitPrice).toBeGreaterThanOrEqual(floor - 0.01)
    }
  })

  it('reads a missing or nonsense rate as no code at all', () => {
    const plain = priceOneOffLines(BOX, cfg()).total
    expect(priceOneOffLines(BOX, cfg(), 0).total).toBe(plain)
    expect(priceOneOffLines(BOX, cfg(), Number.NaN).total).toBe(plain)
    expect(priceOneOffLines(BOX, cfg(), -1).total).toBe(plain)
  })
})

describe('restating a code’s rate against a subscribed price', () => {
  /**
   * A code's rate is off the LIST price and replaces the subscribe-&-save rung
   * for the first month. Everything downstream bills off `flatMonthly`, which
   * has already had the rung taken off, so the rate has to be restated as the
   * one that lands the same price from there.
   */
  it('lands the code’s rate off list, whatever the rung', () => {
    for (const rung of Object.values(PRICING_CONFIG.levelSubscriptionDiscount)) {
      const restated = firstMonthRate(0, CODE, rung)
      // list 100 → subscribed 100(1 − rung) → first month must be 100(1 − code)
      const subscribed = 100 * (1 - rung)
      // 4 places, because `firstMonthRate` rounds to 6 — a rung of 13% gives a
      // recurring 0.137931…, and the difference is 3 millionths of a pound.
      expect(subscribed * (1 - restated)).toBeCloseTo(100 * (1 - CODE), 4)
    }
  })

  it('is the plain rate when nothing has been taken off yet', () => {
    expect(firstMonthRate(0, CODE, 0)).toBe(CODE)
  })

  it('takes the deeper of the code and any intro offer, never both', () => {
    // A site-wide first-month offer replaces, for the same reason the bundle
    // tier does: a code states one number and that number is what is given.
    expect(firstMonthRate(0.5, CODE, 0.2)).toBe(0.5)
    expect(firstMonthRate(0.02, CODE, 0.2)).toBe(firstMonthRate(0, CODE, 0.2))
  })

  it('never turns a code into a penalty', () => {
    // A rung deeper than the code already beats it — the first month stays on
    // the rung rather than being put back up to the code's price.
    expect(firstMonthRate(0, 0.1, 0.2)).toBe(0)
  })

  it('is exactly the intro rate when no code was used', () => {
    expect(firstMonthRate(0.15, 0, 0.2)).toBe(0.15)
    expect(firstMonthRate(0, 0, 0.2)).toBe(0)
  })
})

describe('a partner code on a subscription', () => {
  /** A £90/mo plan that listed at £120 before the 25% Complete rung. */
  const sub = { flatMonthly: 90, subscriptionDiscountRate: 0.25, introDiscountRate: 0 } as MemberSubscription

  it('charges the code’s rate off the LIST price for the first month', () => {
    const claimed = claimIntroDiscount(sub, cfg(), CODE)
    // 25% off the £120 list, not 25% off the already-discounted £90.
    expect(claimed.firstMonth).toBe(90)
    expect(claimed.flatMonthly).toBe(90)
  })

  it('stores the headline rate, not the smaller one that comes off the monthly', () => {
    // `partnerDiscountPct` is what the partner advertises and what the order,
    // the hub and the partner's dashboard all mean by "their discount". The
    // billing rate is derived from it rather than stored alongside it, so the
    // two can never disagree.
    const claimed = claimIntroDiscount({ ...sub, subscriptionDiscountRate: 0.2 }, cfg(), CODE)
    expect(claimed.partnerDiscountPct).toBe(CODE)
    expect(firstMonthDiscountOf(claimed)).toBeCloseTo(0.0625, 6)
    expect(claimed.firstMonth).toBe(84.38)
  })

  it('discounts the first month and nothing after it', () => {
    const claimed = claimIntroDiscount({ ...sub, subscriptionDiscountRate: 0 }, cfg(), CODE)
    expect(claimed.firstMonth).toBe(67.5)
    expect(claimed.flatMonthly).toBe(90)
  })

  it('takes the deeper of an intro offer and the code as ONE coupon', () => {
    // Stripe takes a single `duration: 'once'` discount. Two separate ones would
    // compound in a way neither rate describes, and the member would be charged
    // something nobody quoted.
    //
    // No site-wide intro offer runs today, so this puts one back to prove the
    // rule — the case that matters if one ever returns.
    const withOffer = cfg({
      introOffer: { ...PRICING_CONFIG.introOffer, firstMonthDiscount: 0.5 },
    })
    // No `introDiscountRate` on the payload: an explicit 0 means "apply no
    // intro", which is a different statement from "I did not claim one".
    const claimed = claimIntroDiscount(
      { flatMonthly: 90, subscriptionDiscountRate: 0.2 } as MemberSubscription,
      withOffer,
      CODE,
    )
    expect(claimed.introDiscountRate).toBe(0.5)
    // The offer is the deeper of the two, so it is the whole discount.
    expect(firstMonthDiscountOf(claimed)).toBe(0.5)
    expect(claimed.firstMonth).toBe(45)
  })

  it('leaves the first month whole when no code was used', () => {
    const claimed = claimIntroDiscount(sub, cfg())
    expect(claimed.firstMonth).toBe(90)
    expect(firstMonthDiscountOf(claimed)).toBe(0)
  })
})

describe('what an attributed order actually costs us', () => {
  /**
   * What a £90 three-item box at £45 cost keeps, at a given discount.
   *
   * `sharedParcelItems: 1` — the order IS the parcel. An earlier version of this
   * passed the item count here, which is the per-LINE shape: it divides one
   * parcel's delivery across the lines sharing it. Applied to a whole-order call
   * it collapsed £7.87 of delivery into £0.13 and made every figure below look
   * about £7.74 healthier than it is.
   */
  const keeps = (discount: number) =>
    unitEconomics(
      { shelfPrice: 90 * (1 - discount), supplierCost: 45, sharedParcelItems: 1, freeDeliveryBasis: 90 },
      cfg(),
    ).contribution

  const commission = (discount: number) => {
    const paid = 90 * (1 - discount)
    const net = PRICING_CONFIG.vat.registered ? paid / (1 + PRICING_CONFIG.vat.standardRate) : paid
    return net * PRICING_CONFIG.partners.firstOrderPct
  }

  it('costs us money on an attributed order, but ONE rate’s worth', () => {
    // Pinned because it is the trade the programme was signed off on. If this
    // moves materially the D2 decision deserves revisiting rather than a quiet
    // test update.
    //
    // Still negative once the parcel's real delivery is counted — an
    // acquisition cost taken knowingly, recovered from month two on a
    // subscription. What changed is the size of it: stacking put the deepest
    // rung at −£14.28, and there is no longer a deepest rung to be at — one
    // code, one rate, one figure.
    //
    // −£6.02 → −£3.00 when delivery started being charged. Nothing about the
    // programme changed: this £90 box qualified for free delivery under the old
    // £60 threshold, so we ate the whole £7.80 parcel; on the customer rate
    // ladder it pays £2.95 and the free line sits at £100, plus the Highlands
    // surcharge blended over the orders that pay one. The trade got £3.02
    // cheaper per attributed order, which moves D2 in the safe direction — the
    // pin is here so the next move gets looked at rather than absorbed.
    expect(keeps(CODE) - commission(CODE)).toBeCloseTo(-3.00, 1)

    // Undiscounted and unattributed, the same box pays perfectly well — so the
    // cost is the programme's, not the product's.
    expect(keeps(0)).toBeGreaterThan(20)
  })

  it('pays renewals for a window SHORTER than a customer stays', () => {
    /**
     * Pinned because it is the correction that made the programme affordable,
     * and because 3 < 6 looks like an oversight until you know why.
     *
     * At 6 the window matched `averageRetentionMonths` exactly — commission on
     * every month a customer is expected to exist, which is revenue share
     * rather than a referral fee. Measured on a £90 plan: renewal commission
     * came to £18 over the life, MORE than the loss on the discounted first
     * month, and invisible because it never lands on a single order.
     */
    expect(PRICING_CONFIG.partners.renewalMonths).toBe(3)
    expect(PRICING_CONFIG.partners.renewalMonths).toBeLessThan(
      PRICING_CONFIG.orderMix.averageRetentionMonths,
    )
  })

  it('never lets the COMMISSION be what pushes an order under', () => {
    // The contribution guard. It does not rescue the row above — that was
    // already losing before any commission — but it stops a thin-but-positive
    // order being turned into a loss by the payment itself.
    const { commissionFor } = jest.requireActual<typeof import('@/lib/partners/commission')>(
      '@/lib/partners/commission',
    )
    const thin = {
      lines: [{ sku: 's', productId: 'p', title: 'T', quantity: 1, unitPrice: 60, supplierCost: 40 }],
      subtotal: 60,
    } as never
    const calc = commissionFor(thin, PRICING_CONFIG.partners.firstOrderPct, cfg())
    expect(calc.capped).toBe(true)
    expect(calc.contribution - calc.amount).toBeGreaterThan(0)
  })
})
