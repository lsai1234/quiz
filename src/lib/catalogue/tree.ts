import type { CatalogueProduct } from './types'
import { masterPatch } from './master'
import { putNamesRightWayRound } from '@/lib/supplier/variant-naming'

/**
 * "This SKU is the master, the rest are flavours" — as one change.
 *
 * ── Why the two halves belong in one press ──────────────────────────────────
 * Choosing a master and fixing the names were separate gestures, and that was
 * the mistake. They are not separate facts. Saying which SKU a product IS
 * settles the rest of it:
 *
 *   Protein Bars, Caramel Chaos - 12 x 60g       ← the product
 *     ├ Protein Bars                MASTER       ← what the founder just said
 *     ├ Protein Bars, Chocolate Chip Cookie Dough - 12 x 60g
 *     └ Bars, Dark Chocolate Mint - 12 x 60g
 *
 * Once the master is named, the product's title opens with that row's label and
 * then keeps going — so the row is wearing the product's name, the title is
 * carrying that row's flavour, and every other row is repeating the product's
 * name in front of its own. All of that follows; none of it needs a second
 * decision, and asking for one is how a founder ends up half-way through a fix
 * on fifteen products.
 *
 * ── What follows the master ─────────────────────────────────────────────────
 * The shelf price, the photograph, the cost the margin is read off and the
 * serving count (`masterPatch`), and the names (`putNamesRightWayRound`, with
 * the chosen master as its anchor rather than a guess).
 *
 * ── What does not ───────────────────────────────────────────────────────────
 * The HANDLE. It is the product's URL and every link anyone has to it, and it
 * is not in the patch at any price.
 *
 * Returns null when there is nothing to do, so a caller can leave the button
 * off rather than offering a no-op.
 *
 * Pure: no network, no database.
 */
export function applyTree(
  product: CatalogueProduct,
  masterId: string,
): Partial<CatalogueProduct> | null {
  if (!product.variants.some((v) => v.id === masterId)) return null

  const master = masterPatch(product, masterId)
  /*
    The names are worked out against the master being chosen, not the one
    currently stored — otherwise pressing this on a product whose master is
    about to move reads the title against the row that is on its way out.
  */
  const names = putNamesRightWayRound({ ...product, defaultVariantId: masterId }, masterId)

  if (!master && !names) return null
  return {
    ...(master ?? {}),
    ...(names ? { title: names.title, variants: names.variants } : {}),
  }
}
