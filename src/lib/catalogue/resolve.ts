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
        ? { error: 'No products on sale yet. Add them in Hub → Products → Add products and approve them in Review, or switch the data source back to Mock.' }
        : {}),
    }
  }

  return { products: await composeCatalogue(MOCK_CATALOGUE as CatalogueProduct[]), source: 'mock' }
}

/**
 * A product as anyone on the internet may see it.
 *
 * `getResolvedCatalogue` is the catalogue as the SERVER knows it, and the hub's
 * routes read it for everything a founder needs — including fields that are
 * ours alone. Whatever leaves through a public route (the shop's
 * `/api/catalogue`, fetched on every visit, or a public page's data) goes
 * through this first. It used to send the raw product, review record and all,
 * so every approve stamped a founder's sign-in email onto something any
 * visitor could read in their browser's network tab.
 *
 * Taken out, because nothing a shopper's browser runs reads them:
 *   review              who approved it (a founder's email — their portal
 *                       login), the import's notes, which fields the AI wrote,
 *                       when it was imported. Everything public is approved
 *                       already, so `isPendingReview` reads the same without it.
 *   supplierProductId   PowerBody's own ids, product and SKU. Only the server
 *                       uses them (stock checks, orders, pulls), and it reads
 *                       them from the server-side catalogue, never from here.
 *   priceSource,        who set a SKU's price and servings — the hub's
 *   servingsSource      bookkeeping for what a supplier pull may overwrite.
 *
 * Deliberately KEPT, though they look internal:
 *   cost                the shop's own pricing (`unitCostOf` in
 *                       stack-blueprint/pricing) keeps every discount above the
 *                       margin floor with it, in the browser. Without it the
 *                       browser would estimate the cost, and quote a plan price
 *                       the checkout then does not charge.
 *   supplierRrp         the manufacturer's RRP, public anyway.
 *   marginPriority      the shop's merchandising and search order.
 *   inventory           the shop's "Only N left" chip.
 *   formerly            old product ids and flavour names, which matching a
 *                       subscription line follows. Nothing private in them.
 *
 * Never use this for anything that is written back: it is a view, and a
 * product saved from it would lose its review and its provenance.
 */
export function toPublicProduct(product: CatalogueProduct): CatalogueProduct {
  const { review: _review, supplierProductId: _supplierId, ...shown } = product
  return {
    ...shown,
    variants: product.variants.map((variant) => {
      const { supplierProductId: _supplierId, priceSource: _price, servingsSource: _servings, ...rest } = variant
      return rest
    }),
  }
}

/** The catalogue for public routes: `getResolvedCatalogue`, each product through `toPublicProduct`. */
export async function getPublicCatalogue(): Promise<{ products: CatalogueProduct[]; source: DataSource; error?: string }> {
  const resolved = await getResolvedCatalogue()
  return { ...resolved, products: resolved.products.map(toPublicProduct) }
}
