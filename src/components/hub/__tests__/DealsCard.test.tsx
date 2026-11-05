import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DealsCard } from '../DealsCard'
import type { DealsState } from '@/lib/deals/server'

const quote = {
  listPrice: 34.99, basePrice: 34.99, offerPrice: 29.74, discountPct: 15, rate: 0.15, saving: 5.25,
  standardDelivery: 4.95, deliveryCharge: 0, deliveryDeal: 'free' as const, deliverySaving: 4.95,
  normalTotal: 39.94, total: 29.74, totalSaving: 10.2, viable: true,
}
const state: DealsState = {
  enabled: true,
  hubEndsOn: '2027-02-03',
  deals: [
    { productId: 'creatine', variantId: 'creatine-300g', title: 'Creatine Monohydrate', short: 'Creatine', imageUrl: null, boughtOn: '2026-10-01', runsOutOn: '2026-11-10', estimated: false, opensOn: '2026-11-03', endsOn: '2027-02-03', state: 'open', opensInDays: 0, quote },
    { productId: 'whey', variantId: 'whey-1kg', title: 'Whey Protein', short: 'Whey', imageUrl: null, boughtOn: '2026-11-01', runsOutOn: '2026-12-01', estimated: true, opensOn: '2026-11-24', endsOn: '2027-02-03', state: 'upcoming', opensInDays: 19, quote: { ...quote, offerPrice: 32.99, discountPct: 0, deliveryDeal: 'reduced' as const, deliveryCharge: 0.99, total: 33.98, normalTotal: 37.94 } },
  ],
}

describe('member prices in the hub', () => {
  const calls: { url: string; body: unknown }[] = []
  beforeEach(() => {
    calls.length = 0
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null })
      if (String(url) === '/api/hub/deals') return { ok: true, status: 200, json: async () => state } as Response
      return { ok: false, status: 500, json: async () => ({ error: 'nope' }) } as Response
    }) as unknown as typeof fetch
  })

  it('shows open deals with a price and a way to buy, then what is coming, with the conditions', async () => {
    render(<DealsCard />)
    expect(await screen.findByText('Your member prices')).toBeInTheDocument()
    expect(screen.getByText('15% off and free delivery')).toBeInTheDocument()
    expect(screen.getByText('£29.74 delivered, instead of £39.94')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buy for £29.74' })).toBeInTheDocument()
    expect(screen.getByText(/^Whey: Delivery £0.99/)).toBeInTheDocument()
    expect(screen.getByText(/^Opens in 19 days/)).toBeInTheDocument()
    expect(screen.getByText('£33.98 delivered, instead of £37.94')).toBeInTheDocument()
    expect(screen.getByText(/mainland/)).toBeInTheDocument()
  })

  it('buys through the one-product checkout, saying the price it showed', async () => {
    render(<DealsCard />)
    const buy = await screen.findByRole('button', { name: 'Buy for £29.74' })
    await act(async () => {
      fireEvent.click(buy)
    })
    await waitFor(() => expect(calls.some((c) => c.url === '/api/cart')).toBe(true))
    const cart = calls.find((c) => c.url === '/api/cart')!.body as { lines: { variantId: string }[]; lastChance: { variantId: string; expectedPrice: number; expectedDelivery: number } }
    expect(cart.lines).toHaveLength(1)
    expect(cart.lastChance).toEqual({ variantId: 'creatine-300g', expectedPrice: 29.74, expectedDelivery: 0 })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('shows nothing while switched off', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ enabled: false, deals: [], hubEndsOn: null }) })) as unknown as typeof fetch
    const { container } = render(<DealsCard />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
