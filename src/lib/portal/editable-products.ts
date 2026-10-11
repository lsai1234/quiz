import type { CatalogueProduct } from '@/lib/catalogue/types'
import { applyPatch, diffProducts, isEmptyPatch } from '@/lib/catalogue/patch'
import { rememberRenames } from '@/lib/catalogue/line-variant'
import { editStoredProduct } from './store'
import { listEditableProducts } from './product-edit'

/**
 * Reading and writing a product for the supplier pull and the price screen.
 *
 * Both work the same way: read the product, work out what it should become, save
 * that. The save used to write the WHOLE product back — an imported record
 * replaced wholesale — so anything that moved between the read and the write
 * (the stock sync, another screen) was put back as it was. `saveProductChange`
 * writes only what this pass changed, onto the product as it is at write time.
 */

/** Every product a founder can edit, as it currently stands (pending and removed included). */
export async function allEditableProducts(): Promise<CatalogueProduct[]> {
  return (await listEditableProducts()).map((e) => e.product)
}

/** …and one of them, by id. */
export async function editableProduct(id: string): Promise<CatalogueProduct | undefined> {
  return (await allEditableProducts()).find((p) => p.id === id)
}

/**
 * Save what changed between `before` (as read) and `after` (as worked out).
 * Returns the product as saved, or `before` untouched when nothing changed.
 */
export async function saveProductChange(before: CatalogueProduct, after: CatalogueProduct): Promise<CatalogueProduct> {
  // A pass that renames flavours (the name repair) keeps the old names on file,
  // so subscription lines written against them still find them.
  const patch = diffProducts(before, rememberRenames(before, after))
  if (isEmptyPatch(patch)) return before
  // No servings spread: a pass that sets a SKU's own count means that SKU.
  return editStoredProduct(after.id, (current) => applyPatch(current, patch, { spreadServings: false }))
}
