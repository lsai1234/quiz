import type { CatalogueProduct } from '@/lib/catalogue/types'
import { applyPatch, diffProducts, isEmptyPatch } from '@/lib/catalogue/patch'
import { rememberRenames } from '@/lib/catalogue/line-variant'
import { provenanceChange, withProvenance } from '@/lib/catalogue/review'
import { editStoredProduct } from './store'
import { listEditableProducts, normaliseServings } from './product-edit'

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
  const worked = rememberRenames(before, after)
  /*
    Never the review as one value. `diffProducts` compares fields whole, so a
    pass that added one source put the ENTIRE review it read into the patch —
    status included. A pull runs for up to four minutes and Approve is not
    locked while it does, so a product approved meanwhile went back to pending
    (out of the shop) the moment the pull saved, and every tick made meanwhile
    went with it. Only the pass's own provenance travels, laid onto the review
    as it stands at write time; see `provenanceChange`.
  */
  const { review: _review, ...patch } = diffProducts(before, worked)
  void _review
  const provenance = provenanceChange(before.review, worked.review)
  if (isEmptyPatch(patch) && !provenance) return before
  return editStoredProduct(after.id, (current) => {
    // No servings spread: a pass that sets a SKU's own count means that SKU.
    const next = withProvenance(applyPatch(current, patch, { spreadServings: false }), provenance)
    // …but the product's count follows its master SKU's, and the plan with it
    // when it was following — the same rule a founder's edit keeps, so a pull
    // that brings PowerBody's real count does not leave the plan on a guess.
    return normaliseServings(current, next, { planSet: 'consumption' in patch })
  })
}
