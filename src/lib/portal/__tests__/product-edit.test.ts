/**
 * @jest-environment node
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { asPendingReview, fieldsNeedingReview, sourcesForImport } from '@/lib/catalogue/review'
import { listPriceFor } from '@/lib/pricing/list-price'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { kvSet } from '@/lib/db/kv'
import { clearPersistCache, writeJson } from '../persist'
import {
  ProductNotFound,
  addImportedProducts,
  getImportedProducts,
  getPersistedProducts,
  getProductOverride,
  importProducts,
  markProductRemoved,
  resetPortalPricing,
  setDataSourceSetting,
  setPortalPricingOverrides,
  setTopProductIds,
} from '../store'
import {
  EditRejected,
  applyEdit,
  approveProduct,
  getEditableProduct,
  listEditableProducts,
  productPayload,
  updateProduct,
  validateEdit,
  type ProductEdit,
} from '../product-edit'

/**
 * The hub's one way to read and change a product.
 *
 * What is worth pinning here is less "it saves" than everything the module
 * promises NOT to do: write half an edit, accept a field it has no rule for,
 * spread one SKU's serving count over its siblings, move a subscription plan a
 * founder set on purpose, or forget a flavour's old name.
 */

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** The sample catalogue's whey, exactly as the shop serves it in mock mode. */
const SAMPLE_WHEY = MOCK_CATALOGUE[0] as CatalogueProduct

let seq = 0

/**
 * A whey imported from PowerBody: the sample product's classification, with the
 * shape an import actually has — SKU codes, per-SKU servings, cost and pictures,
 * flavour names as titles, a stored master, and a plan that follows the master.
 */
function importedWhey(overrides: Partial<CatalogueProduct> = {}): CatalogueProduct {
  seq += 1
  const id = `impact-whey-${seq}`
  // A rating is only ever set from real reviews; a fresh import has none.
  const { rating: _rating, ...sample } = SAMPLE_WHEY
  void _rating
  const variants: CatalogueVariant[] = [
    {
      id: `${id}-chocolate`, title: 'Chocolate', flavour: 'Chocolate', size: '1kg', price: 34.99, compareAtPrice: 44.99,
      available: true, inventory: 42, sku: `MP-IW-CHOC-1KG-${seq}`, servings: 33, cost: 17.5,
      imageUrl: 'https://cdn.powerbody.co.uk/media/impact-whey-chocolate.jpg', supplierProductId: '41021',
    },
    {
      id: `${id}-vanilla`, title: 'Vanilla', flavour: 'Vanilla', size: '1kg', price: 33.99, compareAtPrice: null,
      available: true, inventory: 18, sku: `MP-IW-VAN-1KG-${seq}`, servings: 30, cost: 16.9,
      imageUrl: 'https://cdn.powerbody.co.uk/media/impact-whey-vanilla.jpg', supplierProductId: '41022',
    },
    {
      id: `${id}-chocolate-2500`, title: 'Chocolate', flavour: 'Chocolate', size: '2.5kg', price: 69.99, compareAtPrice: 79.99,
      available: true, inventory: 6, sku: `MP-IW-CHOC-2500-${seq}`, servings: 83, cost: 35,
    },
  ]
  return {
    ...sample,
    id,
    handle: id,
    title: 'Impact Whey Protein',
    brand: 'Myprotein',
    description: 'Whey protein concentrate with 21g of protein per serving.',
    imageUrl: 'https://cdn.powerbody.co.uk/media/impact-whey-chocolate.jpg',
    variants,
    defaultVariantId: variants[0].id,
    basePrice: 34.99,
    compareAtPrice: 44.99,
    cost: 17.5,
    servings: 33,
    consumption: { cadence: 'daily', servingsPerUnit: 33, anchor: 'post-workout' },
    supplierRrp: 39.99,
    weightGrams: 1150,
    vatRate: 0.2,
    supplierProductId: '41021',
    ...overrides,
  }
}

/** The same whey as it lands from an import: held for review, AI-classified. */
function pendingWhey(overrides: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return asPendingReview(
    importedWhey(overrides),
    sourcesForImport(['stackSlots', 'goals', 'shortReason'], true),
    '2026-10-01T09:00:00.000Z',
  )
}

const ids = (p: CatalogueProduct) => ({
  choc: p.variants[0].id,
  vanilla: p.variants[1].id,
  big: p.variants[2].id,
})

/** Store a product the way the import does and hand back the id it was given. */
async function seed(product: CatalogueProduct): Promise<string> {
  const [outcome] = await importProducts([product])
  expect(outcome.status).toBe('added')
  return outcome.id
}

async function stored(id: string): Promise<CatalogueProduct> {
  const found = (await getImportedProducts()).find((p) => p.id === id)
  if (!found) throw new Error(`nothing stored as ${id}`)
  return found
}

/** The reasons an edit is refused, or [] when it is accepted. */
function problemsOf(current: CatalogueProduct, edit: ProductEdit): string[] {
  try {
    validateEdit(current, edit)
    return []
  } catch (err) {
    if (err instanceof EditRejected) return err.problems
    throw err
  }
}

/** The patch value one product field validates to. */
function setValue(key: string, value: unknown, current: CatalogueProduct = importedWhey()): unknown {
  return (validateEdit(current, { set: { [key]: value } }).patch as Record<string, unknown>)[key]
}

const EMPTY_PRODUCTS = { overrides: {}, removedIds: [], imported: [], topProductIds: [] }

beforeEach(async () => {
  // Every test starts from an empty store and the sample catalogue.
  await writeJson('products', EMPTY_PRODUCTS)
  clearPersistCache()
  await setDataSourceSetting('mock')
})

afterAll(async () => {
  await writeJson('products', EMPTY_PRODUCTS)
  await setDataSourceSetting('mock')
})

// ── listEditableProducts ─────────────────────────────────────────────────────

