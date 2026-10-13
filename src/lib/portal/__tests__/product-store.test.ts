/**
 * @jest-environment node
 */
import { kvDelete, kvGetRaw, kvSet } from '@/lib/db/kv'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct, ProductReview } from '@/lib/catalogue/types'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { clearPersistCache } from '../persist'
import {
  ProductNotFound,
  addImportedProducts,
  discardImportedProduct,
  editStoredProduct,
  getImportedProducts,
  getPersistedProducts,
  getProductOverrides,
  getRemovedProductIds,
  importProducts,
  markProductRemoved,
  productHoldingSkus,
  restoreProduct,
  restructureProducts,
  setProductOverride,
  setTopProductIds,
  updateImportedProducts,
} from '../store'

/**
 * The product store: every write to the catalogue goes through here.
 *
 * What is pinned is what the store promises a founder: an edit lands on the
 * record the shop reads, a change that fails leaves nothing half-done, an import
 * never duplicates or un-publishes a product, and an old override is folded in
 * without losing what anybody chose.
 */

const KEY = 'portal:products'
const BACKUP_KEY = 'portal:products-before-fold'

type Stored = {
  overrides: Record<string, Partial<CatalogueProduct>>
  removedIds: string[]
  imported: CatalogueProduct[]
  topProductIds: string[]
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Write the products document directly, as it would sit in the database. */
async function seed(state: Partial<Stored> = {}): Promise<void> {
  await kvSet(KEY, { overrides: {}, removedIds: [], imported: [], topProductIds: [], ...state })
  clearPersistCache()
}

async function rawText(): Promise<string | null> {
  return kvGetRaw(KEY)
}

async function stored(): Promise<Stored> {
  return JSON.parse((await rawText())!) as Stored
}

/** What the app reads, with nothing cached in front of it. */
async function fresh() {
  clearPersistCache()
  return getPersistedProducts()
}

const APPROVED: ProductReview = {
  status: 'approved',
  sources: { title: 'supplier', goals: 'ai' },
  confirmed: ['title', 'goals'],
  importedAt: '2026-09-01T10:00:00.000Z',
  approvedAt: '2026-09-02T09:30:00.000Z',
  approvedBy: 'founder@chrgd.co',
}
const PENDING: ProductReview = { status: 'pending', sources: { title: 'supplier' }, confirmed: [], importedAt: '2026-10-10T08:00:00.000Z' }

/**
 * A product as it comes in from PowerBody, built from the sample whey: one SKU
 * per code, every one a 1kg tub PowerBody counted at 33 servings.
 */
function pb(id: string, skus: string[], over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  const base = clone(MOCK_CATALOGUE[0])
  const flavours = base.variants.filter((v) => v.size === '1kg')
  return {
    ...base,
    id,
    handle: id,
    title: `Applied Nutrition ${id}`,
    brand: 'Applied Nutrition',
    defaultVariantId: `${id}-v1`,
    cost: 18.2,
    servings: 30,
    variants: skus.map((sku, i) => ({
      ...flavours[i % flavours.length],
      id: `${id}-v${i + 1}`,
      sku,
      inventory: 20,
      servings: 33,
      cost: 18.2,
    })),
    review: APPROVED,
    ...over,
  }
}

beforeEach(async () => {
  await seed()
})

describe('reading folds old overrides into imported records', () => {
  /** What the old product page saved: renamed things plus a frozen copy of the SKUs. */
  function oldOverride(record: CatalogueProduct, over: Partial<CatalogueProduct> = {}): Partial<CatalogueProduct> {
    return {
      title: 'Applied Whey Isolate',
      shortName: 'Whey',
      variants: record.variants.map((v) => ({ ...v, title: `${v.flavour} (founder)`, price: 9.99, inventory: 500 })),
      ...over,
    }
  }

  it('shows the folded product straight away, and leaves sample-product overrides as they are', async () => {
    const record = pb('pb-whey', ['PB-1', 'PB-2'])
    await seed({
      imported: [record],
      overrides: { 'pb-whey': oldOverride(record), 'chrgd-creatine': { shortName: 'Creatine' } },
    })

    const { imported, overrides } = await getPersistedProducts()
    expect(imported[0]).toMatchObject({ title: 'Applied Whey Isolate', shortName: 'Whey' })
    // Names from the copy, everything else from the record.
    expect(imported[0].variants.map((v) => v.title)).toEqual(record.variants.map((v) => `${v.flavour} (founder)`))
    expect(imported[0].variants.map((v) => [v.price, v.inventory])).toEqual(record.variants.map((v) => [v.price, 20]))
    expect(overrides).toEqual({ 'chrgd-creatine': { shortName: 'Creatine' } })
    expect(await getProductOverrides()).toEqual({ 'chrgd-creatine': { shortName: 'Creatine' } })
  })

  it('does not write on a read', async () => {
    const record = pb('pb-whey', ['PB-1'])
    await seed({ imported: [record], overrides: { 'pb-whey': oldOverride(record) } })
    const before = await rawText()
    await getPersistedProducts()
    await getImportedProducts()
    expect(await rawText()).toBe(before)
  })

  it('stores the fold on the next write, whatever that write was for', async () => {
    const record = pb('pb-whey', ['PB-1'])
    await seed({ imported: [record], overrides: { 'pb-whey': oldOverride(record) } })

    await setTopProductIds(['pb-whey'])

    const raw = await stored()
    expect(raw.overrides).toEqual({})
    expect(raw.imported[0]).toMatchObject({ title: 'Applied Whey Isolate', shortName: 'Whey' })
    expect(raw.topProductIds).toEqual(['pb-whey'])
  })

  it('drops a cost that was only the editor\'s estimate at the configured ratio', async () => {
    const record = pb('pb-whey', ['PB-1'], { cost: undefined })
    const estimate = Math.round(record.basePrice * getPricingConfig().defaultCostRatio * 100) / 100
    await seed({ imported: [record], overrides: { 'pb-whey': { cost: estimate } } })
    expect((await getPersistedProducts()).imported[0].cost).toBeUndefined()

    await seed({ imported: [record], overrides: { 'pb-whey': { cost: 12.5 } } })
    expect((await getPersistedProducts()).imported[0].cost).toBe(12.5)
  })

  it('keeps the record\'s positive cost over the override\'s', async () => {
    const record = pb('pb-whey', ['PB-1'], { cost: 18.2 })
    await seed({ imported: [record], overrides: { 'pb-whey': { cost: 12.5 } } })
    expect((await getPersistedProducts()).imported[0].cost).toBe(18.2)
  })

  it('spreads an override\'s servings only onto SKUs that do not know their own', async () => {
    const record = pb('pb-whey', ['PB-1', 'PB-2'])
    record.variants[1] = { ...record.variants[1], servings: undefined }
    await seed({ imported: [record], overrides: { 'pb-whey': { servings: 30 } } })
    const [folded] = (await getPersistedProducts()).imported
    expect(folded.servings).toBe(30)
    expect(folded.variants.map((v) => v.servings)).toEqual([33, 30])
  })

  it('never keeps a topRank the old override carried', async () => {
    const record = pb('pb-whey', ['PB-1'])
    await seed({ imported: [record], overrides: { 'pb-whey': { topRank: 1, title: 'T' } } })
    await markProductRemoved('nothing-here')
    expect((await stored()).imported[0]).not.toHaveProperty('topRank')
  })
})

describe('editStoredProduct', () => {
  it('rewrites an imported record in place and hands back what was saved', async () => {
    await seed({ imported: [pb('pb-a', ['PB-A1']), pb('pb-b', ['PB-B1'])] })

    const saved = await editStoredProduct('pb-b', (p) => ({ ...p, title: 'Renamed', id: 'somewhere-else', topRank: 3 }))

    expect(saved).toMatchObject({ id: 'pb-b', title: 'Renamed' })
    expect(saved).not.toHaveProperty('topRank')
    const raw = await stored()
    expect(raw.imported.map((p) => p.id)).toEqual(['pb-a', 'pb-b'])
    expect(raw.imported[1].title).toBe('Renamed')
    expect(raw.imported[1]).not.toHaveProperty('topRank')
    expect(raw.overrides).toEqual({})
  })

  it('leaves the product alone when the change returns null', async () => {
    const product = pb('pb-a', ['PB-A1'])
    await seed({ imported: [product] })
    const saved = await editStoredProduct('pb-a', () => null)
    expect(saved).toEqual(product)
    expect((await stored()).imported).toEqual([product])
  })

  it('refuses a product the store does not hold, and writes nothing', async () => {
    await seed({ imported: [pb('pb-a', ['PB-A1'])] })
    const before = await rawText()
    await expect(editStoredProduct('pb-missing', (p) => p)).rejects.toBeInstanceOf(ProductNotFound)
    await expect(editStoredProduct('pb-missing', (p) => p)).rejects.toMatchObject({ id: 'pb-missing' })
    expect(await rawText()).toBe(before)
  })

  it('stores only the difference for a sample product, and nothing once it is back as it was', async () => {
    const base = MOCK_CATALOGUE.find((p) => p.id === 'chrgd-creatine')!

    const saved = await editStoredProduct('chrgd-creatine', (p) => ({ ...p, shortName: 'Creatine' }))
    expect(saved).toEqual({ ...base, shortName: 'Creatine' })
    expect((await stored()).overrides).toEqual({ 'chrgd-creatine': { shortName: 'Creatine' } })
    expect((await stored()).imported).toEqual([])

    // The change is handed the product with its override composed on.
    const seen: CatalogueProduct[] = []
    await editStoredProduct('chrgd-creatine', (p) => {
      seen.push(p)
      const { shortName: _drop, ...rest } = p
      void _drop
      return rest as CatalogueProduct
    })
    expect(seen[0].shortName).toBe('Creatine')
    expect((await stored()).overrides).toEqual({})
  })
})

describe('setProductOverride', () => {
  it('edits an imported product\'s own record, not an override over it', async () => {
    await seed({ imported: [pb('pb-whey', ['PB-1'])] })
    await setProductOverride('pb-whey', { title: 'Applied Clear Whey', goals: ['muscle'] })
    const raw = await stored()
    expect(raw.overrides).toEqual({})
    expect(raw.imported[0]).toMatchObject({ title: 'Applied Clear Whey', goals: ['muscle'] })
  })

  it('clears an optional field on null and leaves review, slots and servings alone', async () => {
    const product = pb('pb-whey', ['PB-1', 'PB-2'], { shortName: 'Whey', review: PENDING })
    await seed({ imported: [product] })

    await setProductOverride('pb-whey', { shortName: null, review: null, stackSlots: null, servings: null } as unknown as Partial<CatalogueProduct>)

    const [saved] = (await stored()).imported
    expect(saved).not.toHaveProperty('shortName')
    expect(saved.review).toEqual(PENDING)
    expect(saved.stackSlots).toEqual(product.stackSlots)
    expect(saved.servings).toBe(30)
    expect(saved.variants.map((v) => v.servings)).toEqual([33, 33])
  })

  it('never moves a product\'s id or handle, approves it, or stores a rank', async () => {
    await seed({ imported: [pb('pb-whey', ['PB-1'], { review: PENDING })] })

    await setProductOverride('pb-whey', {
      id: 'elsewhere', handle: 'elsewhere', review: APPROVED, topRank: 1, title: 'Applied Whey',
    })

    const [saved] = (await stored()).imported
    expect(saved).toMatchObject({ id: 'pb-whey', handle: 'pb-whey', title: 'Applied Whey', review: PENDING })
    expect(saved).not.toHaveProperty('topRank')
  })

  it('edits SKUs by id, keeping what the supplier sync wrote since the screen loaded', async () => {
    await seed({ imported: [pb('pb-whey', ['PB-1', 'PB-2'])] })
    // The sync writes new stock levels…
    await updateImportedProducts((all) => ({
      products: all.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v, inventory: 3 })) })),
      result: null,
    }))
    // …then a screen that loaded before it renames one flavour.
    await setProductOverride('pb-whey', { variants: [{ id: 'pb-whey-v2', title: 'Vanilla Bean' }] } as Partial<CatalogueProduct>)

    const [saved] = (await stored()).imported
    expect(saved.variants.map((v) => v.inventory)).toEqual([3, 3])
    expect(saved.variants[1].title).toBe('Vanilla Bean')
    expect(saved.variants.map((v) => v.id)).toEqual(['pb-whey-v1', 'pb-whey-v2'])
  })

  it('puts a serving count on the SKUs of the master\'s size', async () => {
    await seed({ imported: [pb('pb-whey', ['PB-1', 'PB-2'])] })
    await setProductOverride('pb-whey', { servings: 25 })
    const [saved] = (await stored()).imported
    expect(saved.servings).toBe(25)
    expect(saved.variants.map((v) => v.servings)).toEqual([25, 25])
  })

  it('stores a sample product\'s edit as the difference from the sample', async () => {
    await setProductOverride('chrgd-creatine', { shortName: 'Creatine', handle: 'moved', topRank: 2 })
    expect((await stored()).overrides).toEqual({ 'chrgd-creatine': { shortName: 'Creatine' } })
  })

  it('keeps a patch for a product it does not hold, and folds it in when that product arrives', async () => {
    await setProductOverride('pb-future', { shortName: 'Future' })
    await setProductOverride('pb-future', { title: 'Future Whey', id: 'x', handle: 'x', review: APPROVED, topRank: 2 })
    expect((await stored()).overrides).toEqual({ 'pb-future': { shortName: 'Future', title: 'Future Whey' } })

    const [outcome] = await importProducts([pb('pb-future', ['PB-F1'], { review: PENDING })])
    expect(outcome).toMatchObject({ status: 'added', id: 'pb-future' })

    const { imported, overrides } = await fresh()
    // Still waiting for review — and what the patch set is recorded as the
    // founder's, so a pull does not put PowerBody's title back over it.
    expect(imported[0]).toMatchObject({
      id: 'pb-future',
      shortName: 'Future',
      title: 'Future Whey',
      review: { ...PENDING, sources: { title: 'founder', shortName: 'founder' } },
    })
    expect(overrides).toEqual({})
  })
})

