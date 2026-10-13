import {
  applyPatch,
  applyVariantEdits,
  composeOverride,
  diffProducts,
  foldOverride,
  isEmptyPatch,
  overrideFor,
  withoutDerived,
  type ProductPatch,
  type VariantEdit,
} from '../patch'
import { MOCK_CATALOGUE } from '../mock-catalogue'
import type { CatalogueProduct, CatalogueVariant } from '../types'

/**
 * The patch rules — how every writer changes a product.
 *
 * Each rule here exists because an edit used to vanish while the screen said
 * "Saved": a null that JSON dropped, a stale copy of the SKUs written back over
 * the supplier sync, a serving count written where the shop never reads it.
 */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** A patch as it arrives over JSON, where any field can be null. */
const asPatch = (p: Record<string, unknown>) => p as unknown as ProductPatch

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v)
  }
  return value
}

const CHOC_1KG = 'chrgd-whey-choc-1kg'
const VANILLA_1KG = 'chrgd-whey-vanilla-1kg'
const STRAW_1KG = 'chrgd-whey-straw-1kg'
const CHOC_2KG = 'chrgd-whey-choc-2kg'

/**
 * The sample whey as it looks once it has come in from PowerBody: every SKU
 * has a code, its own serving count (33 for the 1kg tubs, 66 for the 2kg), a
 * stock level and a cost, and the product has a master and a cost of its own.
 */
function whey(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  const base = clone(MOCK_CATALOGUE[0])
  return {
    ...base,
    id: 'pb-whey',
    handle: 'pb-whey',
    shortName: 'Whey Isolate',
    defaultVariantId: CHOC_1KG,
    cost: 18.2,
    weightGrams: 1150,
    vatRate: 0.2,
    supplierRrp: 39.99,
    supplierProductId: '88123',
    servings: 30,
    variants: base.variants.map((v, i) => ({
      ...v,
      sku: `PB-WHEY-${i + 1}`,
      inventory: 40 + i,
      servings: v.size === '2kg' ? 66 : 33,
      cost: v.size === '2kg' ? 31.5 : 18.2,
      supplierProductId: `8812${i}`,
    })),
    review: {
      status: 'approved',
      sources: { title: 'supplier', goals: 'ai' },
      confirmed: ['title', 'goals'],
      importedAt: '2026-09-01T10:00:00.000Z',
      approvedAt: '2026-09-02T09:30:00.000Z',
      approvedBy: 'founder@chrgd.co',
    },
    ...over,
  }
}

const byId = (p: CatalogueProduct, id: string) => p.variants.find((v) => v.id === id)!

