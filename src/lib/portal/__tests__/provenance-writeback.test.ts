/**
 * @jest-environment node
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { asPendingReview, fieldsNeedingReview, sourcesForImport } from '@/lib/catalogue/review'
import type { SupplierProduct, SupplierProvider } from '@/lib/supplier/types'

// The pull's own lookups are not what is under test: every SKU here carries its
// PowerBody id, so nothing needs searching for.
jest.mock('@/lib/portal/supplier-index', () => ({
  indexedProductIds: jest.fn(async () => new Map()),
}))
const rewriteDescription = jest.fn()
jest.mock('@/lib/catalogue/rewrite-description', () => ({
  rewriteDescription: (input: unknown) => rewriteDescription(input),
}))

import { clearPersistCache, writeJson } from '../persist'
import { getImportedProducts, importProducts, setDataSourceSetting } from '../store'
import { approveProduct, updateProduct } from '../product-edit'
import { saveProductChange } from '../editable-products'
import { pullProduct } from '@/lib/supplier/pull'
import { cleanupDescriptions } from '@/lib/catalogue/description-cleanup'

/**
 * Where a field came from is not bookkeeping: "Pull from PowerBody" replaces a
 * field whose source still says `supplier` and leaves everything else alone.
 * So every writer has to keep `review.sources` true, and no pass may write
 * back a review it read minutes ago. Each test here is one way that broke —
 * run against the real store and the real pull.
 */

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CLAIMY = 'Welcome to the world of intense workouts! Boosts your immune system.'

/** What PowerBody say about the two SKUs. */
function pb(sku: string, productId: string, over: Partial<SupplierProduct> = {}): SupplierProduct {
  return {
    sku, productId, name: `Critical Whey, ${sku} - 2kg`, brand: 'Applied Nutrition', category: 'Whey Protein',
    description: CLAIMY, imageUrl: `https://cdn.powerbody.co.uk/media/${sku}.jpg`, wholesalePrice: 24.5, rrp: 49.99,
    currency: 'GBP', stock: 20, inStock: true, barcode: null, flavours: [], servings: 66, weightGrams: 2150,
    vatRate: 0.2, detailed: true, updatedAt: '2026-10-12T09:00:00.000Z', ...over,
  }
}

const POWERBODY: Record<string, SupplierProduct> = {
  '1100': pb('P100', '1100'),
  '1200': pb('P200', '1200'),
}

const supplier = {
  name: 'powerbody',
  async getProductsById(ids: string[]) {
    return ids.map((id) => POWERBODY[id]).filter(Boolean)
  },
} as unknown as SupplierProvider

/** Critical Whey as imported from PowerBody: their facts, their provenance. */
function imported(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  const { rating: _rating, ...sample } = MOCK_CATALOGUE[0] as CatalogueProduct
  void _rating
  const variants: CatalogueVariant[] = [
    {
      id: 'cw-choc', title: 'Chocolate', flavour: 'Chocolate', size: '2kg', price: 49.99, compareAtPrice: null,
      available: true, inventory: 20, sku: 'P100', supplierProductId: '1100', cost: 24.5,
    },
    {
      id: 'cw-vanilla', title: 'Vanilla', flavour: 'Vanilla', size: '2kg', price: 49.99, compareAtPrice: null,
      available: true, inventory: 20, sku: 'P200', supplierProductId: '1200', cost: 24.5,
    },
  ]
  return {
    ...sample,
    id: 'critical-whey',
    handle: 'critical-whey',
    title: 'Critical Whey',
    brand: 'Applied Nutrition',
    category: 'Whey Protein',
    description: CLAIMY,
    imageUrl: 'https://cdn.powerbody.co.uk/media/P100.jpg',
    variants,
    defaultVariantId: 'cw-choc',
    basePrice: 49.99,
    compareAtPrice: null,
    cost: 24.5,
    supplierRrp: 49.99,
    supplierProductId: '1100',
    weightGrams: 2150,
    vatRate: 0.2,
    servings: 66,
    consumption: { cadence: 'daily', servingsPerUnit: 66 },
    ...over,
  }
}

