import { render, screen, waitFor } from '@testing-library/react'
import { SupplierBrowser } from '../SupplierBrowser'

jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: jest.fn() }))

/** A `fetch` reply shaped the way the component reads one: text, then parsed. */
function reply(body: string, { ok = true, status = 200 } = {}) {
  return Promise.resolve({ ok, status, text: async () => body } as Response)
}

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
  jest.restoreAllMocks()
})

describe('SupplierBrowser', () => {
  it('offers the SKU lookup while the feed is still loading', async () => {
    // The feed is the slow, rate-limited part. Importing a SKU you already know
    // must not wait on it — that is the whole reason the box exists.
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch

    render(<SupplierBrowser />)

    expect(screen.getByText(/loading the powerbody feed/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/PB-WHEY-1KG/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /look up/i })).toBeInTheDocument()
  })

  it('shows what went wrong, and a way to retry, instead of loading forever', async () => {
    global.fetch = jest
      .fn()
      .mockReturnValue(reply(JSON.stringify({ error: 'PowerBody is rate limiting us (HTTP 429).' }), {
        ok: false,
        status: 502,
      })) as unknown as typeof fetch

    render(<SupplierBrowser />)

    expect(await screen.findByText(/rate limiting us/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText(/loading the powerbody feed/i)).not.toBeInTheDocument()
  })

  it('treats an unreadable reply as a failure, not as still loading', async () => {
    // A gateway timeout answers with an HTML page. Parsing that as "no products
    // yet" is exactly how the page got stuck on a spinner that never ended.
    global.fetch = jest
      .fn()
      .mockReturnValue(reply('<html>Gateway timeout</html>', { ok: false, status: 504 })) as unknown as typeof fetch

    render(<SupplierBrowser />)

    expect(await screen.findByText(/HTTP 504/)).toBeInTheDocument()
    expect(screen.queryByText(/loading the powerbody feed/i)).not.toBeInTheDocument()
  })

  it('does not sit on a spinner when a 200 comes back without products', async () => {
    global.fetch = jest.fn().mockReturnValue(reply(JSON.stringify({ ok: true }))) as unknown as typeof fetch

    render(<SupplierBrowser />)

    expect(await screen.findByText(/without a product list/i)).toBeInTheDocument()
  })

  it('lists the feed once it arrives', async () => {
    const products = [
      {
        sku: 'PB-1',
        name: 'Whey 1kg',
        brand: 'PB',
        category: 'Protein',
        wholesalePrice: 10,
        rrp: 19.99,
        currency: 'GBP',
        stock: 5,
        inStock: true,
        margin: 9.99,
        marginPct: 50,
        mappedId: 'pb-1',
        stackSlots: [],
        hasStimulants: false,
        alreadyAdded: false,
      },
    ]
    global.fetch = jest
      .fn()
      .mockReturnValue(reply(JSON.stringify({ source: 'powerbody', products }))) as unknown as typeof fetch

    render(<SupplierBrowser />)

    expect(await screen.findByText('Whey 1kg')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/1 products in the feed/i)).toBeInTheDocument())
  })
})
