/**
 * @jest-environment node
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { listPriceFor } from '@/lib/pricing/list-price'
import type { SupplierProduct, SupplierProvider } from '../types'
import type { CodeResolution } from '../resolve-code'

jest.mock('@/lib/portal/supplier-index', () => ({
  indexedProductIds: jest.fn(async () => new Map()),
}))
jest.mock('@/lib/supplier/resolve-code', () => ({
  ...jest.requireActual('@/lib/supplier/resolve-code'),
  resolveCode: jest.fn(),
}))

import { indexedProductIds } from '@/lib/portal/supplier-index'
import { resolveCode } from '@/lib/supplier/resolve-code'
import { pullProduct } from '../pull'

const indexed = indexedProductIds as jest.MockedFunction<typeof indexedProductIds>
const resolve = resolveCode as jest.MockedFunction<typeof resolveCode>

/**
 * "Pull from PowerBody" on one product. What matters is less that facts arrive
 * than where they are NOT allowed to land: a founder's price, a founder's
 * description, a product-level fact from a SKU that is not the master.
 */

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** What PowerBody's detail call says about one SKU. */
function pb(sku: string, productId: string, over: Partial<SupplierProduct> = {}): SupplierProduct {
  return {
    sku,
    productId,
    name: `Critical Whey, ${sku} - 2kg`,
    brand: 'Applied Nutrition',
    category: 'Whey Protein',
    description: `PowerBody’s description of ${sku}.`,
    imageUrl: `https://cdn.powerbody.co.uk/media/${sku}.jpg`,
    wholesalePrice: 24.5,
    rrp: 49.99,
    currency: 'GBP',
    stock: 20,
    inStock: true,
    barcode: null,
    flavours: [],
    servings: 66,
    weightGrams: 2150,
    vatRate: 0.2,
    detailed: true,
    updatedAt: '2026-10-12T09:00:00.000Z',
    ...over,
  }
}

/** PowerBody's three SKUs of Critical Whey, by id. */
const CATALOGUE: Record<string, SupplierProduct> = {
  '1100': pb('P100', '1100', { name: 'Critical Whey, Chocolate - 2kg', wholesalePrice: 24.5, rrp: 49.99, servings: 66 }),
  '1200': pb('P200', '1200', { name: 'Critical Whey, Vanilla - 2kg', wholesalePrice: 23.9, rrp: 48.99, servings: 65 }),
  '1300': pb('P300', '1300', { name: 'Critical Whey, Strawberry - 2kg', wholesalePrice: 25.1, rrp: 49.99, servings: 64 }),
}

function fakeSupplier(
  catalogue: Record<string, SupplierProduct> = CATALOGUE,
  opts: { refuse?: Error } = {},
): { supplier: SupplierProvider; asked: string[][] } {
  const asked: string[][] = []
  const supplier = {
    name: 'powerbody',
    async getProductsById(ids: string[]) {
      asked.push([...ids])
      if (opts.refuse) throw opts.refuse
      return ids.map((id) => catalogue[id]).filter(Boolean)
    },
  } as unknown as SupplierProvider
  return { supplier, asked }
}

function variant(over: Partial<CatalogueVariant> & { id: string }): CatalogueVariant {
  return { title: '', flavour: null, size: '2kg', price: 44.99, compareAtPrice: null, available: true, ...over }
}

/** An imported Critical Whey, blank where an import leaves things blank. */
function whey(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  const { rating: _rating, ...sample } = MOCK_CATALOGUE[0] as CatalogueProduct
  void _rating
  return {
    ...sample,
    id: 'critical-whey',
    handle: 'critical-whey',
    title: 'Applied Nutrition Critical Whey 2kg',
    description: '',
    imageUrl: null,
    brand: null,
    category: '',
    weightGrams: null,
    vatRate: null,
    cost: undefined,
    supplierRrp: null,
    supplierProductId: null,
    variants: [
      variant({ id: 'cw-choc', title: 'Chocolate', flavour: 'Chocolate', sku: 'P100', supplierProductId: '1100' }),
      variant({ id: 'cw-van', title: 'Vanilla', flavour: 'Vanilla', sku: 'P200' }),
      variant({ id: 'cw-straw', title: 'Strawberry', flavour: 'Strawberry', sku: 'P300' }),
    ],
    defaultVariantId: 'cw-choc',
    basePrice: 44.99,
    ...over,
  }
}

function found(product: SupplierProduct): CodeResolution {
  return {
    code: product.sku,
    kind: 'sku',
    status: 'found',
    product,
    productId: product.productId ?? undefined,
    via: 'search',
    message: `Found ${product.name}.`,
    next: [],
    probes: 3,
    trace: [],
  }
}

