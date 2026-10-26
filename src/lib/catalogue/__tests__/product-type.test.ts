import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { SwapGroup } from '../types'
import { PRODUCT_TYPE_LABELS, isProductTypeLabel, productTypeLabel } from '../product-type'

/**
 * The type tag says what a product IS. A word for what it is for or what it
 * does, beside a product, is a health claim the register does not authorise.
 */
const PURPOSE = /joint|night|sleep|menopause|thermo|burn|fat|nootropic|mass|gain|energy|probiotic|immun|stress|recover|calm|focus|support/i

describe('productTypeLabel', () => {
  it('never names a purpose or an effect', () => {
    for (const label of Object.values(PRODUCT_TYPE_LABELS)) expect(label).not.toMatch(PURPOSE)
    for (const p of MOCK_CATALOGUE) expect(productTypeLabel(p)).not.toMatch(PURPOSE)
  })

  it('names a purpose-named kind by its one active, when it has one we can name', () => {
    const one = (swapGroup: SwapGroup, name: string) => productTypeLabel({ swapGroup, actives: [{ name }] })
    expect(one('adaptogen', 'ashwagandha')).toBe('Ashwagandha')
    expect(one('nootropic', 'L-theanine')).toBe('L-theanine')
    expect(one('sleep-support', 'magnesium')).toBe('Magnesium')
  })

  it('falls back to a plain word for a blend, or an active whose stored name is not fit to show', () => {
    const blend = [{ name: 'magnesium', mg: 60 }, { name: 'theanine', mg: 200 }]
    expect(productTypeLabel({ swapGroup: 'sleep-support', actives: blend })).toBe('Blend')
    expect(productTypeLabel({ swapGroup: 'joint-support', actives: [{ name: 'collagen peptides' }] })).toBe('Blend')
    expect(productTypeLabel({ swapGroup: 'adaptogen', actives: [{ name: 'rhodiola 3% rosavins' }] })).toBe('Herbal extract')
    expect(productTypeLabel({ swapGroup: 'nootropic' })).toBe('Supplement')
  })

  it('reads the actives only for purpose-named kinds', () => {
    expect(productTypeLabel({ swapGroup: 'vitamin-c', actives: [{ name: 'zinc' }] })).toBe('Vitamin C')
  })

  it('is a generic word with no product', () => {
    expect(productTypeLabel(null)).toBe('Supplement')
  })
})

describe('isProductTypeLabel', () => {
  it('knows every label productTypeLabel gives', () => {
    for (const p of MOCK_CATALOGUE) expect(isProductTypeLabel(productTypeLabel(p))).toBe(true)
    expect(isProductTypeLabel('L-theanine')).toBe(true)
    expect(isProductTypeLabel('Vitamin B12')).toBe(true)
  })

  it('refuses the slot titles old share cards stored, which name a benefit', () => {
    for (const title of ['Immune Support', 'Sleep', 'Stress Support', 'Recovery', 'Sleep & Recovery', 'Night-time blend']) {
      expect(isProductTypeLabel(title)).toBe(false)
    }
  })
})
