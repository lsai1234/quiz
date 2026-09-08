import {
  relabel,
  titleLooksLikeAFlavour,
  variantWearingTheProductName,
  namingLooksWrong,
  skusToAsk,
  putNamesRightWayRound,
  type SupplierName,
} from '../variant-naming'
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

/**
 * The product as it actually stood in the shop, from the Hub screenshot.
 *
 * Four SKUs. The product is named after the main one; the main one's ROW is
 * named after the product; the other three still carry their full supplier
 * names. Nothing here looks like a SKU code, which is what the narrow pass used
 * to key on — so it asked the supplier about nothing, compared the muddled
 * titles with themselves, found them consistent and reported nothing to do.
 */
const HYDRATION = product({
  title: 'Hydration+, Blue Raspberry - 240 grams',
  variants: [
    variant({ id: 'a', sku: 'P48633', title: 'Hydration+' }),
    variant({ id: 'b', sku: 'P48636', title: 'Hydration+, Lemon & Lime - 240 grams' }),
    variant({ id: 'c', sku: 'P48637', title: 'Hydration+, Strawberry Raspberry - 240 grams' }),
    variant({ id: 'd', sku: 'P48638', title: 'Hydration+, Tropical Vibes - 240 grams' }),
  ],
})

const HYDRATION_NAMES = new Map<string, SupplierName>([
  ['P48633', { name: 'Hydration+, Blue Raspberry - 240 grams', flavour: null }],
  ['P48636', { name: 'Hydration+, Lemon & Lime - 240 grams', flavour: null }],
  ['P48637', { name: 'Hydration+, Strawberry Raspberry - 240 grams', flavour: null }],
  ['P48638', { name: 'Hydration+, Tropical Vibes - 240 grams', flavour: null }],
])

describe('the product from the shop', () => {
  it('is asked about in full, not just for the SKUs showing a code', () => {
    // The bug that made the pass a no-op: none of these look like codes, so the
    // run fetched nothing and had only the muddled titles to compare.
    expect(skusToAsk(HYDRATION, false)).toEqual(['P48633', 'P48636', 'P48637', 'P48638'])
    expect(namingLooksWrong(HYDRATION)).toBe(true)
    expect(variantWearingTheProductName(HYDRATION)).toBe(true)
  })

  it('comes out of one narrow pass with the two ends the right way round', () => {
    const result = relabel(HYDRATION, HYDRATION_NAMES, false)!

    expect(result.renamedTo).toBe('Hydration+')
    expect(result.product.variants.map((v) => v.title)).toEqual([
      'Blue Raspberry', 'Lemon & Lime', 'Strawberry Raspberry', 'Tropical Vibes',
    ])
    // The flavour is the flavour, on the field the shop's picker reads.
    expect(result.product.variants.map((v) => v.flavour)).toEqual([
      'Blue Raspberry', 'Lemon & Lime', 'Strawberry Raspberry', 'Tropical Vibes',
    ])
  })

  it('leaves a label somebody typed by hand, even in the same product', () => {
    const edited = {
      ...HYDRATION,
      variants: HYDRATION.variants.map((v, i) => (i === 1 ? { ...v, title: 'Lemon Lime (house name)' } : v)),
    }
    const result = relabel(edited, HYDRATION_NAMES, false)!

    expect(result.product.variants[1].title).toBe('Lemon Lime (house name)')
    // …and the rest are still put right.
    expect(result.product.variants[0].title).toBe('Blue Raspberry')
  })

  it('is idempotent — a second press finds nothing left to do', () => {
    const once = relabel(HYDRATION, HYDRATION_NAMES, false)!
    expect(relabel(once.product, HYDRATION_NAMES, false)).toBeNull()
  })
})

