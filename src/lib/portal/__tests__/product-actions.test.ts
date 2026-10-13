/**
 * @jest-environment node
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { asPendingReview, sourcesForImport } from '@/lib/catalogue/review'
import { variantForLine } from '@/lib/catalogue/line-variant'
import { clearPersistCache, writeJson } from '../persist'
import {
  ProductNotFound,
  addImportedProducts,
  getImportedProducts,
  getPersistedProducts,
  getRemovedProductIds,
  getTopProductIds,
  markProductRemoved,
  setDataSourceSetting,
  setTopProductIds,
} from '../store'

jest.mock('@/lib/supplier/autopopulate', () => ({
  autopopulateProduct: jest.fn(),
}))

import { autopopulateProduct } from '@/lib/supplier/autopopulate'
import {
  ActionRefused,
  discardProduct,
  fillBlanks,
  mergeIntoProduct,
  removeProduct,
  restoreRemovedProduct,
} from '../product-actions'

const autopopulate = autopopulateProduct as jest.MockedFunction<typeof autopopulateProduct>

/**
 * Whole-product actions, against the real store (in-memory SQLite). The point
 * of each is what it refuses to do: list a tub twice, delete something that
 * was on sale, move a target's identity in a merge, or let a model overwrite a
 * decision.
 */

// ── Fixtures ─────────────────────────────────────────────────────────────────

function variant(over: Partial<CatalogueVariant> & { id: string }): CatalogueVariant {
  return { title: over.id, flavour: null, size: '2kg', price: 44.99, compareAtPrice: null, available: true, inventory: 10, ...over }
}

/** An imported Applied Nutrition whey, live, built from the sample whey. */
function whey(id: string, title: string, variants: CatalogueVariant[], over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  const { rating: _rating, ...sample } = MOCK_CATALOGUE[0] as CatalogueProduct
  void _rating
  return {
    ...sample,
    id,
    handle: id,
    title,
    brand: 'Applied Nutrition',
    imageUrl: `https://cdn.powerbody.co.uk/media/${id}.jpg`,
    variants,
    defaultVariantId: variants[0].id,
    basePrice: 44.99,
    cost: 24.5,
    weightGrams: 2150,
    ...over,
  }
}

function pending(product: CatalogueProduct): CatalogueProduct {
  return asPendingReview(product, sourcesForImport(['stackSlots', 'goals', 'shortReason'], true), '2026-10-01T09:00:00.000Z')
}

/** The target: a whey that already sells two flavours, Vanilla its chosen master. */
function criticalWhey(): CatalogueProduct {
  return whey('critical-whey', 'Critical Whey 2kg', [
    variant({ id: 'cw-choc', title: 'Chocolate', flavour: 'Chocolate', sku: 'P100', cost: 24.5 }),
    variant({ id: 'cw-van', title: 'Vanilla', flavour: 'Vanilla', sku: 'P200', cost: 23.9 }),
  ], { defaultVariantId: 'cw-van', supplierProductId: '1200' })
}

function strawberry(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return whey('critical-whey-strawberry', 'Critical Whey 2kg Strawberry', [
    variant({ id: 'straw', title: 'Strawberry', flavour: 'Strawberry', sku: 'P300' }),
  ], { cost: 25.1, servings: 64, supplierProductId: '1300', ...over })
}

function banana(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return whey('critical-whey-banana', 'Critical Whey 2kg Banana', [
    variant({ id: 'banana', title: 'Banana', flavour: 'Banana', sku: 'P400' }),
  ], over)
}

async function stored(id: string): Promise<CatalogueProduct | undefined> {
  return (await getImportedProducts()).find((p) => p.id === id)
}

async function refusal(promise: Promise<unknown>): Promise<ActionRefused> {
  try {
    await promise
  } catch (err) {
    if (err instanceof ActionRefused) return err
    throw err
  }
  throw new Error('expected the action to be refused')
}

const EMPTY_PRODUCTS = { overrides: {}, removedIds: [], imported: [], topProductIds: [] }