function notYet(sku: string): CodeResolution {
  return {
    code: sku,
    kind: 'sku',
    status: 'not-yet',
    message: `Checked 40 of PowerBody's product ids without reaching ${sku} yet.`,
    next: ['search-again', 'paste-id'],
    probes: 40,
    trace: [],
  }
}

/** The search finds whichever SKU it is asked about, from CATALOGUE. */
function searchFinds(catalogue: Record<string, SupplierProduct> = CATALOGUE) {
  resolve.mockImplementation(async (sku) => {
    const hit = Object.values(catalogue).find((p) => p.sku === sku)
    return hit ? found(hit) : notYet(sku)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  indexed.mockImplementation(async () => new Map())
  searchFinds()
})

// ── Finding the ids ──────────────────────────────────────────────────────────

describe('pullProduct — ids, cheapest first', () => {
  it('asks once for the ids it holds (on the SKU, then the index), master first, and searches only for the rest', async () => {
    indexed.mockImplementation(async (skus) => new Map(skus.includes('P200') ? [['P200', { productId: '1200', qty: 3, price: 23.9 }]] : []))
    const { supplier, asked } = fakeSupplier()
    const result = await pullProduct(whey(), { supplier })

    // The SKU's own id is not looked up in the index again.
    expect(indexed).toHaveBeenCalledWith(['P200', 'P300'])
    expect(asked[0]).toEqual(['1100', '1200'])
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve.mock.calls[0][0]).toBe('P300')
    expect(resolve.mock.calls[0][1].supplier).toBe(supplier)
    expect(result.answered).toBe(3)
    expect(result.unresolved).toEqual([])
  })

  it('uses the product’s own id for a single-SKU product', async () => {
    const single = whey({
      supplierProductId: '1300',
      variants: [variant({ id: 'cw-straw', title: 'Strawberry', flavour: 'Strawberry', sku: 'P300' })],
      defaultVariantId: 'cw-straw',
    })
    const { supplier, asked } = fakeSupplier()
    const result = await pullProduct(single, { supplier })

    expect(asked).toEqual([['1300']])
    expect(resolve).not.toHaveBeenCalled()
    expect(result.after.variants[0].supplierProductId).toBe('1300')
  })

  it('does not use the product-level id for a product with several SKUs', async () => {
    const { supplier, asked } = fakeSupplier()
    await pullProduct(whey({ supplierProductId: '1300', variants: whey().variants.map((v) => ({ ...v, supplierProductId: null })) }), {
      supplier,
    })
    expect(asked).toEqual([])
    expect(resolve).toHaveBeenCalledTimes(3)
  })

  it('looks the master up first when nothing is held', async () => {
    const product = whey({
      defaultVariantId: 'cw-straw',
      variants: whey().variants.map((v) => ({ ...v, supplierProductId: null })),
    })
    const { supplier } = fakeSupplier()
    await pullProduct(product, { supplier })
    expect(resolve.mock.calls.map((c) => c[0])).toEqual(['P300', 'P100', 'P200'])
  })

  it('never takes the facts of an id that now answers for another SKU — it looks that SKU up instead', async () => {
    const moved = { ...CATALOGUE, '1100': pb('P999', '1100', { name: 'Some other brand’s tub', wholesalePrice: 3 }) }
    const { supplier } = fakeSupplier(moved)
    const result = await pullProduct(whey(), { supplier })

    expect(resolve.mock.calls.map((c) => c[0])).toEqual(['P100', 'P200', 'P300'])
    // The search's answer, not the moved id's, is what landed on the master.
    expect(result.after.variants[0].cost).toBe(24.5)
  })

  it('looks every SKU up when PowerBody refuse the batch, and says so', async () => {
    const { supplier } = fakeSupplier(CATALOGUE, { refuse: new Error('HTTP 503') })
    const result = await pullProduct(whey(), { supplier })
    expect(result.trace.some((s) => /would not answer: HTTP 503/.test(s.message))).toBe(true)
    expect(resolve).toHaveBeenCalledTimes(3)
  })

  it('stops asking when PowerBody rate-limit the batch, and says how it was refused', async () => {
    const { supplier } = fakeSupplier(CATALOGUE, { refuse: new Error('429 Too Many Requests') })
    const result = await pullProduct(whey(), { supplier })
    // Searching SKU by SKU against a throttled account only makes the throttle longer.
    expect(resolve).not.toHaveBeenCalled()
    expect(result.refused?.kind).toBe('rate-limited')
    expect(result.unresolved.map((u) => u.refusal)).toEqual(['rate-limited', 'rate-limited', 'rate-limited'])
  })

  it('stops at the first SKU PowerBody refuse to search for, and leaves the rest for later', async () => {
    resolve.mockImplementation(async (sku) => ({
      ...notYet(sku),
      status: 'refused',
      refusal: 'sandbox',
      message: 'PowerBody’s answer suggests this API account is still their DEMO sandbox.',
    }))
    const { supplier } = fakeSupplier()
    const result = await pullProduct(whey(), { supplier })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(result.refused).toEqual({ kind: 'sandbox', message: expect.stringMatching(/DEMO/) })
    expect(result.unresolved).toHaveLength(2)
  })

  it('reports what it could not find, in the search’s words', async () => {
    resolve.mockImplementation(async (sku) => notYet(sku))
    const { supplier } = fakeSupplier()
    const result = await pullProduct(whey(), { supplier })

    expect(result.answered).toBe(1)
    expect(result.unresolved).toEqual([
      { sku: 'P200', message: notYet('P200').message },
      { sku: 'P300', message: notYet('P300').message },
    ])
  })

  it('stops searching when the clock is nearly spent, and says to pull again', async () => {
    const { supplier } = fakeSupplier()
    const result = await pullProduct(whey(), { supplier, budgetMs: 7_000 })

    expect(resolve).not.toHaveBeenCalled()
    expect(result.answered).toBe(1)
    expect(result.unresolved.map((u) => u.sku)).toEqual(['P200', 'P300'])
    expect(result.unresolved[0].message).toMatch(/pull again/)
  })

  it('asks nothing about a product with no SKUs', async () => {
    const bare = whey({ variants: [variant({ id: 'x', sku: null })] })
    const { supplier, asked } = fakeSupplier()
    const result = await pullProduct(bare, { supplier })
    expect(asked).toEqual([])
    expect(resolve).not.toHaveBeenCalled()
    expect(result.after).toBe(bare)
    expect(result.filled).toEqual([])
  })
})