describe('applyPatch', () => {
  it('never mutates the product it is given', () => {
    const product = deepFreeze(whey())
    const before = clone(product)
    applyPatch(product, asPatch({
      title: 'Renamed', shortName: null, imageUrl: null, servings: 25,
      variants: [{ id: VANILLA_1KG, title: 'Vanilla Bean / 1kg', inventory: null }],
    }))
    expect(product).toEqual(before)
  })

  it('sets the fields it names and leaves the rest as they are', () => {
    const product = whey()
    const out = applyPatch(product, { title: 'CHRGD Whey Isolate', goals: ['muscle'] })
    expect(out).toEqual({ ...product, title: 'CHRGD Whey Isolate', goals: ['muscle'] })
  })

  it('ignores undefined — a key JSON would drop anyway changes nothing', () => {
    const product = whey()
    expect(applyPatch(product, { shortName: undefined, cost: undefined })).toEqual(product)
  })

  it('never moves a product to a different id', () => {
    const out = applyPatch(whey(), asPatch({ id: 'something-else', title: 'T' }))
    expect(out.id).toBe('pb-whey')
    expect(out.title).toBe('T')
  })

  describe('null', () => {
    it('deletes an optional field — "Auto" really forgets what was set', () => {
      const product = whey({
        consumption: { cadence: 'daily', servingsPerUnit: 30 },
        minSubscriptionMonths: 3,
        recommendationBasis: 'objective',
        effectOnset: 'none',
        contraindications: ['medication'],
        actives: [{ name: 'protein', mg: 25000 }],
        restockingSoon: true,
        isSubscriptionOnly: false,
        subscriptionProductId: 'chrgd-whey-refill',
      })
      const cleared = [
        'shortName', 'brand', 'defaultVariantId', 'cost', 'subscriptionProductId', 'isSubscriptionOnly',
        'consumption', 'minSubscriptionMonths', 'recommendationBasis', 'effectOnset', 'weightGrams', 'vatRate',
        'supplierRrp', 'supplierProductId', 'contraindications', 'actives', 'rating', 'restockingSoon',
      ]
      for (const key of cleared) expect(product).toHaveProperty(key)

      const out = applyPatch(product, asPatch(Object.fromEntries(cleared.map((k) => [k, null]))))
      for (const key of cleared) expect(out).not.toHaveProperty(key)
      // Deleted, not stored as null — and nothing else moved.
      const rest = { ...product } as Record<string, unknown>
      for (const key of cleared) delete rest[key]
      expect(out).toEqual(rest)
    })

    it('keeps null as the value it already means on imageUrl and compareAtPrice', () => {
      const product = whey({ imageUrl: 'https://cdn.powerbody.co.uk/whey.jpg', compareAtPrice: 44.99 })
      const out = applyPatch(product, asPatch({ imageUrl: null, compareAtPrice: null }))
      expect(out).toHaveProperty('imageUrl', null)
      expect(out).toHaveProperty('compareAtPrice', null)
    })

    it('changes nothing on a required field — {review: null} must not put an import on sale', () => {
      const product = whey({ review: { status: 'pending', sources: {}, confirmed: [], importedAt: '2026-10-01T00:00:00.000Z' } })
      const out = applyPatch(product, asPatch({
        review: null, stackSlots: null, goals: null, title: null, description: null, swapGroup: null,
        basePrice: null, category: null, formats: null, dietaryTags: null, warnings: null, handle: null,
      }))
      expect(out).toEqual(product)
      expect(out.review?.status).toBe('pending')
    })

    it('a null serving count changes nothing — not the product, and not its SKUs', () => {
      // `servings` is required: a null there is not a value to spread. Spreading
      // the old product-level 30 over SKUs PowerBody counted at 33 would rewrite
      // supplier facts nobody asked to touch.
      const product = whey()
      const out = applyPatch(product, asPatch({ servings: null }))
      expect(out.servings).toBe(30)
      expect(out.variants.map((v) => v.servings)).toEqual([33, 33, 33, 66])
      expect(out).toEqual(product)
    })
  })

  describe('variants are edits by id', () => {
    it('touches only the fields an edit names, on the SKU it names', () => {
      const product = whey()
      const out = applyPatch(product, { variants: [{ id: VANILLA_1KG, title: 'Vanilla Bean / 1kg' }] })
      expect(byId(out, VANILLA_1KG)).toEqual({ ...byId(product, VANILLA_1KG), title: 'Vanilla Bean / 1kg' })
      // The SKUs nobody named are the very same objects.
      for (const id of [CHOC_1KG, STRAW_1KG, CHOC_2KG]) expect(byId(out, id)).toBe(byId(product, id))
    })

    it('does not write a screen\'s stale copy over what the sync wrote since', () => {
      const loaded = whey()
      // The supplier sync moved stock and cost after the screen loaded.
      const current = {
        ...loaded,
        variants: loaded.variants.map((v) => ({ ...v, inventory: 3, cost: 19.1 })),
      }
      // The screen sends back only what the founder changed.
      const out = applyPatch(current, { variants: [{ id: CHOC_1KG, price: 36.99 }] })
      expect(byId(out, CHOC_1KG)).toMatchObject({ price: 36.99, inventory: 3, cost: 19.1 })
      expect(out.variants.every((v) => v.inventory === 3)).toBe(true)
    })

    it('never adds, removes or reorders a SKU', () => {
      const product = whey()
      const out = applyPatch(product, {
        variants: [
          { id: CHOC_2KG, title: 'Chocolate / 2kg' },
          { id: 'brand-new-sku', title: 'Cookies & Cream / 1kg', price: 34.99 },
        ],
      })
      expect(out.variants.map((v) => v.id)).toEqual([CHOC_1KG, VANILLA_1KG, STRAW_1KG, CHOC_2KG])
      expect(byId(out, CHOC_2KG).title).toBe('Chocolate / 2kg')
    })

    it('an empty list of edits leaves the SKUs alone', () => {
      const product = whey()
      expect(applyPatch(product, { variants: [] }).variants).toBe(product.variants)
    })

    it('null clears an optional SKU field and keeps null as a value on flavour, size and compareAtPrice', () => {
      const product = whey()
      const target = byId(product, VANILLA_1KG)
      const withExtras: CatalogueVariant = {
        ...target,
        imageUrl: 'https://cdn.powerbody.co.uk/vanilla.jpg',
        priceSource: 'founder',
        formerly: [{ productId: 'old-whey', labels: ['Vanilla'] }],
      }
      const start = { ...product, variants: product.variants.map((v) => (v.id === VANILLA_1KG ? withExtras : v)) }

      const out = applyPatch(start, asPatch({
        variants: [{
          id: VANILLA_1KG,
          inventory: null, servings: null, imageUrl: null, cost: null, priceSource: null,
          supplierProductId: null, formerly: null,
          flavour: null, size: null, compareAtPrice: null,
          title: null, price: null, available: null,
        }],
      }))
      const v = byId(out, VANILLA_1KG)
      for (const key of ['inventory', 'servings', 'imageUrl', 'cost', 'priceSource', 'supplierProductId', 'formerly']) {
        expect(v).not.toHaveProperty(key)
      }
      expect(v).toMatchObject({ flavour: null, size: null, compareAtPrice: null })
      // Required fields: a null is not a value for them.
      expect(v).toMatchObject({ id: VANILLA_1KG, title: target.title, price: target.price, available: true, sku: target.sku })
    })

    it('an unknown id is ignored', () => {
      const product = whey()
      expect(applyPatch(product, { variants: [{ id: 'nope', price: 1 }] })).toEqual(product)
    })
  })

  describe('servings spread over the master\'s size', () => {
    it('writes the count to the master and every sibling of the same size, nothing else', () => {
      const out = applyPatch(whey(), { servings: 28 })
      expect(out.servings).toBe(28)
      // Three 1kg tubs take it; the 2kg tub is a different unit and keeps 66.
      expect(out.variants.map((v) => v.servings)).toEqual([28, 28, 28, 66])
    })

    it('overrides a count the SKU already had — a founder typing it is what it means', () => {
      const out = applyPatch(whey(), { servings: 33 + 1 })
      expect(byId(out, CHOC_1KG).servings).toBe(34)
    })

    it('follows the master the product presents as', () => {
      const out = applyPatch(whey({ defaultVariantId: CHOC_2KG }), { servings: 70 })
      expect(out.variants.map((v) => v.servings)).toEqual([33, 33, 33, 70])
    })

    it('is skipped with spreadServings: false', () => {
      const product = whey()
      const out = applyPatch(product, { servings: 28 }, { spreadServings: false })
      expect(out.servings).toBe(28)
      expect(out.variants).toBe(product.variants)
    })

    it('does not spread when the patch says nothing about servings', () => {
      const product = whey({ servings: 12 })
      expect(applyPatch(product, { title: 'x' }).variants).toBe(product.variants)
    })
  })
})

