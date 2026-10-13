/**
 * @jest-environment node
 */
const authed = { value: true }
jest.mock('@/lib/portal/guard', () => ({ isPortalAuthed: async () => authed.value, getFounder: async () => null }))

import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { clearPersistCache, writeJson } from '@/lib/portal/persist'
import { addImportedProducts, getImportedProducts, getPersistedProducts, markProductRemoved, setDataSourceSetting } from '@/lib/portal/store'
import { listEditableProducts } from '@/lib/portal/product-edit'
import { mergeIntoProduct } from '@/lib/portal/product-actions'
import { POST } from '../route'

/**
 * Splitting a product: both halves land together, and nothing goes on sale
 * that was not on sale before. A removed product is refused — its split-off
 * half used to be a fresh record that nothing marked removed, so it went
 * straight onto the shop, and for a product merged into another the same tub
 * was then listed twice.
 */

const EMPTY_PRODUCTS = { overrides: {}, removedIds: [], imported: [], topProductIds: [] }

function variant(over: Partial<CatalogueVariant> & { id: string }): CatalogueVariant {
  return { title: over.id, flavour: null, size: '2kg', price: 44.99, compareAtPrice: null, available: true, inventory: 10, ...over }
}

function product(id: string, title: string, variants: CatalogueVariant[]): CatalogueProduct {
  const { rating: _rating, ...sample } = MOCK_CATALOGUE[0] as CatalogueProduct
  void _rating
  return { ...sample, id, handle: id, title, variants, defaultVariantId: variants[0].id, cost: 10, weightGrams: 2150 }
}

/** Two sizes on one product: the split the size prompt offers. */
const glycine = () =>
  product('gly', 'Glycine', [
    variant({ id: 'caps', title: '100 caps', size: '100 caps', sku: 'G1' }),
    variant({ id: 'powder', title: '454 grams', size: '454 grams', sku: 'G2' }),
  ])

const post = (body: unknown) =>
  POST(new Request('http://x/api/portal/products/split', { method: 'POST', body: JSON.stringify(body) }))

/** What the shop sells: products on sale, with their SKUs. */
async function onSale(): Promise<Array<[string, string[]]>> {
  clearPersistCache()
  return (await listEditableProducts())
    .filter((e) => e.state === 'live' && e.storage === 'imported')
    .map((e) => [e.product.id, e.product.variants.map((v) => v.sku ?? '')])
}

beforeEach(async () => {
  authed.value = true
  await writeJson('products', EMPTY_PRODUCTS)
  clearPersistCache()
  await setDataSourceSetting('real')
})

afterAll(async () => {
  await writeJson('products', EMPTY_PRODUCTS)
})

describe('POST /api/portal/products/split', () => {
  it('moves the ticked SKUs onto a product of their own, named for their size', async () => {
    await addImportedProducts([glycine()])
    const res = await post({ id: 'gly', variantIds: ['powder'] })
    expect(res.status).toBe(200)
    expect((await res.json()).moved).toMatchObject({ id: 'gly-454g', skus: 1 })
    expect(await onSale()).toEqual([
      ['gly', ['G1']],
      ['gly-454g', ['G2']],
    ])
  })

  it('refuses a removed product, says to restore it first, and puts nothing on sale', async () => {
    await addImportedProducts([glycine()])
    await markProductRemoved('gly')
    const before = await getPersistedProducts()

    const res = await post({ id: 'gly', variantIds: ['powder'] })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/This product is off sale\. Restore it first, then split it/)
    expect(await onSale()).toEqual([])
    expect(await getPersistedProducts()).toEqual(before)
  })

  it('refuses a product merged into another, and points at the one that sells its SKUs now', async () => {
    const target = product('cw', 'Critical Whey 2kg', [variant({ id: 'choc', flavour: 'Chocolate', sku: 'P100' })])
    const more = product('cw-more', 'Critical Whey 2kg More', [
      variant({ id: 'ban', flavour: 'Banana', sku: 'P400' }),
      variant({ id: 'straw', flavour: 'Strawberry', sku: 'P300' }),
    ])
    await addImportedProducts([target, more])
    await mergeIntoProduct('cw', ['cw-more'])

    const res = await post({ id: 'cw-more', variantIds: ['ban'] })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('merged into “Critical Whey 2kg”')
    expect(body.link).toEqual({ label: 'Open Critical Whey 2kg', href: '/founderhub/products/item/cw#variants' })
    // P400 is sold once, by the product it was merged into.
    const sellers = (await onSale()).filter(([, skus]) => skus.includes('P400')).map(([id]) => id)
    expect(sellers).toEqual(['cw'])
    expect((await getImportedProducts()).map((p) => p.id).sort()).toEqual(['cw', 'cw-more'])
  })
})