describe('removing and restoring', () => {
  it('is soft: the record and its edits stay, and restore brings it back as it was', async () => {
    const product = pb('pb-whey', ['PB-1'], { shortName: 'Whey' })
    await seed({ imported: [product] })

    await markProductRemoved('pb-whey')
    await markProductRemoved('pb-whey')
    expect((await stored()).removedIds).toEqual(['pb-whey'])
    expect([...(await getRemovedProductIds())]).toEqual(['pb-whey'])
    expect((await stored()).imported).toEqual([product])

    await restoreProduct('pb-whey')
    expect((await stored()).removedIds).toEqual([])
    expect((await stored()).imported).toEqual([product])
  })

  it('restoring something that is not removed changes nothing else', async () => {
    await seed({ removedIds: ['chrgd-creatine'] })
    await restoreProduct('pb-other')
    expect((await stored()).removedIds).toEqual(['chrgd-creatine'])
  })
})

describe('addImportedProducts', () => {
  it('replaces each product by id in place, appends new ones, and stores no rank', async () => {
    await seed({ imported: [pb('pb-a', ['PB-A1']), pb('pb-b', ['PB-B1'])] })

    await addImportedProducts([
      { ...pb('pb-a', ['PB-A1']), title: 'A, replaced', topRank: 1 },
      { ...pb('pb-c', ['PB-C1']), topRank: 2 },
    ])

    const raw = await stored()
    expect(raw.imported.map((p) => p.id)).toEqual(['pb-a', 'pb-b', 'pb-c'])
    expect(raw.imported[0].title).toBe('A, replaced')
    expect(raw.imported.some((p) => 'topRank' in p)).toBe(false)
  })
})

