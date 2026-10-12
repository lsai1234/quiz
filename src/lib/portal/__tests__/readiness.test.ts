import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { productReadiness, type ReadinessCheck } from '../readiness'

/**
 * The traffic lights on a product. What is worth pinning is the difference
 * between a gap someone can close (warn / fail) and one nobody can (info) — and
 * that only the first kind ever makes a product "need attention".
 */

function variant(over: Partial<CatalogueVariant> & { id: string }): CatalogueVariant {
  return { title: over.id, flavour: null, size: '2kg', price: 44.99, compareAtPrice: null, available: true, ...over }
}

/** A complete imported whey: every check passes. */
function ready(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  const { rating: _rating, ...sample } = MOCK_CATALOGUE[0] as CatalogueProduct
  void _rating
  return {
    ...sample,
    id: 'critical-whey',
    imageUrl: 'https://cdn.powerbody.co.uk/media/critical-whey.jpg',
    variants: [
      variant({ id: 'choc', sku: 'P100', supplierProductId: '1100' }),
      variant({ id: 'van', sku: 'P200', supplierProductId: '1200' }),
    ],
    cost: 24.5,
    weightGrams: 2150,
    servings: 30,
    subscriptionEligible: true,
    ...over,
  }
}

function check(p: CatalogueProduct, id: string, live = true): ReadinessCheck {
  const found = productReadiness(p, { live }).checks.find((c) => c.id === id)
  if (!found) throw new Error(`no ${id} check`)
  return found
}

describe('productReadiness', () => {
  it('passes a complete product', () => {
    const r = productReadiness(ready(), { live: true })
    expect(r.overall).toBe('ok')
    expect(r.checks.every((c) => c.status === 'ok')).toBe(true)
    expect(r.productId).toBe('critical-whey')
  })

  describe('cost', () => {
    it('treats 0 as not known — nothing we sell is free to us', () => {
      expect(check(ready({ cost: 0 }), 'pricing')).toMatchObject({ status: 'warn', section: 'supplier' })
      expect(productReadiness(ready({ cost: 0 }), { live: true }).overall).toBe('warn')
    })

    it('warns when there is no cost at all', () => {
      expect(check(ready({ cost: undefined }), 'pricing').status).toBe('warn')
    })

    it('passes any real cost', () => {
      expect(check(ready({ cost: 0.5 }), 'pricing').status).toBe('ok')
    })
  })

  describe('shipping weight', () => {
    it('is information only, live or not, and never moves the overall status', () => {
      for (const weightGrams of [null, 0]) {
        for (const live of [true, false]) {
          const r = productReadiness(ready({ weightGrams }), { live })
          expect(r.checks.find((c) => c.id === 'shipping')?.status).toBe('info')
          expect(r.overall).toBe('ok')
        }
      }
    })
  })

  describe('subscription', () => {
    it('an accessory that cannot be subscribed to is information, not a problem', () => {
      const shaker = ready({ category: 'Gym Accessories', subscriptionEligible: false })
      expect(check(shaker, 'subscription')).toMatchObject({ status: 'info', detail: 'One-off only (an accessory)' })
      expect(productReadiness(shaker, { live: true }).overall).toBe('ok')

      const bySwapGroup = ready({ swapGroup: 'accessory' as CatalogueProduct['swapGroup'], subscriptionEligible: false })
      expect(check(bySwapGroup, 'subscription').status).toBe('info')
    })

    it('a supplement that cannot be subscribed to is a warning', () => {
      expect(check(ready({ subscriptionEligible: false }), 'subscription')).toMatchObject({
        status: 'warn',
        detail: 'Not subscription-eligible',
      })
    })

    it('a subscribable product with no servings fails', () => {
      expect(check(ready({ servings: 0 }), 'subscription').status).toBe('fail')
    })
  })

  describe('PowerBody ids', () => {
    it('counts the SKUs still without an id, as information', () => {
      const p = ready({
        variants: [
          variant({ id: 'choc', sku: 'P100', supplierProductId: '1100' }),
          variant({ id: 'van', sku: 'P200' }),
          variant({ id: 'straw', sku: 'P300' }),
          // A variant with no SKU has nothing to look up.
          variant({ id: 'bundle', sku: null }),
        ],
      })
      expect(check(p, 'supplier-ids')).toMatchObject({ status: 'info', section: 'supplier' })
      expect(check(p, 'supplier-ids').detail).toMatch(/^2 of 3 SKUs without a PowerBody id/)
      expect(productReadiness(p, { live: true }).overall).toBe('ok')
    })

    it('takes the product’s own id for a single-SKU product', () => {
      const p = ready({ variants: [variant({ id: 'only', sku: 'P100' })], supplierProductId: '1100' })
      expect(check(p, 'supplier-ids').status).toBe('ok')
    })

    it('does not let the product’s id stand in for several SKUs', () => {
      const p = ready({ variants: [variant({ id: 'a', sku: 'P100' }), variant({ id: 'b', sku: 'P200' })], supplierProductId: '1100' })
      expect(check(p, 'supplier-ids').detail).toMatch(/^2 of 2 SKUs/)
    })

    it('says "SKU" for one', () => {
      const p = ready({ variants: [variant({ id: 'only', sku: 'P100' })], supplierProductId: null })
      expect(check(p, 'supplier-ids').detail).toMatch(/^1 of 1 SKU without/)
    })
  })

  describe('overall', () => {
    it('ignores information however much of it there is', () => {
      const p = ready({
        weightGrams: null,
        category: 'Accessories',
        subscriptionEligible: false,
        variants: [variant({ id: 'a', sku: 'P100' }), variant({ id: 'b', sku: 'P200' })],
      })
      const r = productReadiness(p, { live: true })
      expect(r.checks.filter((c) => c.status === 'info').map((c) => c.id).sort()).toEqual(['shipping', 'subscription', 'supplier-ids'])
      expect(r.overall).toBe('ok')
    })

    it('is the worst real problem', () => {
      expect(productReadiness(ready({ weightGrams: null, cost: 0 }), { live: true }).overall).toBe('warn')
      expect(productReadiness(ready({ weightGrams: null, servings: 0 }), { live: true }).overall).toBe('fail')
    })

    it('fails a live product that cannot be ordered, and only warns about a draft', () => {
      const noSku = ready({ variants: [variant({ id: 'a', sku: null })] })
      expect(check(noSku, 'identity', true)).toMatchObject({ status: 'fail', section: 'variants' })
      expect(check(noSku, 'identity', false).status).toBe('warn')
    })
  })
})
