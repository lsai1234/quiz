import { normaliseSize, skuGroups, mixedSizes, splitOut, splitBySize, freeId } from '../split'
import type { CatalogueProduct, CatalogueVariant } from '../types'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 14.99, compareAtPrice: null, available: true, ...over }
}

/**
 * The glycine, which is the case that started this: one PowerBody master SKU
 * hanging a tub of capsules and a bag of powder off it, merged into one product
 * that went live at the capsules' price with the capsules' serving count.
 */
function glycine(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'glycine', title: 'Glycine', handle: 'glycine', description: 'Amino acid.',
    imageUrl: 'https://pb/caps.jpg', category: 'Amino Acids', stackSlots: ['recovery'], goals: ['recovery'],
    dietaryTags: [], formats: ['capsule'],
    variants: [
      variant({ id: 'caps', sku: 'P100', title: '100 vcaps', size: '100 caps', price: 14.99, servings: 33, cost: 8.2, imageUrl: 'https://pb/caps.jpg' }),
      variant({ id: 'powder', sku: 'P200', title: 'Pure Powder', size: '454 grams', price: 39.99, servings: 454, cost: 24.5, imageUrl: 'https://pb/powder.jpg' }),
    ],
    basePrice: 14.99, compareAtPrice: null, servings: 33, cost: 8.2, subscriptionEligible: true,
    consumption: { cadence: 'daily', servingsPerUnit: 33 },
    swapGroup: 'aminos', recommendationPriority: 5, marginPriority: 5, isCoreEligible: true,
    isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [],
    defaultVariantId: 'caps', ...over,
  }
}

describe('what counts as the same size', () => {
  it('reads three spellings of one size as one size', () => {
    // PowerBody use all three across a single brand's line; comparing the raw
    // strings would split one product into three.
    expect(normaliseSize('500 grams')).toBe('500g')
    expect(normaliseSize('500g')).toBe('500g')
    expect(normaliseSize('500 G')).toBe('500g')
    expect(normaliseSize('100 vcaps')).toBe('100cap')
    expect(normaliseSize('100 capsules')).toBe('100cap')
  })

  it('does not convert between units', () => {
    // A supplier who writes both is describing two listings, and guessing they
    // are the same tub is how a split silently merges two real products.
    expect(normaliseSize('0.5 kg')).not.toBe(normaliseSize('500 grams'))
  })

  it('has nothing to say about a SKU that never gave a size', () => {
    expect(normaliseSize(null)).toBe('')
    expect(normaliseSize('  ')).toBe('')
  })
})

describe('is this really two products', () => {
  it('says so when two SKUs are different sizes', () => {
    expect(mixedSizes(glycine())).toBe(true)
    expect(skuGroups(glycine()).map((g) => g.label)).toEqual(['100 caps', '454 grams'])
  })

  it('says nothing about six flavours of one bag', () => {
    const flavours = glycine({
      variants: ['Banana', 'Chocolate', 'Vanilla'].map((f, i) =>
        variant({ id: `v${i}`, sku: `P${i}`, title: f, size: '500 grams', price: 23.99 }),
      ),
    })
    expect(mixedSizes(flavours)).toBe(false)
  })

  it('says nothing when the sizes are simply unknown', () => {
    // Half the catalogue has no size at all. "We do not know" is not evidence
    // of two products, and warning on it would warn on everything.
    const unsized = glycine({
      variants: [variant({ id: 'a', sku: 'P1' }), variant({ id: 'b', sku: 'P2', size: '500 grams' })],
    })
    expect(mixedSizes(unsized)).toBe(false)
  })

  it('leads with the group the product is mostly made of, and puts the unsized last', () => {
    const p = glycine({
      variants: [
        variant({ id: 'a', sku: 'P1' }),
        variant({ id: 'b', sku: 'P2', size: '500 grams' }),
        variant({ id: 'c', sku: 'P3', size: '500 g' }),
      ],
    })
    expect(skuGroups(p).map((g) => g.key)).toEqual(['500g', ''])
  })
})

