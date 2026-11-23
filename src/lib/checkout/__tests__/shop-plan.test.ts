import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { buildShopPlan, shopPlanMinMonths, shopPlanTermLine } from '../shop-plan'
import { priceBasket, resolveBasket } from '@/lib/basket/helpers'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'

const config = getPricingConfig()
const sellable = MOCK_CATALOGUE.filter((p) => p.variants.some((v) => v.available))
const lineFor = (p: CatalogueProduct, quantity = 1) => {
  const v = p.variants.find((x) => x.available)!
  return { productId: p.id, variantId: v.id, quantity }
}

describe('a shop basket bought every month', () => {
  it('costs what the same basket costs once, with no subscribe-and-save rate', () => {
    const input = [lineFor(sellable[0], 2), lineFor(sellable[1])]
    const plan = buildShopPlan(input, MOCK_CATALOGUE, config)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const once = priceBasket(resolveBasket(input, MOCK_CATALOGUE), config)
    expect(plan.monthly).toBeCloseTo(once.total, 2)
    expect(plan.subscription.flatMonthly).toBeCloseTo(once.total, 2)
    expect(plan.subscription.subscriptionDiscountRate).toBe(0)
    expect(plan.subscription.introDiscountRate).toBe(0)
    expect(plan.subscription.firstMonth).toBe(plan.monthly)
    // The lines add up to the monthly, so the hub's sums agree with the charge.
    const sum = plan.subscription.lines.reduce((s, l) => s + l.pricePerDelivery, 0)
    expect(sum).toBeCloseTo(plan.monthly, 2)
  })

  it('keeps the basket’s own saving (the £50+ tier) when it earns one', () => {
    const big = [...sellable].sort((a, b) => b.variants[0].price - a.variants[0].price).slice(0, 3).map((p) => lineFor(p))
    const plan = buildShopPlan(big, MOCK_CATALOGUE, config)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const once = priceBasket(resolveBasket(big, MOCK_CATALOGUE), config)
    expect(plan.saving).toBeCloseTo(once.discount, 2)
  })

  it('refuses a basket under the monthly minimum, and says what the minimum is', () => {
    const cheap = [...sellable].sort((a, b) => a.variants[0].price - b.variants[0].price)[0]
    const plan = buildShopPlan([lineFor(cheap)], MOCK_CATALOGUE, { ...config, minSubscriptionMonthly: 1000 })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.reason).toBe('minimum')
    expect(plan.message).toContain('start at £1000 a month')
  })

  it('refuses a product that has gone, naming it', () => {
    const p = sellable[0]
    const plan = buildShopPlan([{ productId: p.id, variantId: 'no-such-variant', quantity: 1 }], MOCK_CATALOGUE, config)
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.reason).toBe('unavailable')
    expect(plan.message).toContain(p.title)
  })

  it('refuses an empty basket', () => {
    const plan = buildShopPlan([], MOCK_CATALOGUE, config)
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.reason).toBe('empty')
  })

  it('takes nothing from the browser but products and quantities', () => {
    const p = sellable[0]
    // A quantity out of range is clamped, never trusted.
    const plan = buildShopPlan([{ ...lineFor(p), quantity: 10_000 }], MOCK_CATALOGUE, config)
    expect(plan.ok).toBe(true)
    if (plan.ok) expect(plan.subscription.lines[0].quantity).toBe(99)
  })

  it('takes an unavailable product out rather than swapping it, since there are no answers to swap against', () => {
    const plan = buildShopPlan([lineFor(sellable[0]), lineFor(sellable[1])], MOCK_CATALOGUE, config)
    expect(plan.ok && plan.subscription.defaultChangePolicy).toBe('remove')
    expect(plan.ok && plan.subscription.lines.every((l) => l.allowSubstitution === false)).toBe(true)
  })

  // Members are promised they can cancel any time; no setting adds a term.
  it('has no minimum term, whatever the products', () => {
    expect(shopPlanMinMonths()).toBe(1)
    expect(shopPlanTermLine()).toBe('Cancel any time')
    const plan = buildShopPlan([lineFor(sellable[0])], MOCK_CATALOGUE.map((p) => ({ ...p, minSubscriptionMonths: 6 })), { ...config, minSubscriptionMonths: 3 })
    expect(plan.ok && plan.subscription.minMonths).toBe(1)
  })

  it('adds a monthly delivery line under the free-delivery line, and none over it', () => {
    const cheap = [...sellable].sort((a, b) => a.variants[0].price - b.variants[0].price)[0]
    const low = buildShopPlan([lineFor(cheap)], MOCK_CATALOGUE, { ...config, minSubscriptionMonthly: 1 })
    const free = config.freeDeliveryThreshold
    if (low.ok && low.monthly < free) expect(low.delivery?.price).toBeGreaterThan(0)
    const big = buildShopPlan(sellable.slice(0, 4).map((p) => lineFor(p)), MOCK_CATALOGUE, config)
    if (big.ok && big.monthly >= free) expect(big.delivery).toBeNull()
  })
})