describe('updateImportedProducts', () => {
  it('replaces only the products it hands back, ignores ids the store does not hold, and returns the result', async () => {
    const a = pb('pb-a', ['PB-A1'])
    const b = pb('pb-b', ['PB-B1'])
    await seed({ imported: [a, b] })

    const result = await updateImportedProducts((all) => {
      expect(all.map((p) => p.id)).toEqual(['pb-a', 'pb-b'])
      return {
        products: [{ ...all[1], title: 'B, synced', topRank: 4 }, pb('pb-ghost', ['PB-G1'])],
        result: { touched: 1 },
      }
    })

    expect(result).toEqual({ touched: 1 })
    const raw = await stored()
    expect(raw.imported.map((p) => p.id)).toEqual(['pb-a', 'pb-b'])
    expect(raw.imported[0]).toEqual(a)
    expect(raw.imported[1].title).toBe('B, synced')
    expect(raw.imported[1]).not.toHaveProperty('topRank')
  })

  it('works on the store as it is at write time, not as some earlier reader saw it', async () => {
    await seed({ imported: [pb('pb-a', ['PB-A1'])] })
    const readEarlier = await getImportedProducts()
    await setProductOverride('pb-a', { shortName: 'Edited meanwhile' })

    await updateImportedProducts((all) => ({ products: all.map((p) => ({ ...p, cost: 17 })), result: undefined }))

    const [saved] = (await stored()).imported
    expect(readEarlier[0].shortName).toBeUndefined()
    expect(saved).toMatchObject({ shortName: 'Edited meanwhile', cost: 17 })
  })
})