// ── Per-SKU facts ────────────────────────────────────────────────────────────

describe('pullProduct — per-SKU facts', () => {
  it('gives every SKU its own cost, servings and PowerBody id', async () => {
    const { supplier } = fakeSupplier()
    const { after } = await pullProduct(whey(), { supplier })
    expect(after.variants.map((v) => [v.sku, v.cost, v.servings, v.supplierProductId])).toEqual([
      ['P100', 24.5, 66, '1100'],
      ['P200', 23.9, 65, '1200'],
      ['P300', 25.1, 64, '1300'],
    ])
  })

  it('never re-prices a price a founder set, even when forced — but still records its cost', async () => {
    const product = whey({
      variants: whey().variants.map((v) => (v.id === 'cw-van' ? { ...v, price: 39.0, priceSource: 'founder' as const } : v)),
    })
    const { supplier } = fakeSupplier()
    const { after } = await pullProduct(product, { supplier, force: true })

    const vanilla = after.variants.find((v) => v.id === 'cw-van')!
    expect(vanilla.price).toBe(39.0)
    expect(vanilla.cost).toBe(23.9)
    // A price nobody set by hand follows the rule when forced.
    expect(after.variants.find((v) => v.id === 'cw-choc')!.price).toBe(listPriceFor(24.5))
  })

  it('leaves prices alone when not forced and the siblings already price differently', async () => {
    const product = whey({
      variants: whey().variants.map((v, i) => ({ ...v, price: 44.99 + i })),
    })
    const { supplier } = fakeSupplier()
    const { after } = await pullProduct(product, { supplier })
    expect(after.variants.map((v) => v.price)).toEqual([44.99, 45.99, 46.99])
  })
})

// ── Product-level facts ──────────────────────────────────────────────────────

