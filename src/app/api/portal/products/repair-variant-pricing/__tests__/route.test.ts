/**
 * @jest-environment node
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { SupplierProduct, SupplierProvider } from '@/lib/supplier/types'

/*
  "Repair SKU prices" on one product: the same rules as a pull, so the same
  doors stay shut — no sample-catalogue id is written as a PowerBody id, and a
  serving count somebody typed survives.
*/
jest.mock('@/lib/portal/guard', () => ({ isPortalAuthed: async () => true }))
jest.mock('@/lib/supplier', () => ({ getSupplier: jest.fn() }))
jest.mock('@/lib/portal/supplier-index', () => ({ indexedProductIds: jest.fn(async () => new Map()) }))
jest.mock('@/lib/portal/editable-products', () => ({ saveProductChange: jest.fn(async (_b: unknown, a: unknown) => a) }))
jest.mock('@/lib/portal/product-edit', () => ({ listEditableProducts: jest.fn() }))
jest.mock('@/lib/supplier/resolve-code', () => ({ resolveCode: jest.fn() }))

import { POST } from '../route'
import { getSupplier } from '@/lib/supplier'
import { indexedProductIds } from '@/lib/portal/supplier-index'
import { saveProductChange } from '@/lib/portal/editable-products'
import { listEditableProducts } from '@/lib/portal/product-edit'
import { resolveCode } from '@/lib/supplier/resolve-code'

const saved = saveProductChange as jest.MockedFunction<typeof saveProductChange>

function pb(sku: string, productId: string, servings = 66): SupplierProduct {
  return {
    sku, productId, name: `Whey ${sku} - 1kg`, brand: 'PB', category: 'Protein', description: '', imageUrl: null,
    wholesalePrice: 20, rrp: 40, currency: 'GBP', stock: 5, inStock: true, barcode: null, flavours: [],
    servings, weightGrams: null, vatRate: null, detailed: true, updatedAt: '2026-10-13T09:00:00.000Z',
  }
}

function product(variant: Partial<CatalogueVariant> = {}): CatalogueProduct {
  return {
    id: 'whey', title: 'Whey 1kg', handle: 'whey', description: '', imageUrl: null, category: 'Protein',
    stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'],
    variants: [{ id: 'v', title: 'Chocolate', flavour: 'Chocolate', size: '1kg', price: 39.99, compareAtPrice: null, available: true, sku: 'P100', ...variant }],
    defaultVariantId: 'v', basePrice: 39.99, compareAtPrice: null, servings: 30, subscriptionEligible: true,
    swapGroup: 'protein-whey', recommendationPriority: 5, marginPriority: 5, isCoreEligible: true, isBoosterEligible: false,
    hasStimulants: false, shortReason: '', warnings: [],
  }
}

function supplier(name: string, byId: Record<string, SupplierProduct>): { provider: SupplierProvider; asked: string[][] } {
  const asked: string[][] = []
  const provider = {
    name,
    async getProductsById(ids: string[]) {
      asked.push([...ids])
      return ids.map((id) => byId[id]).filter(Boolean)
    },
  } as unknown as SupplierProvider
  return { provider, asked }
}

const repair = () =>
  POST(new Request('http://localhost/api/portal/products/repair-variant-pricing', { method: 'POST', body: JSON.stringify({ productId: 'whey' }) }))

beforeEach(() => {
  jest.clearAllMocks()
  ;(indexedProductIds as jest.Mock).mockImplementation(async () => new Map())
})

describe('POST /api/portal/products/repair-variant-pricing — one product', () => {
  it('writes no id from the Sample supplier, whose ids only look like PowerBody’s', async () => {
    ;(listEditableProducts as jest.Mock).mockResolvedValue([{ product: product(), state: 'live' }])
    const { provider } = supplier('mock', { P89490: pb('P100', 'P89490') })
    ;(getSupplier as jest.Mock).mockResolvedValue(provider)
    ;(resolveCode as jest.Mock).mockResolvedValue({ status: 'found', productId: 'P89490' })

    const res = await repair()
    expect(res.status).toBe(200)
    const after = saved.mock.calls[0][1] as CatalogueProduct
    expect(after.variants[0].supplierProductId ?? null).toBeNull()
    expect(after.supplierProductId ?? null).toBeNull()
    // What the sample said about the SKU itself still lands.
    expect(after.variants[0].cost).toBe(20)
  })

  it('never asks PowerBody for a non-numeric id left on a SKU, and finds the real one instead', async () => {
    ;(listEditableProducts as jest.Mock).mockResolvedValue([{ product: product({ supplierProductId: 'P89490' }), state: 'live' }])
    // The index answers only for the SKUs it is asked about.
    ;(indexedProductIds as jest.Mock).mockImplementation(
      async (skus: string[]) => new Map(skus.includes('P100') ? [['P100', { productId: '1100', qty: 5, price: 20 }]] : []),
    )
    const { provider, asked } = supplier('powerbody', { '1100': pb('P100', '1100') })
    ;(getSupplier as jest.Mock).mockResolvedValue(provider)

    await repair()
    expect(asked.flat()).toEqual(['1100'])
    expect((saved.mock.calls[0][1] as CatalogueProduct).variants[0].supplierProductId).toBe('1100')
  })

  it('leaves a serving count the founder typed', async () => {
    ;(listEditableProducts as jest.Mock).mockResolvedValue([
      { product: product({ supplierProductId: '1100', servings: 60, servingsSource: 'founder' }), state: 'live' },
    ])
    const { provider } = supplier('powerbody', { '1100': pb('P100', '1100', 66) })
    ;(getSupplier as jest.Mock).mockResolvedValue(provider)

    await repair()
    const after = (saved.mock.calls[0]?.[1] as CatalogueProduct | undefined) ?? product({ servings: 60 })
    expect(after.variants[0].servings).toBe(60)
  })
})
