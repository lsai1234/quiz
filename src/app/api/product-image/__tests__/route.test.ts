/**
 * @jest-environment node
 *
 * The fetch boundary.
 *
 * Past this route the server fetches a URL a client chose and returns the
 * bytes, so what it refuses is the whole of its security. The boundary is the
 * catalogue: a URL is fetchable if and only if some product carries it as its
 * `imageUrl`.
 *
 * The version this replaced gated on a hardcoded list of PowerBody hostnames.
 * It was wrong in both directions — the live feed serves from a host that was
 * not on the list, so nothing was ever normalised, and the failure was silent,
 * falling through to the raw URL. The only symptom was cropped photos on a
 * phone. These tests exist so the next change to the gate has to say out loud
 * what it is letting through.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'

const getResolvedCatalogue = jest.fn()
jest.mock('@/lib/catalogue/resolve', () => ({
  getResolvedCatalogue: (...args: unknown[]) => getResolvedCatalogue(...args),
}))

const toBuffer = jest.fn(async () => Buffer.from('webp-bytes'))
jest.mock('sharp', () => {
  const chain = {
    rotate: () => chain,
    resize: () => chain,
    flatten: () => chain,
    webp: () => chain,
    toBuffer: () => toBuffer(),
  }
  return { __esModule: true, default: () => chain }
})

const CATALOGUE_IMAGE = 'https://images.somebrand.net/whey.jpg'

function product(imageUrl: string | null): CatalogueProduct {
  return { id: 'p', imageUrl } as unknown as CatalogueProduct
}

async function get(query: string) {
  // Imported inside, so each test gets a module with a cold catalogue memo.
  const { GET } = await import('../route')
  return GET(new Request(`https://shop.test/api/product-image?${query}`))
}

const fetchMock = jest.fn()

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
  getResolvedCatalogue.mockResolvedValue({ products: [product(CATALOGUE_IMAGE), product(null)] })
  fetchMock.mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-length': '3' } }),
  )
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('what it will fetch', () => {
  it('normalises an image the catalogue actually carries', async () => {
    const res = await get(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=320`)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(fetchMock).toHaveBeenCalledWith(CATALOGUE_IMAGE, expect.anything())
  })

  it('does not care who is hosting it — only that the catalogue names it', async () => {
    // The whole point of replacing the hostname list: a supplier changing CDN
    // must not silently stop being normalised.
    expect(CATALOGUE_IMAGE).not.toContain('powerbody')
    expect((await get(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=320`)).status).toBe(200)
  })

  it('serves it as a year-long immutable response, because the URL is content-addressed', async () => {
    const res = await get(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=320`)
    expect(res.headers.get('Cache-Control')).toContain('immutable')
    expect(res.headers.get('Cache-Control')).toContain('max-age=31536000')
  })
})

describe('what it refuses, without fetching', () => {
  const refuses = async (query: string) => {
    const res = await get(query)
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  }

  it('a URL no product carries', async () => {
    await refuses(`u=${encodeURIComponent('https://images.somebrand.net/other.jpg')}&w=320`)
  })

  it('the internal addresses an SSRF reaches for', async () => {
    await refuses(`u=${encodeURIComponent('https://169.254.169.254/latest/meta-data/')}&w=320`)
    await refuses(`u=${encodeURIComponent('https://localhost/admin')}&w=320`)
  })

  it('a lookalike host, and a traversal off a real one', async () => {
    await refuses(`u=${encodeURIComponent('https://images.somebrand.net.evil.com/whey.jpg')}&w=320`)
    await refuses(`u=${encodeURIComponent('https://images.somebrand.net/../../etc/passwd')}&w=320`)
  })

  it('anything that is not an https URL at all', async () => {
    await refuses('w=320')
    await refuses(`u=${encodeURIComponent('http://images.somebrand.net/whey.jpg')}&w=320`)
    await refuses(`u=${encodeURIComponent('file:///etc/passwd')}&w=320`)
  })

  it('a width that is not a positive number', async () => {
    await refuses(`u=${encodeURIComponent(CATALOGUE_IMAGE)}`)
    await refuses(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=-5`)
  })

  it('everything, when the catalogue cannot be read', async () => {
    // The safe direction for a route that fetches URLs: an unreadable
    // catalogue refuses rather than widens.
    getResolvedCatalogue.mockRejectedValue(new Error('database down'))
    await refuses(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=320`)
  })
})

describe('when the supplier is the problem', () => {
  it('reports upstream failure rather than serving a broken image', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }))
    expect((await get(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=320`)).status).toBe(502)
  })

  it('refuses to decode something far too large to be a product photo', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1]), { status: 200, headers: { 'content-length': String(50 * 1024 * 1024) } }),
    )
    expect((await get(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=320`)).status).toBe(502)
  })

  it('does not throw when the bytes are not an image sharp can read', async () => {
    toBuffer.mockRejectedValue(new Error('unsupported image format'))
    expect((await get(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=320`)).status).toBe(502)
  })
})
