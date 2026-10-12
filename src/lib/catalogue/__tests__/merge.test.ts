import { canMerge, commonTitlePrefix, mergeProducts, variantLabelFor, skusOf, withOwnFacts, mergeInto } from '@/lib/catalogue/merge'
import { labelsOf, variantForLine } from '@/lib/catalogue/line-variant'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'

function product(title: string, sku: string, over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return {
    id,
    title,
    handle: id,
    description: '',
    imageUrl: null,
    category: 'Protein',
    stackSlots: ['protein'],
    goals: ['muscle'],
    dietaryTags: [],
    formats: ['powder'],
    variants: [
      { id, title, flavour: null, size: null, price: 39.99, compareAtPrice: null, available: true, inventory: 10, sku },
    ],
    basePrice: 39.99,
    compareAtPrice: null,
    cost: 20,
    servings: 30,
    weightGrams: 1200,
    subscriptionEligible: true,
    swapGroup: 'protein-whey',
    recommendationPriority: 5,
    marginPriority: 5,
    isCoreEligible: true,
    isBoosterEligible: false,
    hasStimulants: false,
    shortReason: '',
    warnings: [],
    ...over,
  } as CatalogueProduct
}

describe('commonTitlePrefix', () => {
  it('takes whole words, never half of one', () => {
    // A character-wise prefix would cut "Vanil" out of "Vanilla" and call it a
    // product name.
    expect(commonTitlePrefix(['Whey Protein 1kg Vanilla', 'Whey Protein 1kg Vanilla Fudge'])).toBe('Whey Protein 1kg')
  })

  it('never eats a whole title, which would leave a variant unlabelled', () => {
    expect(commonTitlePrefix(['Whey 1kg', 'Whey 1kg Chocolate'])).toBe('Whey')
  })

  it('is empty when the titles share nothing', () => {
    expect(commonTitlePrefix(['Creatine 250g', 'Whey 1kg'])).toBe('')
  })
})

describe('variantLabelFor', () => {
  it('strips the shared name and tidies the join left behind', () => {
    expect(variantLabelFor('Whey Protein 1kg - Vanilla', 'Whey Protein 1kg')).toBe('Vanilla')
  })

  it('falls back to the whole title rather than an empty label', () => {
    expect(variantLabelFor('Whey Protein 1kg', 'Whey Protein 1kg')).toBe('Whey Protein 1kg')
  })
})

describe('canMerge', () => {
  it('allows flavours of the same tub', () => {
    expect(canMerge([product('Whey 1kg Chocolate', 'W-CHOC'), product('Whey 1kg Vanilla', 'W-VAN')])).toEqual({
      ok: true,
    })
  })

  it('refuses different sizes, naming why', () => {
    // The variant model has a price and a SKU but no cost, so merging sizes
    // would price every one of them as if it were the first.
    const check = canMerge([
      product('Whey 1kg', 'W-1KG'),
      product('Whey 2.27kg', 'W-2KG', { cost: 38.5 }),
    ])
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toMatch(/different sizes \(1 kg, 2.27 kg\)/)
  })

  /*
    Each SKU now carries its own cost and servings, so flavours PowerBody price
    a few pence apart — most of them — can be grouped. Refusing them made
    grouping flavours impossible for half the range.
  */
  it('combines flavours that cost or serve differently, each keeping its own numbers', () => {
    const a = product('Whey A', 'A', { cost: 10, servings: 30 })
    const b = product('Whey B', 'B', { cost: 10.4, servings: 33 })
    expect(canMerge([a, b]).ok).toBe(true)
    const merged = mergeProducts([a, b])
    expect(merged.variants.map((v) => v.cost)).toEqual([10, 10.4])
    expect(merged.variants.map((v) => v.servings)).toEqual([30, 33])
  })

  it('refuses when shipped weight differs, which sets the delivery band', () => {
    const check = canMerge([product('Whey A', 'A'), product('Whey B', 'B', { weightGrams: 2400 })])
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toMatch(/weight|postage/)
  })

  it('refuses a product with no supplier SKU — it could never be ordered', () => {
    const orphan = product('Whey C', 'C')
    orphan.variants = orphan.variants.map((v) => ({ ...v, sku: null }))
    const check = canMerge([product('Whey A', 'A'), orphan])
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toMatch(/no supplier SKU/)
  })

  it('needs at least two', () => {
    expect(canMerge([product('Whey A', 'A')]).ok).toBe(false)
  })
})

