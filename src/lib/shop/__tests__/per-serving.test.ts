import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { parseSize, servingsForVariant, pricePerServing, formatPerServing, interchangeableVariants } from '../per-serving'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, ...over }
}

function makeProduct(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'p', title: 'P', handle: 'p', description: '', imageUrl: null, category: 'Protein',
    stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'],
    variants: [variant()], basePrice: 30, compareAtPrice: null, subscriptionEligible: true,
    servings: 30, swapGroup: 'protein-whey', recommendationPriority: 5, marginPriority: 5,
    isCoreEligible: true, isBoosterEligible: false, hasStimulants: false, shortReason: '',
    warnings: [], ...over,
  }
}

describe('parseSize', () => {
  it('reads mass, normalising to grams', () => {
    expect(parseSize('1kg')).toEqual({ value: 1000, unit: 'mass' })
    expect(parseSize('300g')).toEqual({ value: 300, unit: 'mass' })
    expect(parseSize('2.5kg')).toEqual({ value: 2500, unit: 'mass' })
  })

  it('reads counts, however the unit is written', () => {
    expect(parseSize('90 softgels')).toEqual({ value: 90, unit: 'count' })
    expect(parseSize('60 caps')).toEqual({ value: 60, unit: 'count' })
    expect(parseSize('120 capsules')).toEqual({ value: 120, unit: 'count' })
    expect(parseSize('30 servings')).toEqual({ value: 30, unit: 'count' })
    expect(parseSize('60 Tablets')).toEqual({ value: 60, unit: 'count' })
  })

  it('returns null rather than guessing at anything else', () => {
    expect(parseSize(null)).toBeNull()
    expect(parseSize('')).toBeNull()
    expect(parseSize('Large')).toBeNull()
    expect(parseSize('family size')).toBeNull()
    expect(parseSize('0g')).toBeNull()
  })
})

/**
 * The regression this module exists to prevent. Every fixture below is a real
 * shape from the catalogue, where `product.servings` describes only the FIRST
 * variant and a naive division would invert the value comparison.
 */
describe('servingsForVariant', () => {
  const WHEY = makeProduct({
    servings: 30,
    variants: [
      variant({ id: '1kg', size: '1kg', price: 34.99 }),
      variant({ id: '2kg', size: '2kg', price: 59.99 }),
    ],
  })

  it('uses the product figure for the variant it describes', () => {
    expect(servingsForVariant(WHEY, WHEY.variants[0])).toBe(30)
  })

  it('scales a bigger container up, rather than pricing it as the small one', () => {
    expect(servingsForVariant(WHEY, WHEY.variants[1])).toBe(60)
  })

  it('scales counts the same way', () => {
    const omega = makeProduct({
      servings: 90,
      variants: [
        variant({ id: '90', size: '90 softgels', price: 14.99 }),
        variant({ id: '180', size: '180 softgels', price: 26.99 }),
      ],
    })
    expect(servingsForVariant(omega, omega.variants[1])).toBe(180)
  })

  it('scales down as well as up', () => {
    const p = makeProduct({
      servings: 60,
      variants: [variant({ id: 'big', size: '600g' }), variant({ id: 'small', size: '300g' })],
    })
    expect(servingsForVariant(p, p.variants[1])).toBe(30)
  })

  it('refuses to make a ratio out of two different units', () => {
    const p = makeProduct({
      servings: 30,
      variants: [variant({ id: 'powder', size: '300g' }), variant({ id: 'caps', size: '60 caps' })],
    })
    expect(servingsForVariant(p, p.variants[1])).toBeNull()
  })

  it('returns null when either size is unreadable', () => {
    const p = makeProduct({
      servings: 30,
      variants: [variant({ id: 'a', size: '300g' }), variant({ id: 'b', size: 'Large' })],
    })
    expect(servingsForVariant(p, p.variants[1])).toBeNull()
  })

  it('still answers for a product whose only variant has no size', () => {
    const p = makeProduct({ servings: 30, variants: [variant({ id: 'only', size: null })] })
    expect(servingsForVariant(p, p.variants[0])).toBe(30)
  })

  it('falls back to the derived consumption when servings is not set', () => {
    // `resolveConsumption` fills in a month for a daily product with no figure.
    const p = makeProduct({ servings: 0, variants: [variant({ id: 'only' })] })
    expect(servingsForVariant(p, p.variants[0])).toBeGreaterThan(0)
  })

  it('prefers an explicit consumption override to the servings field', () => {
    const p = makeProduct({
      servings: 30,
      consumption: { cadence: 'daily', servingsPerUnit: 45 },
      variants: [variant({ id: 'only' })],
    })
    expect(servingsForVariant(p, p.variants[0])).toBe(45)
  })
})

describe('pricePerServing', () => {
  const WHEY = makeProduct({
    servings: 30,
    variants: [
      variant({ id: '1kg', size: '1kg', price: 34.99 }),
      variant({ id: '2kg', size: '2kg', price: 59.99 }),
    ],
  })

  it('is the whole point: the bigger tub is the better value, and says so', () => {
    const small = pricePerServing(WHEY, WHEY.variants[0])!
    const big = pricePerServing(WHEY, WHEY.variants[1])!
    expect(small).toBeCloseTo(1.166, 2)
    expect(big).toBeCloseTo(1.0, 2)
    expect(big).toBeLessThan(small)
  })

  it('is null when the servings cannot be known', () => {
    const p = makeProduct({
      servings: 30,
      variants: [variant({ id: 'a', size: '300g' }), variant({ id: 'b', size: 'Large' })],
    })
    expect(pricePerServing(p, p.variants[1])).toBeNull()
  })

  it('is null for a free or nonsensical price rather than infinity', () => {
    const p = makeProduct({ servings: 30, variants: [variant({ id: 'a', price: 0 })] })
    expect(pricePerServing(p, p.variants[0])).toBeNull()
  })
})

