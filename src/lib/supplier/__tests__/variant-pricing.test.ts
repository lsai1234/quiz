import { repriceVariants, sliceBySkuBudget, type SkuFacts } from '../variant-pricing'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 14.99, compareAtPrice: null, available: true, ...over }
}

function product(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'glycine', title: 'Glycine, 1000mg - 100 vcaps', handle: 'glycine', description: '',
    imageUrl: null, category: 'Amino Acids', stackSlots: ['recovery'], goals: ['recovery'],
    dietaryTags: [], formats: ['capsule'],
    variants: [
      variant({ id: 'caps', sku: 'P100' }),
      variant({ id: 'powder', sku: 'P200' }),
    ],
    defaultVariantId: 'caps',
    basePrice: 14.99, compareAtPrice: null, servings: 33, subscriptionEligible: true,
    swapGroup: 'aminos', recommendationPriority: 5, marginPriority: 5, isCoreEligible: true,
    isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [], ...over,
  }
}

/** What PowerBody actually say about the two glycine SKUs. */
const FACTS = new Map<string, SkuFacts>([
  ['P100', { cost: 11.12, rrp: 15.5, servings: 33, name: 'Glycine, 1000mg - 100 vcaps', image: 'https://pb/caps.jpg' }],
  ['P200', { cost: 20.04, rrp: 26, servings: 454, name: 'Glycine, Pure Powder - 454 grams', image: 'https://pb/powder.jpg' }],
])

describe('repriceVariants', () => {
  it('re-prices siblings that cost different amounts but share one shelf price', () => {
    const result = repriceVariants(product(), FACTS, false)!
    const [caps, powder] = result.product.variants

    expect(caps.price).toBe(21.99)
    expect(powder.price).toBe(39.99)
    // The headline follows the variant the page opens on, so the card and the
    // product sheet cannot disagree about the price.
    expect(result.product.basePrice).toBe(21.99)
    expect(result.changed.P200).toContain('£14.99 → £39.99')
  })

  it('gives each variant the supplier\'s own serving count and size', () => {
    const { product: fixed } = repriceVariants(product(), FACTS, false)!

    expect(fixed.variants[0].servings).toBe(33)
    expect(fixed.variants[1].servings).toBe(454)
    expect(fixed.variants[1].size).toBe('454 grams')
  })

  it('gives each variant the supplier\'s own picture, and never replaces one', () => {
    // PowerBody hold one photograph per product id, and every flavour is its
    // own product at their end — so the per-flavour pictures have always
    // existed and the shop was showing the main SKU's for all of them.
    const { product: fixed } = repriceVariants(product(), FACTS, false)!
    expect(fixed.variants.map((v) => v.imageUrl)).toEqual(['https://pb/caps.jpg', 'https://pb/powder.jpg'])

    // A picture a founder chose is not the supplier's to overwrite.
    const chosen = product({
      variants: [
        variant({ id: 'caps', sku: 'P100', imageUrl: 'https://ours/better.jpg' }),
        variant({ id: 'powder', sku: 'P200' }),
      ],
    })
    const { product: kept } = repriceVariants(chosen, FACTS, true)!
    expect(kept.variants[0].imageUrl).toBe('https://ours/better.jpg')
  })

  it('leaves a product somebody has priced by hand alone', () => {
    // Variants already at different prices are a pricing decision, not the
    // sibling-merge bug. Overwriting those is how a repair pass loses real work.
    const handPriced = product({
      variants: [variant({ id: 'caps', sku: 'P100', price: 18 }), variant({ id: 'powder', sku: 'P200', price: 35 })],
    })
    const result = repriceVariants(handPriced, FACTS, false)!

    expect(result.product.variants.map((v) => v.price)).toEqual([18, 35])
    // Cost and servings are facts rather than decisions, so those still land.
    expect(result.product.variants[0].cost).toBe(11.12)
    expect(result.product.variants[1].servings).toBe(454)
  })

  it('re-prices everything from cost when forced', () => {
    const handPriced = product({
      variants: [variant({ id: 'caps', sku: 'P100', price: 18 }), variant({ id: 'powder', sku: 'P200', price: 35 })],
    })
    const { product: fixed } = repriceVariants(handPriced, FACTS, true)!

    expect(fixed.variants.map((v) => v.price)).toEqual([21.99, 39.99])
  })

  it('leaves a price a founder set alone, even when forced', () => {
    /*
      The difference between "already at different prices" above and this: that
      one is inferred from the shape of the data and `force` overrules it, this
      one is recorded because somebody typed the price on the product screen.
      An override a sweep can undo is not an override.
    */
    const chosen = product({
      variants: [
        variant({ id: 'caps', sku: 'P100', price: 18, priceSource: 'founder' }),
        variant({ id: 'powder', sku: 'P200' }),
      ],
    })
    const { product: fixed } = repriceVariants(chosen, FACTS, true)!

    expect(fixed.variants[0].price).toBe(18)
    // The cost still lands: it is a fact, and the margin figures are read off
    // it — a manual price is exactly where knowing the cost matters most.
    expect(fixed.variants[0].cost).toBe(11.12)
    expect(fixed.variants[1].price).toBe(39.99)
  })

  it('leaves siblings that genuinely are flavours of one tub exactly as they are', () => {
    const flavours = new Map<string, SkuFacts>([
      ['P100', { cost: 11.12, rrp: 15.5, servings: 30, name: 'Whey, Chocolate - 1kg', image: 'https://pb/choc.jpg' }],
      ['P200', { cost: 11.12, rrp: 15.5, servings: 30, name: 'Whey, Vanilla - 1kg', image: 'https://pb/van.jpg' }],
    ])
    const whey = product({
      servings: 30,
      variants: [
        variant({ id: 'choc', sku: 'P100', price: 21.99, servings: 30, cost: 11.12, size: '1 kg', imageUrl: 'https://pb/choc.jpg' }),
        variant({ id: 'van', sku: 'P200', price: 21.99, servings: 30, cost: 11.12, size: '1 kg', imageUrl: 'https://pb/van.jpg' }),
      ],
    })

    expect(repriceVariants(whey, flavours, false)).toBeNull()
  })

  it('writes no servings onto an accessory, which has no dose to count', () => {
    const shaker = product({
      swapGroup: 'accessory', category: 'Accessories', servings: 1,
      variants: [variant({ id: 'a', sku: 'P100', price: 3.99 }), variant({ id: 'b', sku: 'P200', price: 3.99 })],
    })
    const { product: fixed } = repriceVariants(shaker, FACTS, false)!

    expect(fixed.variants.every((v) => v.servings == null)).toBe(true)
  })

  it('ignores a SKU the supplier never answered for', () => {
    const partial = new Map<string, SkuFacts>([['P100', FACTS.get('P100')!]])
    const { product: fixed } = repriceVariants(product(), partial, true)!

    expect(fixed.variants[0].price).toBe(21.99)
    expect(fixed.variants[1].price).toBe(14.99)
  })
})