describe('productHoldingSkus', () => {
  const live = pb('pb-live', ['PB-1', 'PB-2'])
  const pending = pb('pb-pending', ['PB-1', 'PB-3'], { review: PENDING })
  const removed = pb('pb-removed', ['PB-1', 'PB-4'])

  it('prefers a live product, then a pending one, then a removed one — whatever the order', () => {
    const state = (imported: CatalogueProduct[]) => ({ imported, removedIds: ['pb-removed'] })
    expect(productHoldingSkus(state([removed, pending, live]), ['PB-1'])).toMatchObject({ product: { id: 'pb-live' }, state: 'live' })
    expect(productHoldingSkus(state([removed, pending]), ['PB-1'])).toMatchObject({ product: { id: 'pb-pending' }, state: 'pending' })
    expect(productHoldingSkus(state([removed]), ['PB-1'])).toMatchObject({ product: { id: 'pb-removed' }, state: 'removed' })
  })

  it('counts a removed product as removed even if it was pending', () => {
    const state = { imported: [pb('pb-x', ['PB-9'], { review: PENDING })], removedIds: ['pb-x'] }
    expect(productHoldingSkus(state, ['PB-9'])?.state).toBe('removed')
  })

  it('matches codes whatever their case, and hands back the shared ones as stored', () => {
    const hit = productHoldingSkus({ imported: [live], removedIds: [] }, ['pb-2', 'PB-404'])
    expect(hit).toMatchObject({ product: { id: 'pb-live' }, skus: ['PB-2'] })
  })

  it('finds nothing for no codes, blank codes, or codes nobody sells', () => {
    const state = { imported: [live], removedIds: [] }
    expect(productHoldingSkus(state, [])).toBeNull()
    expect(productHoldingSkus(state, [''])).toBeNull()
    expect(productHoldingSkus(state, ['PB-404'])).toBeNull()
  })
})