describe('formatPerServing', () => {
  it('uses pence below a pound, where "£0.07" reads as noise', () => {
    expect(formatPerServing(0.07)).toBe('7p')
    expect(formatPerServing(0.166)).toBe('17p')
    expect(formatPerServing(0.99)).toBe('99p')
  })

  it('uses pounds at and above one, rounding before choosing the unit', () => {
    // 99.5p is a pound once rounded, and "100p" is not how anyone writes that.
    expect(formatPerServing(0.995)).toBe('£1.00')
    expect(formatPerServing(1)).toBe('£1.00')
    expect(formatPerServing(1.166)).toBe('£1.17')
  })
})

describe("a variant's own serving count", () => {
  it('is used in preference to anything scaled from a sibling', () => {
    // The glycine: 100 capsules and a 454g bag of the same powder under one
    // master SKU. No ratio between the two can reach 454 from 33 — their sizes
    // are not even in the same unit — so the supplier's own count is the only
    // answer there is.
    const capsules = variant({ id: 'caps', size: '100 caps', price: 21.99, servings: 33 })
    const powder = variant({ id: 'powder', size: '454 grams', price: 39.99, servings: 454 })
    const product = makeProduct({ variants: [capsules, powder], servings: 33 })

    expect(servingsForVariant(product, capsules)).toBe(33)
    expect(servingsForVariant(product, powder)).toBe(454)
    // …and the per-serving price follows it: 9p a serving, not £1.27.
    expect(formatPerServing(pricePerServing(product, powder)!)).toBe('9p')
  })

  it('falls back to scaling when the supplier never said', () => {
    const base = variant({ id: 'base', size: '1kg' })
    const big = variant({ id: 'big', size: '2kg', price: 50 })
    const product = makeProduct({ variants: [base, big], servings: 30 })
    expect(servingsForVariant(product, big)).toBe(60)
  })
})

describe('accessories', () => {
  it('have no servings and no per-serving price, whatever the import wrote', () => {
    // A shaker has no dose. The import used to give it the default 30, which is
    // what put "30 servings" on the card under a bottle.
    const v = variant({ id: 'shaker', price: 3.99 })
    const shaker = makeProduct({
      swapGroup: 'accessory', category: 'Accessories', stackSlots: [], servings: 30, variants: [v],
    })
    expect(servingsForVariant(shaker, v)).toBeNull()
    expect(pricePerServing(shaker, v)).toBeNull()
  })

  it('are recognised by category too, for the ones imported before the rule existed', () => {
    const v = variant({ id: 'bottle', price: 4.99 })
    const bottle = makeProduct({ swapGroup: 'general', category: 'Accessories', servings: 1, variants: [v] })
    expect(servingsForVariant(bottle, v)).toBeNull()
  })
})

describe('what a plan may offer as a swap', () => {
  it('offers the flavours of one tub, which is what the picker is for', () => {
    // The common case: one product, several flavours, no per-variant size. Only
    // the first variant's count is known, and treating "unknown" as "different"
    // would empty the picker for exactly these.
    const choc = variant({ id: 'choc' })
    const vanilla = variant({ id: 'vanilla' })
    const berry = variant({ id: 'berry' })
    const whey = makeProduct({ variants: [choc, vanilla, berry] })

    expect(interchangeableVariants(whey, choc).map((v) => v.id)).toEqual(['choc', 'vanilla', 'berry'])
  })

  it('withholds a variant with a different serving count', () => {
    // 100 capsules and a 454g bag under one master SKU. A plan has sized the
    // month and priced it from the count it chose; offering the other as a
    // flavour swap reprices somebody's stack without saying so.
    const capsules = variant({ id: 'caps', size: '100 caps', price: 21.99, servings: 33 })
    const powder = variant({ id: 'powder', size: '454 grams', price: 39.99, servings: 454 })
    const glycine = makeProduct({ variants: [capsules, powder], servings: 33 })

    expect(interchangeableVariants(glycine, capsules).map((v) => v.id)).toEqual(['caps'])
    expect(interchangeableVariants(glycine, powder).map((v) => v.id)).toEqual(['powder'])
  })

  it('withholds a bigger tub of the same thing, counted by size', () => {
    const small = variant({ id: '1kg', size: '1kg' })
    const big = variant({ id: '2kg', size: '2kg', price: 50 })
    const whey = makeProduct({ variants: [small, big], servings: 30 })

    expect(interchangeableVariants(whey, small).map((v) => v.id)).toEqual(['1kg'])
  })

  it('keeps same-size flavours together while withholding the other size', () => {
    const choc1 = variant({ id: 'choc-1kg', size: '1kg', servings: 30 })
    const van1 = variant({ id: 'van-1kg', size: '1kg', servings: 30 })
    const choc2 = variant({ id: 'choc-2kg', size: '2kg', price: 50, servings: 60 })
    const whey = makeProduct({ variants: [choc1, van1, choc2], servings: 30 })

    expect(interchangeableVariants(whey, choc1).map((v) => v.id)).toEqual(['choc-1kg', 'van-1kg'])
  })

  it('offers everything when nothing knows a serving count', () => {
    const a = variant({ id: 'a' })
    const b = variant({ id: 'b' })
    const shaker = makeProduct({ swapGroup: 'accessory', category: 'Accessories', variants: [a, b] })
    expect(interchangeableVariants(shaker, a)).toHaveLength(2)
  })
})
