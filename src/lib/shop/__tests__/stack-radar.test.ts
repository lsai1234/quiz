import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { ResolvedBasketLine } from '@/lib/basket/types'
import { isClaimSafe } from '../claim-safety'
import {
  slotCoverage,
  activeOverlaps,
  activeLabel,
  formatDoseMg,
  overlapSentence,
} from '../stack-radar'

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

const WHEY = makeProduct({ id: 'whey', title: 'CHRGD Whey Protein', stackSlots: ['protein'] })
const SALTS = makeProduct({ id: 'salts', title: 'CHRGD Electrolyte Mix', stackSlots: ['hydration'] })
const MAG = makeProduct({
  id: 'mag', title: 'CHRGD Magnesium Glycinate', stackSlots: ['sleep'],
  actives: [{ name: 'magnesium', mg: 400 }],
})
const SLEEP_BLEND = makeProduct({
  id: 'sleep', title: 'CHRGD Sleep Blend', stackSlots: ['sleep', 'recovery'],
  actives: [{ name: 'magnesium', mg: 60 }, { name: 'theanine', mg: 200 }],
})
const ADAPTOGEN = makeProduct({
  id: 'adapt', title: 'CHRGD Calm', stackSlots: ['health'],
  actives: [{ name: 'ashwagandha', mg: 600 }],
})

const CATALOGUE = [WHEY, SALTS, MAG, SLEEP_BLEND, ADAPTOGEN]

function line(product: CatalogueProduct, quantity = 1): ResolvedBasketLine {
  const v = product.variants[0]
  return { product, variant: v, quantity, lineTotal: v.price * quantity }
}

describe('activeLabel', () => {
  it('turns a stored key into something a person would read', () => {
    expect(activeLabel('magnesium')).toBe('Magnesium')
    expect(activeLabel('beta-alanine')).toBe('Beta Alanine')
    expect(activeLabel('vitamin-c')).toBe('Vitamin C')
  })
})

describe('slotCoverage', () => {
  it('reports what the basket covers and what it does not', () => {
    const rows = slotCoverage([line(WHEY)], CATALOGUE)
    const protein = rows.find((r) => r.slot === 'protein')!
    expect(protein.covered).toBe(true)
    expect(protein.products.map((p) => p.id)).toEqual(['whey'])
    expect(rows.find((r) => r.slot === 'hydration')!.covered).toBe(false)
  })

  it('leads with what IS covered', () => {
    const rows = slotCoverage([line(SALTS)], CATALOGUE)
    expect(rows[0].covered).toBe(true)
    expect(rows[0].slot).toBe('hydration')
  })

  it('omits slots the shop sells nothing for — a dead end is not information', () => {
    const rows = slotCoverage([], CATALOGUE)
    // Nothing in this catalogue fills these, so they are not offered at all.
    expect(rows.map((r) => r.slot)).not.toContain('menopause')
    expect(rows.map((r) => r.slot)).not.toContain('gut')
    expect(rows.every((r) => r.available > 0)).toBe(true)
  })

  it('counts a product into every slot it fills', () => {
    const rows = slotCoverage([line(SLEEP_BLEND)], CATALOGUE)
    expect(rows.find((r) => r.slot === 'sleep')!.covered).toBe(true)
    expect(rows.find((r) => r.slot === 'recovery')!.covered).toBe(true)
  })

  it('covers nothing for an empty basket, but still maps the shop', () => {
    const rows = slotCoverage([], CATALOGUE)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => !r.covered)).toBe(true)
  })
})

/**
 * The part worth building. Telling someone they are buying the same ingredient
 * twice is telling them to spend less, which is the most trust-building thing a
 * supplement shop can do — and we are one of very few holding the data to do it.
 */
