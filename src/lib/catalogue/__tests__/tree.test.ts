import { applyTree } from '../tree'
import type { CatalogueProduct, CatalogueVariant } from '../types'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 35.99, compareAtPrice: null, available: true, ...over }
}

/**
 * The Grenade bars as they actually went live: the product named after one of
 * its own flavours, the product's name sitting on a row, and the pack size
 * repeated on every label.
 */
function bars(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'protein-bars', title: 'Protein Bars, Caramel Chaos - 12 x 60g', handle: 'protein-bars',
    description: '', imageUrl: 'https://pb/caramel.jpg', category: 'Health Foods',
    stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['bar'],
    variants: [
      variant({ id: 'a', sku: 'P24068', title: 'Protein Bars', size: '60 g', servings: 12, cost: 18.15, imageUrl: 'https://pb/caramel.jpg' }),
      variant({ id: 'b', sku: 'P51981', title: 'Protein Bars, Chocolate Chip Cookie Dough - 12 x 60g', size: '60 g', servings: 12, cost: 18.15 }),
      variant({ id: 'c', sku: 'P51982', title: 'Bars, Dark Chocolate Mint - 12 x 60g', size: '60 g', servings: 12, cost: 18.15, price: 39.99, imageUrl: 'https://pb/mint.jpg' }),
    ],
    basePrice: 35.99, compareAtPrice: null, servings: 12, cost: 18.15, subscriptionEligible: true,
    swapGroup: 'protein-bar', recommendationPriority: 5, marginPriority: 5, isCoreEligible: true,
    isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [],
    defaultVariantId: 'a', ...over,
  }
}

describe('“this SKU is the master, the rest are flavours”', () => {
  it('settles the names as well as the master, in one patch', () => {
    const patch = applyTree(bars(), 'a')!

    // The product stops being named after one of its flavours…
    expect(patch.title).toBe('Protein Bars')
    // …the row that was wearing that name takes back the flavour the title was
    // carrying, and the pack size every row repeats comes off the end.
    expect(patch.variants!.map((v) => v.title)).toEqual([
      'Caramel Chaos',
      'Chocolate Chip Cookie Dough',
      'Bars, Dark Chocolate Mint',
    ])
    // The picker reads `flavour` and falls back to `title`, so both move.
    expect(patch.variants![0]).toMatchObject({ flavour: 'Caramel Chaos' })
  })

  it('never touches the web address', () => {
    // The handle is every link anyone has to this product.
    expect(applyTree(bars(), 'a')).not.toHaveProperty('handle')
    expect(applyTree(bars(), 'a')).not.toHaveProperty('id')
  })

  it('moves the price, picture, cost and servings when the master moves', () => {
    const patch = applyTree(bars(), 'c')!
    expect(patch).toMatchObject({
      defaultVariantId: 'c',
      basePrice: 39.99,
      imageUrl: 'https://pb/mint.jpg',
      servings: 12,
      cost: 18.15,
    })
  })

  it('reads the title against the master being CHOSEN, not the one stored', () => {
    /*
      Both rows open the title here. Anchoring on the stored master would read
      it against the row on its way out, and the product would be renamed after
      the wrong one.
    */
    const two = bars({
      title: 'Whey Protein Professional, Banana - 500 grams',
      defaultVariantId: 'a',
      variants: [
        variant({ id: 'a', sku: 'P1', title: 'Whey' }),
        variant({ id: 'b', sku: 'P2', title: 'Whey Protein Professional' }),
      ],
    })
    expect(applyTree(two, 'b')!.title).toBe('Whey Protein Professional')
    expect(applyTree(two, 'a')!.title).toBe('Whey')
  })

  it('is nothing to do on a product that is already right', () => {
    const done = bars({
      title: 'Protein Bars',
      defaultVariantId: 'a',
      variants: [
        variant({ id: 'a', sku: 'P1', title: 'Caramel Chaos', flavour: 'Caramel Chaos' }),
        variant({ id: 'b', sku: 'P2', title: 'Fudged Up', flavour: 'Fudged Up' }),
      ],
      basePrice: 35.99,
      imageUrl: null,
      compareAtPrice: null,
    })
    expect(applyTree(done, 'a')).toBeNull()
  })

  it('refuses a SKU that is not on this product', () => {
    expect(applyTree(bars(), 'nope')).toBeNull()
  })
})