beforeEach(async () => {
  jest.clearAllMocks()
  await writeJson('products', EMPTY_PRODUCTS)
  clearPersistCache()
  await setDataSourceSetting('mock')
})

afterAll(async () => {
  await writeJson('products', EMPTY_PRODUCTS)
})

// ── removeProduct ────────────────────────────────────────────────────────────

describe('removeProduct', () => {
  it('takes a product off sale and keeps its record, so it can come back as it was', async () => {
    await addImportedProducts([criticalWhey()])
    await removeProduct('critical-whey')

    expect((await getRemovedProductIds()).has('critical-whey')).toBe(true)
    expect((await stored('critical-whey'))?.title).toBe('Critical Whey 2kg')
  })

  it('does nothing to a product already removed', async () => {
    await addImportedProducts([criticalWhey()])
    await markProductRemoved('critical-whey')
    await expect(removeProduct('critical-whey')).resolves.toBeUndefined()
    expect((await getPersistedProducts()).removedIds).toEqual(['critical-whey'])
  })

  it('can remove a sample product in mock mode', async () => {
    await removeProduct('chrgd-whey-protein')
    expect((await getRemovedProductIds()).has('chrgd-whey-protein')).toBe(true)
  })

  it('refuses an id nobody holds', async () => {
    await expect(removeProduct('no-such-product')).rejects.toBeInstanceOf(ProductNotFound)
    expect((await getPersistedProducts()).removedIds).toEqual([])
  })
})

// ── restoreRemovedProduct ────────────────────────────────────────────────────

describe('restoreRemovedProduct', () => {
  it('puts a removed product back on sale when nothing else sells its SKUs', async () => {
    await addImportedProducts([criticalWhey()])
    await markProductRemoved('critical-whey')
    await restoreRemovedProduct('critical-whey')
    expect((await getRemovedProductIds()).has('critical-whey')).toBe(false)
  })

  it('refuses when another live product now sells its SKUs, and names that product', async () => {
    const readded = whey('critical-whey-2', 'Critical Whey 2kg (re-added)', [variant({ id: 'x', sku: 'P200' })])
    await addImportedProducts([criticalWhey(), readded])
    await markProductRemoved('critical-whey')

    const err = await refusal(restoreRemovedProduct('critical-whey'))
    expect(err.message).toContain('Critical Whey 2kg (re-added)')
    expect(err.message).toMatch(/list them twice/)
    expect(err.link).toEqual({ label: 'Open Critical Whey 2kg (re-added)', href: '/founderhub/products/item/critical-whey-2' })
    expect((await getRemovedProductIds()).has('critical-whey')).toBe(true)
  })

  it('refuses when a product still waiting for review holds them too', async () => {
    await addImportedProducts([criticalWhey(), pending(whey('cw-pending', 'Critical Whey pending', [variant({ id: 'y', sku: 'P100' })]))])
    await markProductRemoved('critical-whey')
    await expect(restoreRemovedProduct('critical-whey')).rejects.toBeInstanceOf(ActionRefused)
  })

  it('restores when the only other holder is itself removed', async () => {
    const other = whey('cw-other', 'Critical Whey other', [variant({ id: 'z', sku: 'P100' })])
    await addImportedProducts([criticalWhey(), other])
    await markProductRemoved('critical-whey')
    await markProductRemoved('cw-other')
    await restoreRemovedProduct('critical-whey')
    expect([...(await getRemovedProductIds())]).toEqual(['cw-other'])
  })

  it('does nothing to a product that is not removed', async () => {
    await addImportedProducts([criticalWhey()])
    await restoreRemovedProduct('critical-whey')
    expect((await getPersistedProducts()).removedIds).toEqual([])
  })

  it('refuses an id nobody holds', async () => {
    await expect(restoreRemovedProduct('no-such-product')).rejects.toBeInstanceOf(ProductNotFound)
  })
})

// ── discardProduct ───────────────────────────────────────────────────────────