describe('putting both ends right from what we already hold', () => {
  /*
    The Grenade bars, as they actually went live: every name present, every one
    a correct supplier name, and on the wrong rows. There is nothing to fetch —
    the title opens with one of its own rows and then keeps going.
  */
  const BARS = product({
    title: 'Protein Bars, Caramel Chaos - 12 x 60g',
    variants: [
      variant({ id: 'a', sku: 'P24068', title: 'Protein Bars', size: '60 g' }),
      variant({ id: 'b', sku: 'P51981', title: 'Protein Bars, Chocolate Chip Cookie Dough - 12 x 60g', size: '60 g' }),
      variant({ id: 'c', sku: 'P51982', title: 'Bars, Dark Chocolate Mint - 12 x 60g', size: '60 g' }),
    ],
    defaultVariantId: 'a',
  })

  it('swaps the two ends and trims the rest, with no supplier call', () => {
    const out = putNamesRightWayRound(BARS)!
    expect(out.title).toBe('Protein Bars')
    // The row that was wearing the product's name takes back the flavour the
    // title was carrying — and the pack size every sibling repeats comes off
    // the end, because a run they all share cannot tell them apart.
    expect(out.variants[0]).toMatchObject({ title: 'Caramel Chaos', flavour: 'Caramel Chaos' })
    // …the row repeating the product's name loses the repetition…
    expect(out.variants[1].title).toBe('Chocolate Chip Cookie Dough')
    // …and the row named some other way keeps its own wording, minus that
    // same shared ending.
    expect(out.variants[2].title).toBe('Bars, Dark Chocolate Mint')
    expect(out.swapped).toBe('P24068')
  })

  it('trims even when the product was already named correctly', () => {
    const out = putNamesRightWayRound(
      product({
        title: 'Protein Bars',
        variants: [
          variant({ id: 'a', sku: 'P1', title: 'Protein Bars, Caramel Chaos - 12 x 60g' }),
          variant({ id: 'b', sku: 'P2', title: 'Fudged Up' }),
        ],
      }),
    )!
    expect(out.title).toBe('Protein Bars')
    expect(out.swapped).toBeNull()
    expect(out.variants[0].title).toBe('Caramel Chaos - 12 x 60g')
    expect(out.variants[1].title).toBe('Fudged Up')
  })

  it('prefers the master when two rows both open the title', () => {
    // The title came from the master's supplier name, so where two rows could
    // be the one wearing it, the master is the one it came from.
    const out = putNamesRightWayRound(
      product({
        title: 'Whey Protein Professional, Banana',
        defaultVariantId: 'b',
        variants: [
          variant({ id: 'a', sku: 'P1', title: 'Whey' }),
          variant({ id: 'b', sku: 'P2', title: 'Whey Protein Professional' }),
        ],
      }),
    )!
    expect(out.title).toBe('Whey Protein Professional')
    expect(out.swapped).toBe('P2')
  })

  it('leaves a row still showing its code alone, flavour included', () => {
    // `flavour: null` is the honest "we were never told", and it is what the
    // supplier-driven repair looks for. Stamping the code into it would hide
    // the row from the pass that can actually fix it.
    const out = putNamesRightWayRound(
      product({
        title: 'Hydration+, Blue Raspberry - 240 grams',
        variants: [
          variant({ id: 'a', sku: 'P1', title: 'Hydration+' }),
          variant({ id: 'b', sku: 'P2', title: 'P45757' }),
        ],
      }),
    )!
    expect(out.variants[1]).toMatchObject({ title: 'P45757', flavour: null })
  })

  it('says nothing about a product that is already right', () => {
    expect(
      putNamesRightWayRound(
        product({
          title: 'Hydration+',
          variants: [
            variant({ id: 'a', sku: 'P1', title: 'Blue Raspberry', flavour: 'Blue Raspberry' }),
            variant({ id: 'b', sku: 'P2', title: 'Lemon & Lime', flavour: 'Lemon & Lime' }),
          ],
        }),
      ),
    ).toBeNull()
    // …and has nothing to compare on a product with one SKU.
    expect(putNamesRightWayRound(product({ variants: [variant({ id: 'a', title: 'Hydration+' })] }))).toBeNull()
  })
})

describe('the pack size they all end with', () => {
  it('comes off, because it cannot tell one flavour from another', () => {
    const out = putNamesRightWayRound(
      product({
        title: 'Protein Bars',
        variants: [
          variant({ id: 'a', sku: 'P1', title: 'Caramel Chaos - 12 x 60g' }),
          variant({ id: 'b', sku: 'P2', title: 'Fudged Up - 12 x 60g' }),
        ],
      }),
    )!
    expect(out.variants.map((v) => v.title)).toEqual(['Caramel Chaos', 'Fudged Up'])
  })

  it('stays on when the packs differ', () => {
    // Then the pack IS part of what tells them apart, which is the whole test.
    expect(
      putNamesRightWayRound(
        product({
          title: 'Protein Bars',
          variants: [
            variant({ id: 'a', sku: 'P1', title: 'Caramel Chaos - 12 x 60g' }),
            variant({ id: 'b', sku: 'P2', title: 'Fudged Up - 6 x 60g' }),
          ],
        }),
      ),
    ).toBeNull()
  })

  it('will not take the flavour off the end of a flavour', () => {
    // The trap a generic "strip whatever they all end with" walks into: these
    // two share "Caramel Chaos" at the end, and that shared run IS the flavour.
    const out = putNamesRightWayRound(
      product({
        title: 'Protein Bars',
        variants: [
          variant({ id: 'a', sku: 'P1', title: 'Caramel Chaos' }),
          variant({ id: 'b', sku: 'P2', title: 'Fudged Up Caramel Chaos' }),
        ],
      }),
    )
    expect(out).toBeNull()
  })
})
