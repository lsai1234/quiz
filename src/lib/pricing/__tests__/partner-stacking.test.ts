/**
 * A partner's code stacks on top of the discounts already running.
 *
 * That is a decision, not an oversight — `docs/PARTNER_PROGRAMME_BUILD.md` §0 D2.
 * On the deepest rung an attributed first order can lose a few pounds, recovered
 * from month two. What must NOT happen is a line going under cost, so the margin
 * floor sits under the combined rate rather than under each part of it.
 */
import { priceOneOffLines, PRICING_CONFIG, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { claimIntroDiscount, firstMonthDiscountOf } from '@/lib/checkout/finalize'
import { unitEconomics } from '@/lib/pricing/unit-economics'
import type { MemberSubscription } from '@/lib/recharge/types'

const cfg = (over: Partial<PricingConfig> = {}): PricingConfig => ({ ...PRICING_CONFIG, ...over })

/** Three £30 products at cost £15 — a typical quiz box, priced by the rule. */
const BOX = [
  { price: 30, cost: 15 },
  { price: 30, cost: 15 },
  { price: 30, cost: 15 },
]

describe('a partner code on a one-off order', () => {
  it('takes its rate off on top of whatever tier the basket earned', () => {
    const plain = priceOneOffLines(BOX, cfg())
    const coded = priceOneOffLines(BOX, cfg(), 0.2)

    expect(coded.partnerPct).toBe(0.2)
    expect(coded.total).toBeLessThan(plain.total)
    // Multiplicative with the tier, never additive.
    expect(coded.combinedPct).toBeCloseTo(1 - (1 - plain.tierPct) * 0.8, 6)
  })

  it('does not change which tier the basket qualified for', () => {
    // The tier is what the basket earned; a code is not part of earning it.
    // Judging qualification on the discounted total would let a code push an
    // order down a tier and take the bundle discount away with the same click.
    expect(priceOneOffLines(BOX, cfg(), 0.2).tierPct).toBe(priceOneOffLines(BOX, cfg()).tierPct)
    expect(priceOneOffLines(BOX, cfg(), 0.2).subtotal).toBe(priceOneOffLines(BOX, cfg()).subtotal)
  })

  it('never sells a line below the margin floor, however deep the stack', () => {
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

describe('a partner code on a subscription', () => {
  const sub = { flatMonthly: 90, introDiscountRate: 0 } as MemberSubscription

  it('discounts the first month and nothing after it', () => {
    const claimed = claimIntroDiscount(sub, cfg(), 0.2)
    expect(claimed.firstMonth).toBe(72)
    expect(claimed.flatMonthly).toBe(90)
    expect(claimed.partnerDiscountPct).toBe(0.2)
  })

  it('combines with an intro offer as ONE coupon, multiplicatively', () => {
    // Stripe takes a single `duration: 'once'` discount. Two separate ones would
    // compound in a way neither rate describes, and the member would be charged
    // something nobody quoted.
    //
    // No site-wide intro offer runs today, so this puts one back to prove the
    // maths — the case that matters if one ever returns.
    const withOffer = cfg({
      introOffer: { ...PRICING_CONFIG.introOffer, firstMonthDiscount: 0.1 },
    })
    // No `introDiscountRate` on the payload: an explicit 0 means "apply no
    // intro", which is a different statement from "I did not claim one".
    const claimed = claimIntroDiscount({ flatMonthly: 90 } as MemberSubscription, withOffer, 0.2)
    expect(claimed.introDiscountRate).toBe(0.1)
    expect(firstMonthDiscountOf(claimed)).toBeCloseTo(0.28, 6)
    expect(claimed.firstMonth).toBe(64.8)
  })

  it('is exactly the code’s rate while no intro offer runs — which is now', () => {
    expect(PRICING_CONFIG.introOffer.firstMonthDiscount).toBe(0)
    const claimed = claimIntroDiscount(sub, cfg(), 0.2)
    expect(firstMonthDiscountOf(claimed)).toBe(0.2)
  })

  it('leaves the first month whole when no code was used', () => {
    const claimed = claimIntroDiscount(sub, cfg())
    expect(claimed.firstMonth).toBe(90)
    expect(firstMonthDiscountOf(claimed)).toBe(0)
  })
})

describe('what the stack actually costs us', () => {
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

  it('costs us money on an attributed order, at both rungs', () => {
    // Pinned because it is the trade the programme was signed off on. If either
    // number moves materially, the D2 decision deserves revisiting rather than
    // a quiet test update.
    //
    // Both are negative on this box once the parcel's real delivery is counted.
    // That is an acquisition cost taken knowingly (D2, option 1), recovered from
    // month two on a subscription — but it is NOT "an attributed one-off makes
    // money on its own", which is what the first pass of this modelling said.
    const codeOnly = keeps(0.2) - commission(0.2)
    const deepest = keeps(0.36) - commission(0.36)

    expect(codeOnly).toBeCloseTo(-2.26, 1)
    expect(deepest).toBeCloseTo(-14.28, 1)

    // Undiscounted and unattributed, the same box pays perfectly well — so the
    // cost is the programme's, not the product's.
    expect(keeps(0)).toBeGreaterThan(20)
  })

  it('never lets the COMMISSION be what pushes an order under', () => {
    // The contribution guard. It does not rescue the rows above — those were
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