describe('discardProduct', () => {
  it('deletes a product still waiting for review, leaving no trace', async () => {
    await addImportedProducts([pending(strawberry())])
    await markProductRemoved('critical-whey-strawberry')
    await discardProduct('critical-whey-strawberry')

    expect(await stored('critical-whey-strawberry')).toBeUndefined()
    expect((await getPersistedProducts()).removedIds).toEqual([])
  })

  it('refuses a product that went on sale — Remove is the way, and it can be undone', async () => {
    await addImportedProducts([criticalWhey()])
    const err = await refusal(discardProduct('critical-whey'))
    expect(err.message).toMatch(/Only a product still waiting for review can be discarded/)
    expect(await stored('critical-whey')).toBeDefined()
  })

  it('refuses a sample product, which has no review to be waiting on', async () => {
    await expect(discardProduct('chrgd-whey-protein')).rejects.toBeInstanceOf(ActionRefused)
  })

  it('refuses an id nobody holds', async () => {
    await expect(discardProduct('no-such-product')).rejects.toBeInstanceOf(ProductNotFound)
  })
})

// ── mergeIntoProduct ─────────────────────────────────────────────────────────

describe('mergeIntoProduct', () => {
  it('adds the sources’ SKUs to the target, which keeps its id, labels, master and own SKUs', async () => {
    const target = criticalWhey()
    await addImportedProducts([target, strawberry(), banana()])

    const result = await mergeIntoProduct('critical-whey', ['critical-whey-strawberry', 'critical-whey-banana'])

    expect(result.moved).toBe(2)
    const merged = (await stored('critical-whey'))!
    expect(merged).toMatchObject({ id: 'critical-whey', title: 'Critical Whey 2kg', defaultVariantId: 'cw-van', supplierProductId: '1200' })
    expect(merged.variants.slice(0, 2)).toEqual(target.variants)
    expect(merged.variants.slice(2).map((v) => [v.id, v.sku, v.flavour])).toEqual([
      ['straw', 'P300', 'Strawberry'],
      ['banana', 'P400', 'Banana'],
    ])
    // Each newcomer brings its own facts.
    expect(merged.variants[2]).toMatchObject({ cost: 25.1, servings: 64, supplierProductId: '1300' })
    expect(result.product.variants).toHaveLength(4)
  })

  it('removes a source that was on sale (restorable) and discards one that never was', async () => {
    await addImportedProducts([criticalWhey(), strawberry(), pending(banana())])

    const result = await mergeIntoProduct('critical-whey', ['critical-whey-strawberry', 'critical-whey-banana'])

    expect(result.removed).toEqual(['critical-whey-strawberry'])
    expect(result.discarded).toEqual(['critical-whey-banana'])
    expect(await stored('critical-whey-strawberry')).toBeDefined()
    expect((await getRemovedProductIds()).has('critical-whey-strawberry')).toBe(true)
    expect(await stored('critical-whey-banana')).toBeUndefined()
    expect((await getRemovedProductIds()).has('critical-whey-banana')).toBe(false)
  })

  it('moves a source’s Top 25 place to the target', async () => {
    await addImportedProducts([criticalWhey(), strawberry()])
    await setTopProductIds(['chrgd-creatine', 'critical-whey-strawberry', 'chrgd-plant-protein'])

    await mergeIntoProduct('critical-whey', ['critical-whey-strawberry'])

    expect(await getTopProductIds()).toEqual(['chrgd-creatine', 'critical-whey', 'chrgd-plant-protein'])
  })

  it('drops a source’s place when the target already has one, rather than listing the target twice', async () => {
    await addImportedProducts([criticalWhey(), strawberry()])
    await setTopProductIds(['critical-whey-strawberry', 'critical-whey', 'chrgd-creatine'])

    await mergeIntoProduct('critical-whey', ['critical-whey-strawberry'])

    expect(await getTopProductIds()).toEqual(['critical-whey', 'chrgd-creatine'])
  })

  it('refuses to put two sizes on one product, and changes nothing', async () => {
    const bigTub = whey('critical-whey-4kg', 'Critical Whey 4kg Strawberry', [
      variant({ id: 'big', title: 'Strawberry', flavour: 'Strawberry', size: '4kg', sku: 'P900' }),
    ])
    await addImportedProducts([criticalWhey(), bigTub])
    const before = await getPersistedProducts()

    const err = await refusal(mergeIntoProduct('critical-whey', ['critical-whey-4kg']))
    expect(err.message).toMatch(/different sizes/)
    expect(await getPersistedProducts()).toEqual(before)
  })

  it('reads a size from a name when the SKU has none', async () => {
    const unlabelled = whey('critical-whey-900g', 'Critical Whey 900g', [variant({ id: 'small', size: null, sku: 'P901' })])
    const target = criticalWhey()
    target.variants = target.variants.map((v) => ({ ...v, size: null, title: `${v.title} - 2kg` }))
    await addImportedProducts([target, unlabelled])
    await expect(mergeIntoProduct('critical-whey', ['critical-whey-900g'])).rejects.toThrow(/different sizes/)
  })

  it('needs another product to bring in', async () => {
    await addImportedProducts([criticalWhey()])
    await expect(mergeIntoProduct('critical-whey', [])).rejects.toThrow(/Pick another product/)
    await expect(mergeIntoProduct('critical-whey', ['critical-whey'])).rejects.toThrow(/Pick another product/)
  })

  it('refuses to merge a product on sale into one still waiting for review, and changes nothing', async () => {
    // The new flavour came in as its own product (pending); the founder opens it
    // from Review and picks the live product to bring in. Done that way round,
    // the live product would go off sale with its Top 25 place and its renewals.
    const vanilla = pending(whey('whey-van', 'Critical Whey 2kg Vanilla', [variant({ id: 'van', flavour: 'Vanilla', sku: 'P200' })]))
    const chocolate = whey('whey-choc', 'Critical Whey 2kg Chocolate', [variant({ id: 'choc', flavour: 'Chocolate', sku: 'P100' })])
    await addImportedProducts([vanilla, chocolate])
    await setTopProductIds(['whey-choc'])
    const before = await getPersistedProducts()

    const err = await refusal(mergeIntoProduct('whey-van', ['whey-choc']))

    expect(err.message).toContain('“Critical Whey 2kg Chocolate” is on sale and this product is still waiting for review')
    expect(err.message).toMatch(/open “Critical Whey 2kg Chocolate” and bring this one into it/)
    expect(err.link).toEqual({ label: 'Open Critical Whey 2kg Chocolate', href: '/founderhub/products/item/whey-choc' })
    expect(await getPersistedProducts()).toEqual(before)
    expect(await getTopProductIds()).toEqual(['whey-choc'])
    expect((await getRemovedProductIds()).has('whey-choc')).toBe(false)
  })

  it('the other way round, the waiting product joins the one on sale and is discarded', async () => {
    const vanilla = pending(whey('whey-van', 'Critical Whey 2kg Vanilla', [variant({ id: 'van', flavour: 'Vanilla', sku: 'P200' })]))
    const chocolate = whey('whey-choc', 'Critical Whey 2kg Chocolate', [variant({ id: 'choc', flavour: 'Chocolate', sku: 'P100' })])
    await addImportedProducts([vanilla, chocolate])
    await setTopProductIds(['whey-choc'])

    const result = await mergeIntoProduct('whey-choc', ['whey-van'])

    expect(result.discarded).toEqual(['whey-van'])
    expect(result.removed).toEqual([])
    expect((await stored('whey-choc'))!.variants.map((v) => v.sku)).toEqual(['P100', 'P200'])
    expect(await stored('whey-van')).toBeUndefined()
    expect((await getRemovedProductIds()).size).toBe(0)
    expect(await getTopProductIds()).toEqual(['whey-choc'])
  })

  it('still combines two products that are both waiting for review', async () => {
    await addImportedProducts([pending(criticalWhey()), pending(strawberry())])
    const result = await mergeIntoProduct('critical-whey', ['critical-whey-strawberry'])
    expect(result.discarded).toEqual(['critical-whey-strawberry'])
    expect((await stored('critical-whey'))!.variants.map((v) => v.sku)).toEqual(['P100', 'P200', 'P300'])
  })

  it('lets a product waiting for review take in a removed one, which nobody can buy anyway', async () => {
    await addImportedProducts([pending(criticalWhey()), strawberry()])
    await markProductRemoved('critical-whey-strawberry')
    const result = await mergeIntoProduct('critical-whey', ['critical-whey-strawberry'])
    expect(result.removed).toEqual(['critical-whey-strawberry'])
  })

  it('refuses to add flavours to a removed product', async () => {
    await addImportedProducts([criticalWhey(), strawberry()])
    await markProductRemoved('critical-whey')
    await expect(mergeIntoProduct('critical-whey', ['critical-whey-strawberry'])).rejects.toThrow(/Restore this product/)
  })

  it('lands all of it or none of it when one source is missing', async () => {
    await addImportedProducts([criticalWhey(), strawberry()])
    const before = await getPersistedProducts()
    await expect(mergeIntoProduct('critical-whey', ['critical-whey-strawberry', 'no-such-product'])).rejects.toBeInstanceOf(ProductNotFound)
    expect(await getPersistedProducts()).toEqual(before)
  })

  it('refuses an unknown target', async () => {
    await addImportedProducts([strawberry()])
    await expect(mergeIntoProduct('no-such-product', ['critical-whey-strawberry'])).rejects.toBeInstanceOf(ProductNotFound)
  })

  it('keeps a subscription line naming a merged-away product shipping the right SKU', async () => {
    await addImportedProducts([criticalWhey(), strawberry()])
    await mergeIntoProduct('critical-whey', ['critical-whey-strawberry'])
    const catalogue = await getImportedProducts()
    const hit = variantForLine({ productId: 'critical-whey-strawberry', variantTitle: 'Strawberry · 2kg' }, catalogue.filter((p) => p.id !== 'critical-whey-strawberry'))
    expect(hit).toMatchObject({ product: { id: 'critical-whey' }, variant: { sku: 'P300' } })
  })

  it('a merged-away source cannot simply be restored: its SKUs are on the target now', async () => {
    await addImportedProducts([criticalWhey(), strawberry()])
    await mergeIntoProduct('critical-whey', ['critical-whey-strawberry'])

    const err = await refusal(restoreRemovedProduct('critical-whey-strawberry'))
    expect(err.message).toContain('Critical Whey 2kg')
    expect(err.link?.href).toBe('/founderhub/products/item/critical-whey')
    expect((await getRemovedProductIds()).has('critical-whey-strawberry')).toBe(true)
  })
})

