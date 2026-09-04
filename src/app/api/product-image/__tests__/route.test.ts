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
import { IMAGE_PLATE } from '@/lib/images/product-image'

const getResolvedCatalogue = jest.fn()
jest.mock('@/lib/catalogue/resolve', () => ({
  getResolvedCatalogue: (...args: unknown[]) => getResolvedCatalogue(...args),
}))

/**
 * A chainable sharp stand-in.
 *
 * Every method returns the chain; `toBuffer` returns either encoded bytes or a
 * raw RGBA frame, depending on whether the caller asked for the object form —
 * which is exactly how the route distinguishes "give me pixels to key" from
 * "give me the finished image".
 *
 * The raw frame it hands back is a real one: a white border round a dark
 * centre, so `keyBackground` runs for real and the keyed path is what these
 * tests actually exercise.
 */
const W = 12
function rawFrame(centre: number): Buffer {
  const buf = Buffer.alloc(W * W * 4)
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const edge = x < 3 || y < 3 || x >= W - 3 || y >= W - 3
      const v = edge ? 255 : centre
      const p = (y * W + x) * 4
      buf[p] = v; buf[p + 1] = v; buf[p + 2] = v; buf[p + 3] = 255
    }
  }
  return buf
}

/** Swapped per test: 20 keys cleanly, 255 is white-on-white and must not. */
let centreValue = 20
const encodeFails = { current: false }

/** Every argument the route hands sharp, per method, in call order. */
const mockCalls: Record<string, unknown[][]> = {}

jest.mock('sharp', () => {
  const chain: Record<string, unknown> = {}
  for (const m of ['rotate', 'clone', 'ensureAlpha', 'removeAlpha', 'raw', 'resize', 'flatten', 'trim', 'webp', 'joinChannel']) {
    chain[m] = (...args: unknown[]) => {
      ;(mockCalls[m] ??= []).push(args)
      return chain
    }
  }
  chain.toBuffer = (opts?: { resolveWithObject?: boolean }) => {
    if (opts?.resolveWithObject) {
      return Promise.resolve({ data: rawFrame(centreValue), info: { width: W, height: W, channels: 4 } })
    }
    return encodeFails.current
      ? Promise.reject(new Error('unsupported image format'))
      : Promise.resolve(Buffer.from('webp-bytes'))
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
  for (const k of Object.keys(mockCalls)) delete mockCalls[k]
  centreValue = 20
  encodeFails.current = false
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

  it('cuts the white ground away and says so', async () => {
    const res = await get(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=320`)
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Image-Keyed')).toBe('1')
  })

  it('falls back to the light tile for a photo it cannot safely cut', async () => {
    // White on white: nothing separates the product from its ground, so the
    // fill reaches the centre and the keying declines. A product that keeps its
    // plate is a worse card; one with its middle eaten out is a broken one.
    centreValue = 255
    const res = await get(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=320`)
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Image-Keyed')).toBe('0')
  })

  it('serves it as a year-long immutable response, because the URL is content-addressed', async () => {
    const res = await get(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=320`)
    expect(res.headers.get('Cache-Control')).toContain('immutable')
    expect(res.headers.get('Cache-Control')).toContain('max-age=31536000')
  })
})

/**
 * The one thing a shelf cannot survive: two treatments side by side.
 *
 * Both branches of the transform have to end on the SAME white. That has been
 * broken three separate ways — a dark `#18181b` pad, a light grey `#F4F5F7`
 * one, and a keyed branch that resized onto transparency while the branch next
 * to it padded onto a colour — and every time, the symptom was a shelf where
 * some products sat on a panel and the rest did not. Nothing above catches it:
 * every one of those versions returned 200 with valid WebP bytes.
 */
describe('every path ends on the same white plate', () => {
  const backgrounds = (method: 'resize' | 'flatten') =>
    (mockCalls[method] ?? []).map((args) => {
      const opts = (method === 'resize' ? args[2] : args[0]) as { background?: unknown }
      return opts?.background
    })

  it('the keyed path pads and flattens onto white, never onto transparency', async () => {
    expect((await get(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=320`)).headers.get('X-Image-Keyed')).toBe('1')
    expect(backgrounds('resize')).toEqual([IMAGE_PLATE])
    expect(backgrounds('flatten')).toEqual([IMAGE_PLATE])
  })

  it('and so does the path that declines to cut', async () => {
    centreValue = 255
    expect((await get(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=320`)).headers.get('X-Image-Keyed')).toBe('0')
    expect(backgrounds('resize')).toEqual([IMAGE_PLATE])
    expect(backgrounds('flatten')).toEqual([IMAGE_PLATE])
  })

  it('and the white is white, not the card, not a near-white', () => {
    // Named rather than inferred: the whole failure mode is a plate that is a
    // shade off the one next to it, which nobody notices in a diff.
    expect(IMAGE_PLATE).toBe('#FFFFFF')
  })
})

/**
 * Why the pipeline version is in the cache key.
 *
 * These responses are `immutable` for a year and the URL names only the source
 * image and the width, so nothing ever re-asks for one. Two accessories were
 * still being served padded onto `#18181b` three revisions after that colour
 * had been removed from the code — not because the transform was wrong, but
 * because it was never run for them again. Every cache between here and the
 * phone keys on the full URL, so the version has to be in it.
 */
describe('a change to the transform is a change to the URL', () => {
  it('does not answer one pipeline version out of another one\'s cache', async () => {
    const url = `u=${encodeURIComponent(CATALOGUE_IMAGE)}`
    await get(`${url}&w=320&p=1`)
    await get(`${url}&w=320&p=1`)
    await get(`${url}&w=320&p=2`)
    // Twice: once for p=1, once for p=2. The repeat of p=1 is the memo hit that
    // proves the second fetch is the version change and not just a cold cache.
    expect(fetchMock).toHaveBeenCalledTimes(2)
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
    encodeFails.current = true
    expect((await get(`u=${encodeURIComponent(CATALOGUE_IMAGE)}&w=320`)).status).toBe(502)
  })
})
