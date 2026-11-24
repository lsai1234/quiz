import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * Putting an earlier order back in the basket ("Buy again", "Get these every
 * month"): the same variant where it's still on sale, the product's first
 * variant on sale where that one has gone, and a plain list of what can't come
 * back at all, so the member is told rather than left to notice.
 */
export function reorderLines(
  lines: readonly { productId: string; variantId: string | null; title: string; quantity: number }[],
  catalogue: readonly CatalogueProduct[],
): { add: { productId: string; variantId: string; quantity: number }[]; missing: string[] } {
  const add: { productId: string; variantId: string; quantity: number }[] = []
  const missing: string[] = []
  for (const line of lines) {
    const product = catalogue.find((p) => p.id === line.productId)
    const same = product?.variants.find((v) => v.id === line.variantId && v.available)
    const variant = same ?? product?.variants.find((v) => v.available)
    if (!product || !variant) {
      missing.push(line.title)
      continue
    }
    add.push({ productId: product.id, variantId: variant.id, quantity: Math.max(1, Math.round(line.quantity)) })
  }
  return { add, missing }
}
