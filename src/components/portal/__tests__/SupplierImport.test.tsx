import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SupplierImport } from '../SupplierImport'

jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: jest.fn() }))

function reply(body: string, { ok = true, status = 200 } = {}) {
  return Promise.resolve({ ok, status, json: async () => JSON.parse(body) } as Response)
}

const ROW = {
  sku: 'PB-WHEY-1KG',
  name: 'Whey Protein 1kg',
  brand: 'PowerBody',
  category: 'Protein',
  imageUrl: null,
  wholesalePrice: 10,
  sellPrice: 19.99,
  contribution: 5.85,
  marginPct: 35,
  marginEstimated: false,
  rrp: 24.99,
  currency: 'GBP',
  stock: 12,
  inStock: true,
  detailed: true,
  mappedId: 'whey-protein-1kg',
  stackSlots: ['protein'],
  hasStimulants: false,
  alreadyAdded: false,
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  jest.restoreAllMocks()
})

describe('SupplierImport', () => {
  it('shows the whole product for a looked-up SKU', async () => {
    global.fetch = jest
      .fn()
      .mockReturnValue(reply(JSON.stringify({ products: [ROW], notFound: [], source: 'powerbody' }))) as unknown as typeof fetch

    render(<SupplierImport />)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/PB-WHEY-1KG/), 'PB-WHEY-1KG')
    await user.click(screen.getByRole('button', { name: /look up/i }))

    // The point of going by SKU: what comes back is a product, not a code.
    expect(await screen.findByText('Whey Protein 1kg')).toBeInTheDocument()
    expect(screen.getByText(/12 in stock/)).toBeInTheDocument()
    expect(screen.getByText(/Cost £10\.00 → sell £19\.99/)).toBeInTheDocument()
    expect(screen.getByText(/35% margin/)).toBeInTheDocument()
  })

  it('names the SKUs the supplier does not have', async () => {
    global.fetch = jest
      .fn()
      .mockReturnValue(reply(JSON.stringify({ products: [], notFound: ['NOPE-1'] }))) as unknown as typeof fetch

    render(<SupplierImport />)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/PB-WHEY-1KG/), 'NOPE-1')
    await user.click(screen.getByRole('button', { name: /look up/i }))

    expect(await screen.findByText(/Not in the feed: NOPE-1/)).toBeInTheDocument()
  })

  it('says a product is waiting for review rather than on sale', async () => {
    const fetchMock = jest.fn((url: string) =>
      url === '/api/portal/supplier'
        ? reply(JSON.stringify({ ok: true, added: 1, aiUsed: false }))
        : reply(JSON.stringify({ products: [ROW], notFound: [] })),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    render(<SupplierImport />)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/PB-WHEY-1KG/), 'PB-WHEY-1KG')
    await user.click(screen.getByRole('button', { name: /look up/i }))
    await user.click(await screen.findByRole('button', { name: /^add$/i }))

    // Adding is not publishing, and the wording has to carry that.
    expect(await screen.findByText(/waiting in Products → Review/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing is on sale until you approve it/)).toBeInTheDocument()
  })

  it('surfaces the supplier’s own error', async () => {
    global.fetch = jest
      .fn()
      .mockReturnValue(
        reply(JSON.stringify({ error: 'PowerBody is rate limiting us (HTTP 429).' }), { ok: false, status: 502 }),
      ) as unknown as typeof fetch

    render(<SupplierImport />)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/PB-WHEY-1KG/), 'PB-1')
    await user.click(screen.getByRole('button', { name: /look up/i }))

    expect(await screen.findByText(/rate limiting us/)).toBeInTheDocument()
  })
})