describe('sliceBySkuBudget', () => {
  const p = (id: string, skus: number) => ({
    id,
    variants: Array.from({ length: skus }, (_, i) => ({ sku: `${id}-${i}` })),
  })

  it('fills a batch by SKU count, not by product count', () => {
    // Reading a SKU is one throttled call, so eight flavours is eight requests
    // and three two-flavour products is six. A batch measured in products makes
    // its own cost depend on which products it happened to contain.
    const batch = sliceBySkuBudget([p('a', 4), p('b', 4), p('c', 4)], 12)
    expect(batch.map((x) => x.id)).toEqual(['a', 'b', 'c'])

    const smaller = sliceBySkuBudget([p('a', 8), p('b', 8)], 12)
    expect(smaller.map((x) => x.id)).toEqual(['a'])
  })

  it('always takes at least one product, however many variants it has', () => {
    // Otherwise the product that most needs repairing blocks the queue forever.
    const batch = sliceBySkuBudget([p('huge', 40), p('next', 2)], 12)
    expect(batch.map((x) => x.id)).toEqual(['huge'])
  })

  it('ignores variants with no supplier SKU — nothing is asked about those', () => {
    const noSkus = { id: 'hand-made', variants: [{ sku: null }, { sku: undefined }] }
    expect(sliceBySkuBudget([noSkus, p('a', 12)], 12).map((x) => x.id)).toEqual(['hand-made', 'a'])
  })

  it('is empty when there is nothing left', () => {
    expect(sliceBySkuBudget([], 12)).toEqual([])
  })
})