describe('importProducts', () => {
  it('adds a product nobody sells under its own id, with a matching handle', async () => {
    const incoming = { ...pb('pb-new', ['PB-N1']), handle: 'something-else', review: PENDING, topRank: 3 }
    const outcomes = await importProducts([incoming])
    expect(outcomes).toEqual([{ status: 'added', id: 'pb-new', title: incoming.title }])
    const [saved] = (await stored()).imported
    expect(saved).toMatchObject({ id: 'pb-new', handle: 'pb-new', review: PENDING })
    expect(saved).not.toHaveProperty('topRank')
  })

  it('gives a new product an id no stored product has — removed ones and the samples included', async () => {
    await seed({ imported: [pb('pb-whey', ['PB-1']), pb('pb-whey-2', ['PB-2'])], removedIds: ['pb-whey-2'] })

    const outcomes = await importProducts([
      pb('pb-whey', ['PB-NEW-1']),
      pb('chrgd-creatine', ['PB-NEW-2']),
    ])

    expect(outcomes.map((o) => o.id)).toEqual(['pb-whey-3', 'chrgd-creatine-2'])
    const raw = await stored()
    expect(raw.imported.map((p) => [p.id, p.handle])).toEqual([
      ['pb-whey', 'pb-whey'],
      ['pb-whey-2', 'pb-whey-2'],
      ['pb-whey-3', 'pb-whey-3'],
      ['chrgd-creatine-2', 'chrgd-creatine-2'],
    ])
  })

  it('does not add a product that is already on sale, or touch the one that is', async () => {
    const onSale = pb('pb-whey', ['PB-1', 'PB-2'])
    await seed({ imported: [onSale] })
    const refresh = jest.fn((current: CatalogueProduct) => current)

    const outcomes = await importProducts([pb('pb-whey-again', ['pb-1', 'PB-2', 'PB-7'])], { refresh })

    expect(outcomes).toEqual([{
      status: 'already', id: 'pb-whey', title: onSale.title, state: 'live', skus: ['PB-1', 'PB-2'], newSkus: ['PB-7'],
    }])
    // Never refreshed — it is on sale — and the new flavour is offered, not added.
    expect(refresh).not.toHaveBeenCalled()
    expect((await stored()).imported).toEqual([onSale])
  })

  it('reports a product waiting for review when there is no refresh', async () => {
    const waiting = pb('pb-whey', ['PB-1'], { review: PENDING })
    await seed({ imported: [waiting] })
    const [outcome] = await importProducts([pb('pb-whey', ['PB-1'])])
    expect(outcome).toEqual({ status: 'already', id: 'pb-whey', title: waiting.title, state: 'pending', skus: ['PB-1'], newSkus: [] })
    expect((await stored()).imported).toEqual([waiting])
  })

  it('refreshes a product still waiting for review, keeping its id', async () => {
    const waiting = pb('pb-whey', ['PB-1'], { review: PENDING, description: 'old copy' })
    await seed({ imported: [waiting] })
    const incoming = pb('pb-incoming', ['PB-1', 'PB-8'], { description: 'new copy from the spreadsheet' })

    const outcomes = await importProducts([incoming], {
      refresh: (current, next) => ({ ...current, description: next.description, id: next.id, topRank: 9 }),
    })

    expect(outcomes).toEqual([{ status: 'refreshed', id: 'pb-whey', title: waiting.title, newSkus: ['PB-8'] }])
    const raw = await stored()
    expect(raw.imported).toHaveLength(1)
    expect(raw.imported[0]).toMatchObject({ id: 'pb-whey', description: 'new copy from the spreadsheet', review: PENDING })
    expect(raw.imported[0]).not.toHaveProperty('topRank')
  })

  it('points at a removed product rather than adding it again', async () => {
    const gone = pb('pb-whey', ['PB-1', 'PB-2'])
    await seed({ imported: [gone], removedIds: ['pb-whey'] })

    const outcomes = await importProducts([pb('pb-whey-again', ['PB-2', 'PB-5'])])

    expect(outcomes).toEqual([{ status: 'removed', id: 'pb-whey', title: gone.title, skus: ['PB-2'], newSkus: ['PB-5'] }])
    const raw = await stored()
    expect(raw.imported).toEqual([gone])
    expect(raw.removedIds).toEqual(['pb-whey'])
  })

  it('reports the live holder when a removed product also has the SKU', async () => {
    await seed({ imported: [pb('pb-old', ['PB-1']), pb('pb-live', ['PB-1'])], removedIds: ['pb-old'] })
    const [outcome] = await importProducts([pb('pb-whey', ['PB-1'])])
    expect(outcome).toMatchObject({ status: 'already', id: 'pb-live', state: 'live' })
  })

  it('does not add the same SKUs twice from one spreadsheet', async () => {
    const outcomes = await importProducts([
      pb('pb-whey', ['PB-1', 'PB-2'], { review: PENDING }),
      pb('pb-whey-dupe', ['PB-2', 'PB-3'], { review: PENDING }),
    ])
    expect(outcomes).toEqual([
      { status: 'added', id: 'pb-whey', title: 'Applied Nutrition pb-whey' },
      { status: 'already', id: 'pb-whey', title: 'Applied Nutrition pb-whey', state: 'pending', skus: ['PB-2'], newSkus: ['PB-3'] },
    ])
    expect((await stored()).imported.map((p) => p.id)).toEqual(['pb-whey'])
  })

  it('adds a product with no supplier codes (it can match nothing)', async () => {
    const handmade = pb('chrgd-shaker', [], { variants: [{ id: 'shaker', title: 'Black', flavour: null, size: null, price: 6.99, compareAtPrice: null, available: true, sku: null }] })
    expect(await importProducts([handmade])).toEqual([{ status: 'added', id: 'chrgd-shaker', title: handmade.title }])
  })
})

