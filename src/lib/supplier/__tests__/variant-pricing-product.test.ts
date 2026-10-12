import { repriceVariants, type SkuFacts } from '../variant-pricing'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'

/**
 * The product-level half of `repriceVariants`: the product's cost, RRP and
 * PowerBody id follow its MASTER SKU, which is what the catalogue list,
 * readiness and Top 25 read.
 */

function variant(over: Partial<CatalogueVariant> & { id: string }): CatalogueVariant {
  return { title: over.id, flavour: null, size: '1 kg', price: 21.99, compareAtPrice: null, available: true, ...over }
}

function whey(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'whey', title: 'Critical Whey 1kg', handle: 'whey', description: '', imageUrl: null, category: 'Protein',
    stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'],
    variants: [
      variant({ id: 'choc', sku: 'P100', price: 21.99 }),
      variant({ id: 'van', sku: 'P200', price: 22.99 }),
    ],
    defaultVariantId: 'choc',
    basePrice: 21.99, compareAtPrice: null, servings: 30, subscriptionEligible: true,
    swapGroup: 'protein-whey', recommendationPriority: 5, marginPriority: 5, isCoreEligible: true,
    isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [], ...over,
  }
}

const facts = (entries: Array<[string, Partial<SkuFacts>]>) =>
  new Map<string, SkuFacts>(entries.map(([sku, f]) => [sku, { cost: null, rrp: null, servings: null, name: null, ...f }]))

describe('repriceVariants — the product follows its master', () => {
  it('moves the product’s cost, RRP and id even when no variant changed', () => {
    // Every SKU already carries its facts; only the product is behind.
    const p = whey({
      cost: undefined,
      supplierRrp: null,
      supplierProductId: null,
      variants: [
        variant({ id: 'choc', sku: 'P100', price: 21.99, cost: 11.12, supplierProductId: '4401', servings: 30 }),
        variant({ id: 'van', sku: 'P200', price: 22.99, cost: 11.5, supplierProductId: '4402', servings: 30 }),
      ],
    })
    const out = repriceVariants(p, facts([['P100', { cost: 11.12, rrp: 15.5, productId: '4401' }], ['P200', { cost: 11.5, rrp: 16, productId: '4402' }]]), false)

    expect(out).not.toBeNull()
    expect(out!.product.variants.every((v, i) => v === p.variants[i])).toBe(true)
    expect(out!.product).toMatchObject({ cost: 11.12, supplierRrp: 15.5, supplierProductId: '4401' })
    expect(out!.changed.cost).toBe('product cost £11.12')
  })

  it('returns null when neither the SKUs nor the product moved', () => {
    const p = whey({
      cost: 11.12,
      supplierRrp: 15.5,
      supplierProductId: '4401',
      variants: [
        variant({ id: 'choc', sku: 'P100', price: 21.99, cost: 11.12, supplierProductId: '4401' }),
        variant({ id: 'van', sku: 'P200', price: 22.99, cost: 11.5, supplierProductId: '4402' }),
      ],
    })
    expect(repriceVariants(p, facts([['P100', { cost: 11.12, rrp: 15.5, productId: '4401' }], ['P200', { cost: 11.5, productId: '4402' }]]), false)).toBeNull()
  })

  it('reads the master past one that is out of stock, the way the shop does', () => {
    const p = whey({
      cost: undefined,
      variants: [
        variant({ id: 'choc', sku: 'P100', price: 21.99, available: false }),
        variant({ id: 'van', sku: 'P200', price: 22.99 }),
      ],
    })
    const out = repriceVariants(p, facts([['P100', { cost: 11.12, rrp: 15.5, productId: '4401' }], ['P200', { cost: 11.5, rrp: 16, productId: '4402' }]]), false)!
    expect(out.product).toMatchObject({ cost: 11.5, supplierRrp: 16, supplierProductId: '4402', basePrice: 22.99 })
  })

  it('keeps the product’s RRP when the master’s SKU said none', () => {
    const p = whey({ supplierRrp: 18 })
    const out = repriceVariants(p, facts([['P100', { cost: 11.12, rrp: null }], ['P200', { cost: 11.5, rrp: 30 }]]), false)!
    // The sibling's RRP is not the product's.
    expect(out.product.supplierRrp).toBe(18)
    expect(out.product.cost).toBe(11.12)
  })

  it('keeps the product’s cost when the master has none of its own', () => {
    const p = whey({ cost: 9.5 })
    const out = repriceVariants(p, facts([['P200', { cost: 11.5, rrp: 16, productId: '4402' }]]), false)!
    expect(out.product.cost).toBe(9.5)
    expect(out.changed.cost).toBeUndefined()
    // A sibling's id is not the product's either.
    expect(out.product.supplierProductId ?? null).toBeNull()
  })

  it('keeps the product’s id when the master SKU has none', () => {
    const p = whey({ supplierProductId: '7777' })
    const out = repriceVariants(p, facts([['P200', { cost: 11.5, productId: '4402' }]]), false)!
    expect(out.product.supplierProductId).toBe('7777')
  })

  it('a founder-priced master still gives the product its cost', () => {
    const p = whey({
      cost: undefined,
      variants: [
        variant({ id: 'choc', sku: 'P100', price: 29.99, priceSource: 'founder' }),
        variant({ id: 'van', sku: 'P200', price: 29.99 }),
      ],
    })
    const out = repriceVariants(p, facts([['P100', { cost: 11.12 }], ['P200', { cost: 14 }]]), true)!
    expect(out.product.variants[0].price).toBe(29.99)
    expect(out.product.cost).toBe(11.12)
    expect(out.product.basePrice).toBe(29.99)
  })
})
