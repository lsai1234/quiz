import { getDataSource, type DataSource } from '@/lib/data-source'
import { MOCK_CATALOGUE } from './mock-catalogue'
import {
  applyProductOverrides,
  getPersistedProducts,
  syncPortalRuntime,
} from '@/lib/portal/store'
import { applyTopRanks } from '@/lib/portal/top-products'
import { isPendingReview } from './review'
import type { CatalogueProduct } from './types'

/**
 * Compose the catalogue founders actually see: base products with field
 * overrides merged on, products added from the supplier feed appended, and any
 * products the founders removed filtered out. Applied to both branches so
 * removals/imports reflect everywhere (quiz, hub, dashboard).
 *
 * Products still awaiting import review are held out entirely. An imported
 * product is part supplier data, part AI, and the AI half decides who gets
 * recommended it — so it is not sellable until someone has looked. They are
 * reachable in the hub through `getPendingReviewProducts`, and nowhere else.
 */
async function composeCatalogue(base: CatalogueProduct[]): Promise<CatalogueProduct[]> {
  const { overrides, removedIds, imported, topProductIds } = await getPersistedProducts()
  const removed = new Set(removedIds)
  // Overrides apply to imported products too. They used to be merged onto the
  // base only, which silently dropped every edit made to a product that came
  // from the supplier feed — including the corrections made while reviewing it.
  const withImports = applyProductOverrides([...base, ...imported], overrides)
  const sellable = withImports.filter((p) => !isPendingReview(p))
  const visible = removed.size === 0 ? sellable : sellable.filter((p) => !removed.has(p.id))
  // Last, so the Top 25 is stamped only onto products that actually survived —
  // a roster entry for a removed product simply doesn't apply.
  return applyTopRanks(visible, topProductIds ?? [])
}

/**
 * The catalogue the app should serve right now.
 *
 *   real → ONLY the products curated from the PowerBody feed. There is no
 *          sample data underneath: the real shop is exactly what has been added
 *          and not removed, which is the whole point of curating it.
 *   mock → the sample catalogue as the base, with imports on top, so every
 *          journey works before a single supplier product has been added.
 *
 * `real` with nothing imported yet is a legitimate, empty catalogue rather than
 * a failure — but it is reported, because an empty shop should say why.
 */
export async function getResolvedCatalogue(): Promise<{ products: CatalogueProduct[]; source: DataSource; error?: string }> {
  // Hydrate the data-source override + pricing overrides from the database
  // first — on serverless this instance may not have seen a portal edit yet.
  await syncPortalRuntime()

  if (getDataSource() === 'real') {
    // Base is empty: `composeCatalogue` appends the imported products, applies
    // founder overrides and drops anything removed.
    const products = await composeCatalogue([])
    return {
      products,
      source: 'real',
      ...(products.length === 0
        ? { error: 'No products added yet. Add them in Hub → Products → PowerBody, or switch the data source back to Mock.' }
        : {}),
    }
  }

  return { products: await composeCatalogue(MOCK_CATALOGUE as CatalogueProduct[]), source: 'mock' }
}
