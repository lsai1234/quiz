import {
  basketItemCount, basketSubtotal, pruneBasket, resolveBasket, resolvedItemCount,
} from '../helpers'
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