function pending(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return asPendingReview(imported(over), sourcesForImport(['stackSlots', 'goals', 'shortReason'], true), '2026-10-01T09:00:00.000Z')
}

async function seed(product: CatalogueProduct): Promise<string> {
  const [outcome] = await importProducts([product])
  expect(outcome.status).toBe('added')
  return outcome.id
}

async function stored(id: string): Promise<CatalogueProduct> {
  clearPersistCache()
  const found = (await getImportedProducts()).find((p) => p.id === id)
  if (!found) throw new Error(`nothing stored as ${id}`)
  return found
}

/** What the pull route saves: PowerBody's answer, with what they filled confirmed by them. */
function confirmFromSupplier(product: CatalogueProduct, filled: string[]): CatalogueProduct {
  const review = product.review
  if (!review || filled.length === 0) return product
  const sources = { ...review.sources }
  for (const key of filled) sources[key as keyof CatalogueProduct] = 'supplier'
  return { ...product, review: { ...review, sources, confirmed: [...new Set([...review.confirmed, ...filled])] } }
}

const EMPTY_PRODUCTS = { overrides: {}, removedIds: [], imported: [], topProductIds: [] }

beforeEach(async () => {
  await writeJson('products', EMPTY_PRODUCTS)
  clearPersistCache()
  await setDataSourceSetting('mock')
  rewriteDescription.mockReset()
})

afterAll(async () => {
  await writeJson('products', EMPTY_PRODUCTS)
})

// ── A pass never writes back the review it read ──────────────────────────────

describe('saveProductChange — a pass that ran for minutes', () => {
  it('does not undo an approval made while it ran', async () => {
    const id = await seed(pending({ imageUrl: null }))
    // The pull reads the product…
    const before = await stored(id)

    // …and while PowerBody is being asked, the founder ticks what is left and approves.
    await updateProduct(id, { confirm: fieldsNeedingReview(before).map((f) => f.key as string) })
    expect(await approveProduct(id, 'founder@chrgd.co')).toEqual({ ok: true })

    // The pull finishes: a picture filled, confirmed by PowerBody.
    const after = confirmFromSupplier({ ...before, imageUrl: 'https://cdn.powerbody.co.uk/media/P100.jpg' }, ['imageUrl'])
    await saveProductChange(before, after)

    const saved = await stored(id)
    expect(saved.imageUrl).toBe('https://cdn.powerbody.co.uk/media/P100.jpg')
    // Still on sale, still approved by who approved it.
    expect(saved.review?.status).toBe('approved')
    expect(saved.review?.approvedBy).toBe('founder@chrgd.co')
    expect(saved.review?.approvedAt).toBeDefined()
    // …and what the pull itself knew is recorded too.
    expect(saved.review?.sources.imageUrl).toBe('supplier')
  })

  it('keeps ticks made while it ran, and adds its own', async () => {
    const id = await seed(pending({ imageUrl: null }))
    const before = await stored(id)

    await updateProduct(id, { confirm: ['goals', 'stackSlots'] })

    await saveProductChange(before, confirmFromSupplier({ ...before, imageUrl: 'https://cdn/p.jpg' }, ['imageUrl']))

    const saved = await stored(id)
    expect(saved.review?.status).toBe('pending')
    expect(saved.review?.confirmed).toEqual(expect.arrayContaining(['goals', 'stackSlots', 'imageUrl']))
  })

  it('records the provenance a pass added even when no field changed', async () => {
    const id = await seed(pending())
    const before = await stored(id)
    const after = confirmFromSupplier(before, ['basePrice'])
    await saveProductChange(before, after)
    expect((await stored(id)).review?.confirmed).toContain('basePrice')
  })
})

// ── The product's servings follow its master after a pass ────────────────────