describe('pullProduct — the product’s own fields', () => {
  it('fills blank descriptive fields from the master SKU', async () => {
    const { supplier } = fakeSupplier()
    const { after, filled } = await pullProduct(whey(), { supplier })

    const master = CATALOGUE['1100']
    expect(after).toMatchObject({
      imageUrl: master.imageUrl,
      description: master.description,
      category: master.category,
      brand: master.brand,
      weightGrams: master.weightGrams,
      vatRate: master.vatRate,
    })
    expect(filled).toEqual(expect.arrayContaining(['imageUrl', 'description', 'category', 'brand', 'weightGrams', 'vatRate']))
  })

  it('never writes over a value a founder wrote', async () => {
    const curated = whey({
      imageUrl: 'https://chrgd.co/critical-whey-hero.jpg',
      description: 'Our own words about Critical Whey.',
      category: 'Protein',
      brand: 'Applied',
      weightGrams: 2200,
      vatRate: 0.05,
    })
    curated.review = {
      status: 'approved',
      sources: { description: 'founder', imageUrl: 'founder' },
      confirmed: ['description'],
      importedAt: '2026-10-01T09:00:00.000Z',
    }
    const { supplier } = fakeSupplier()
    const { after, filled } = await pullProduct(curated, { supplier })

    expect(after).toMatchObject({
      imageUrl: 'https://chrgd.co/critical-whey-hero.jpg',
      description: 'Our own words about Critical Whey.',
      category: 'Protein',
      brand: 'Applied',
      weightGrams: 2200,
      vatRate: 0.05,
    })
    for (const key of ['imageUrl', 'description', 'category', 'brand', 'weightGrams', 'vatRate']) expect(filled).not.toContain(key)
  })

  it('keeps a 0% VAT rate a founder set — zero-rated is an answer, not a gap', async () => {
    const zeroRated = whey({ vatRate: 0 })
    const { supplier } = fakeSupplier()
    const { after, filled } = await pullProduct(zeroRated, { supplier })
    expect(after.vatRate).toBe(0)
    expect(filled).not.toContain('vatRate')
  })

  it('refreshes a value that came from PowerBody in the first place', async () => {
    const stale = whey({ description: 'PowerBody’s old description.', category: 'Old Category' })
    stale.review = {
      status: 'approved',
      sources: { description: 'supplier', category: 'founder' },
      confirmed: [],
      importedAt: '2026-10-01T09:00:00.000Z',
    }
    const { supplier } = fakeSupplier()
    const { after, filled } = await pullProduct(stale, { supplier })

    expect(after.description).toBe(CATALOGUE['1100'].description)
    expect(filled).toContain('description')
    expect(after.category).toBe('Old Category')
    expect(filled).not.toContain('category')
  })

  it('does not list a field as filled when PowerBody say what it already says', async () => {
    const same = whey({ description: CATALOGUE['1100'].description })
    same.review = { status: 'approved', sources: { description: 'supplier' }, confirmed: [], importedAt: '2026-10-01T09:00:00.000Z' }
    const { supplier } = fakeSupplier()
    const { filled } = await pullProduct(same, { supplier })
    expect(filled).not.toContain('description')
  })

  it('ignores a blank offer — an empty picture or a zero weight is not a fact', async () => {
    const blankOffer = { ...CATALOGUE, '1100': pb('P100', '1100', { imageUrl: null, description: '  ', weightGrams: 0 }) }
    const { supplier } = fakeSupplier(blankOffer)
    const product = whey({ variants: whey().variants.slice(0, 1) })
    const { after, filled } = await pullProduct(product, { supplier })
    expect(after.imageUrl).toBeNull()
    expect(after.description).toBe('')
    expect(after.weightGrams).toBeNull()
    expect(filled).not.toEqual(expect.arrayContaining(['imageUrl']))
  })

  it('takes the product’s cost, RRP and id from the master SKU', async () => {
    const product = whey({ defaultVariantId: 'cw-van' })
    indexed.mockImplementation(async () => new Map([['P200', { productId: '1200', qty: 3, price: 23.9 }]]))
    const { supplier } = fakeSupplier()
    const { after, filled } = await pullProduct(product, { supplier })

    expect(after.cost).toBe(23.9)
    expect(after.supplierRrp).toBe(48.99)
    expect(after.supplierProductId).toBe('1200')
    expect(filled).toEqual(expect.arrayContaining(['cost', 'supplierRrp', 'supplierProductId']))
    // …and its descriptive face is the master's too.
    expect(after.description).toBe(CATALOGUE['1200'].description)
  })

  it('falls back to another SKU’s face when the master could not be found', async () => {
    resolve.mockImplementation(async (sku) => (sku === 'P300' ? found(CATALOGUE['1300']) : notYet(sku)))
    const product = whey({ variants: whey().variants.map((v) => ({ ...v, supplierProductId: null })) })
    const { supplier } = fakeSupplier()
    const { after, unresolved } = await pullProduct(product, { supplier })

    expect(unresolved.map((u) => u.sku)).toEqual(['P100', 'P200'])
    expect(after.description).toBe(CATALOGUE['1300'].description)
  })

  it('leaves `before` exactly as it was handed in', async () => {
    const product = whey()
    const snapshot = JSON.stringify(product)
    const { supplier } = fakeSupplier()
    const result = await pullProduct(product, { supplier })
    expect(result.before).toBe(product)
    expect(JSON.stringify(product)).toBe(snapshot)
  })
})
