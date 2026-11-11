import { dealPreview, dealWindow, frequencyFor, LEAD_DAYS, memberDeals, runOutDays, variantFor } from '../engine'
import { DEALS_COPY } from '../copy'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { offerProductFor, quoteOffer } from '@/lib/last-chance/economics'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'

const DAY = 86_400_000
const NOW = new Date('2026-11-05T12:00:00Z')
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()
const sellable = MOCK_CATALOGUE.filter((p) => !p.isSubscriptionOnly && variantFor(p, null))

describe('when a deal opens and ends', () => {
  it('opens a week before the pack runs out, and ends with the hub', () => {
    const w = dealWindow(0, 60, 90 * DAY)
    expect(w.opensMs).toBe((60 - LEAD_DAYS) * DAY)
    expect(w.endsMs).toBe(90 * DAY)
  })
  it('opens 14 days before the hub ends when the pack would outlast it', () => {
    expect(dealWindow(0, 200, 90 * DAY).opensMs).toBe(76 * DAY)
  })
  it('never opens in the first week', () => {
    expect(dealWindow(0, 5, 90 * DAY).opensMs).toBe(7 * DAY)
  })
  it('reads usage from training days', () => {
    expect(frequencyFor(3)).toBe('3-4x')
    expect(frequencyFor(null)).toBeNull()
  })
})

describe('member deals', () => {
  const purchases = sellable.slice(0, 6).map((p) => ({ productId: p.id, quantity: 1, at: ago(40) }))

  it('makes a deal only where it keeps the profit floor, and every one saves them money', () => {
    const { deals } = memberDeals({ purchases, products: MOCK_CATALOGUE, answers: null, now: NOW })
    expect(deals.length).toBeGreaterThan(0)
    const config = getPricingConfig()
    for (const d of deals) {
      const product = MOCK_CATALOGUE.find((p) => p.id === d.productId)!
      const q = quoteOffer(offerProductFor(product, variantFor(product, null)!), config)
      expect(q.viable).toBe(true)
      expect(q.contribution).toBeGreaterThanOrEqual(q.floor)
      expect(d.quote.total).toBeLessThan(d.quote.normalTotal)
      expect(d.quote).not.toHaveProperty('contribution')
      expect(d.quote).not.toHaveProperty('floor')
    }
    // Anything left out had no profitable deal to make.
    for (const p of purchases) {
      if (deals.some((d) => d.productId === p.productId)) continue
      const product = MOCK_CATALOGUE.find((x) => x.id === p.productId)!
      expect(quoteOffer(offerProductFor(product, variantFor(product, null)!), config).viable).toBe(false)
    }
  })

  it('leaves out the gift and the plan’s own products', () => {
    const [a, b] = purchases
    const { deals } = memberDeals({
      purchases: [{ ...a, bonus: true }, b],
      products: MOCK_CATALOGUE,
      answers: null,
      planProductIds: [b.productId],
      now: NOW,
    })
    expect(deals).toEqual([])
  })

  it('follows the latest purchase of a product, and the latest order sets the hub’s end', () => {
    const p = purchases[0]
    const { deals, hubEndsOn } = memberDeals({ purchases: [{ ...p, at: ago(80) }, { ...p, at: ago(2) }], products: MOCK_CATALOGUE, answers: null, now: NOW })
    expect(hubEndsOn).toBe(new Date(NOW.getTime() + 88 * DAY).toISOString().slice(0, 10))
    if (deals.length) expect(deals[0].boughtOn).toBe(ago(2).slice(0, 10))
  })

  it('is open once its day comes, and lists open deals first', () => {
    const { deals } = memberDeals({ purchases: purchases.map((p, i) => ({ ...p, at: ago(i % 2 ? 85 : 1) })), products: MOCK_CATALOGUE, answers: null, now: NOW })
    const states = deals.map((d) => d.state)
    expect(states).toEqual([...states].sort((a, b) => (a === b ? 0 : a === 'open' ? -1 : 1)))
    for (const d of deals) expect(d.state === 'open' ? d.opensInDays === 0 : d.opensInDays > 0).toBe(true)
  })

  it('makes nothing once the hub has ended', () => {
    expect(memberDeals({ purchases: purchases.map((p) => ({ ...p, at: ago(95) })), products: MOCK_CATALOGUE, answers: null, now: NOW }).deals).toEqual([])
  })

  it('previews a product’s deal for the reveal, in weeks', () => {
    for (const p of sellable.slice(0, 6)) {
      const preview = dealPreview(p, null)
      if (!preview) continue
      expect(preview.weeks).toBeGreaterThanOrEqual(1)
      expect(preview.weeks).toBeLessThanOrEqual(11)
      const lasts = runOutDays(p, variantFor(p, null)!, 1, null)
      expect(lasts.days).toBeGreaterThanOrEqual(7)
    }
  })
})

describe('the words', () => {
  it('puts the condition next to every free delivery and never pressures', () => {
    expect(DEALS_COPY.dealLine({ discountPct: 15, deliveryDeal: 'free', deliveryCharge: 0, standardDelivery: 3.99 })).toBe('15% off and free UK delivery')
    expect(DEALS_COPY.freeDeliveryCondition).toMatch(/Northern Ireland/)
    const all = JSON.stringify(DEALS_COPY)
    expect(all).not.toMatch(/hurry|last chance|don’t miss|only today|act now/i)
  })
})
