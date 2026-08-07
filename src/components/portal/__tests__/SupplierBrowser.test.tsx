import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SupplierBrowser } from '../SupplierBrowser'

jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: jest.fn() }))

/** A `fetch` reply. The feed reads `text()` (so an HTML error page is legible);
 *  the lookup and add calls read `json()`. */
function reply(body: string, { ok = true, status = 200 } = {}) {
  return Promise.resolve({
    ok,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as Response)
}

/** A row as the cheap list feed gives it: real money, no description, no RRP. */
const bareRow = {
  sku: 'PB-1',
  name: 'PB-1',
  brand: '',
  category: '',
  imageUrl: null,
  wholesalePrice: 10,
  rrp: null,
  currency: 'GBP',
  stock: 5,
  inStock: true,
  margin: null,
  marginPct: null,
  detailed: false,
  mappedId: 'pb-1',
  stackSlots: [],
  hasStimulants: false,
  alreadyAdded: false,
}

/** The same product once `getProductInfo` has been paid for. */
const detailedRow = {
  ...bareRow,
  name: 'Whey 1kg',
  brand: 'PB',
  category: 'Protein',
  rrp: 19.99,
  margin: 9.99,
  marginPct: 50,
  detailed: true,
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
    global.fetch = jest
      .fn()
      .mockReturnValue(
        reply(JSON.stringify({ source: 'powerbody', products: [detailedRow] })),
      ) as unknown as typeof fetch

    render(<SupplierBrowser />)

    expect(await screen.findByText('Whey 1kg')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/1 products in the feed/i)).toBeInTheDocument())
  })

  it('says the RRP is unfetched rather than showing a margin it cannot know', async () => {
    // A list-feed row has no RRP. The fallback is wholesale-including-VAT, which
    // would render as a ~17% margin — a number that looks like a fact and isn't.
    global.fetch = jest
      .fn()
      .mockReturnValue(
        reply(JSON.stringify({ source: 'powerbody', products: [bareRow] })),
      ) as unknown as typeof fetch

    render(<SupplierBrowser />)

    expect(await screen.findByText(/RRP not fetched/i)).toBeInTheDocument()
    expect(screen.getByText(/Cost £10\.00/)).toBeInTheDocument()
    expect(screen.queryByText(/% margin/)).not.toBeInTheDocument()
  })

  it('fetches one product’s detail on demand and fills its row in', async () => {
    const fetchMock = jest.fn((url: string, init?: RequestInit) =>
      url === '/api/portal/supplier/lookup'
        ? reply(JSON.stringify({ products: [detailedRow], notFound: [] }))
        : reply(JSON.stringify({ source: 'powerbody', products: [bareRow] })),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    render(<SupplierBrowser />)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^details$/i }))

    // The row now carries the name and margin that only getProductInfo knows.
    expect(await screen.findByText('Whey 1kg')).toBeInTheDocument()
    expect(screen.getByText(/50% margin/)).toBeInTheDocument()
    // And it cost exactly one lookup — for that SKU alone.
    const lookups = fetchMock.mock.calls.filter(([url]) => url === '/api/portal/supplier/lookup')
    expect(lookups).toHaveLength(1)
    expect(JSON.parse(String(lookups[0][1]?.body))).toEqual({ skus: ['PB-1'] })
  })
})
