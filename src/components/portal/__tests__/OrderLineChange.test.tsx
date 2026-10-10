import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderLineChange } from '../OrderLineChange'

const OPTIONS = {
  index: 1,
  value: 8.27,
  live: { sku: 'P51016', stock: 0, inStock: false },
  onlyLine: false,
  replacements: [
    { productId: 'd3-cheaper', variantId: 'v-1', sku: 'P60001', title: 'Vegan D3', variantTitle: null, price: 7.5, difference: -0.77, stock: 25, confirmed: true },
    { productId: 'd3-dearer', variantId: 'v-2', sku: 'P60002', title: 'D3 Max', variantTitle: '120 caps', price: 9.99, difference: 1.72, stock: 4, confirmed: true },
  ],
}

const PICKS = [
  {
    productId: 'whey',
    title: 'Whey Isolate',
    brand: 'PowerBody',
    category: 'Protein',
    variants: [
      { variantId: 'w-choc', sku: 'P1', label: 'Chocolate', price: 29.99, difference: 21.72, stock: 9 },
      { variantId: 'w-van', sku: 'P2', label: 'Vanilla', price: 29.99, difference: 21.72, stock: 3 },
    ],
    warnings: ['Not vegan — the original was'],
  },
]

const reply = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => body } as Response)

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
})

function setup() {
  const calls: Record<string, unknown>[] = []
  global.fetch = jest.fn((_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    calls.push(body)
    if (body.action === 'line-options') return reply({ ok: true, options: OPTIONS })
    if (body.action === 'line-search') return reply({ ok: true, products: PICKS })
    return reply({ ok: true, order: { id: 'ord_1' } })
  }) as unknown as typeof fetch
  const onChanged = jest.fn()
  const onClose = jest.fn()
  render(<OrderLineChange orderId="ord_1" index={1} sku="P51016" firstName="Charlie" onChanged={onChanged} onClose={onClose} />)
  return { calls, onChanged, onClose }
}

describe('OrderLineChange', () => {
  it('shows live stock and the like-for-like replacements, with what each costs us or them', async () => {
    setup()
    expect(await screen.findByText('PowerBody have none of these right now.')).toBeInTheDocument()
    expect(screen.getByText('Vegan D3')).toBeInTheDocument()
    expect(screen.getByText(/£0\.77 cheaper — we refund the gap/)).toBeInTheDocument()
    expect(screen.getByText(/£1\.72 dearer — on us/)).toBeInTheDocument()
  })

  it('asks twice before refunding, and sends the line and SKU it was showing', async () => {
    const { calls, onChanged, onClose } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove and refund £8.27' }))
    expect(calls.map((c) => c.action)).toEqual(['line-options'])

    await userEvent.click(screen.getByRole('button', { name: 'Confirm — refund £8.27' }))
    expect(calls.at(-1)).toEqual({ line: 1, sku: 'P51016', action: 'line-remove', notify: true })
    expect(onChanged).toHaveBeenCalledWith({ id: 'ord_1' })
    expect(onClose).toHaveBeenCalled()
  })

  it('swaps a dearer match in one press — no money moves', async () => {
    const { calls } = setup()
    const swaps = await screen.findAllByRole('button', { name: 'Swap' })
    await userEvent.click(swaps[1])
    expect(calls.at(-1)).toMatchObject({ action: 'line-swap', productId: 'd3-dearer', variantId: 'v-2' })
  })

  it('finds any product by search, lets a flavour be chosen, and asks twice when it breaks a promise', async () => {
    const { calls } = setup()
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Or pick any product' }), 'whey')
    expect(await screen.findByText('PowerBody · Whey Isolate')).toBeInTheDocument()
    expect(screen.getByText('Not vegan — the original was.')).toBeInTheDocument()
    expect(calls.find((c) => c.action === 'line-search')).toMatchObject({ query: 'whey', line: 1 })

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Which Whey Isolate' }), 'w-van')
    const swaps = screen.getAllByRole('button', { name: 'Swap' })
    await userEvent.click(swaps[swaps.length - 1])
    expect(calls.at(-1)?.action).toBe('line-search')

    await userEvent.click(screen.getByRole('button', { name: 'Swap anyway' }))
    expect(calls.at(-1)).toMatchObject({ action: 'line-swap', productId: 'whey', variantId: 'w-van', acceptWarnings: true })
  })

  it('can leave the customer un-emailed', async () => {
    const { calls } = setup()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Email Charlie about it' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send the rest now, this later' }))
    expect(calls.at(-1)).toMatchObject({ action: 'line-backorder', notify: false })
  })
})
