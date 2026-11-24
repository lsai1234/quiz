import { BUY_CHANNELS, CHANNEL_LABEL, OFFER_RULES, offerWorksOn } from '../rulebook'
import { worksOn } from '@/lib/partners/redeem'
import { founderCodeWorksOn } from '@/lib/founder-codes/redeem'
import { buildShopPlan } from '@/lib/checkout/shop-plan'
import { priceBasket, resolveBasket } from '@/lib/basket/helpers'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint/mock-blueprint'
import { calculatePricing, getPricingConfig } from '@/lib/stack-blueprint/pricing'

/**
 * The offer rulebook (`rulebook.ts`) is a table for people. These hold it to
 * what checkout actually does, cell by cell, so a rule changed in one place and
 * not the other fails here rather than on a customer's receipt.
 */

const config = getPricingConfig()
const sellable = MOCK_CATALOGUE.filter((p) => p.variants.some((v) => v.available))
const lineFor = (id: string) => {
  const p = MOCK_CATALOGUE.find((x) => x.id === id)!
  return { productId: p.id, variantId: p.variants.find((v) => v.available)!.id, quantity: 1 }
}

describe('the rulebook agrees with checkout', () => {
  it('partner codes: refused on single shop products, taken on stacks and every plan', () => {
    expect(offerWorksOn('partner-code', 'shop-once')).toBe(worksOn('shop'))
    expect(offerWorksOn('partner-code', 'stack-once')).toBe(worksOn('quiz'))
    // Every plan checks out on the subscription channel, the shop's monthly basket included.
    expect(offerWorksOn('partner-code', 'stack-monthly')).toBe(worksOn('subscription'))
    expect(offerWorksOn('partner-code', 'shop-monthly')).toBe(worksOn('subscription'))
  })

  it('a partner code on a plan comes off the first payment only, as the note says', async () => {
    const { firstMonthRate } = await import('@/lib/stack-blueprint/pricing')
    // 25% off the full price, in place of a 20% plan saving: 6.25% off the plan's price, once.
    expect(firstMonthRate(0, 0.25, 0.2)).toBeCloseTo(0.0625, 6)
    expect(OFFER_RULES.find((r) => r.id === 'partner-code')!.note).toMatch(/first payment only/)
  })

  it('founder codes: one-off orders only, never a plan', () => {
    expect(offerWorksOn('founder-code', 'shop-once')).toBe(founderCodeWorksOn('shop'))
    expect(offerWorksOn('founder-code', 'stack-once')).toBe(founderCodeWorksOn('quiz'))
    expect(offerWorksOn('founder-code', 'stack-monthly')).toBe(founderCodeWorksOn('subscription'))
    expect(offerWorksOn('founder-code', 'shop-monthly')).toBe(founderCodeWorksOn('subscription'))
  })

  it('a monthly shop basket: no plan saving, no first-month discount, no gift, and the basket saving kept', () => {
    const big = [...sellable].sort((a, b) => b.variants[0].price - a.variants[0].price).slice(0, 3).map((p) => lineFor(p.id))
    const plan = buildShopPlan(big, MOCK_CATALOGUE, config)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect((plan.subscription.subscriptionDiscountRate ?? 0) > 0).toBe(offerWorksOn('plan-saving', 'shop-monthly'))
    expect((plan.subscription.introDiscountRate ?? 0) > 0).toBe(offerWorksOn('first-month', 'shop-monthly'))
    expect(Boolean(plan.subscription.bonus)).toBe(offerWorksOn('free-gift', 'shop-monthly'))
    const once = priceBasket(resolveBasket(big, MOCK_CATALOGUE), config)
    expect(once.discount).toBeGreaterThan(0)
    expect(plan.saving > 0).toBe(offerWorksOn('basket-tier', 'shop-monthly'))
  })

  it('a stack plan: the bundle’s saving', () => {
    const pricing = calculatePricing(MOCK_BLUEPRINT, MOCK_CATALOGUE)
    expect(pricing.subscriptionDiscountPct > 0).toBe(offerWorksOn('plan-saving', 'stack-monthly'))
  })

  it('the plan savings are the ones the settings give, by bundle size', () => {
    expect(Object.values(config.levelSubscriptionDiscount).map((r) => Math.round(r * 100))).toEqual([13, 15, 20])
    expect(OFFER_RULES.find((r) => r.id === 'plan-saving')!.name).toContain('13%, 15% or 20%')
  })
})

describe('the table itself', () => {
  it('says, for every offer, where it works and what to know', () => {
    for (const rule of OFFER_RULES) {
      expect(BUY_CHANNELS.some((c) => rule.channels[c])).toBe(true)
      expect(rule.note.length).toBeGreaterThan(20)
    }
    for (const c of BUY_CHANNELS) expect(CHANNEL_LABEL[c]).toBeTruthy()
  })

  it('names products and offers, never what a product does', () => {
    const words = OFFER_RULES.flatMap((r) => [r.name, r.note]).join(' ').toLowerCase()
    for (const claim of ['helps', 'boost', 'improve', 'sleep', 'immun', 'recover']) expect(words).not.toContain(claim)
  })
})