// ── fillBlanks ───────────────────────────────────────────────────────────────

describe('fillBlanks', () => {
  /** What the classifier hands back: an opinion on everything, numbers included. */
  const SUGGESTED: Partial<CatalogueProduct> = {
    title: 'AI title',
    description: 'AI description',
    cost: 99,
    servings: 99,
    consumption: { cadence: 'daily', servingsPerUnit: 99 },
    goals: ['muscle', 'recovery'],
    stackSlots: ['recovery'],
    swapGroup: 'protein-whey',
    shortReason: 'Protein to help build muscle.',
    dietaryTags: [],
    warnings: ['Contains milk.'],
    effectOnset: '   ' as unknown as CatalogueProduct['effectOnset'],
    hasStimulants: false,
  }

  /** A pending whey with gaps where an import leaves them. */
  function gappy(): CatalogueProduct {
    const product = pending(
      whey('cw-gappy', 'Critical Whey 2kg', [variant({ id: 'g', sku: 'P100' })], {
        goals: [],
        shortReason: '',
        swapGroup: 'general' as CatalogueProduct['swapGroup'],
        stackSlots: ['protein'],
        dietaryTags: [],
        warnings: [],
        cost: undefined,
        servings: 0,
        consumption: undefined,
        effectOnset: undefined,
      }),
    )
    return { ...product, review: { ...product.review!, confirmed: ['goals', 'stackSlots', 'title'] } }
  }

  it('fills only what is blank — never a filled field, the cost, the servings or the plan', async () => {
    await addImportedProducts([gappy()])
    autopopulate.mockResolvedValue({ patch: SUGGESTED, source: 'ai' })

    const { filled, source } = await fillBlanks('cw-gappy')

    expect(source).toBe('ai')
    expect(filled.sort()).toEqual(['goals', 'shortReason', 'swapGroup', 'warnings'])
    const after = (await stored('cw-gappy'))!
    expect(after).toMatchObject({
      goals: ['muscle', 'recovery'],
      shortReason: 'Protein to help build muscle.',
      swapGroup: 'protein-whey',
      warnings: ['Contains milk.'],
      // Filled already: a decision, not a gap.
      stackSlots: ['protein'],
      // Supplier-owned, whatever the model thinks.
      title: 'Critical Whey 2kg',
      servings: 0,
    })
    expect(after.cost).toBeUndefined()
    expect(after.consumption).toBeUndefined()
    // A blank string and an empty list are not something to fill with.
    expect(after.effectOnset).toBeUndefined()
    expect(after.dietaryTags).toEqual([])
    expect(autopopulate).toHaveBeenCalledWith(expect.objectContaining({ id: 'cw-gappy' }))
  })

  it('records what it filled as the model’s, and takes back any confirmation of those fields', async () => {
    await addImportedProducts([gappy()])
    autopopulate.mockResolvedValue({ patch: SUGGESTED, source: 'ai' })

    await fillBlanks('cw-gappy')

    const review = (await stored('cw-gappy'))!.review!
    expect(review.status).toBe('pending')
    expect(review.sources).toMatchObject({ goals: 'ai', shortReason: 'ai', swapGroup: 'ai', warnings: 'ai' })
    // stackSlots kept its value, so its provenance is untouched.
    expect(review.sources.stackSlots).toBe(gappy().review!.sources.stackSlots)
    expect(review.confirmed.sort()).toEqual(['stackSlots', 'title'])
  })

  it('says "heuristic" when no model was involved', async () => {
    await addImportedProducts([gappy()])
    autopopulate.mockResolvedValue({ patch: { goals: ['muscle'] }, source: 'heuristic' })

    const result = await fillBlanks('cw-gappy')

    expect(result).toEqual({ filled: ['goals'], source: 'heuristic' })
    expect((await stored('cw-gappy'))!.review!.sources.goals).toBe('heuristic')
  })

  it('writes nothing when nothing is blank', async () => {
    const full = criticalWhey()
    await addImportedProducts([full])
    const before = await getPersistedProducts()
    autopopulate.mockResolvedValue({ patch: { goals: ['health'], shortReason: 'Other words.', stackSlots: ['health'] }, source: 'ai' })

    expect(await fillBlanks('critical-whey')).toEqual({ filled: [], source: 'ai' })
    expect(await getPersistedProducts()).toEqual(before)
  })

  it('adds no review to a product that had none', async () => {
    await addImportedProducts([{ ...criticalWhey(), goals: [] }])
    autopopulate.mockResolvedValue({ patch: { goals: ['muscle'] }, source: 'ai' })

    await fillBlanks('critical-whey')

    const after = (await stored('critical-whey'))!
    expect(after.goals).toEqual(['muscle'])
    expect(after.review).toBeUndefined()
  })

  it('refuses an id nobody holds, without asking the classifier', async () => {
    await expect(fillBlanks('no-such-product')).rejects.toBeInstanceOf(ProductNotFound)
    expect(autopopulate).not.toHaveBeenCalled()
  })
})
