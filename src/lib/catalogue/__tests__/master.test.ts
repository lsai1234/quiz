import { masterVariant, masterPatch } from '../master'
import type { CatalogueProduct, CatalogueVariant } from '../types'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 14.99, compareAtPrice: null, available: true, ...over }
}

function product(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'glycine', title: 'Glycine', handle: 'glycine', description: '', imageUrl: 'https://pb/caps.jpg',
    category: 'Amino Acids', stackSlots: ['recovery'], goals: ['recovery'], dietaryTags: [], formats: ['capsule'],
    variants: [
      variant({ id: 'caps', sku: 'P100', title: '100 vcaps', price: 14.99, servings: 33, cost: 8.2, imageUrl: 'https://pb/caps.jpg' }),
      variant({ id: 'powder', sku: 'P200', title: 'Pure Powder', price: 39.99, servings: 454, cost: 24.5, imageUrl: 'https://pb/powder.jpg' }),
    ],
    basePrice: 14.99, compareAtPrice: null, servings: 33, cost: 8.2, subscriptionEligible: true,
    swapGroup: 'aminos', recommendationPriority: 5, marginPriority: 5, isCoreEligible: true,
    isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [],
    defaultVariantId: 'caps', ...over,
  }
}

describe('which SKU a product presents itself as', () => {
  it('is the stored choice', () => {
    const p = product({ defaultVariantId: 'powder' })
    expect(masterVariant(p)?.id).toBe('powder')
  })

  it('reads past a master that is sold out, without moving it', () => {
    // The fallback is a read, not a write: a stock level is a fact about today
    // and the master is a decision. The shop shows something buyable; the
    // stored choice is still there when the flavour comes back.
    const p = product({
      defaultVariantId: 'caps',
      variants: [variant({ id: 'caps', available: false }), variant({ id: 'powder' })],
    })
    expect(masterVariant(p)?.id).toBe('powder')
    expect(p.defaultVariantId).toBe('caps')
  })

  it('falls back to the first listed when nothing is buyable, and when the choice is gone', () => {
    expect(
      masterVariant(product({
        defaultVariantId: 'caps',
        variants: [variant({ id: 'caps', available: false }), variant({ id: 'powder', available: false })],
      }))?.id,
    ).toBe('caps')
    // A master that was deleted must not leave the product with none.
    expect(masterVariant(product({ defaultVariantId: 'gone' }))?.id).toBe('caps')
    expect(masterVariant(product({ variants: [] }))).toBeUndefined()
  })
})

describe('what changes when a different SKU becomes the master', () => {
  it('moves everything that describes one unit', () => {
    // The glycine: 100 capsules at £14.99 and a 454-serving bag at £39.99 under
    // one master SKU. Whichever is the master is what the shelf quotes.
    expect(masterPatch(product(), 'powder')).toEqual({
      defaultVariantId: 'powder',
      basePrice: 39.99,
      compareAtPrice: null,
      imageUrl: 'https://pb/powder.jpg',
      servings: 454,
      cost: 24.5,
    })
  })

  it('leaves the product name alone', () => {
    // A master SKU is one flavour. Naming the product after it is the bug that
    // put "Hydration+, Blue Raspberry - 240 grams" on a four-flavour product.
    expect(masterPatch(product(), 'powder')).not.toHaveProperty('title')
    expect(masterPatch(product(), 'powder')).not.toHaveProperty('handle')
  })

  it('does not blank what the new master does not know about itself', () => {
    const p = product({
      variants: [
        product().variants[0],
        variant({ id: 'powder', sku: 'P200', title: 'Pure Powder', price: 39.99 }),
      ],
    })
    const patch = masterPatch(p, 'powder')
    expect(patch).toMatchObject({ defaultVariantId: 'powder', basePrice: 39.99 })
    // No picture, servings or cost of its own — the product keeps what it has
    // rather than losing them to a variant that was never asked about.
    expect(patch).not.toHaveProperty('imageUrl')
    expect(patch).not.toHaveProperty('servings')
    expect(patch).not.toHaveProperty('cost')
  })

  it('is nothing to do when the choice is already stored, and impossible for a SKU that is not there', () => {
    expect(masterPatch(product(), 'caps')).toBeNull()
    expect(masterPatch(product(), 'nope')).toBeNull()
  })

  it('clears a stale RRP the new master does not have', () => {
    // Otherwise a product carries the old master's "was £59.99" against the new
    // one's price, which is a saving nobody is offering.
    const p = product({ compareAtPrice: 59.99 })
    expect(masterPatch(p, 'powder')).toMatchObject({ compareAtPrice: null })
  })
})