describe('listEditableProducts', () => {
  it('in mock mode lists every sample product and every import, each with where it stands', async () => {
    const liveId = await seed(importedWhey())
    const pendingId = await seed(pendingWhey())
    const removedId = await seed(importedWhey())
    await markProductRemoved(removedId)
    await markProductRemoved('chrgd-creatine')

    const entries = await listEditableProducts()
    const byId = new Map(entries.map((e) => [e.product.id, e]))

    expect(entries).toHaveLength(MOCK_CATALOGUE.length + 3)
    expect(byId.get(liveId)).toMatchObject({ state: 'live', storage: 'imported' })
    expect(byId.get(pendingId)).toMatchObject({ state: 'pending', storage: 'imported' })
    expect(byId.get(removedId)).toMatchObject({ state: 'removed', storage: 'imported' })
    // A sample product can be removed too, and is still openable.
    expect(byId.get('chrgd-creatine')).toMatchObject({ state: 'removed', storage: 'base' })
    expect(byId.get('chrgd-whey-protein')).toMatchObject({ state: 'live', storage: 'base' })
  })

  it('in real mode lists only what was imported — the sample catalogue is not ours to sell', async () => {
    const liveId = await seed(importedWhey())
    const pendingId = await seed(pendingWhey())
    const removedId = await seed(importedWhey())
    await markProductRemoved(removedId)
    await setDataSourceSetting('real')

    const entries = await listEditableProducts()

    expect(entries.map((e) => e.product.id).sort()).toEqual([liveId, pendingId, removedId].sort())
    expect(entries.every((e) => e.storage === 'imported')).toBe(true)
    expect(Object.fromEntries(entries.map((e) => [e.product.id, e.state]))).toEqual({
      [liveId]: 'live',
      [pendingId]: 'pending',
      [removedId]: 'removed',
    })
  })

  it('a removed product that is also pending reads as removed', async () => {
    const id = await seed(pendingWhey())
    await markProductRemoved(id)
    expect((await getEditableProduct(id))?.state).toBe('removed')
  })

  it('lists an import that shares a sample product’s id once, as the import', async () => {
    await addImportedProducts([importedWhey({ id: 'chrgd-whey-protein', handle: 'chrgd-whey-protein', title: 'Imported Whey' })])

    const entries = await listEditableProducts()
    const matches = entries.filter((e) => e.product.id === 'chrgd-whey-protein')

    expect(entries).toHaveLength(MOCK_CATALOGUE.length)
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ storage: 'imported', product: { title: 'Imported Whey' } })
  })

  it('shows a sample product with the founder’s saved edits on it', async () => {
    await updateProduct('chrgd-creatine', { set: { title: 'CHRGD Creatine Monohydrate' } })
    const entry = await getEditableProduct('chrgd-creatine')
    expect(entry).toMatchObject({ storage: 'base', state: 'live', product: { title: 'CHRGD Creatine Monohydrate' } })
  })

  it('stamps a Top 25 rank only onto what is actually on sale', async () => {
    const pendingId = await seed(pendingWhey())
    const liveId = await seed(importedWhey())
    const removedId = await seed(importedWhey())
    await markProductRemoved(removedId)
    await setTopProductIds([pendingId, liveId, removedId])

    const entries = await listEditableProducts()
    const rank = (id: string) => entries.find((e) => e.product.id === id)?.product.topRank

    // Its place on the roster, not its place among the live ones.
    expect(rank(liveId)).toBe(2)
    expect(rank(pendingId)).toBeUndefined()
    expect(rank(removedId)).toBeUndefined()
  })

  it('getEditableProduct finds one product, or nothing for an id nobody has', async () => {
    const id = await seed(importedWhey())
    expect((await getEditableProduct(id))?.product.title).toBe('Impact Whey Protein')
    expect(await getEditableProduct('no-such-product')).toBeUndefined()
  })
})

// ── validateEdit ─────────────────────────────────────────────────────────────