describe('applyVariantEdits', () => {
  const variants = whey().variants

  it('returns the very same list when there are no edits', () => {
    expect(applyVariantEdits(variants, [])).toBe(variants)
  })

  it('matches by SKU code when the edit\'s id is unknown, and keeps the stored id', () => {
    // A screen that loaded before a re-import gave the SKUs new ids.
    const out = applyVariantEdits(variants, [{ id: 'whey-vanilla-old', sku: 'PB-WHEY-2', title: 'Vanilla Bean / 1kg' }])
    expect(out[1]).toEqual({ ...variants[1], title: 'Vanilla Bean / 1kg' })
    expect(out[1].id).toBe(VANILLA_1KG)
  })

  it('never applies an edit to a different SKU by code when its id names one that exists', () => {
    // The edit is for the chocolate SKU (it re-codes it); vanilla, whose code it
    // carries, must not pick it up too.
    const out = applyVariantEdits(variants, [{ id: CHOC_1KG, sku: 'PB-WHEY-2', title: 'Chocolate Fudge / 1kg' }])
    expect(out[0]).toMatchObject({ id: CHOC_1KG, sku: 'PB-WHEY-2' })
    expect(out[1]).toBe(variants[1])
  })

  it('prefers the id match over a code match', () => {
    const edits: VariantEdit[] = [
      { id: 'stray', sku: 'PB-WHEY-1', title: 'by code' },
      { id: CHOC_1KG, title: 'by id' },
    ]
    expect(applyVariantEdits(variants, edits)[0].title).toBe('by id')
  })

  it('does not match a SKU-less variant to an edit without a code', () => {
    const noCodes = variants.map((v) => ({ ...v, sku: null }))
    const out = applyVariantEdits(noCodes, [{ id: 'stray', title: 'x' }])
    expect(out).toEqual(noCodes)
  })
})

