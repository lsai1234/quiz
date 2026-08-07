import { canMerge, commonTitlePrefix, mergeProducts, variantLabelFor, skusOf } from '@/lib/catalogue/merge'
import type { CatalogueProduct } from '@/lib/catalogue/types'

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
    expect(check.ok === false && check.reason).toMatch(/different sizes rather than flavours|cost different amounts/)
  })

  it('refuses when servings differ, which sizes the subscription', () => {
    const check = canMerge([product('Whey A', 'A'), product('Whey B', 'B', { servings: 71 })])
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toMatch(/servings/)
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