describe('saveProductChange — servings', () => {
  /** A roster import with no counts from PowerBody yet: the guessed 30 everywhere. */
  function guessed(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
    const base = imported()
    return imported({
      servings: 30,
      consumption: { cadence: 'daily', servingsPerUnit: 30 },
      variants: base.variants.map(({ servings: _s, ...v }) => v),
      ...over,
    })
  }

  it('moves the product and the plan to the count a pull gave the master', async () => {
    const id = await seed(guessed())
    const before = await stored(id)
    // What the pull worked out: PowerBody count 66 servings in each tub.
    const after = { ...before, variants: before.variants.map((v) => ({ ...v, servings: 66, servingsSource: 'supplier' as const })) }

    await saveProductChange(before, after)

    const saved = await stored(id)
    expect(saved.variants.map((v) => v.servings)).toEqual([66, 66])
    expect(saved.servings).toBe(66)
    // A daily customer is sized on the tub the shelf describes, not the guess.
    expect(saved.consumption?.servingsPerUnit).toBe(66)
  })

  it('leaves a plan that was set on purpose', async () => {
    const id = await seed(guessed({ consumption: { cadence: 'daily', servingsPerUnit: 15 } }))
    const before = await stored(id)
    await saveProductChange(before, { ...before, variants: before.variants.map((v) => ({ ...v, servings: 66 })) })
    const saved = await stored(id)
    expect(saved.servings).toBe(66)
    expect(saved.consumption?.servingsPerUnit).toBe(15)
  })
})

// ── Every writer keeps the sources true, so a pull leaves the work alone ─────

describe('a pull after the founder or a pass changed a PowerBody field', () => {
  it('keeps a VAT rate the founder set — 0% is a real answer, not PowerBody’s to undo', async () => {
    const id = await seed(pending())
    await updateProduct(id, { set: { vatRate: 0 } })
    const edited = await stored(id)
    expect(edited.review?.sources.vatRate).toBe('founder')

    const result = await pullProduct(edited, { supplier })
    expect(result.after.vatRate).toBe(0)
    expect(result.filled).not.toContain('vatRate')
  })

  it('keeps a brand the founder changed after a pull had filled it', async () => {
    // As an earlier pull leaves it: the brand filled, and recorded as PowerBody's.
    const product = pending()
    product.review!.sources.brand = 'supplier'
    const id = await seed(product)

    await updateProduct(id, { set: { brand: 'Applied' } })
    const result = await pullProduct(await stored(id), { supplier })
    expect(result.after.brand).toBe('Applied')
  })

  it('keeps a description the AI tidy rewrote, rather than putting the claims back', async () => {
    const id = await seed(pending())
    rewriteDescription.mockResolvedValueOnce({ text: 'A whey protein blend for after training.', source: 'ai' })

    await cleanupDescriptions({ ids: [id], ai: true, write: true })
    const tidied = await stored(id)
    expect(tidied.description).toBe('A whey protein blend for after training.')
    expect(tidied.review?.sources.description).toBe('ai')

    const result = await pullProduct(tidied, { supplier })
    expect(result.after.description).toBe('A whey protein blend for after training.')
    expect(result.filled).not.toContain('description')
  })

  it('keeps a category an old-editor override set, once the override is folded in', async () => {
    const record = pending()
    // The store as it was before the fold shipped: the founder's category in an
    // override over the record PowerBody's import wrote.
    await writeJson('products', { ...EMPTY_PRODUCTS, imported: [record], overrides: { [record.id]: { category: 'Protein' } } })
    clearPersistCache()

    const folded = await stored(record.id)
    expect(folded.category).toBe('Protein')
    expect(folded.review?.sources.category).toBe('founder')

    const result = await pullProduct(folded, { supplier })
    expect(result.after.category).toBe('Protein')
  })

  it('still refreshes what really is PowerBody’s', async () => {
    const id = await seed(pending({ weightGrams: 2000 }))
    const result = await pullProduct(await stored(id), { supplier })
    expect(result.after.weightGrams).toBe(2150)
    expect(result.filled).toContain('weightGrams')
  })
})