describe('withoutDerived', () => {
  it('drops topRank, which the resolver works out on read', () => {
    const product = deepFreeze(whey({ topRank: 3 }))
    const out = withoutDerived(product)
    expect(out).not.toHaveProperty('topRank')
    expect(product.topRank).toBe(3)
  })

  it('drops a null or undefined topRank key too', () => {
    expect(withoutDerived(whey({ topRank: null }))).not.toHaveProperty('topRank')
    expect(withoutDerived(whey({ topRank: undefined }))).not.toHaveProperty('topRank')
  })

  it('hands back the same object when there is nothing to drop', () => {
    const product = whey()
    expect(withoutDerived(product)).toBe(product)
  })
})

describe('foldOverride', () => {
  const RATIO = 0.55

  /**
   * An override written by the old product page: the founder renamed things,
   * and the page saved with it a frozen copy of every SKU as it was then.
   */
  function oldOverride(record: CatalogueProduct, over: Partial<CatalogueProduct> = {}): Partial<CatalogueProduct> {
    return {
      title: 'CHRGD Whey Isolate',
      shortName: 'Whey',
      goals: ['muscle', 'recovery'],
      basePrice: 32.99,
      variants: record.variants.map((v) => ({
        ...v,
        price: 32.99,
        inventory: 120,
        cost: 9.99,
        servings: 30,
        imageUrl: 'https://old.example/frozen.jpg',
        available: false,
        compareAtPrice: 99,
      })),
      ...over,
    }
  }

  it('never mutates the record or the override', () => {
    const record = deepFreeze(whey())
    const override = deepFreeze(oldOverride(record, { servings: 25, cost: 12 }))
    const before = clone({ record, override })
    foldOverride(record, override, { costRatio: RATIO })
    expect({ record, override }).toEqual(before)
  })

  it('an empty override leaves the record as it is', () => {
    const record = whey()
    expect(foldOverride(record, {}, { costRatio: RATIO })).toEqual(record)
  })

  it('takes product-level fields from the override — it is what somebody chose', () => {
    const record = whey()
    const out = foldOverride(record, { title: 'CHRGD Whey Isolate', shortName: 'Whey', goals: ['muscle'], description: 'Founder copy.' })
    expect(out).toMatchObject({ title: 'CHRGD Whey Isolate', shortName: 'Whey', goals: ['muscle'], description: 'Founder copy.' })
    expect(out.id).toBe('pb-whey')
  })

  it('applies the override\'s nulls by the patch rules', () => {
    const record = whey()
    const out = foldOverride(record, asPatch({ shortName: null, imageUrl: null, review: null, servings: null, id: 'elsewhere' }) as Partial<CatalogueProduct>)
    expect(out).not.toHaveProperty('shortName')
    expect(out).toHaveProperty('imageUrl', null)
    // `review: null` changes nothing. The short name the founder cleared is
    // recorded as theirs; the picture was already none, so nothing changed.
    expect(out.review).toEqual({ ...record.review, sources: { ...record.review!.sources, shortName: 'founder' } })
    expect(out.servings).toBe(30)
    expect(out.id).toBe('pb-whey')
  })

  describe('variants', () => {
    it('lets the record decide which SKUs exist and in what order', () => {
      const record = whey()
      // Since the override was saved: the 2kg was split onto its own product,
      // and a new flavour arrived from the supplier.
      const now = {
        ...record,
        variants: [
          ...record.variants.filter((v) => v.id !== CHOC_2KG),
          { ...record.variants[0], id: 'chrgd-whey-cookies-1kg', title: 'Cookies / 1kg', flavour: 'Cookies', sku: 'PB-WHEY-9' },
        ],
      }
      const override = oldOverride(record)
      override.variants = [...override.variants!].reverse()

      const out = foldOverride(now, override)
      expect(out.variants.map((v) => v.id)).toEqual([CHOC_1KG, VANILLA_1KG, STRAW_1KG, 'chrgd-whey-cookies-1kg'])
    })

    it('takes only the names from the frozen copy — price, stock, cost, servings and picture stay the record\'s', () => {
      const record = whey()
      const override = oldOverride(record)
      override.variants = override.variants!.map((v) => ({ ...v, title: `${v.title} (renamed)`, flavour: `${v.flavour} Deluxe` }))

      const out = foldOverride(record, override)
      out.variants.forEach((v, i) => {
        const was = record.variants[i]
        expect(v).toEqual({ ...was, title: `${was.title} (renamed)`, flavour: `${was.flavour} Deluxe` })
      })
    })

    it('does not blank a name with an empty title, and keeps a flavour the copy cleared', () => {
      const record = whey()
      const override = oldOverride(record)
      override.variants = override.variants!.map((v) => ({ ...v, title: '', flavour: null }))
      const out = foldOverride(record, override)
      expect(out.variants.map((v) => v.title)).toEqual(record.variants.map((v) => v.title))
      expect(out.variants.every((v) => v.flavour === null)).toBe(true)
    })

    it('finds a SKU by code when the copy knew it under another id', () => {
      const record = whey()
      const out = foldOverride(record, {
        variants: [{ ...record.variants[1], id: 'whey-vanilla-old', title: 'Vanilla Bean / 1kg' }],
      })
      expect(byId(out, VANILLA_1KG).title).toBe('Vanilla Bean / 1kg')
      expect(byId(out, CHOC_1KG).title).toBe(record.variants[0].title)
    })

    it('puts the shelf price back on the master SKU, whose price now comes from the record', () => {
      const record = whey()
      // Record master price moved to 36.99 since the override froze 32.99.
      const now = { ...record, basePrice: 36.99, variants: record.variants.map((v, i) => (i === 0 ? { ...v, price: 36.99, compareAtPrice: 46.99 } : v)) }
      const out = foldOverride(now, oldOverride(record))
      expect(out.basePrice).toBe(36.99)
      expect(out.compareAtPrice).toBe(46.99)
    })

    it('reads the master from the override\'s choice of default SKU', () => {
      const record = whey()
      const out = foldOverride(record, oldOverride(record, { defaultVariantId: CHOC_2KG }))
      expect(out.defaultVariantId).toBe(CHOC_2KG)
      expect(out.basePrice).toBe(byId(record, CHOC_2KG).price)
    })

    it('without a copy of the SKUs, the override\'s price stands like any other field', () => {
      const record = whey()
      const out = foldOverride(record, { basePrice: 29.99 })
      expect(out.basePrice).toBe(29.99)
      expect(out.variants).toEqual(record.variants)
    })
  })

  describe('cost', () => {
    it('keeps a positive record cost — the sync keeps it current', () => {
      const out = foldOverride(whey({ cost: 18.2 }), { cost: 12 }, { costRatio: RATIO })
      expect(out.cost).toBe(18.2)
    })

    it('takes the override\'s cost when the record has none, or a zero', () => {
      expect(foldOverride(whey({ cost: undefined }), { cost: 12 }, { costRatio: RATIO }).cost).toBe(12)
      expect(foldOverride(whey({ cost: 0 }), { cost: 12 }, { costRatio: RATIO }).cost).toBe(12)
    })

    it('drops a cost that is only price × the default ratio, to the penny', () => {
      // 34.99 × 0.55 = 19.2445 → the old editor's 19.24.
      const record = whey({ cost: undefined })
      const estimated = foldOverride(record, { cost: 19.24 }, { costRatio: RATIO })
      expect(estimated.cost).toBeUndefined()
      // A penny off is a real number somebody typed.
      expect(foldOverride(record, { cost: 19.25 }, { costRatio: RATIO }).cost).toBe(19.25)
    })

    it('treats nothing as an estimate when no ratio is given', () => {
      expect(foldOverride(whey({ cost: undefined }), { cost: 19.24 }).cost).toBe(19.24)
    })

    it('recognises the estimate against the price the override was saved at, after the record\'s price moved', () => {
      // Saved at 34.99, so the editor sent 34.99 × 0.55 = 19.24 as "cost". The
      // master's price has since moved to 36.99 on the record; that estimate is
      // still not a cost anybody chose.
      const record = whey({ cost: undefined })
      const now = { ...record, basePrice: 36.99, variants: record.variants.map((v, i) => (i === 0 ? { ...v, price: 36.99 } : v)) }
      const override = { ...oldOverride(record), basePrice: 34.99, cost: 19.24 }
      const out = foldOverride(now, override, { costRatio: RATIO })
      expect(out.basePrice).toBe(36.99)
      expect(out.cost).toBeUndefined()
    })

    it('a null cost clears a cost the record does not really have, never a positive one', () => {
      expect(foldOverride(whey({ cost: 0 }), asPatch({ cost: null }) as Partial<CatalogueProduct>)).not.toHaveProperty('cost')
      expect(foldOverride(whey({ cost: 18.2 }), asPatch({ cost: null }) as Partial<CatalogueProduct>).cost).toBe(18.2)
    })
  })

  describe('servings', () => {
    it('spreads the founder\'s count only onto SKUs that do not know their own', () => {
      const record = whey()
      // PowerBody counted the chocolate tub; the other two 1kg tubs are unknown.
      const now = {
        ...record,
        variants: record.variants.map((v) => (v.id === VANILLA_1KG || v.id === STRAW_1KG ? { ...v, servings: undefined } : v)),
      }
      const out = foldOverride(now, { servings: 30 })
      expect(out.servings).toBe(30)
      expect(out.variants.map((v) => v.servings)).toEqual([33, 30, 30, 66])
    })

    it('spreads over the STORED master\'s size, not whichever SKU is in stock today', () => {
      // Glycine: the stored master is the 100-cap bottle, out of stock today.
      const glycine = whey({
        defaultVariantId: 'caps',
        variants: [
          { id: 'caps', title: '100 vcaps', flavour: null, size: '100 caps', price: 14.99, compareAtPrice: null, available: false, sku: 'PB-GLY-1' },
          { id: 'powder', title: 'Pure Powder', flavour: null, size: '454 grams', price: 39.99, compareAtPrice: null, available: true, sku: 'PB-GLY-2' },
        ],
      })
      const out = foldOverride(glycine, { servings: 33 })
      expect(byId(out, 'caps').servings).toBe(33)
      expect(byId(out, 'powder')).not.toHaveProperty('servings')
    })

    it('spreads a count the founder TYPED over SKUs PowerBody had counted, as the read path did', () => {
      // PowerBody said 12 a tub; a founder corrected it to 20 in the old editor.
      // Before the fold the shelf (and the per-serving price) said 20.
      const record = whey({ servings: 12, variants: whey().variants.map((v) => ({ ...v, servings: v.size === '2kg' ? 24 : 12 })) })
      const out = foldOverride(record, { servings: 20 })
      expect(out.servings).toBe(20)
      expect(out.variants.map((v) => v.servings)).toEqual([20, 20, 20, 24])
      // …recorded as the founder's on each SKU it set, so a pull keeps it.
      expect(out.variants.map((v) => v.servingsSource ?? null)).toEqual(['founder', 'founder', 'founder', null])
      expect(out.review?.sources.servings).toBe('founder')
    })

    it('a count the old editor only re-sent fills unknown SKUs and is nobody’s', () => {
      const record = whey({ servings: 30 })
      const out = foldOverride(record, { servings: 30 })
      expect(out.variants.map((v) => v.servings)).toEqual([33, 33, 33, 66])
      expect(out.variants.every((v) => v.servingsSource === undefined)).toBe(true)
      expect(out.review?.sources.servings).toBeUndefined()
    })

    it('does not spread when the override says nothing about servings', () => {
      const record = whey({ variants: whey().variants.map((v) => ({ ...v, servings: undefined })) })
      const out = foldOverride(record, { title: 'x' })
      expect(out.variants).toEqual(record.variants)
    })
  })

  describe('provenance', () => {
    it('records what the override changed as the founder’s, so a pull does not put PowerBody’s back', () => {
      const record = whey({
        category: 'Whey Protein',
        review: { ...whey().review!, sources: { title: 'supplier', category: 'supplier', vatRate: 'supplier', goals: 'ai' } },
      })
      const out = foldOverride(record, { category: 'Protein', vatRate: 0, goals: ['muscle'] })
      expect(out.review?.sources).toEqual({ title: 'supplier', category: 'founder', vatRate: 'founder', goals: 'founder' })
      // Nothing else about the review moves: still approved, by the same person.
      expect(out.review).toMatchObject({ status: 'approved', approvedBy: 'founder@chrgd.co', confirmed: ['title', 'goals'] })
    })

    it('leaves a field the override only repeated as whoever’s it was', () => {
      const record = whey({ review: { ...whey().review!, sources: { title: 'supplier' } } })
      const out = foldOverride(record, { title: record.title, vatRate: record.vatRate })
      expect(out.review?.sources).toEqual({ title: 'supplier' })
    })

    it('records a cost it took, and not one it dropped as an estimate', () => {
      const taken = foldOverride(whey({ cost: 0 }), { cost: 12 }, { costRatio: RATIO })
      expect(taken.review?.sources.cost).toBe('founder')
      const record = whey({ cost: 0, basePrice: 30 })
      const estimate = foldOverride(record, { cost: Math.round(30 * RATIO * 100) / 100 }, { costRatio: RATIO })
      expect(estimate.review?.sources.cost).toBeUndefined()
    })

    it('a record with no review gets none', () => {
      expect(foldOverride(whey({ review: undefined }), { category: 'Protein' }).review).toBeUndefined()
    })
  })

  it('never stores topRank, wherever it came from', () => {
    expect(foldOverride(whey({ topRank: 2 }), {})).not.toHaveProperty('topRank')
    expect(foldOverride(whey(), { topRank: 4 })).not.toHaveProperty('topRank')
  })
})