describe('validateEdit — what a change may contain', () => {
  it('turns a good edit into a patch and says which fields actually change', () => {
    const whey = importedWhey()
    const { patch, changed, master } = validateEdit(whey, {
      set: { title: '  Impact Whey Isolate ', brand: 'Myprotein', goals: ['muscle', 'recovery'] },
    })
    expect(patch).toEqual({ title: 'Impact Whey Isolate', brand: 'Myprotein', goals: ['muscle', 'recovery'] })
    // The brand was sent as it already was: in the patch, not a change.
    expect(changed).toEqual(['title', 'goals'])
    expect(master).toBeNull()
  })

  it('a value that only differs by surrounding spaces is not a change', () => {
    const whey = importedWhey()
    expect(validateEdit(whey, { set: { title: '  Impact Whey Protein  ' } }).changed).toEqual([])
  })

  it('skips a field sent as undefined (what JSON drops anyway)', () => {
    const whey = importedWhey()
    expect(validateEdit(whey, { set: { title: undefined, brand: 'MP' } }).patch).toEqual({ brand: 'MP' })
  })

  it('accepts an empty edit as a no-op', () => {
    expect(validateEdit(importedWhey(), {})).toEqual({ patch: {}, changed: [], master: null })
  })

  it('refuses fields it has no rule for, including the ones kept off on purpose', () => {
    const whey = importedWhey()
    const guarded = ['id', 'handle', 'variants', 'basePrice', 'defaultVariantId', 'review', 'topRank', 'rating', 'servings', 'colour']
    const problems = problemsOf(whey, { set: Object.fromEntries(guarded.map((k) => [k, 'x'])) })
    expect(problems).toEqual(guarded.map((k) => `“${k}” can’t be changed here.`))
  })

  it('reports every problem in one refusal, not just the first', () => {
    const whey = importedWhey()
    let caught: unknown
    try {
      validateEdit(whey, {
        set: { title: '', swapGroup: 'protein-cheese', basePrice: 9.99 },
        variants: [{ id: 'gone' }],
        master: 'also-gone',
        confirm: ['price'],
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(EditRejected)
    const rejected = caught as EditRejected
    expect(rejected.name).toBe('EditRejected')
    expect(rejected.problems).toEqual([
      'Name can’t be empty.',
      'Swap group can’t be “protein-cheese”.',
      '“basePrice” can’t be changed here.',
      'There is no SKU “gone” on this product any more — reload the page.',
      'That SKU is not on this product any more — reload the page.',
      '“price” is not something to confirm.',
    ])
    expect(rejected.message).toBe(rejected.problems.join(' '))
  })

  describe('text', () => {
    it('requires a name and a category', () => {
      const whey = importedWhey()
      expect(problemsOf(whey, { set: { title: '   ', category: '' } })).toEqual(['Name can’t be empty.', 'Category can’t be empty.'])
      expect(problemsOf(whey, { set: { title: 42 } })).toEqual(['Name must be text.'])
    })

    it('lets description and card copy be blank', () => {
      expect(setValue('description', '  ')).toBe('')
      expect(setValue('shortReason', '')).toBe('')
    })

    it('clears an optional text field when it is blank or null', () => {
      expect(setValue('shortName', '   ')).toBeNull()
      expect(setValue('brand', null)).toBeNull()
      expect(setValue('shortName', ' Impact Whey ')).toBe('Impact Whey')
      expect(problemsOf(importedWhey(), { set: { brand: ['Myprotein'] } })).toEqual(['Brand must be text.'])
    })
  })

  describe('choices', () => {
    it('accepts only a known swap group, and never none', () => {
      const whey = importedWhey()
      expect(setValue('swapGroup', 'protein-clear')).toBe('protein-clear')
      expect(problemsOf(whey, { set: { swapGroup: 'protein-cheese' } })).toEqual(['Swap group can’t be “protein-cheese”.'])
      expect(problemsOf(whey, { set: { swapGroup: null } })).toEqual(['Swap group can’t be “null”.'])
    })

    it('lets the optional choices go back to auto with null', () => {
      expect(setValue('recommendationBasis', null)).toBeNull()
      expect(setValue('effectOnset', null)).toBeNull()
      expect(setValue('effectOnset', 'long')).toBe('long')
      expect([...problemsOf(importedWhey(), { set: { effectOnset: 'eventually', recommendationBasis: 3 } })].sort()).toEqual([
        'Keep-or-change advice can’t be “3”.',
        'When it is felt can’t be “eventually”.',
      ])
    })
  })

  describe('lists', () => {
    it('trims, drops blanks and de-duplicates', () => {
      expect(setValue('goals', [' muscle', 'recovery', '', 'muscle  '])).toEqual(['muscle', 'recovery'])
      expect(setValue('formats', ['powder', ' sachet '])).toEqual(['powder', 'sachet'])
    })

    it('names every value it does not know', () => {
      expect(problemsOf(importedWhey(), { set: { dietaryTags: ['vegan', 'paleo', 'carnivore'] } })).toEqual([
        'Dietary tags can’t include “paleo”, “carnivore”.',
      ])
      expect(problemsOf(importedWhey(), { set: { contraindications: ['pregnancy', 'nuts'] } })).toEqual([
        'Not for can’t include “nuts”.',
      ])
      expect(problemsOf(importedWhey(), { set: { stackSlots: ['protein', 'dessert'] } })).toEqual([
        'Stack slots can’t include “dessert”.',
      ])
    })

    it('refuses something that is not a list of words', () => {
      expect(problemsOf(importedWhey(), { set: { stackSlots: 'protein' } })).toEqual(['Stack slots must be a list.'])
      expect(problemsOf(importedWhey(), { set: { goals: ['muscle', 7] } })).toEqual(['Goals must be a list of words.'])
      expect(problemsOf(importedWhey(), { set: { warnings: null } })).toEqual(['Warnings must be a list.'])
    })

    it('lets free-form lists hold anything written', () => {
      expect(setValue('warnings', ['Contains milk.', 'Not for under 18s.'])).toEqual(['Contains milk.', 'Not for under 18s.'])
    })
  })

  describe('numbers', () => {
    it('reads numbers sent as text', () => {
      expect(setValue('recommendationPriority', '7')).toBe(7)
      expect(setValue('cost', '17.25')).toBe(17.25)
    })

    it('refuses what is not a number, or out of range, or not whole where it must be', () => {
      const whey = importedWhey()
      expect(problemsOf(whey, { set: { recommendationPriority: 'high' } })).toEqual(['Recommendation priority must be a number.'])
      expect(problemsOf(whey, { set: { recommendationPriority: true } })).toEqual(['Recommendation priority must be a number.'])
      expect(problemsOf(whey, { set: { recommendationPriority: 0 } })).toEqual(['Recommendation priority must be at least 1.'])
      expect(problemsOf(whey, { set: { marginPriority: 11 } })).toEqual(['Margin priority must be at most 10.'])
      expect(problemsOf(whey, { set: { recommendationPriority: 7.5 } })).toEqual(['Recommendation priority must be a whole number.'])
      expect(problemsOf(whey, { set: { minSubscriptionMonths: 25 } })).toEqual(['Minimum term must be at most 24.'])
      expect(problemsOf(whey, { set: { vatRate: 1.2 } })).toEqual(['VAT rate must be at most 1.'])
      expect(problemsOf(whey, { set: { cost: -1 } })).toEqual(['What we pay must be at least 0.'])
      expect(problemsOf(whey, { set: { weightGrams: 250_000 } })).toEqual(['Shipped weight must be at most 100000.'])
      expect(problemsOf(whey, { set: { cost: Infinity } })).toEqual(['What we pay must be a number.'])
    })

    it('needs a number where there is no "auto", and clears where there is', () => {
      const whey = importedWhey()
      expect(problemsOf(whey, { set: { recommendationPriority: null } })).toEqual(['Recommendation priority needs a number.'])
      expect(problemsOf(whey, { set: { marginPriority: '' } })).toEqual(['Margin priority needs a number.'])
      expect(setValue('minSubscriptionMonths', null)).toBeNull()
      expect(setValue('vatRate', '')).toBeNull()
    })

    it('reads a blank of only spaces as blank, never as zero', () => {
      // `Number('  ')` is 0. A VAT rate of 0 is zero-rated — a 20% error on the
      // whole margin — and a priority of 0 is a different complaint than "empty".
      expect(setValue('vatRate', '   ')).toBeNull()
      expect(problemsOf(importedWhey(), { set: { recommendationPriority: '  ' } })).toEqual([
        'Recommendation priority needs a number.',
      ])
    })

    it('reads 0 as "not known" for money and weight, rather than as a fact', () => {
      expect(setValue('cost', 0)).toBeNull()
      expect(setValue('supplierRrp', '0')).toBeNull()
      expect(setValue('compareAtPrice', 0)).toBeNull()
      // Below its minimum of 1 g — but 0 means "unknown", so it clears instead of failing.
      expect(setValue('weightGrams', 0)).toBeNull()
    })

    it('keeps a VAT rate of 0: zero-rated is a real rate', () => {
      expect(setValue('vatRate', 0)).toBe(0)
    })

    it('does not count a cleared 0 as a change on a product that never had one', () => {
      const { cost: _cost, ...noCost } = importedWhey()
      void _cost
      expect(validateEdit(noCost as CatalogueProduct, { set: { cost: 0 } }).changed).toEqual([])
    })
  })

  describe('yes/no', () => {
    it('takes only booleans, and null only where "unknown" is allowed', () => {
      const whey = importedWhey()
      expect(setValue('hasStimulants', true)).toBe(true)
      expect(problemsOf(whey, { set: { hasStimulants: 'yes' } })).toEqual(['Contains stimulants must be yes or no.'])
      expect(problemsOf(whey, { set: { subscriptionEligible: null } })).toEqual(['Subscription must be yes or no.'])
      expect(setValue('isSubscriptionOnly', null)).toBeNull()
      expect(setValue('restockingSoon', null)).toBeNull()
    })
  })

  describe('picture links', () => {
    it('accepts a web link or an uploaded picture, and blank clears it', () => {
      expect(setValue('imageUrl', ' https://cdn.powerbody.co.uk/media/x.jpg ')).toBe('https://cdn.powerbody.co.uk/media/x.jpg')
      expect(setValue('imageUrl', 'http://images.example.com/x.png')).toBe('http://images.example.com/x.png')
      expect(setValue('imageUrl', '/uploads/products/impact-whey.webp')).toBe('/uploads/products/impact-whey.webp')
      expect(setValue('imageUrl', '')).toBeNull()
      expect(setValue('imageUrl', null)).toBeNull()
    })

    it('refuses anything else', () => {
      const whey = importedWhey()
      const notALink = 'Picture must be a web link (https://…) or an uploaded picture.'
      expect(problemsOf(whey, { set: { imageUrl: 'www.powerbody.co.uk/x.jpg' } })).toEqual([notALink])
      expect(problemsOf(whey, { set: { imageUrl: 'ftp://files.example.com/x.jpg' } })).toEqual([notALink])
      expect(problemsOf(whey, { set: { imageUrl: 'javascript:alert(1)' } })).toEqual([notALink])
      expect(problemsOf(whey, { set: { imageUrl: 42 } })).toEqual(['Picture must be a link.'])
    })
  })

  describe('PowerBody product id', () => {
    it('takes digits only, as text', () => {
      expect(setValue('supplierProductId', 41021)).toBe('41021')
      expect(setValue('supplierProductId', ' 41021 ')).toBe('41021')
      expect(setValue('supplierProductId', '')).toBeNull()
      const wrong = 'PowerBody product id must be PowerBody’s numeric product id.'
      expect(problemsOf(importedWhey(), { set: { supplierProductId: 'MP-IW-CHOC' } })).toEqual([wrong])
      expect(problemsOf(importedWhey(), { set: { supplierProductId: '1234567890123' } })).toEqual([wrong])
      expect(problemsOf(importedWhey(), { set: { supplierProductId: 410.21 } })).toEqual([wrong])
    })
  })

  describe('how it is taken (consumption)', () => {
    it('keeps only the parts it knows, as numbers', () => {
      expect(
        setValue('consumption', {
          cadence: 'as-needed', servingsPerUnit: '30', asNeededTrigger: 'sweat', anchor: 'hot-days', daysPerWeek: '3', scoops: 2,
        }),
      ).toEqual({ cadence: 'as-needed', servingsPerUnit: 30, asNeededTrigger: 'sweat', anchor: 'hot-days', daysPerWeek: 3 })
    })

    it('null goes back to auto', () => {
      expect(setValue('consumption', null)).toBeNull()
    })

    it('refuses each wrong part with its own reason', () => {
      const whey = importedWhey()
      const daily = { cadence: 'daily', servingsPerUnit: 30 }
      expect(problemsOf(whey, { set: { consumption: [daily] } })).toEqual(['How it is taken is not in the right shape.'])
      expect(problemsOf(whey, { set: { consumption: 'daily' } })).toEqual(['How it is taken is not in the right shape.'])
      expect(problemsOf(whey, { set: { consumption: { ...daily, cadence: 'weekly' } } })).toEqual(['How it is taken: choose how it is taken.'])
      expect(problemsOf(whey, { set: { consumption: { cadence: 'daily' } } })).toEqual(['How it is taken: servings per unit must be above 0.'])
      expect(problemsOf(whey, { set: { consumption: { ...daily, servingsPerUnit: 0 } } })).toEqual(['How it is taken: servings per unit must be above 0.'])
      expect(problemsOf(whey, { set: { consumption: { ...daily, daysPerWeek: 8 } } })).toEqual(['How it is taken: days a week must be 1 to 7.'])
      expect(problemsOf(whey, { set: { consumption: { ...daily, daysPerWeek: 3.5 } } })).toEqual(['How it is taken: days a week must be 1 to 7.'])
      expect(problemsOf(whey, { set: { consumption: { ...daily, asNeededTrigger: 'boredom' } } })).toEqual(['How it is taken: unknown trigger.'])
      expect(problemsOf(whey, { set: { consumption: { ...daily, anchor: 'midnight' } } })).toEqual(['How it is taken: unknown time of day.'])
    })
  })

  describe('active ingredients', () => {
    it('drops unnamed rows, reads doses as numbers, and allows no dose', () => {
      expect(
        setValue('actives', [
          { name: ' Whey protein concentrate ', mg: '21000' },
          { name: 'Leucine', mg: 2300 },
          { name: 'Lactase', mg: '' },
          { name: 'Sucralose', mg: null },
          { name: '   ', mg: 5 },
          null,
        ]),
      ).toEqual([
        { name: 'Whey protein concentrate', mg: 21000 },
        { name: 'Leucine', mg: 2300 },
        { name: 'Lactase' },
        { name: 'Sucralose' },
      ])
      expect(setValue('actives', null)).toBeNull()
    })

    it('refuses a dose that is not a non-negative number, naming the ingredient', () => {
      expect(problemsOf(importedWhey(), { set: { actives: [{ name: 'Caffeine', mg: -200 }] } })).toEqual([
        'Active ingredients: “Caffeine” needs a dose in mg, or none.',
      ])
      expect(problemsOf(importedWhey(), { set: { actives: [{ name: 'Caffeine', mg: 'lots' }] } })).toEqual([
        'Active ingredients: “Caffeine” needs a dose in mg, or none.',
      ])
      expect(problemsOf(importedWhey(), { set: { actives: { name: 'Caffeine' } } })).toEqual(['Active ingredients must be a list.'])
    })
  })

  describe('monthly refill product', () => {
    it('may point at another product, or be cleared', () => {
      expect(setValue('subscriptionProductId', 'chrgd-whey-protein')).toBe('chrgd-whey-protein')
      expect(setValue('subscriptionProductId', '')).toBeNull()
    })

    it('may not point at the product itself, however it is spaced', () => {
      const whey = importedWhey()
      expect(problemsOf(whey, { set: { subscriptionProductId: whey.id } })).toEqual(['A product can’t be its own monthly refill.'])
      expect(problemsOf(whey, { set: { subscriptionProductId: `  ${whey.id} ` } })).toEqual(['A product can’t be its own monthly refill.'])
    })
  })

  describe('SKU edits', () => {
    it('refuses an edit for a SKU the product no longer has, or with no id at all', () => {
      const whey = importedWhey()
      expect(problemsOf(whey, { variants: [{ id: 'impact-whey-strawberry', title: 'Strawberry' }] })).toEqual([
        'There is no SKU “impact-whey-strawberry” on this product any more — reload the page.',
      ])
      expect(problemsOf(whey, { variants: [{ title: 'Strawberry' }, { id: 7 }, null as never] })).toEqual([
        'There is no SKU “(blank)” on this product any more — reload the page.',
        'There is no SKU “(blank)” on this product any more — reload the page.',
        'There is no SKU “(blank)” on this product any more — reload the page.',
      ])
    })

    it('refuses the whole edit when one SKU in it is unknown — nothing half-applies', () => {
      const whey = importedWhey()
      const { choc } = ids(whey)
      expect(() =>
        validateEdit(whey, { variants: [{ id: choc, title: 'Double Chocolate' }, { id: 'gone', title: 'x' }] }),
      ).toThrow(EditRejected)
    })

    it('refuses SKU fields that are owned elsewhere (price, code, stock)', () => {
      const whey = importedWhey()
      const { choc } = ids(whey)
      expect(problemsOf(whey, { variants: [{ id: choc, price: 29.99, sku: 'X', available: false, formerly: [] }] })).toEqual([
        'A SKU’s “price” can’t be changed here.',
        'A SKU’s “sku” can’t be changed here.',
        'A SKU’s “available” can’t be changed here.',
        'A SKU’s “formerly” can’t be changed here.',
      ])
    })

    it('names the SKU by its code in a problem, or by its title when it has none', () => {
      const whey = importedWhey()
      const [choc] = whey.variants
      expect(problemsOf(whey, { variants: [{ id: choc.id, servings: 0, imageUrl: 'choc.jpg', title: ' ' }] })).toEqual([
        `${choc.sku}: servings must be at least 0.01.`,
        `${choc.sku}: picture must be a web link (https://…) or an uploaded picture.`,
        `${choc.sku}: flavour or size name can’t be empty.`,
      ])
      const sampleSku = SAMPLE_WHEY.variants[0]
      expect(problemsOf(SAMPLE_WHEY, { variants: [{ id: sampleSku.id, cost: 'free' }] })).toEqual([
        'Chocolate Fudge / 1kg: what we pay must be a number.',
      ])
    })

    it('reads a SKU cost or "was" price of 0 as not known, and null servings as "not counted"', () => {
      const whey = importedWhey()
      const { vanilla } = ids(whey)
      const { patch } = validateEdit(whey, { variants: [{ id: vanilla, cost: 0, compareAtPrice: '0', servings: null }] })
      expect(patch.variants).toEqual([{ id: vanilla, cost: null, compareAtPrice: null, servings: null }])
    })

    it('drops a SKU edit that changes nothing, so "variants" is not reported as changed', () => {
      const whey = importedWhey()
      const { choc, vanilla } = ids(whey)
      const result = validateEdit(whey, {
        variants: [{ id: choc, title: 'Chocolate', servings: 33 }, { id: vanilla, compareAtPrice: 0 }],
      })
      expect(result.patch.variants).toBeUndefined()
      expect(result.changed).toEqual([])
    })

    it('keeps only the SKUs that actually change', () => {
      const whey = importedWhey()
      const { choc, vanilla } = ids(whey)
      const result = validateEdit(whey, { variants: [{ id: choc, servings: 33 }, { id: vanilla, servings: '32' }] })
      expect(result.patch.variants).toEqual([{ id: vanilla, servings: 32 }])
      expect(result.changed).toEqual(['variants'])
    })

    it('moves the flavour with the name, so a SKU is never called two things', () => {
      const whey = importedWhey()
      const { choc } = ids(whey)
      expect(validateEdit(whey, { variants: [{ id: choc, title: ' Chocolate Brownie ' }] }).patch.variants).toEqual([
        { id: choc, title: 'Chocolate Brownie', flavour: 'Chocolate Brownie' },
      ])
    })

    it('lets a flavour sent alongside the name win', () => {
      const whey = importedWhey()
      const { big } = ids(whey)
      expect(
        validateEdit(whey, { variants: [{ id: big, title: 'Chocolate · 2.5kg', flavour: 'Chocolate' }] }).patch.variants,
      ).toEqual([{ id: big, title: 'Chocolate · 2.5kg', flavour: 'Chocolate' }])
    })

    it('leaves a SKU with no flavour (a size or a count) without one', () => {
      const omega = MOCK_CATALOGUE.find((p) => p.id === 'chrgd-omega-3') as CatalogueProduct
      const [softgels] = omega.variants
      expect(validateEdit(omega, { variants: [{ id: softgels.id, title: '90 Capsules' }] }).patch.variants).toEqual([
        { id: softgels.id, title: '90 Capsules' },
      ])
    })

    it('does not rename the flavour when the name is sent back unchanged', () => {
      // The sample catalogue names a SKU "Chocolate Fudge / 1kg" and its
      // flavour "Chocolate Fudge". Re-sending the unchanged name alongside a
      // cost is not renaming anything.
      const [choc] = SAMPLE_WHEY.variants
      const result = validateEdit(SAMPLE_WHEY, { variants: [{ id: choc.id, title: choc.title, cost: 16 }] })
      expect(result.patch.variants).toEqual([{ id: choc.id, title: choc.title, cost: 16 }])
    })
  })

  describe('master', () => {
    it('names a SKU on this product', () => {
      const whey = importedWhey()
      expect(validateEdit(whey, { master: ids(whey).vanilla }).master).toBe(ids(whey).vanilla)
      expect(problemsOf(whey, { master: 'impact-whey-strawberry' })).toEqual([
        'That SKU is not on this product any more — reload the page.',
      ])
    })

    it('treats a null master as "no change"', () => {
      expect(validateEdit(importedWhey(), { master: null as never }).master).toBeNull()
    })
  })

  describe('confirm', () => {
    it('takes review fields only', () => {
      const whey = pendingWhey()
      expect(problemsOf(whey, { confirm: ['stackSlots', 'basePrice', 'warnings'] })).toEqual([])
      expect(problemsOf(whey, { confirm: ['brand', 'stackSlots'] })).toEqual(['“brand” is not something to confirm.'])
    })
  })
})

// ── applyEdit ────────────────────────────────────────────────────────────────

describe('applyEdit — a validated change, applied', () => {
  it('is pure: the product it is given is left exactly as it was', () => {
    const whey = pendingWhey()
    const before = JSON.stringify(whey)
    applyEdit(whey, {
      set: { title: 'Impact Whey Isolate', cost: 0 },
      variants: [{ id: ids(whey).choc, title: 'Double Chocolate', servings: 40 }],
      master: ids(whey).vanilla,
      confirm: ['swapGroup'],
    })
    expect(JSON.stringify(whey)).toBe(before)
  })

  it('throws the refusal rather than applying any of it', () => {
    expect(() => applyEdit(importedWhey(), { set: { title: 'Fine', swapGroup: 'nope' } })).toThrow(EditRejected)
  })

  it('clears optional fields that a blank or zero empties', () => {
    const whey = importedWhey({ shortName: 'Impact Whey', minSubscriptionMonths: 3 })
    const { product, changed } = applyEdit(whey, {
      set: { cost: 0, imageUrl: '', consumption: null, shortName: '', minSubscriptionMonths: null, weightGrams: 0 },
    })
    expect('cost' in product).toBe(false)
    expect(product.imageUrl).toBeNull()
    expect('consumption' in product).toBe(false)
    expect('shortName' in product).toBe(false)
    expect('minSubscriptionMonths' in product).toBe(false)
    expect('weightGrams' in product).toBe(false)
    expect(changed.sort()).toEqual(['consumption', 'cost', 'imageUrl', 'minSubscriptionMonths', 'shortName', 'weightGrams'])
  })

  describe('choosing the master', () => {
    it('moves the price, “was” price, picture, cost and servings onto the product', () => {
      const whey = importedWhey()
      const { vanilla } = ids(whey)
      const { product, changed } = applyEdit(whey, { master: vanilla })

      expect(product.defaultVariantId).toBe(vanilla)
      expect(product.basePrice).toBe(33.99)
      expect(product.compareAtPrice).toBeNull()
      expect(product.imageUrl).toBe('https://cdn.powerbody.co.uk/media/impact-whey-vanilla.jpg')
      expect(product.cost).toBe(16.9)
      expect(product.servings).toBe(30)
      expect(changed).toEqual(['defaultVariantId'])
    })

    it('does not spread the new master’s serving count over siblings of the same size', () => {
      // Choosing which flavour leads is not a statement that every flavour has
      // the same number of scoops.
      const whey = importedWhey()
      const { choc, vanilla, big } = ids(whey)
      const { product } = applyEdit(whey, { master: vanilla })
      const servings = Object.fromEntries(product.variants.map((v) => [v.id, v.servings]))
      expect(servings).toEqual({ [choc]: 33, [vanilla]: 30, [big]: 83 })
    })

    it('leaves the product’s picture alone when the new master has none of its own', () => {
      const whey = importedWhey()
      const { product } = applyEdit(whey, { master: ids(whey).big })
      expect(product.imageUrl).toBe(whey.imageUrl)
      expect(product.basePrice).toBe(69.99)
      expect(product.compareAtPrice).toBe(79.99)
      expect(product.servings).toBe(83)
    })

    it('choosing the master it already has changes nothing', () => {
      const whey = importedWhey()
      const { product, changed } = applyEdit(whey, { master: ids(whey).choc })
      expect(changed).toEqual([])
      expect(product).toEqual(whey)
    })
  })

  describe('the product’s serving count', () => {
    it('is the master SKU’s own count', () => {
      const whey = importedWhey()
      const { choc, vanilla, big } = ids(whey)
      const { product, changed } = applyEdit(whey, { variants: [{ id: choc, servings: 40 }] })
      expect(product.servings).toBe(40)
      // Set per SKU: the sibling of the same size keeps its own.
      expect(product.variants.find((v) => v.id === vanilla)?.servings).toBe(30)
      expect(product.variants.find((v) => v.id === big)?.servings).toBe(83)
      expect(changed).toEqual(['variants'])
    })

    it('does not move when a SKU that is not the master is recounted', () => {
      const whey = importedWhey()
      const { product } = applyEdit(whey, { variants: [{ id: ids(whey).vanilla, servings: 35 }] })
      expect(product.servings).toBe(33)
      expect(product.consumption?.servingsPerUnit).toBe(33)
    })

    it('reads the first SKU as the master when none is stored', () => {
      const whey = importedWhey({ defaultVariantId: undefined })
      const { product } = applyEdit(whey, { variants: [{ id: ids(whey).choc, servings: 36 }] })
      expect(product.servings).toBe(36)
    })

    it('keeps the product-level count when the master SKU stops knowing its own', () => {
      const whey = importedWhey()
      const { product } = applyEdit(whey, { variants: [{ id: ids(whey).choc, servings: null }] })
      expect('servings' in product.variants[0]).toBe(false)
      expect(product.servings).toBe(33)
    })

    it('corrects a stale product-level count on the next real edit', () => {
      const whey = importedWhey({ servings: 20 })
      const { product } = applyEdit(whey, { set: { brand: 'MyProtein' } })
      expect(product.servings).toBe(33)
    })
  })

  describe('the subscription plan follows the serving count', () => {
    it('moves with it when it was following', () => {
      const whey = importedWhey()
      const { product } = applyEdit(whey, { variants: [{ id: ids(whey).choc, servings: 40 }] })
      expect(product.consumption).toEqual({ cadence: 'daily', servingsPerUnit: 40, anchor: 'post-workout' })
    })

    it('moves with a new master', () => {
      const whey = importedWhey()
      const { product } = applyEdit(whey, { master: ids(whey).big })
      expect(product.consumption?.servingsPerUnit).toBe(83)
    })

    it('stays put when it was set on purpose to something else', () => {
      // Two scoops a day: 33 scoops last 16 days, and somebody said so.
      const whey = importedWhey({ consumption: { cadence: 'daily', servingsPerUnit: 16 } })
      const { product } = applyEdit(whey, { variants: [{ id: ids(whey).choc, servings: 40 }] })
      expect(product.servings).toBe(40)
      expect(product.consumption?.servingsPerUnit).toBe(16)
    })

    it('keeps the number a founder set in the same edit', () => {
      const whey = importedWhey()
      const { product } = applyEdit(whey, {
        set: { consumption: { cadence: 'daily', servingsPerUnit: 20 } },
        variants: [{ id: ids(whey).choc, servings: 40 }],
      })
      expect(product.consumption).toEqual({ cadence: 'daily', servingsPerUnit: 20 })
    })

    it('does not invent a plan for a product that has none', () => {
      const whey = importedWhey({ consumption: undefined })
      const { product } = applyEdit(whey, { variants: [{ id: ids(whey).choc, servings: 40 }] })
      expect(product.consumption).toBeUndefined()
    })
  })

  describe('renamed SKUs keep their old names on file', () => {
    it('notes the old labels on the renamed SKU only', () => {
      const whey = importedWhey()
      const { choc, vanilla } = ids(whey)
      const { product } = applyEdit(whey, { variants: [{ id: choc, title: 'Double Chocolate' }] })
      const renamed = product.variants.find((v) => v.id === choc)!
      expect(renamed).toMatchObject({ title: 'Double Chocolate', flavour: 'Double Chocolate' })
      expect(renamed.formerly).toEqual([{ productId: whey.id, labels: ['Chocolate', 'Chocolate · 1kg'] }])
      expect(product.variants.find((v) => v.id === vanilla)?.formerly).toBeUndefined()
    })

    it('adds to the note on a second rename instead of starting another', () => {
      const whey = importedWhey()
      const { choc } = ids(whey)
      const once = applyEdit(whey, { variants: [{ id: choc, title: 'Double Chocolate' }] }).product
      const twice = applyEdit(once, { variants: [{ id: choc, title: 'Triple Chocolate' }] }).product
      expect(twice.variants[0].formerly).toEqual([
        { productId: whey.id, labels: ['Chocolate', 'Chocolate · 1kg', 'Double Chocolate', 'Double Chocolate · 1kg'] },
      ])
    })

    it('leaves SKUs alone when only other fields change', () => {
      const whey = importedWhey()
      const { product } = applyEdit(whey, { set: { title: 'Impact Whey Isolate' }, variants: [{ id: ids(whey).choc, cost: 18 }] })
      expect(product.variants.every((v) => v.formerly === undefined)).toBe(true)
    })
  })

  describe('review provenance', () => {
    it('marks edited review fields as the founder’s, and confirmed', () => {
      const whey = pendingWhey()
      const { product } = applyEdit(whey, {
        set: { title: 'Impact Whey Protein 1kg', goals: ['muscle', 'recovery'], brand: 'MyProtein' },
      })
      expect(product.review?.sources.title).toBe('founder')
      expect(product.review?.sources.goals).toBe('founder')
      expect(product.review?.confirmed).toEqual(expect.arrayContaining(['title', 'goals']))
      // Not a review field, so nothing about it is recorded.
      expect(product.review?.confirmed).not.toContain('brand')
      expect(product.review?.sources.brand).toBeUndefined()
      // Everything else keeps where it came from.
      expect(product.review?.sources.stackSlots).toBe('ai')
      expect(product.review?.sources.swapGroup).toBe('heuristic')
      expect(product.review?.status).toBe('pending')
    })

    it('confirms without editing: the value and its source stay as they were', () => {
      const whey = pendingWhey()
      const { product, changed } = applyEdit(whey, { confirm: ['stackSlots', 'swapGroup'] })
      expect(changed).toEqual([])
      expect(product.stackSlots).toEqual(whey.stackSlots)
      expect(product.review?.confirmed).toEqual(['stackSlots', 'swapGroup'])
      expect(product.review?.sources.stackSlots).toBe('ai')
      expect(product.review?.sources.swapGroup).toBe('heuristic')
    })

    it('does not count a review field sent back unchanged as edited', () => {
      const whey = pendingWhey()
      const { product } = applyEdit(whey, { set: { goals: [...whey.goals], brand: 'MyProtein' } })
      expect(product.review?.sources.goals).toBe('ai')
      expect(product.review?.confirmed).toEqual([])
    })

    it('a SKU-only edit confirms nothing', () => {
      const whey = pendingWhey()
      const { product } = applyEdit(whey, { variants: [{ id: ids(whey).vanilla, cost: 17 }] })
      expect(product.review).toEqual(whey.review)
    })

    it('gives a product with no review record none', () => {
      const whey = importedWhey()
      const { product } = applyEdit(whey, { set: { title: 'Impact Whey Isolate' }, confirm: ['title'] })
      expect(product.review).toBeUndefined()
    })
  })
})

// ── updateProduct ────────────────────────────────────────────────────────────

describe('updateProduct', () => {
  it('saves a checked change and answers with the product as stored', async () => {
    const id = await seed(importedWhey())
    const { product, changed } = await updateProduct(id, {
      set: { title: 'Impact Whey Isolate', dietaryTags: ['gluten-free', 'vegetarian'] },
      variants: [{ id: `${id}-vanilla`, cost: 17.2 }],
    })

    expect(changed).toEqual(['title', 'dietaryTags', 'variants'])
    expect(product.title).toBe('Impact Whey Isolate')
    const saved = await stored(id)
    expect(saved).toEqual(product)
    expect(saved.dietaryTags).toEqual(['gluten-free', 'vegetarian'])
    expect(saved.variants[1].cost).toBe(17.2)
    expect((await getEditableProduct(id))?.product.title).toBe('Impact Whey Isolate')
  })

  it('writes nothing when nothing changed', async () => {
    // A product-level count out of step with its master SKU — the next REAL
    // edit corrects it (see applyEdit), but a save that changes nothing must
    // not quietly write that correction, or anything else.
    const id = await seed(pendingWhey({ servings: 20 }))
    const before = await stored(id)

    const { product, changed } = await updateProduct(id, { set: { title: before.title, goals: [...before.goals] } })

    expect(changed).toEqual([])
    expect(product).toEqual(before)
    expect(await stored(id)).toEqual(before)
  })

  it('refuses a wrong edit whole — the good parts are not saved either', async () => {
    const id = await seed(importedWhey())
    const before = await stored(id)

    await expect(
      updateProduct(id, { set: { title: 'Impact Whey Isolate', cost: -5 }, variants: [{ id: `${id}-vanilla`, servings: 31 }] }),
    ).rejects.toMatchObject({ name: 'EditRejected', problems: ['What we pay must be at least 0.'] })
    expect(await stored(id)).toEqual(before)
  })

  it('throws EditRejected (with every problem) as a class the route can recognise', async () => {
    const id = await seed(importedWhey())
    const attempt = updateProduct(id, { set: { title: '' }, master: 'gone' })
    await expect(attempt).rejects.toBeInstanceOf(EditRejected)
    await expect(attempt).rejects.toHaveProperty('problems', [
      'Name can’t be empty.',
      'That SKU is not on this product any more — reload the page.',
    ])
  })

  it('throws ProductNotFound for an id the store does not hold', async () => {
    await expect(updateProduct('impact-whey-nobody', { set: { title: 'X' } })).rejects.toBeInstanceOf(ProductNotFound)
  })

  it('saves a confirmation that changes no field', async () => {
    const id = await seed(pendingWhey())
    const { changed } = await updateProduct(id, { confirm: ['stackSlots'] })
    expect(changed).toEqual([])
    expect((await stored(id)).review?.confirmed).toEqual(['stackSlots'])
  })

  it('saves a master change and the servings, plan and price that follow it', async () => {
    const id = await seed(importedWhey())
    const { changed } = await updateProduct(id, { master: `${id}-vanilla` })
    const saved = await stored(id)
    expect(changed).toEqual(['defaultVariantId'])
    expect(saved).toMatchObject({ defaultVariantId: `${id}-vanilla`, basePrice: 33.99, servings: 30, cost: 16.9 })
    expect(saved.consumption?.servingsPerUnit).toBe(30)
    expect(saved.variants[0].servings).toBe(33)
  })

  it('saves a renamed flavour with its old name on file', async () => {
    const id = await seed(importedWhey())
    await updateProduct(id, { variants: [{ id: `${id}-chocolate`, title: 'Double Chocolate' }] })
    expect((await stored(id)).variants[0]).toMatchObject({
      title: 'Double Chocolate',
      flavour: 'Double Chocolate',
      formerly: [{ productId: id, labels: ['Chocolate', 'Chocolate · 1kg'] }],
    })
  })

  it('stores a sample product’s edit as the difference, and drops it when undone', async () => {
    // The sample product is already called "CHRGD Creatine Monohydrate".
    await updateProduct('chrgd-creatine', { set: { title: 'CHRGD Creatine 300g', hasStimulants: false } })
    expect(await getProductOverride('chrgd-creatine')).toEqual({ title: 'CHRGD Creatine 300g' })

    await updateProduct('chrgd-creatine', { set: { title: 'CHRGD Creatine Monohydrate' } })
    expect(await getProductOverride('chrgd-creatine')).toBeUndefined()
    expect((await getEditableProduct('chrgd-creatine'))?.product.title).toBe('CHRGD Creatine Monohydrate')
  })

  it('reads back a sample SKU’s serving count as it was saved, without spreading it over its siblings', async () => {
    // The product page edits servings per SKU. The write answers with the
    // siblings untouched; the read must say the same thing.
    const [choc, vanilla, straw] = SAMPLE_WHEY.variants
    const { product: written } = await updateProduct(SAMPLE_WHEY.id, { variants: [{ id: choc.id, servings: 40 }] })
    expect(written.variants.find((v) => v.id === vanilla.id)?.servings).toBeUndefined()

    const read = (await getEditableProduct(SAMPLE_WHEY.id))!.product
    expect(read.servings).toBe(40)
    expect(read.variants.find((v) => v.id === choc.id)?.servings).toBe(40)
    expect(read.variants.find((v) => v.id === vanilla.id)?.servings).toBeUndefined()
    expect(read.variants.find((v) => v.id === straw.id)?.servings).toBeUndefined()
  })
})

// ── approveProduct ───────────────────────────────────────────────────────────

describe('approveProduct', () => {
  it('refuses while any review field is unchecked, saying which, and leaves it pending', async () => {
    const id = await seed(pendingWhey())
    const expected = fieldsNeedingReview(await stored(id)).map((f) => f.key as string)

    const result = await approveProduct(id, 'founder@chrgd.dev')

    expect(result).toEqual({ ok: false, remaining: expected })
    expect(expected).toEqual(expect.arrayContaining(['basePrice', 'stackSlots', 'goals', 'swapGroup', 'shortReason']))
    // Supplier facts are not asked about.
    expect(expected).not.toContain('cost')
    expect((await stored(id)).review?.status).toBe('pending')
    expect((await getEditableProduct(id))?.state).toBe('pending')
  })

  it('approves once every field has been checked, by edit or by confirmation', async () => {
    const id = await seed(pendingWhey())
    const remaining = fieldsNeedingReview(await stored(id)).map((f) => f.key as string)

    // Two corrected, the rest looked at and left.
    await updateProduct(id, {
      set: { goals: ['muscle', 'recovery'], swapGroup: 'protein-whey' },
      confirm: remaining.filter((k) => k !== 'goals' && k !== 'swapGroup'),
    })
    // swapGroup was sent as it already was — so it still needed confirming.
    const stillLeft = await approveProduct(id, 'founder@chrgd.dev')
    expect(stillLeft).toEqual({ ok: false, remaining: ['swapGroup'] })

    await updateProduct(id, { confirm: ['swapGroup'] })
    expect(await approveProduct(id, 'founder@chrgd.dev')).toEqual({ ok: true })

    const saved = await stored(id)
    expect(saved.review).toMatchObject({ status: 'approved', approvedBy: 'founder@chrgd.dev' })
    expect(typeof saved.review?.approvedAt).toBe('string')
    expect(saved.review?.sources.goals).toBe('founder')
    expect((await getEditableProduct(id))?.state).toBe('live')
  })

  it('records no approver when none is known', async () => {
    const id = await seed(pendingWhey())
    await updateProduct(id, { confirm: fieldsNeedingReview(await stored(id)).map((f) => f.key as string) })
    expect(await approveProduct(id, null)).toEqual({ ok: true })
    const review = (await stored(id)).review!
    expect(review.status).toBe('approved')
    expect('approvedBy' in review).toBe(false)
  })

  it('leaves a product that is already on sale as it is', async () => {
    const id = await seed(importedWhey())
    const before = await stored(id)
    expect(await approveProduct(id, 'founder@chrgd.dev')).toEqual({ ok: true })
    expect(await stored(id)).toEqual(before)
  })

  it('throws ProductNotFound for an id the store does not hold', async () => {
    await expect(approveProduct('impact-whey-nobody', 'founder@chrgd.dev')).rejects.toBeInstanceOf(ProductNotFound)
  })
})

// ── productPayload ───────────────────────────────────────────────────────────

describe('productPayload', () => {
  afterEach(async () => {
    await resetPortalPricing()
  })

  it('is null for a product nobody has', async () => {
    expect(await productPayload('impact-whey-nobody')).toBeNull()
    expect(await productPayload('impact-whey-nobody', { fresh: true })).toBeNull()
  })

  it('carries everything the product page draws, for a product waiting on review', async () => {
    const id = await seed(pendingWhey())
    const payload = (await productPayload(id))!

    expect(Object.keys(payload).sort()).toEqual(
      ['heldBy', 'markupOnCost', 'priceRows', 'product', 'readiness', 'remaining', 'source', 'state', 'storage', 'usage', 'usageWarning'].sort(),
    )
    expect(payload).toMatchObject({ state: 'pending', storage: 'imported', source: 'mock' })
    expect(payload.product).toEqual(await stored(id))
    expect(payload.readiness.productId).toBe(id)
    expect(payload.remaining).toEqual(fieldsNeedingReview(payload.product).map((f) => f.key))
    expect(payload.usage).toEqual({ topRank: null, bundles: [], stacks: [] })
    expect(payload.usageWarning).toBeNull()
  })

  it('has nothing remaining for a product on sale', async () => {
    const id = await seed(importedWhey())
    expect((await productPayload(id))!.remaining).toEqual([])
  })

  it('prices every SKU on the server with the founder’s own markup', async () => {
    await setPortalPricingOverrides({ listPricing: { markupOnCost: 2.5 } } as Partial<PricingConfig>)
    const id = await seed(importedWhey())
    const payload = (await productPayload(id))!

    expect(payload.markupOnCost).toBe(2.5)
    expect(payload.priceRows.map((r) => r.variantId)).toEqual([`${id}-chocolate`, `${id}-vanilla`, `${id}-chocolate-2500`])
    const [choc, vanilla] = payload.priceRows
    expect(choc).toMatchObject({ price: 34.99, cost: 17.5, isMaster: true, rrp: 39.99, wasPrice: 44.99, manual: false })
    expect(vanilla).toMatchObject({ isMaster: false, wasPrice: null })
    // 17.50 × 2.5 = 43.75, down to .99.
    expect(getPricingConfig().listPricing.markupOnCost).toBe(2.5)
    expect(choc.rulePrice).toBe(listPriceFor(17.5, getPricingConfig()))
    expect(choc.rulePrice).toBe(42.99)
  })

  it('says where else the product is used', async () => {
    const id = await seed(importedWhey())
    await setTopProductIds(['chrgd-creatine', id])
    const payload = (await productPayload(id))!
    expect(payload.usage.topRank).toBe(2)
    expect(payload.usageWarning).toBe('Heads up: it is #2 on the Top 25.')
    expect(payload.product.topRank).toBe(2)
  })

  it('says which catalogue the shop is serving', async () => {
    const id = await seed(importedWhey())
    await setDataSourceSetting('real')
    expect((await productPayload(id))!.source).toBe('real')
    // A sample product is not openable in the real shop.
    expect(await productPayload('chrgd-creatine')).toBeNull()
  })

  it('finds a product another server has just created, even through a warm cache', async () => {
    await listEditableProducts() // warm this server's read cache
    const made = importedWhey({ title: 'Impact Whey — split off' })
    const doc = await getPersistedProducts()
    await kvSet('portal:products', { ...doc, imported: [...doc.imported, made] })

    expect((await productPayload(made.id))?.product.title).toBe('Impact Whey — split off')
  })

  it('with fresh, skips this server’s cached copy', async () => {
    const id = await seed(importedWhey())
    expect((await productPayload(id))!.product.title).toBe('Impact Whey Protein')

    // Another server renames it.
    const doc = await getPersistedProducts()
    await kvSet('portal:products', {
      ...doc,
      imported: doc.imported.map((p) => (p.id === id ? { ...p, title: 'Impact Whey Isolate' } : p)),
    })

    expect((await productPayload(id))!.product.title).toBe('Impact Whey Protein')
    expect((await productPayload(id, { fresh: true }))!.product.title).toBe('Impact Whey Isolate')
  })
})
