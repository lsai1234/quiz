import {
  basketItemCount, basketSubtotal, basketSupplierValue, priceBasket, pruneBasket,
  resolveBasket, resolvedItemCount,
} from '../helpers'
import { priceAtFounderTerms } from '@/lib/founder-codes/codes'
import { getPricingConfig, priceOneOffLines, unitCostOf } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * The ghost basket.
 *
 * The badge counted raw persisted lines while every price came from the
 * resolved ones, so a basket holding products that had left the catalogue read
 * "2" next to "£0.00" — a shop telling you that you have two things and owe
 * nothing, before you had added anything at all.
 */
describe('a basket holding products that no longer exist', () => {
  const product = {
    id: 'p1',
    variants: [{ id: 'v1', price: 10, available: true }],
  } as unknown as CatalogueProduct

  const lines = [
    { productId: 'p1', variantId: 'v1', quantity: 1 },
    { productId: 'gone', variantId: 'v9', quantity: 2 },
  ]

  it('counts what it will actually charge for, not what it is carrying', () => {
    const resolved = resolveBasket(lines, [product])
    expect(basketItemCount(lines)).toBe(3)      // what the badge used to say
    expect(resolvedItemCount(resolved)).toBe(1) // what the total agrees with
  })

  it('never shows a count with nothing behind it', () => {
    const resolved = resolveBasket([{ productId: 'gone', variantId: 'v9', quantity: 2 }], [product])
    expect(resolvedItemCount(resolved)).toBe(0)
    expect(basketSubtotal(resolved)).toBe(0)
  })

  it('drops the dead lines from the store, so they stop being carried', () => {
    expect(pruneBasket(lines, [product])).toEqual([
      { productId: 'p1', variantId: 'v1', quantity: 1 },
    ])
  })

  it('drops a line whose variant went even though the product stayed', () => {
    const moved = [{ productId: 'p1', variantId: 'discontinued', quantity: 1 }]
    expect(pruneBasket(moved, [product])).toEqual([])
  })

  it('returns the same array when there is nothing to drop', () => {
    const good = [{ productId: 'p1', variantId: 'v1', quantity: 1 }]
    // Identity, not equality: the caller skips the write on an unchanged array,
    // which is what stops the prune looping against a persisted store.
    expect(pruneBasket(good, [product])).toBe(good)
  })

  it('would empty everything against an unloaded catalogue, which is why callers gate it', () => {
    // Documenting the sharp edge rather than hiding it — `ShopShell` checks
    // `isLoading` and a non-empty catalogue before calling this.
    expect(pruneBasket(lines, [])).toEqual([])
  })
})

/**
 * The drawer and the card have to agree, under a founder code as much as under
 * a bundle tier.
 *
 * `priceBasket` is the one function the shop prices from, and `/api/cart` bills
 * from the same `priceAtFounderTerms` underneath it. A basket showing £0.00
 * against a checkout billing £48 is the failure this delegation exists to
 * prevent, and it is only prevented while both sides call the same thing.
 */
describe('a basket under a founder code', () => {
  const product = {
    id: 'p1',
    cost: 9,
    variants: [{ id: 'v1', price: 30, available: true }],
  } as unknown as CatalogueProduct

  const resolved = resolveBasket([{ productId: 'p1', variantId: 'v1', quantity: 2 }], [product])
  const lines = [{ price: 30, cost: unitCostOf(product, 30), quantity: 2 }]

  it('prices identically to what the checkout will bill', () => {
    for (const kind of ['free', 'cost', 'unlock'] as const) {
      expect(priceBasket(resolved, getPricingConfig(), kind))
        .toEqual(priceAtFounderTerms(kind, lines, getPricingConfig()))
    }
  })

  it('prices exactly as before when no code is applied', () => {
    expect(priceBasket(resolved)).toEqual(priceOneOffLines(lines))
    expect(priceBasket(resolved, getPricingConfig(), null)).toEqual(priceOneOffLines(lines))
  })

  it('reports what we pay the supplier, ex VAT, for the delivery band to read', () => {
    // PowerBody band on the WHOLESALE value of the parcel, not on the retail
    // total — using the wrong one puts a £60 basket in a band it never reaches.
    expect(basketSupplierValue(resolved)).toBe(18)
  })
})