describe('mergeProducts', () => {
  const choc = product('Whey Protein 1kg Chocolate', 'W-CHOC')
  const van = product('Whey Protein 1kg Vanilla', 'W-VAN')

  it('makes one product named after what they share', () => {
    const merged = mergeProducts([choc, van])

    expect(merged.title).toBe('Whey Protein 1kg')
    expect(merged.id).toBe('whey-protein-1kg')
    expect(merged.variants.map((v) => v.flavour)).toEqual(['Chocolate', 'Vanilla'])
  })

  it('keeps every variant’s own supplier SKU — the thing that makes it orderable', () => {
    // submitOrderToSupplier sends variant.sku per line, and the daily sync reads
    // stock per variant SKU. Lose these and the product cannot be fulfilled.
    const merged = mergeProducts([choc, van])
    expect(merged.variants.map((v) => v.sku)).toEqual(['W-CHOC', 'W-VAN'])
    expect(skusOf(merged).sort()).toEqual(['W-CHOC', 'W-VAN'])
  })

  it('defaults to a variant you can actually buy', () => {
    const soldOut = product('Whey Protein 1kg Chocolate', 'W-CHOC')
    soldOut.variants = soldOut.variants.map((v) => ({ ...v, available: false }))

    const merged = mergeProducts([soldOut, van])
    expect(merged.defaultVariantId).toBe(merged.variants[1].id)
  })

  it('gives every variant a unique id even when two labels collide', () => {
    const a = product('Whey Protein 1kg Vanilla', 'W-VAN-1')
    const b = product('Whey Protein 1kg Vanilla', 'W-VAN-2')
    const ids = mergeProducts([a, b]).variants.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('takes an explicit name and can label as sizes', () => {
    const merged = mergeProducts([choc, van], { title: 'CHRGD Whey', as: 'size' })
    expect(merged.title).toBe('CHRGD Whey')
    expect(merged.variants[0].size).toBe('Chocolate')
    expect(merged.variants[0].flavour).toBeNull()
  })

  it('keeps the flavours a source product already had', () => {
    const multi = product('Whey Protein 1kg Chocolate', 'W-CHOC')
    multi.variants = [
      { ...multi.variants[0], id: 'a', flavour: 'Smooth', sku: 'W-CHOC-S' },
      { ...multi.variants[0], id: 'b', flavour: 'Dark', sku: 'W-CHOC-D' },
    ]
    const merged = mergeProducts([multi, van])

    expect(merged.variants.map((v) => v.flavour)).toEqual(['Chocolate Smooth', 'Chocolate Dark', 'Vanilla'])
    expect(merged.variants.map((v) => v.sku)).toEqual(['W-CHOC-S', 'W-CHOC-D', 'W-VAN'])
  })
})

describe('canMerge — sizes read from names', () => {
  it('reads a single-SKU product’s size off the end of its title', () => {
    const check = canMerge([product('Critical Whey 2kg', 'P100'), product('Critical Whey 900g', 'P200')])
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toMatch(/different sizes \(2 kg, 900 g\)/)
  })

  it('reads a multi-SKU product’s sizes off its SKUs’ titles', () => {
    const multi = product('Critical Whey', 'P100')
    multi.variants = [
      { ...multi.variants[0], id: 'a', title: 'Chocolate - 2kg', sku: 'P100' },
      { ...multi.variants[0], id: 'b', title: 'Vanilla - 2kg', sku: 'P200' },
    ]
    expect(canMerge([multi, product('Critical Whey Strawberry 2kg', 'P300')]).ok).toBe(true)
    const check = canMerge([multi, product('Critical Whey Strawberry 4kg', 'P400')])
    expect(check.ok === false && check.reason).toMatch(/2 kg, 4 kg/)
  })

  it('lets a SKU’s own size field speak over its name', () => {
    const labelled = product('Critical Whey 2kg', 'P100')
    labelled.variants = labelled.variants.map((v) => ({ ...v, size: '1kg' }))
    expect(canMerge([labelled, product('Critical Whey 1kg', 'P200')]).ok).toBe(true)
  })

  it('reads one size written two ways as one size', () => {
    expect(canMerge([product('Creatine 500g', 'P100'), product('Creatine Lemon 500 grams', 'P200')]).ok).toBe(true)
  })

  it('takes an unknown size as proving nothing either way', () => {
    expect(canMerge([product('Critical Whey Chocolate', 'P100'), product('Critical Whey 2kg', 'P200')]).ok).toBe(true)
  })
})

describe('withOwnFacts', () => {
  it('moves a single-SKU product’s cost, servings, picture and PowerBody id onto its SKU', () => {
    const p = product('Critical Whey 2kg Chocolate', 'P100', {
      cost: 24.5, servings: 66, imageUrl: 'https://pb/choc.jpg', supplierProductId: '1100',
    })
    expect(withOwnFacts(p)[0]).toMatchObject({ cost: 24.5, servings: 66, imageUrl: 'https://pb/choc.jpg', supplierProductId: '1100' })
  })

  it('never overwrites what a SKU already says about itself', () => {
    const p = product('Critical Whey 2kg Chocolate', 'P100', {
      cost: 24.5, servings: 66, imageUrl: 'https://pb/product.jpg', supplierProductId: '1100',
    })
    p.variants = p.variants.map((v) => ({ ...v, cost: 23, servings: 60, imageUrl: 'https://pb/own.jpg', supplierProductId: '1999' }))
    expect(withOwnFacts(p)[0]).toMatchObject({ cost: 23, servings: 60, imageUrl: 'https://pb/own.jpg', supplierProductId: '1999' })
  })

  it('does not hand down a cost or serving count of zero — that is "not known"', () => {
    const [v] = withOwnFacts(product('Critical Whey 2kg Chocolate', 'P100', { cost: 0, servings: 0 }))
    expect(v.cost).toBeUndefined()
    expect(v.servings).toBeUndefined()
  })

  it('on a product with several SKUs, gives only the stored master the picture and id, and nobody the cost or servings', () => {
    const p = product('Critical Whey 2kg', 'P100', {
      cost: 24.5, servings: 66, imageUrl: 'https://pb/van.jpg', supplierProductId: '1200', defaultVariantId: 'van',
    })
    p.variants = [
      { ...p.variants[0], id: 'choc', sku: 'P100' },
      // The stored master is honoured even while it is out of stock.
      { ...p.variants[0], id: 'van', sku: 'P200', available: false },
    ]
    const [choc, van] = withOwnFacts(p)
    expect(van).toMatchObject({ imageUrl: 'https://pb/van.jpg', supplierProductId: '1200' })
    expect(choc.imageUrl ?? null).toBeNull()
    expect(choc.supplierProductId).toBeUndefined()
    for (const v of [choc, van]) {
      expect(v.cost).toBeUndefined()
      expect(v.servings).toBeUndefined()
    }
  })

  it('takes the first SKU as the master when none is stored', () => {
    const p = product('Critical Whey 2kg', 'P100', { supplierProductId: '1100', defaultVariantId: undefined })
    p.variants = [{ ...p.variants[0], id: 'a', sku: 'P100' }, { ...p.variants[0], id: 'b', sku: 'P200' }]
    expect(withOwnFacts(p).map((v) => v.supplierProductId)).toEqual(['1100', undefined])
  })
})

describe('mergeInto', () => {
  function v(over: Partial<CatalogueVariant> & { id: string }): CatalogueVariant {
    return { title: over.id, flavour: null, size: null, price: 44.99, compareAtPrice: null, available: true, ...over }
  }

  /** A whey that already sells two flavours, with a chosen master. */
  function target(): CatalogueProduct {
    return product('Critical Whey 2kg', 'P100', {
      id: 'critical-whey',
      handle: 'critical-whey',
      description: 'Our own words.',
      shortName: 'Critical Whey',
      supplierProductId: '1100',
      defaultVariantId: 'cw-van',
      variants: [
        v({ id: 'cw-choc', title: 'Chocolate', flavour: 'Chocolate', sku: 'P100', cost: 24.5 }),
        v({ id: 'cw-van', title: 'Vanilla', flavour: 'Vanilla', sku: 'P200', cost: 23.9 }),
      ],
    })
  }

  it('leaves the target’s id, name, copy, master and own SKUs exactly as they were', () => {
    const t = target()
    const merged = mergeInto(t, [product('Critical Whey 2kg Strawberry', 'P300')])

    expect(merged).toMatchObject({
      id: 'critical-whey', handle: 'critical-whey', title: 'Critical Whey 2kg', description: 'Our own words.',
      shortName: 'Critical Whey', supplierProductId: '1100', defaultVariantId: 'cw-van',
    })
    expect(merged.variants[0]).toBe(t.variants[0])
    expect(merged.variants[1]).toBe(t.variants[1])
    expect(merged.variants).toHaveLength(3)
  })

  it('labels a newcomer by what its title adds to the target’s name', () => {
    const merged = mergeInto(target(), [product('Critical Whey 2kg Strawberry', 'P300')])
    expect(merged.variants[2]).toMatchObject({ title: 'Strawberry', flavour: 'Strawberry', sku: 'P300' })
  })

  it('brings each source’s own cost, servings, picture and id with its SKU', () => {
    const source = product('Critical Whey 2kg Strawberry', 'P300', {
      cost: 25.1, servings: 64, imageUrl: 'https://pb/straw.jpg', supplierProductId: '1300',
    })
    const merged = mergeInto(target(), [source])
    expect(merged.variants[2]).toMatchObject({ cost: 25.1, servings: 64, imageUrl: 'https://pb/straw.jpg', supplierProductId: '1300' })
    // The target's own product-level facts are not the newcomer's business.
    expect(merged.supplierProductId).toBe('1100')
  })

  it('keeps a source SKU’s own id — bundles and baskets may point at it — unless the target already uses it', () => {
    const a = product('Critical Whey 2kg Strawberry', 'P300')
    a.variants = [v({ id: 'cw-choc', title: 'Strawberry', sku: 'P300' })]
    const b = product('Critical Whey 2kg Banana', 'P400')
    b.variants = [v({ id: 'cw-choc', title: 'Banana', sku: 'P400' })]
    const c = product('Critical Whey 2kg Cookies', 'P500')
    c.variants = [v({ id: 'whey-cookies', title: 'Cookies', sku: 'P500' })]

    const merged = mergeInto(target(), [a, b, c])
    expect(merged.variants.map((x) => x.id)).toEqual(['cw-choc', 'cw-van', 'cw-choc-2', 'cw-choc-3', 'whey-cookies'])
  })

  it('does not add a SKU the target already sells, or the same SKU twice', () => {
    const dup = product('Critical Whey 2kg Chocolate', 'P100')
    const straw1 = product('Critical Whey 2kg Strawberry', 'P300')
    const straw2 = product('Critical Whey 2kg Strawberry Again', 'P300')
    const merged = mergeInto(target(), [dup, straw1, straw2])
    expect(skusOf(merged)).toEqual(['P100', 'P200', 'P300'])
  })

  it('keeps a multi-flavour source’s flavours apart, qualified by its label', () => {
    const cookies = product('Critical Whey 2kg Cookies', 'P500')
    cookies.variants = [
      v({ id: 'ck-orig', title: 'Original', flavour: 'Original', sku: 'P500' }),
      v({ id: 'ck-dark', title: 'Dark', flavour: 'Dark', sku: 'P501' }),
    ]
    const merged = mergeInto(target(), [cookies])
    expect(merged.variants.slice(2).map((x) => [x.id, x.flavour])).toEqual([
      ['ck-orig', 'Cookies Original'],
      ['ck-dark', 'Cookies Dark'],
    ])
  })

  it('has each moved SKU remember the product and the labels it was sold under', () => {
    const source = product('Critical Whey 2kg Strawberry', 'P300')
    source.variants = [
      v({
        id: 'straw', title: 'Strawberry Cream', flavour: 'Strawberry Cream', size: '2kg', sku: 'P300',
        formerly: [{ productId: 'older-whey', labels: ['Strawberry'] }],
      }),
    ]
    const merged = mergeInto(target(), [source])
    const moved = merged.variants[2]

    expect(moved.formerly).toEqual([
      { productId: 'older-whey', labels: ['Strawberry'] },
      { productId: source.id, labels: labelsOf(source.variants[0]) },
    ])
    expect(labelsOf(source.variants[0])).toContain('Strawberry Cream · 2kg')
    // The target's own SKUs did not move, so they remember nothing new.
    expect(merged.variants[0].formerly).toBeUndefined()

    // A subscription line still naming the source finds the SKU on the target.
    const line = { productId: source.id, variantTitle: 'Strawberry Cream · 2kg' }
    expect(variantForLine(line, [merged])?.variant.sku).toBe('P300')
  })
})

describe('mergeInto names a sized newcomer so the shop can tell it apart', () => {
  const sized = (title: string, sku: string): CatalogueProduct => ({
    ...(MOCK_CATALOGUE[0] as CatalogueProduct),
    id: sku.toLowerCase(),
    handle: sku.toLowerCase(),
    title,
    defaultVariantId: `${sku}-v`,
    variants: [{ id: `${sku}-v`, title, flavour: null, size: '500g', price: 19.99, compareAtPrice: null, available: true, sku }],
  })

  it('gives it its label as a flavour, so the picker does not show two “500g”s', () => {
    const merged = mergeInto(sized('Creatine Monohydrate 500g', 'CR-1'), [sized('Creatine Monohydrate 500g Lemon', 'CR-2')])
    const newcomer = merged.variants.find((v) => v.sku === 'CR-2')!
    expect(newcomer.flavour).toBe('Lemon')
    expect(newcomer.size).toBe('500g')
  })
})
