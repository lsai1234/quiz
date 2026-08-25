import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SupplierImport } from '../SupplierImport'

jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: jest.fn() }))

function reply(body: string, { ok = true, status = 200 } = {}) {
  return Promise.resolve({ ok, status, json: async () => JSON.parse(body) } as Response)
}

const ROW = {
  sku: 'PB-WHEY-1KG',
  // Null on purpose: these fixtures exercise the fallback for a supplier row
  // that resolved no product id, so Add still has to go by SKU.
  productId: null as string | null,
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
    await user.type(screen.getByPlaceholderText(/ON-GOLD-WHEY-2270/), 'PB-WHEY-1KG')
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
    await user.type(screen.getByPlaceholderText(/ON-GOLD-WHEY-2270/), 'NOPE-1')
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
    await user.type(screen.getByPlaceholderText(/ON-GOLD-WHEY-2270/), 'PB-WHEY-1KG')
    await user.click(screen.getByRole('button', { name: /look up/i }))
    // Named per row — a results list of identical "Add" buttons is one a
    // screen-reader user cannot tell apart.
    await user.click(await screen.findByRole('button', { name: `Add ${ROW.name}` }))

    // Adding is not publishing, and the wording has to carry that.
    expect(await screen.findByText(/waiting in Products → Review/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing is on sale until you approve it/)).toBeInTheDocument()
  })

  it('offers SKUs from the feed and puts a tapped one in the box', async () => {
    // Importing by SKU is only usable if you can get hold of a SKU — and on a
    // feed whose products exist only in the API, there is nowhere else to look.
    global.fetch = jest
      .fn()
      .mockReturnValue(reply(JSON.stringify({ skus: ['P64', 'P2589'], source: 'powerbody' }))) as unknown as typeof fetch

    render(<SupplierImport />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /show me some skus/i }))

    await user.click(await screen.findByRole('button', { name: 'P2589' }))
    expect(screen.getByPlaceholderText(/ON-GOLD-WHEY-2270/)).toHaveValue('P2589')

    // Codes only — this is not the browse list returning.
    expect(screen.getByText(/Codes only/)).toBeInTheDocument()
  })

  /**
   * The ID box exists because a SKU has to be SEARCHED for in PowerBody's feed
   * before it can be fetched, and a SKU that isn't there takes that search to
   * the end of the catalogue and times out. An id needs no search.
   */
  it('looks a product up by ID without needing a SKU', async () => {
    const fetchMock = jest.fn((_url: string, _init?: RequestInit) =>
      reply(JSON.stringify({ products: [{ ...ROW, productId: '44338' }], notFound: [], notFoundIds: [] })),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    render(<SupplierImport />)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/44338/), '44338')
    await user.click(screen.getByRole('button', { name: /look up/i }))

    expect(await screen.findByText('Whey Protein 1kg')).toBeInTheDocument()
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      skus: '',
      productIds: '44338',
    })
  })

  /** Adding by the id the lookup already resolved is what stops the feed being
   *  paged a second time for a mapping we are holding. */
  it('adds by the product ID the lookup resolved, not by SKU', async () => {
    const fetchMock = jest.fn((url: string, _init?: RequestInit) =>
      url === '/api/portal/supplier'
        ? reply(JSON.stringify({ ok: true, added: 1, combined: false, skusAdded: 1, aiUsed: false }))
        : reply(JSON.stringify({ products: [{ ...ROW, productId: '44338' }], notFound: [], notFoundIds: [] })),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    render(<SupplierImport />)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/ON-GOLD-WHEY-2270/), 'PB-WHEY-1KG')
    await user.click(screen.getByRole('button', { name: /look up/i }))
    await user.click(await screen.findByRole('button', { name: /Add Whey Protein 1kg/i }))

    const add = fetchMock.mock.calls.find(([url]) => url === '/api/portal/supplier')
    expect(JSON.parse(String(add?.[1]?.body))).toEqual({ skus: [], productIds: ['44338'], combine: false })
  })

  it('shows the resolved ID, so a SKU that works once yields a code that keeps working', async () => {
    global.fetch = jest
      .fn()
      .mockReturnValue(
        reply(JSON.stringify({ products: [{ ...ROW, productId: '44338' }], notFound: [] })),
      ) as unknown as typeof fetch

    render(<SupplierImport />)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/ON-GOLD-WHEY-2270/), 'PB-WHEY-1KG')
    await user.click(screen.getByRole('button', { name: /look up/i }))

    expect(await screen.findByText(/ID 44338/)).toBeInTheDocument()
  })

  it('points a not-found SKU at the box that cannot time out', async () => {
    global.fetch = jest
      .fn()
      .mockReturnValue(reply(JSON.stringify({ products: [], notFound: ['P44338'] }))) as unknown as typeof fetch

    render(<SupplierImport />)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/ON-GOLD-WHEY-2270/), 'P44338')
    await user.click(screen.getByRole('button', { name: /look up/i }))

    expect(await screen.findByText(/Not in the feed: P44338/)).toBeInTheDocument()
    expect(screen.getByText(/take its product ID from the page/)).toBeInTheDocument()
  })

  it('reports a failed ID separately from a failed SKU', async () => {
    global.fetch = jest
      .fn()
      .mockReturnValue(
        reply(JSON.stringify({ products: [], notFound: [], notFoundIds: ['99999'] })),
      ) as unknown as typeof fetch

    render(<SupplierImport />)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/44338/), '99999')
    await user.click(screen.getByRole('button', { name: /look up/i }))

    // Different problem, different fix — so it must not read as "not in the feed".
    expect(await screen.findByText(/PowerBody returned no product for ID: 99999/)).toBeInTheDocument()
  })

  /**
   * Looking a code up asks "is this one there?" and answers slowly when it is
   * not. The export asks "what is there?" once, which is the right shape when
   * you have a list of a hundred to check against the account.
   */
  it('downloads the whole feed as a file', async () => {
    const createObjectURL = jest.fn(() => 'blob:feed')
    const revokeObjectURL = jest.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Row-Count': '842' }),
        blob: async () => new Blob(['productId,sku\n1001,PB-1\n'], { type: 'text/csv' }),
      } as unknown as Response),
    ) as unknown as typeof fetch

    render(<SupplierImport />)
    await userEvent.setup().click(screen.getByRole('button', { name: /download the full product list/i }))

    expect(await screen.findByText(/Downloaded 842 products from the feed/)).toBeInTheDocument()
    // The mapping is the point of the file, so the notice has to name the column.
    expect(screen.getByText(/productId column is what the ID box takes/)).toBeInTheDocument()
    expect(click).toHaveBeenCalled()
    // Held object URLs leak; the component must let go of it.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:feed')
  })

  /**
   * A truncated export is not a smaller answer — it is a wrong one to the
   * question people act on. "Not in the file" has to stop meaning "not on the
   * account" the moment the read fell short.
   */
  it('warns that a truncated export proves nothing about what is missing', async () => {
    Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:feed'), revokeObjectURL: jest.fn() })
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Row-Count': '9000', 'X-Feed-Complete': 'no', 'X-Feed-Pages': '200' }),
        blob: async () => new Blob(['productId,sku\n'], { type: 'text/csv' }),
      } as unknown as Response),
    ) as unknown as typeof fetch

    render(<SupplierImport />)
    await userEvent.setup().click(screen.getByRole('button', { name: /download the full product list/i }))

    expect(await screen.findByText(/only part of the catalogue/)).toBeInTheDocument()
    expect(screen.getByText(/anything MISSING proves nothing/)).toBeInTheDocument()
  })

  it('surfaces why the feed could not be exported', async () => {
    global.fetch = jest
      .fn()
      .mockReturnValue(
        reply(JSON.stringify({ error: 'PowerBody is rate limiting us (HTTP 429).' }), { ok: false, status: 502 }),
      ) as unknown as typeof fetch

    render(<SupplierImport />)
    await userEvent.setup().click(screen.getByRole('button', { name: /download the full product list/i }))

    expect(await screen.findByText(/rate limiting us/)).toBeInTheDocument()
  })

  it('can add several SKUs as one product with a variant each', async () => {
    // PowerBody sell every flavour as its own SKU, so this is the only way four
    // codes become one product with a flavour picker rather than four listings.
    const choc = { ...ROW, sku: 'W-CHOC', name: 'Whey 1kg Chocolate' }
    const van = { ...ROW, sku: 'W-VAN', name: 'Whey 1kg Vanilla' }
    const fetchMock = jest.fn((url: string, _init?: RequestInit) =>
      url === '/api/portal/supplier'
        ? reply(JSON.stringify({ ok: true, added: 1, combined: true, skusAdded: 2, aiUsed: false }))
        : reply(JSON.stringify({ products: [choc, van], notFound: [] })),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    render(<SupplierImport />)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/ON-GOLD-WHEY-2270/), 'W-CHOC, W-VAN')
    await user.click(screen.getByRole('button', { name: /look up/i }))
    await user.click(await screen.findByRole('button', { name: /Add as ONE product/i }))

    const add = fetchMock.mock.calls.find(([url]) => url === '/api/portal/supplier')
    expect(JSON.parse(String(add?.[1]?.body))).toEqual({ skus: ['W-CHOC', 'W-VAN'], productIds: [], combine: true })
    expect(await screen.findByText(/2 SKUs combined into one product/)).toBeInTheDocument()
  })

  it('adds them separately when that is what was asked for', async () => {
    const choc = { ...ROW, sku: 'W-CHOC', name: 'Whey 1kg Chocolate' }
    const van = { ...ROW, sku: 'W-VAN', name: 'Whey 1kg Vanilla' }
    const fetchMock = jest.fn((url: string, _init?: RequestInit) =>
      url === '/api/portal/supplier'
        ? reply(JSON.stringify({ ok: true, added: 2, combined: false, skusAdded: 2, aiUsed: false }))
        : reply(JSON.stringify({ products: [choc, van], notFound: [] })),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    render(<SupplierImport />)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/ON-GOLD-WHEY-2270/), 'W-CHOC, W-VAN')
    await user.click(screen.getByRole('button', { name: /look up/i }))
    await user.click(await screen.findByRole('button', { name: /Add all 2 separately/i }))

    const add = fetchMock.mock.calls.find(([url]) => url === '/api/portal/supplier')
    expect(JSON.parse(String(add?.[1]?.body))).toEqual({ skus: ['W-CHOC', 'W-VAN'], productIds: [], combine: false })
  })

  it('surfaces the supplier’s own error', async () => {
    global.fetch = jest
      .fn()
      .mockReturnValue(
        reply(JSON.stringify({ error: 'PowerBody is rate limiting us (HTTP 429).' }), { ok: false, status: 502 }),
      ) as unknown as typeof fetch

    render(<SupplierImport />)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/ON-GOLD-WHEY-2270/), 'PB-1')
    await user.click(screen.getByRole('button', { name: /look up/i }))

    expect(await screen.findByText(/rate limiting us/)).toBeInTheDocument()
  })
})