describe('restructureProducts', () => {
  it('lands nothing when the change throws part-way', async () => {
    await seed({
      imported: [pb('pb-a', ['PB-A1', 'PB-A2']), pb('pb-b', ['PB-B1'])],
      removedIds: ['pb-b'],
      overrides: { 'chrgd-creatine': { shortName: 'Creatine' } },
      topProductIds: ['pb-a', 'chrgd-creatine'],
    })
    const before = await rawText()
    const readBefore = await fresh()

    await expect(
      restructureProducts((bench) => {
        const a = bench.get('pb-a')!
        bench.add({ ...a, id: 'pb-a-split', variants: [a.variants[1]] })
        bench.put({ ...a, variants: [a.variants[0]] })
        bench.restore('pb-b')
        bench.remove('pb-a')
        bench.discard('chrgd-creatine')
        bench.repointRoster('pb-a', 'pb-a-split')
        throw new Error('the second half failed')
      }),
    ).rejects.toThrow('the second half failed')

    expect(await rawText()).toBe(before)
    expect(await fresh()).toEqual(readBefore)
  })

  it('lands nothing when it names a product that is not there', async () => {
    await seed({ imported: [pb('pb-a', ['PB-A1'])] })
    const before = await rawText()
    await expect(
      restructureProducts((bench) => {
        bench.add(pb('pb-new', ['PB-N1']))
        bench.put(pb('pb-missing', ['PB-M1']))
      }),
    ).rejects.toBeInstanceOf(ProductNotFound)
    expect(await rawText()).toBe(before)
  })

  it('splits a SKU onto a new product in one write, and hands back the change\'s result', async () => {
    await seed({ imported: [pb('pb-glycine', ['PB-G1', 'PB-G2'])], topProductIds: ['pb-glycine'] })

    const newId = await restructureProducts((bench) => {
      const source = bench.get('pb-glycine')!
      const id = bench.add({ ...source, id: 'pb-glycine', title: 'Glycine Powder', variants: [source.variants[1]], topRank: 1 })
      bench.put({ ...source, variants: [source.variants[0]] })
      return id
    })

    expect(newId).toBe('pb-glycine-2')
    const raw = await stored()
    expect(raw.imported.map((p) => [p.id, p.handle, p.variants.map((v) => v.sku)])).toEqual([
      ['pb-glycine', 'pb-glycine', ['PB-G1']],
      ['pb-glycine-2', 'pb-glycine-2', ['PB-G2']],
    ])
    expect(raw.imported.some((p) => 'topRank' in p)).toBe(false)
  })

  it('get: the imported record, a sample product with its edits, or nothing', async () => {
    const a = pb('pb-a', ['PB-A1'])
    await seed({ imported: [a], overrides: { 'chrgd-creatine': { shortName: 'Creatine' } } })
    const creatine = MOCK_CATALOGUE.find((p) => p.id === 'chrgd-creatine')!
    const whey = MOCK_CATALOGUE.find((p) => p.id === 'chrgd-whey-protein')!

    const got = await restructureProducts((bench) => ({
      a: bench.get('pb-a'),
      creatine: bench.get('chrgd-creatine'),
      whey: bench.get('chrgd-whey-protein'),
      missing: bench.get('pb-missing'),
    }))
    expect(got.a).toEqual(a)
    expect(got.creatine).toEqual({ ...creatine, shortName: 'Creatine' })
    expect(got.whey).toEqual(whey)
    expect(got.missing).toBeUndefined()
  })

  it('put on a sample product stores its difference as an override', async () => {
    await restructureProducts((bench) => {
      const creatine = bench.get('chrgd-creatine')!
      bench.put({ ...creatine, variants: [creatine.variants[0]], topRank: 1 })
    })
    const { overrides } = await stored()
    expect(Object.keys(overrides['chrgd-creatine'])).toEqual(['variants'])
    expect(overrides['chrgd-creatine'].variants).toHaveLength(1)
  })

  it('remove, isRemoved and restore see the change as it goes', async () => {
    await seed({ imported: [pb('pb-a', ['PB-A1']), pb('pb-b', ['PB-B1'])], removedIds: ['pb-b'] })

    const seen = await restructureProducts((bench) => {
      const out = [bench.isRemoved('pb-a'), bench.isRemoved('pb-b')]
      bench.remove('pb-a')
      bench.remove('pb-a')
      bench.restore('pb-b')
      out.push(bench.isRemoved('pb-a'), bench.isRemoved('pb-b'))
      return out
    })

    expect(seen).toEqual([false, true, true, false])
    expect((await stored()).removedIds).toEqual(['pb-a'])
  })

  it('discard leaves no trace of the product', async () => {
    await seed({
      imported: [pb('pb-a', ['PB-A1']), pb('pb-b', ['PB-B1'])],
      removedIds: ['pb-a'],
      overrides: { 'pb-a': { shortName: 'A' } },
    })
    await restructureProducts((bench) => bench.discard('pb-a'))
    const raw = await stored()
    expect(raw.imported.map((p) => p.id)).toEqual(['pb-b'])
    expect(raw.removedIds).toEqual([])
    expect(raw.overrides).toEqual({})
  })

  it('holderOf looks at every other product, live first', async () => {
    await seed({
      imported: [
        pb('pb-self', ['PB-1']),
        pb('pb-removed', ['PB-1']),
        pb('pb-pending', ['PB-1'], { review: PENDING }),
        pb('pb-live', ['PB-1']),
      ],
      removedIds: ['pb-removed'],
    })
    const hits = await restructureProducts((bench) => ({
      fromSelf: bench.holderOf(['PB-1'], 'pb-self'),
      fromLive: bench.holderOf(['PB-1'], 'pb-live'),
      none: bench.holderOf(['PB-404'], 'pb-self'),
    }))
    expect(hits.fromSelf).toMatchObject({ product: { id: 'pb-live' }, state: 'live' })
    expect(hits.fromLive).toMatchObject({ product: { id: 'pb-self' }, state: 'live' })
    expect(hits.none).toBeNull()
  })

  it('repointRoster keeps the place, drops a duplicate, and ignores a product not on it', async () => {
    await seed({ topProductIds: ['pb-a', 'pb-b', 'pb-c'] })

    await restructureProducts((bench) => bench.repointRoster('pb-b', 'pb-b-merged'))
    expect((await stored()).topProductIds).toEqual(['pb-a', 'pb-b-merged', 'pb-c'])

    await restructureProducts((bench) => bench.repointRoster('pb-a', 'pb-c'))
    expect((await stored()).topProductIds).toEqual(['pb-b-merged', 'pb-c'])

    await restructureProducts((bench) => bench.repointRoster('pb-zzz', 'pb-a'))
    expect((await stored()).topProductIds).toEqual(['pb-b-merged', 'pb-c'])
  })
})

