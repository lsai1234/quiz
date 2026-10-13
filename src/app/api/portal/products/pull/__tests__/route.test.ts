/**
 * @jest-environment node
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { SupplierProduct, SupplierProvider } from '@/lib/supplier/types'

/*
  The pull route's one promise: the reply always ends with a result line, on
  our terms, before the platform's limit — and what PowerBody did answer is
  saved. Everything around the pull itself is replaced; the pull is real.
*/
jest.mock('@/lib/portal/guard', () => ({ isPortalAuthed: async () => true }))
jest.mock('@/lib/portal/store', () => ({ syncPortalRuntime: jest.fn(async () => undefined) }))
jest.mock('@/lib/supplier', () => ({ getSupplier: jest.fn() }))
jest.mock('@/lib/portal/product-edit', () => ({
  getEditableProduct: jest.fn(),
  productPayload: jest.fn(async () => ({ product: null })),
}))
jest.mock('@/lib/portal/editable-products', () => ({ saveProductChange: jest.fn(async (_b: unknown, a: unknown) => a) }))
jest.mock('@/lib/portal/supplier-index', () => ({ indexedProductIds: jest.fn(async () => new Map()) }))
jest.mock('@/lib/supplier/resolve-code', () => ({
  ...jest.requireActual('@/lib/supplier/resolve-code'),
  resolveCode: jest.fn(async (sku: string) => ({ code: sku, kind: 'sku', status: 'not-yet', message: 'Not yet.', next: [], probes: 0, trace: [] })),
}))

import { POST } from '../route'
import { syncPortalRuntime } from '@/lib/portal/store'
import { getSupplier } from '@/lib/supplier'
import { getEditableProduct } from '@/lib/portal/product-edit'
import { saveProductChange } from '@/lib/portal/editable-products'

const saved = saveProductChange as jest.MockedFunction<typeof saveProductChange>
const editable = getEditableProduct as jest.MockedFunction<typeof getEditableProduct>
const supplierFor = getSupplier as jest.MockedFunction<typeof getSupplier>
const synced = syncPortalRuntime as jest.MockedFunction<typeof syncPortalRuntime>

function pb(sku: string, productId: string): SupplierProduct {
  return {
    sku, productId, name: `Whey ${sku}`, brand: 'PB', category: 'Protein', description: 'Whey.', imageUrl: null,
    wholesalePrice: 20, rrp: 40, currency: 'GBP', stock: 5, inStock: true, barcode: null, flavours: [],
    servings: 30, weightGrams: null, vatRate: null, detailed: true, updatedAt: '2026-10-13T09:00:00.000Z',
  }
}

/** Seven SKUs, every id already held — so the pull asks for them in two batches. */
function sevenSkus(): CatalogueProduct {
  const variants: CatalogueVariant[] = Array.from({ length: 7 }, (_, i) => ({
    id: `v${i}`, title: `Flavour ${i}`, flavour: `Flavour ${i}`, size: '1kg', price: 39.99, compareAtPrice: null,
    available: true, sku: `P${100 + i}`, supplierProductId: String(1000 + i),
  }))
  return {
    id: 'whey', title: 'Whey 1kg', handle: 'whey', description: '', imageUrl: null, category: 'Protein',
    stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'], variants, defaultVariantId: 'v0',
    basePrice: 39.99, compareAtPrice: null, servings: 30, subscriptionEligible: true, swapGroup: 'protein-whey',
    recommendationPriority: 5, marginPriority: 5, isCoreEligible: true, isBoosterEligible: false, hasStimulants: false,
    shortReason: '', warnings: [],
  }
}

/** PowerBody answering the first batch, then never answering again. */
function goesQuiet(): SupplierProvider {
  let calls = 0
  return {
    name: 'powerbody',
    async getProductsById(ids: string[]) {
      calls += 1
      if (calls > 1) return new Promise<SupplierProduct[]>(() => {})
      return ids.map((id) => pb(`P${Number(id) - 900}`, id))
    },
  } as unknown as SupplierProvider
}

const post = () =>
  POST(new Request('http://localhost/api/portal/products/pull', { method: 'POST', body: JSON.stringify({ id: 'whey', stream: true }) }))

async function lines(res: Response, advanceMs: number): Promise<Array<Record<string, unknown>>> {
  const text = res.text()
  await jest.advanceTimersByTimeAsync(advanceMs)
  return (await text).split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  synced.mockImplementation(async () => undefined)
  editable.mockResolvedValue({ product: sevenSkus(), state: 'live' } as never)
})
afterEach(() => jest.useRealTimers())

describe('POST /api/portal/products/pull — the hard stop', () => {
  it('ends with a result line when PowerBody stop answering, saving what they had sent', async () => {
    supplierFor.mockResolvedValue(goesQuiet())
    const out = await lines(await post(), 300_000)
    const result = out.at(-1)!

    expect(result).toMatchObject({ type: 'result', ok: true, timedOut: true, answered: 6 })
    expect(result.message).toMatch(/PowerBody stopped answering/)
    expect(result.message).toMatch(/6 of 7 SKUs is saved/)
    expect(result.unresolved).toEqual([{ sku: 'P106', message: expect.stringMatching(/stopped answering/) }])

    // Saved once, with what did arrive.
    expect(saved).toHaveBeenCalledTimes(1)
    const after = saved.mock.calls[0][1] as CatalogueProduct
    expect(after.variants.slice(0, 6).every((v) => v.cost === 20)).toBe(true)
    expect(after.variants[6].cost).toBeUndefined()
  })

  it('answers even when the stop comes before the product was read, and changes nothing', async () => {
    synced.mockImplementation(() => new Promise<void>(() => {}))
    const out = await lines(await post(), 300_000)
    expect(out.at(-1)).toMatchObject({ type: 'result', ok: false, status: 504, timedOut: true })
    expect(String(out.at(-1)!.error)).toMatch(/Nothing was changed/)
    expect(saved).not.toHaveBeenCalled()
  })

  it('a pull that finishes in time answers as usual, saves once, and leaves no timer behind', async () => {
    supplierFor.mockResolvedValue({
      name: 'powerbody',
      async getProductsById(ids: string[]) {
        return ids.map((id) => pb(`P${Number(id) - 900}`, id))
      },
    } as unknown as SupplierProvider)
    const out = await lines(await post(), 0)
    const result = out.at(-1)!
    expect(result).toMatchObject({ type: 'result', ok: true, answered: 7 })
    expect(result.timedOut).toBeUndefined()
    expect(saved).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })
})
