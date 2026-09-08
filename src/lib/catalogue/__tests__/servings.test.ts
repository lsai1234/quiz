import { spreadServings, servingsAppliesTo } from '../servings'
import { servingsForVariant } from '@/lib/shop/per-serving'
import type { CatalogueProduct, CatalogueVariant } from '../types'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 42.99, compareAtPrice: null, available: true, ...over }
}

/** The Chunky Protein Bar: four flavours of one box, every SKU the same size. */
function bars(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'chunky', title: 'Chunky Protein Bar', handle: 'chunky', description: '', imageUrl: null,
    category: 'Protein Bars', stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['bar'],
    variants: [
      variant({ id: 'a', sku: 'P1', title: 'Black Biscuit', size: '60 g', servings: 12 }),
      variant({ id: 'b', sku: 'P2', title: 'Coconut Dream', size: '60 g', servings: 12 }),
      variant({ id: 'c', sku: 'P3', title: 'Crunchy Caramel', size: '60 g', servings: 12 }),
    ],
    basePrice: 42.99, compareAtPrice: null, servings: 12, subscriptionEligible: true,
    swapGroup: 'protein-bar', recommendationPriority: 5, marginPriority: 5, isCoreEligible: true,
    isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [],
    defaultVariantId: 'a', ...over,
  }
}

describe('a serving count typed in the Hub', () => {
  it('reaches the SKUs the shop actually reads', () => {
    /*
      The bug, exactly: the Hub said 20 and the shelf said 12 for ever, because
      the field wrote `product.servings` and the shop reads the selected SKU's
      own count. An edit that saves and changes nothing is the worst kind.
    */
    const product = bars()
    expect(servingsForVariant(product, product.variants[0])).toBe(12)

    const variants = spreadServings(product, 20)!
    expect(variants.map((v) => v.servings)).toEqual([20, 20, 20])
    expect(servingsForVariant({ ...product, servings: 20, variants }, variants[0])).toBe(20)
  })

  it('leaves a SKU of a different size to its own count', () => {
    // 100 capsules and a 454g bag are 33 servings and 454, and that is the one
    // case a product-level number cannot describe.
    const glycine = bars({
      defaultVariantId: 'caps',
      variants: [
        variant({ id: 'caps', sku: 'P1', size: '100 caps', servings: 33 }),
        variant({ id: 'powder', sku: 'P2', size: '454 grams', servings: 454 }),
      ],
    })
    expect(spreadServings(glycine, 100)!.map((v) => v.servings)).toEqual([100, 454])
  })

  it('reads three spellings of one size as the same unit', () => {
    const mixed = bars({
      variants: [
        variant({ id: 'a', sku: 'P1', size: '500 grams', servings: 20 }),
        variant({ id: 'b', sku: 'P2', size: '500g', servings: 20 }),
      ],
    })
    expect(spreadServings(mixed, 25)!.map((v) => v.servings)).toEqual([25, 25])
  })

  it('clears rather than writing a zero', () => {
    // `servings: 0` reads as a fact — "no servings" — where what is meant is
    // "we were never told".
    const cleared = spreadServings(bars(), 0)!
    expect(cleared.every((v) => !('servings' in v))).toBe(true)
    expect(servingsForVariant({ ...bars(), variants: cleared }, cleared[0])).toBe(12)
  })

  it('says nothing when the number is already there', () => {
    expect(spreadServings(bars(), 12)).toBeNull()
    expect(spreadServings(bars({ variants: [] }), 20)).toBeNull()
  })

  it('counts the SKUs it would apply to, for the founder to read first', () => {
    expect(servingsAppliesTo(bars())).toBe(3)
    expect(
      servingsAppliesTo(
        bars({
          defaultVariantId: 'caps',
          variants: [
            variant({ id: 'caps', size: '100 caps' }),
            variant({ id: 'powder', size: '454 grams' }),
          ],
        }),
      ),
    ).toBe(1)
  })
})