describe('overrideFor + composeOverride (the sample catalogue)', () => {
  const base = MOCK_CATALOGUE[0]
  /** What the store does with an override: JSON in, JSON out. */
  const stored = (o: Partial<CatalogueProduct>) => clone(o)

  it('is empty when nothing changed', () => {
    expect(overrideFor(base, clone(base))).toEqual({})
  })

  it('holds only the fields that changed', () => {
    const next = applyPatch(base, { shortName: 'Whey', goals: ['muscle'] })
    expect(overrideFor(base, next)).toEqual({ shortName: 'Whey', goals: ['muscle'] })
  })

  it('never holds the id or a topRank', () => {
    const next = { ...base, id: 'moved', topRank: 1, title: 'T' }
    expect(overrideFor(base, next)).toEqual({ title: 'T' })
    expect(overrideFor({ ...base, topRank: 5 }, base)).toEqual({})
  })

  it('stores a dropped field as null, so the read path drops it too', () => {
    const next = applyPatch(base, asPatch({ brand: null }))
    const override = overrideFor(base, next)
    expect(override).toEqual({ brand: null })
    expect(composeOverride(base, stored(override))).not.toHaveProperty('brand')
  })

  it('treats a field set to undefined as dropped — JSON would otherwise lose the edit', () => {
    const next = { ...base, brand: undefined }
    const override = overrideFor(base, next)
    expect(override).toEqual({ brand: null })
    expect(composeOverride(base, stored(override))).not.toHaveProperty('brand')
  })

  it('round-trips an edit through the store', () => {
    const next = applyPatch(base, asPatch({
      title: 'CHRGD Whey', shortName: 'Whey', brand: null, imageUrl: 'https://cdn/whey.jpg', compareAtPrice: null,
      variants: [{ id: VANILLA_1KG, price: 32.99 }],
    }))
    const composed = composeOverride(base, stored(overrideFor(base, next)))
    expect(composed).toEqual(next)
  })

  it('a SKU edit stores the whole SKU list, which the read path puts back as it is', () => {
    const next = applyPatch(base, { variants: [{ id: CHOC_2KG, available: false }] })
    const override = overrideFor(base, next)
    expect(Object.keys(override)).toEqual(['variants'])
    expect(composeOverride(base, stored(override)).variants).toEqual(next.variants)
  })

  it('composeOverride clears by the patch rules and leaves the base alone', () => {
    const frozen = deepFreeze(clone(base))
    const out = composeOverride(frozen, asPatch({ brand: null, imageUrl: null, stackSlots: null, review: null, title: 'T' }) as Partial<CatalogueProduct>)
    expect(out).not.toHaveProperty('brand')
    expect(out).toHaveProperty('imageUrl', null)
    expect(out.stackSlots).toEqual(base.stackSlots)
    expect(out.title).toBe('T')
    expect(frozen).toEqual(clone(base))
  })
})