describe('discardImportedProduct', () => {
  it('leaves no trace, so the same SKU can be imported again after a second look', async () => {
    await seed({
      imported: [pb('pb-whey', ['PB-1'], { review: PENDING }), pb('pb-other', ['PB-9'])],
      removedIds: ['pb-whey'],
      overrides: { 'pb-whey': { shortName: 'W' } },
    })

    await discardImportedProduct('pb-whey')
    const raw = await stored()
    expect(raw.imported.map((p) => p.id)).toEqual(['pb-other'])
    expect(raw.removedIds).toEqual([])
    expect(raw.overrides).toEqual({})

    const [outcome] = await importProducts([pb('pb-whey', ['PB-1'], { review: PENDING })])
    expect(outcome).toEqual({ status: 'added', id: 'pb-whey', title: 'Applied Nutrition pb-whey' })
  })
})

describe('the backup taken before the first fold', () => {
  /** A fresh copy of the store module, as a newly started server would have. */
  async function newProcess<T>(run: (store: typeof import('../store')) => Promise<T>): Promise<T> {
    let out: T
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      out = await run(require('../store') as typeof import('../store'))
    })
    clearPersistCache()
    return out!
  }

  const backup = async () => {
    const raw = await kvGetRaw(BACKUP_KEY)
    return raw === null ? null : JSON.parse(raw)
  }

  beforeEach(async () => {
    await kvDelete(BACKUP_KEY)
  })

  it('keeps the store exactly as it was, override and all, before the fold rewrites it', async () => {
    const record = pb('pb-whey', ['PB-1'])
    await seed({ imported: [record], overrides: { 'pb-whey': { title: 'Founder title' } }, removedIds: [] })
    const original = await stored()

    await newProcess((store) => store.markProductRemoved('pb-other'))

    expect(await backup()).toEqual(original)
    const raw = await stored()
    expect(raw.overrides).toEqual({})
    expect(raw.imported[0].title).toBe('Founder title')
  })

  it('is written once: neither a later write nor a later process replaces it', async () => {
    const record = pb('pb-whey', ['PB-1'])
    await seed({ imported: [record], overrides: { 'pb-whey': { title: 'First' } } })
    const first = await stored()

    await newProcess(async (store) => {
      await store.markProductRemoved('pb-x')
      // A second fold-worthy state inside the same process…
      await seed({ imported: [record], overrides: { 'pb-whey': { title: 'Second' } } })
      await store.markProductRemoved('pb-y')
    })
    expect(await backup()).toEqual(first)

    // …and in a process that starts later.
    await seed({ imported: [record], overrides: { 'pb-whey': { title: 'Third' } } })
    await newProcess((store) => store.markProductRemoved('pb-z'))
    expect(await backup()).toEqual(first)
  })

  it('is not written when there is nothing to fold', async () => {
    await seed({ imported: [pb('pb-whey', ['PB-1'])], overrides: { 'chrgd-creatine': { shortName: 'Creatine' } } })
    await newProcess((store) => store.markProductRemoved('pb-whey'))
    expect(await backup()).toBeNull()
  })
})
