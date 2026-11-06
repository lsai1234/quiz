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
  freeOver: 40,
  deals: [
    { productId: 'creatine', variantId: 'creatine-300g', title: 'Creatine Monohydrate', short: 'Creatine', imageUrl: null, boughtOn: '2026-10-01', runsOutOn: '2026-11-10', estimated: false, opensOn: '2026-11-03', endsOn: '2027-02-03', state: 'open', opensInDays: 0, boxable: true, quote },
    { productId: 'whey', variantId: 'whey-1kg', title: 'Whey Protein', short: 'Whey', imageUrl: null, boughtOn: '2026-11-01', runsOutOn: '2026-12-01', estimated: true, opensOn: '2026-11-24', endsOn: '2027-02-03', state: 'upcoming', opensInDays: 19, boxable: true, quote: { ...quote, offerPrice: 32.99, discountPct: 0, deliveryDeal: 'reduced' as const, deliveryCharge: 0.99, total: 33.98, normalTotal: 37.94 } },
  ],
}

const box = {
  lines: [{ productId: 'creatine', variantId: 'creatine-300g', title: 'Creatine Monohydrate', listPrice: 34.99, basePrice: 34.99, offerPrice: 29.74, discountPct: 15 }],
  subtotal: 34.99, goods: 29.74, standardDelivery: 4.95, deliveryCharge: 0, delivery: 'free', total: 29.74, normalTotal: 39.94, totalSaving: 10.2, freeOver: 40, viable: true,
}

describe('member prices in the hub', () => {
  const calls: { url: string; body: unknown }[] = []
  beforeEach(() => {
    calls.length = 0
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null })
      if (String(url) === '/api/hub/deals') return { ok: true, status: 200, json: async () => state } as Response
      if (String(url) === '/api/hub/deal-emails') return { ok: true, status: 200, json: async () => ({ on: true }) } as Response
      if (String(url) === '/api/hub/deals/quote') return { ok: true, status: 200, json: async () => box } as Response
      return { ok: false, status: 500, json: async () => ({ error: 'nope' }) } as Response
    }) as unknown as typeof fetch
  })

  it('puts open prices in a top-up box, priced by the server, with what is coming and the conditions', async () => {
    render(<DealsCard />)
    expect(await screen.findByText('Your member prices')).toBeInTheDocument()
    expect(screen.getAllByText('15% off and free UK mainland delivery').length).toBeGreaterThan(0)
    expect(await screen.findByRole('button', { name: 'Buy for £29.74' })).toBeInTheDocument()
    expect(screen.getByText(/You save £10.20/)).toBeInTheDocument()
    // Whey is due within 30 days: it can join the box early.
    expect(screen.getByRole('checkbox', { name: 'Add to my box early' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'In my box' })).toBeChecked()
    expect(screen.getAllByText(/UK mainland/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /How member prices work/ }))
    expect(screen.getByRole('link', { name: 'Member hub terms' })).toHaveAttribute('href', '/legal/member-hub')
    expect(screen.getByRole('checkbox', { name: /Email me when a member price opens/ })).toBeChecked()
  })

  it('buys the box through the member checkout, saying the total it showed', async () => {
    render(<DealsCard />)
    const buy = await screen.findByRole('button', { name: 'Buy for £29.74' })
    await act(async () => {
      fireEvent.click(buy)
    })
    await waitFor(() => expect(calls.some((c) => c.url === '/api/cart')).toBe(true))
    const cart = calls.find((c) => c.url === '/api/cart')!.body as { lines: { variantId: string }[]; memberDeal: { expectedTotal: number } }
    expect(cart.lines.map((l) => l.variantId)).toEqual(['creatine-300g'])
    expect(cart.memberDeal).toEqual({ expectedTotal: 29.74 })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('shows nothing while switched off', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ enabled: false, deals: [], hubEndsOn: null, freeOver: 40 }) })) as unknown as typeof fetch
    const { container } = render(<DealsCard />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