describe('moving SKUs onto a product of their own', () => {
  it('gives each side the price, picture, servings and cost of its own SKU', () => {
    const out = splitOut(glycine(), ['powder'], { id: 'glycine-powder' })!

    expect(out.moved.id).toBe('glycine-powder')
    expect(out.moved.handle).toBe('glycine-powder')
    expect(out.moved.variants.map((v) => v.id)).toEqual(['powder'])
    expect(out.moved).toMatchObject({
      basePrice: 39.99, servings: 454, cost: 24.5, imageUrl: 'https://pb/powder.jpg', defaultVariantId: 'powder',
    })
    // …and the one it came out of stops quoting a SKU it no longer sells.
    expect(out.kept.variants.map((v) => v.id)).toEqual(['caps'])
    expect(out.kept).toMatchObject({ basePrice: 14.99, servings: 33, defaultVariantId: 'caps' })
  })

  it('resizes the plan, not just the label', () => {
    // `consumption.servingsPerUnit` is what the subscription maths reads, and
    // leaving it behind sizes a 454-serving bag like a tub of 33 capsules.
    const out = splitOut(glycine(), ['powder'], { id: 'glycine-powder' })!
    expect(out.moved.consumption?.servingsPerUnit).toBe(454)
  })

  it('names the new product after the size, until somebody renames it', () => {
    expect(splitOut(glycine(), ['powder'], { id: 'x' })!.moved.title).toBe('Glycine — 454 grams')
    expect(splitOut(glycine(), ['powder'], { id: 'x', title: 'Glycine Powder' })!.moved.title).toBe('Glycine Powder')
  })

  it('works out each side’s format from its own unit', () => {
    const out = splitOut(glycine(), ['powder'], { id: 'x' })!
    expect(out.moved.formats).toEqual(['powder'])
    expect(out.kept.formats).toEqual(['capsule'])
  })

  it('does not carry the supplier’s product id onto the new product', () => {
    // It is the id of the PARENT's main SKU. Carried over, the next detail
    // lookup fetches the wrong product's name and picture and writes them here.
    const out = splitOut(glycine({ supplierProductId: '1001' }), ['powder'], { id: 'x' })!
    expect(out.moved.supplierProductId).toBeUndefined()
    expect(out.kept.supplierProductId).toBe('1001')
  })

  it('refuses a move that would empty one side', () => {
    expect(splitOut(glycine(), [], { id: 'x' })).toBeNull()
    expect(splitOut(glycine(), ['caps', 'powder'], { id: 'x' })).toBeNull()
    expect(splitOut(glycine(), ['nope'], { id: 'x' })).toBeNull()
  })
})

describe('one product per unit of sale, at import', () => {
  it('splits the glycine row into the capsules and the bag', () => {
    const out = splitBySize(glycine())
    expect(out).toHaveLength(2)
    // The group holding the master keeps the id and the URL: it is what the
    // product already was.
    expect(out[0]).toMatchObject({ id: 'glycine', handle: 'glycine', basePrice: 14.99 })
    expect(out[1]).toMatchObject({ title: 'Glycine — 454 grams', basePrice: 39.99, servings: 454 })
    expect(out[1].id).not.toBe('glycine')
  })

  it('leaves a flavour list exactly as it is', () => {
    const flavours = glycine({
      defaultVariantId: 'v0',
      variants: ['Banana', 'Chocolate'].map((f, i) =>
        variant({ id: `v${i}`, sku: `P${i}`, title: f, size: '500 grams' }),
      ),
    })
    expect(splitBySize(flavours)).toEqual([flavours])
  })

  it('does not take an id something else is already using', () => {
    const out = splitBySize(glycine(), ['glycine-454g'])
    expect(out[1].id).toBe('glycine-454g-2')
  })
})

describe('a free id', () => {
  it('is the stem when nothing has it, and numbered when something does', () => {
    expect(freeId('Glycine Powder', [])).toBe('glycine-powder')
    expect(freeId('glycine', ['glycine'])).toBe('glycine-2')
    expect(freeId('glycine', ['glycine', 'glycine-2'])).toBe('glycine-3')
  })
})
