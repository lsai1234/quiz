import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { parseSize, servingsForVariant, pricePerServing, formatPerServing } from '../per-serving'

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
