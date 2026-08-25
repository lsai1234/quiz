/**
 * A committed SKU → PowerBody `product_id` map.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * Resolving a SKU normally means walking `getProductList` until its row turns
 * up. On this account that walk stops at 3,000 products against a catalogue of
 * 8,023 — an undocumented server-side cap with no parameter to raise it — so
 * every SKU past the ceiling is unreachable by the only route the API offers.
 *
 * `scripts/backfill-product-ids.ts` finds those ids by binary-searching
 * `getProductInfo` (which takes an id and returns the SKU, so it can be run
 * backwards) and writes them here. Checked in on purpose: it is expensive to
 * derive, it does not change once found, and a build should not depend on
 * hundreds of throttled calls to a third party.
 *
 * It is a SHORTCUT, never a source of truth. Everything else about a product —
 * price, stock, name, weight — is still fetched live; this only answers "which
 * id do I ask about". A stale entry can therefore only ever cost a wasted call
 * on a product that has moved, never a wrong price.
 *
 * Empty is the correct state when the feed reaches everything. If PowerBody lift
 * the cap this file can simply stay empty and nothing changes.
 */
import RAW from './product-id-map.json'

const MAP: Record<string, number> = RAW as Record<string, number>

/** The id we have on file for a SKU, or null when we have none. */
export function productIdForSku(sku: string): number | null {
  const id = MAP[sku]
  return typeof id === 'number' && Number.isFinite(id) && id > 0 ? id : null
}

/**
 * Split SKUs into those we can go straight to the detail call for and those that
 * still need the feed walked.
 *
 * The whole point of the map: the known ones cost one `getProductInfo` each and
 * cannot time out, while only the genuinely unknown ones pay for paging.
 */
export function partitionBySkuMap(skus: string[]): {
  mapped: Array<{ sku: string; productId: number }>
  unmapped: string[]
} {
  const mapped: Array<{ sku: string; productId: number }> = []
  const unmapped: string[] = []
  for (const sku of skus) {
    const productId = productIdForSku(sku)
    if (productId === null) unmapped.push(sku)
    else mapped.push({ sku, productId })
  }
  return { mapped, unmapped }
}

/** How many SKUs the map holds — for diagnostics and the backfill's own logging. */
export function knownSkuCount(): number {
  return Object.keys(MAP).length
}

/** The map itself, for the backfill script to merge into. Callers must not mutate. */
export function knownProductIds(): Readonly<Record<string, number>> {
  return MAP
}