describe('diffProducts', () => {
  it('is empty when nothing changed', () => {
    const patch = diffProducts(whey(), whey())
    expect(patch).toEqual({})
    expect(isEmptyPatch(patch)).toBe(true)
  })

  it('names only the product fields that changed, with null for one that was dropped', () => {
    const before = whey()
    const after = { ...whey({ title: 'CHRGD Whey Isolate' }), shortName: undefined } as CatalogueProduct
    delete (after as Partial<CatalogueProduct>).brand
    expect(diffProducts(before, after)).toEqual({ title: 'CHRGD Whey Isolate', shortName: null, brand: null })
  })

  it('never names the id or topRank', () => {
    expect(diffProducts(whey(), whey({ id: 'x', topRank: 1 }))).toEqual({})
  })

  it('names SKU fields by id, only the ones that changed', () => {
    const before = whey()
    const after = whey()
    after.variants[1] = { ...after.variants[1], price: 32.99 }
    delete after.variants[3].imageUrl
    after.variants[3] = { ...after.variants[3], inventory: undefined }
    const patch = diffProducts(before, after)
    expect(patch).toEqual({ variants: [{ id: VANILLA_1KG, price: 32.99 }, { id: CHOC_2KG, inventory: null }] })
    expect(isEmptyPatch(patch)).toBe(false)
  })

  it('ignores SKUs added or removed — that is not a patch', () => {
    const before = whey()
    const after = { ...before, variants: [...before.variants.slice(1), { ...before.variants[0], id: 'new-one' }] }
    expect(diffProducts(before, after)).toEqual({})
  })

  it('applied back (without a spread) turns before into after', () => {
    const before = whey()
    const after = applyPatch(before, asPatch({
      title: 'CHRGD Whey', cost: null, servings: 28, imageUrl: 'https://cdn/whey.jpg',
      variants: [{ id: STRAW_1KG, flavour: 'Strawberry', inventory: null, price: 33.99 }],
    }), { spreadServings: false })
    expect(applyPatch(before, diffProducts(before, after), { spreadServings: false })).toEqual(after)
  })

  it('carries only this pass\'s change onto a product that moved in the meantime', () => {
    const before = whey()
    // The price screen worked out a new price for one SKU…
    const after = applyPatch(before, { variants: [{ id: CHOC_1KG, price: 36.99, priceSource: 'founder' }] })
    // …while the stock sync wrote new stock levels.
    const now = { ...before, variants: before.variants.map((v) => ({ ...v, inventory: 2 })) }

    const saved = applyPatch(now, diffProducts(before, after), { spreadServings: false })
    expect(byId(saved, CHOC_1KG)).toMatchObject({ price: 36.99, priceSource: 'founder', inventory: 2 })
    expect(saved.variants.every((v) => v.inventory === 2)).toBe(true)
  })
})
