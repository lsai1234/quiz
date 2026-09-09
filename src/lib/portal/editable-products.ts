import type { CatalogueProduct } from '@/lib/catalogue/types'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import {
  getImportedProducts,
  getProductOverrides,
  saveImportedProduct,
  setProductOverride,
  syncPortalRuntime,
} from './store'

/**
 * Reading and writing a product the way the Hub edits one.
 *
 * A product lives in one of two places and the difference decides how a change
 * is written, which is subtle enough that two screens got it right by copying
 * each other and would have drifted the moment one of them changed:
 *
 *   IMPORTED   still in the review queue, and ours outright — rewritten whole.
 *   LIVE       in the catalogue, where the base product is regenerated from the
 *              feed. A direct write is lost on the next sync, so the edit is
 *              held as an OVERRIDE and composed over the base on read.
 *
 * Both callers — the supplier pull and the price screen — need the same two
 * steps: every product as it currently stands (base + override + imported), and
 * a write that goes to whichever of the two places this one belongs in.
 */

/**
 * Every product a founder can edit, as it currently stands.
 *
 * Imported products are composed with their overrides here too: one can be
 * edited before it is approved, and a pass that read the raw imported record
 * would hand back a product missing the edit and then write that back over it.
 */
export async function allEditableProducts(): Promise<CatalogueProduct[]> {
  await syncPortalRuntime()
  const [imported, resolved, overrides] = await Promise.all([
    getImportedProducts(),
    getResolvedCatalogue(),
    getProductOverrides(),
  ])
  const byId = new Map<string, CatalogueProduct>()
  for (const p of resolved.products) byId.set(p.id, p)
  for (const p of imported) byId.set(p.id, { ...p, ...(overrides[p.id] ?? {}) } as CatalogueProduct)
  return [...byId.values()]
}

/** …and one of them, by id. */
export async function editableProduct(id: string): Promise<CatalogueProduct | undefined> {
  return (await allEditableProducts()).find((p) => p.id === id)
}

/**
 * Write a change to a product, the way that product is stored.
 *
 * `next` is the whole product after the change and `patch` is the part of it
 * that changed: an imported record is replaced with the first, a live one gets
 * the second as its override. Passing both is what lets one call serve both
 * shapes without the caller having to know which it is holding.
 */
export async function saveProductEdit(
  next: CatalogueProduct,
  patch: Partial<CatalogueProduct>,
): Promise<void> {
  const imported = new Set((await getImportedProducts()).map((p) => p.id))
  if (imported.has(next.id)) await saveImportedProduct(next)
  else await setProductOverride(next.id, patch)
}
