import { relabel, titleLooksLikeAFlavour, type SupplierName } from '../variant-naming'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'

/**
 * The two ends of one comparison.
 *
 * A flavour is what the siblings do NOT share; the product is what they do.
 * Import used only the first half — it took the row's MAIN sku's name for the
 * whole product — so a four-flavour hydration powder went on the shelf called
 * "Hydration+, Blue Raspberry - 240 grams" with "Hydration+" listed under it as
 * one of its flavours. Both ends are fixed from the same set of names.
 */
function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 21.99, compareAtPrice: null, available: true, ...over }
}

function product(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'hydration', title: 'Hydration+, Blue Raspberry - 240 grams', handle: 'hydration',
    description: '', imageUrl: null, category: 'Endurance', stackSlots: ['hydration'],
    goals: ['hydration'], dietaryTags: [], formats: ['powder'],
    variants: [
      variant({ id: 'a', sku: 'P48633', title: 'Hydration+' }),
      variant({ id: 'b', sku: 'P48636', title: 'Hydration+, Lemon & Lime - 240 grams' }),
    ],
    basePrice: 21.99, compareAtPrice: null, servings: 30, subscriptionEligible: true,
    swapGroup: 'electrolytes', recommendationPriority: 5, marginPriority: 5, isCoreEligible: true,
    isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [], ...over,
  }
}

const NAMES = new Map<string, SupplierName>([
  ['P48633', { name: 'Hydration+, Blue Raspberry - 240 grams', flavour: null }],
  ['P48636', { name: 'Hydration+, Lemon & Lime - 240 grams', flavour: null }],
])

describe('relabel', () => {
  it('renames the product off a flavour and labels the flavours from the difference', () => {
    const result = relabel(product(), NAMES, true)!

    expect(result.renamedTo).toBe('Hydration+')
    expect(result.product.title).toBe('Hydration+')
    expect(result.product.variants.map((v) => v.title)).toEqual(['Blue Raspberry', 'Lemon & Lime'])
  })

  it('never touches the handle, whatever it does to the title', () => {
    // The handle is the product's URL and every link anyone has to it.
    expect(relabel(product(), NAMES, true)!.product.handle).toBe('hydration')
  })

  it('leaves a title somebody wrote alone', () => {
    const named = product({ title: 'CHRGD Hydration' })
    const result = relabel(named, NAMES, true)!

    expect(result.renamedTo).toBeUndefined()
    expect(result.product.title).toBe('CHRGD Hydration')
    // …and still fixes the flavours, which is the other half of the job.
    expect(result.product.variants.map((v) => v.title)).toEqual(['Blue Raspberry', 'Lemon & Lime'])
  })

  it('reports nothing to do when the names agree with what is already there', () => {
    const done = product({
      title: 'Hydration+',
      variants: [
        variant({ id: 'a', sku: 'P48633', title: 'Blue Raspberry', flavour: 'Blue Raspberry' }),
        variant({ id: 'b', sku: 'P48636', title: 'Lemon & Lime', flavour: 'Lemon & Lime' }),
      ],
    })
    expect(relabel(done, NAMES, true)).toBeNull()
  })
})

describe('titleLooksLikeAFlavour', () => {
  it('spots a title that is what the flavours share plus a flavour', () => {
    // No supplier call needed to find these, which is why the scan flags them
    // for free — only fixing one costs a lookup.
    expect(titleLooksLikeAFlavour(product())).toBe(true)
  })

  it('is quiet once the product wears the shared name', () => {
    expect(titleLooksLikeAFlavour(product({ title: 'Hydration+' }))).toBe(false)
  })

  it('is quiet about a title nobody derived from the supplier', () => {
    // It decides what to LOOK at; `titleFromSiblings` decides what to change,
    // and refuses this one anyway. Agreeing here keeps the list honest.
    expect(titleLooksLikeAFlavour(product({ title: 'CHRGD Hydration' }))).toBe(false)
  })

  it('has nothing to say about a single-variant product', () => {
    // One SKU: its name IS the product's name, and correctly so.
    const single = product({ variants: [variant({ id: 'a', sku: 'P1', title: 'Hydration+, Blue Raspberry - 240 grams' })] })
    expect(titleLooksLikeAFlavour(single)).toBe(false)
  })
})