describe('activeOverlaps', () => {
  it('spots the same active arriving from two products, and totals the labels', () => {
    const overlaps = activeOverlaps([line(MAG), line(SLEEP_BLEND)])
    expect(overlaps).toHaveLength(1)
    expect(overlaps[0]).toMatchObject({ key: 'magnesium', label: 'Magnesium', totalMg: 460 })
    expect(overlaps[0].products.map((p) => p.id)).toEqual(['mag', 'sleep'])
  })

  it('says nothing about an ingredient only one product carries', () => {
    expect(activeOverlaps([line(MAG), line(ADAPTOGEN)])).toEqual([])
  })

  it('says nothing about a basket of one product, however many actives it has', () => {
    expect(activeOverlaps([line(SLEEP_BLEND)])).toEqual([])
  })

  it('counts per product, not per line — two tubs is a quantity, not a duplication', () => {
    expect(activeOverlaps([line(MAG, 2)])).toEqual([])
  })

  it('withholds a total rather than understating it when a dose is missing', () => {
    const noDose = makeProduct({ id: 'nd', actives: [{ name: 'magnesium' }] })
    const overlaps = activeOverlaps([line(MAG), line(noDose)])
    expect(overlaps[0].products).toHaveLength(2)
    // 400mg would be the WRONG total, and low is the one direction this must
    // never round.
    expect(overlaps[0].totalMg).toBeNull()
  })

  it('ignores a product that lists the same active twice', () => {
    const sloppy = makeProduct({ id: 's', actives: [{ name: 'magnesium', mg: 10 }, { name: 'Magnesium', mg: 10 }] })
    expect(activeOverlaps([line(sloppy)])).toEqual([])
  })

  it('matches on the stored key regardless of case or spacing', () => {
    const other = makeProduct({ id: 'o', actives: [{ name: '  MAGNESIUM ', mg: 100 }] })
    expect(activeOverlaps([line(MAG), line(other)])[0].totalMg).toBe(500)
  })

  it('leads with the most duplicated', () => {
    const a = makeProduct({ id: 'a', actives: [{ name: 'magnesium', mg: 1 }, { name: 'zinc', mg: 1 }] })
    const b = makeProduct({ id: 'b', actives: [{ name: 'magnesium', mg: 1 }, { name: 'zinc', mg: 1 }] })
    const c = makeProduct({ id: 'c', actives: [{ name: 'magnesium', mg: 1 }] })
    expect(activeOverlaps([line(a), line(b), line(c)])[0].key).toBe('magnesium')
  })
})

describe('formatDoseMg', () => {
  it('switches to grams once a dose passes one', () => {
    expect(formatDoseMg(400)).toBe('400mg')
    expect(formatDoseMg(1000)).toBe('1g')
    expect(formatDoseMg(2400)).toBe('2.4g')
  })
})

/**
 * The sentence is arithmetic, never advice. Naming a dose as too much, or
 * telling someone to stop taking something, is a claim — and this is a shop.
 */
describe('overlapSentence', () => {
  const sentence = () => overlapSentence(activeOverlaps([line(MAG), line(SLEEP_BLEND)])[0])

  it('names both products, the ingredient and the total', () => {
    expect(sentence()).toBe('CHRGD Magnesium Glycinate and CHRGD Sleep Blend both contain magnesium — 460mg in total.')
  })

  it('leaves the total out when it is not known', () => {
    const noDose = makeProduct({ id: 'nd', title: 'CHRGD Mystery', actives: [{ name: 'magnesium' }] })
    const text = overlapSentence(activeOverlaps([line(MAG), line(noDose)])[0])
    expect(text).toBe('CHRGD Magnesium Glycinate and CHRGD Mystery both contain magnesium.')
  })

  it('makes no claim about the dose being too much, or about health at all', () => {
    const text = sentence()
    expect(isClaimSafe(text)).toBe(true)
    expect(text).not.toMatch(/too much|excess|unsafe|overdose|harm|stop taking|should not/i)
  })

  it('summarises rather than listing when three or more products share one', () => {
    const a = makeProduct({ id: 'a', title: 'A', actives: [{ name: 'zinc', mg: 5 }] })
    const b = makeProduct({ id: 'b', title: 'B', actives: [{ name: 'zinc', mg: 5 }] })
    const c = makeProduct({ id: 'c', title: 'C', actives: [{ name: 'zinc', mg: 5 }] })
    const text = overlapSentence(activeOverlaps([line(a), line(b), line(c)])[0])
    expect(text).toBe('3 of your products contain zinc — 15mg in total.')
  })
})
