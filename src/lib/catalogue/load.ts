'use client'

/**
 * Loading the catalogue in the browser.
 * ─────────────────────────────────────
 * One shared, deduped fetch of `/api/catalogue`, so every part of the app that
 * needs products is looking at the SAME catalogue.
 *
 * That sameness is the whole point. The quiz builds a stack by picking product
 * ids out of a catalogue; the reveal then looks those ids back up. When the two
 * steps read different catalogues, the reveal finds nothing — every card reads
 * "Product unavailable" at £0.00, while the AI's reason still names the product
 * from the catalogue the stack was actually built against. That is precisely
 * what happened when the store's default value was the mock catalogue: the quiz
 * built against mock products because nothing had fetched the real ones yet.
 *
 * So the store now starts EMPTY, and the only way products get there is this
 * loader. Anything that needs the catalogue awaits `loadCatalogue()` rather
 * than reading the store and hoping.
 */

import { useQuizStore } from '@/lib/store'
import type { CatalogueProduct } from './types'

export interface CatalogueLoad {
  products: CatalogueProduct[]
  /** Which catalogue the server served — `real` is the curated PowerBody shop. */
  source: 'mock' | 'real'
  /** Set when there is nothing sellable to show, said plainly rather than hidden. */
  error: string | null
}

/** The in-flight (or settled) load. Shared so N callers make one request. */
let inflight: Promise<CatalogueLoad> | null = null

/** Force the next `loadCatalogue()` to re-fetch (e.g. the portal flipped the
 *  data source, or products were imported). */
export function invalidateCatalogue(): void {
  inflight = null
  try {
    useQuizStore.getState().setCatalogueProducts([])
  } catch {
    /* ignore — nothing to clear */
  }
}

/**
 * The catalogue, fetched once and cached for the session.
 *
 * An empty result is reported as an error rather than quietly substituting
 * sample data: a real shop with no products is a thing the founder needs to
 * see, and a stack built from products we don't sell is worse than no stack.
 */
export function loadCatalogue(): Promise<CatalogueLoad> {
  if (inflight) return inflight

  inflight = fetch('/api/catalogue')
    .then((r) => r.json())
    .then((data: { products?: CatalogueProduct[]; source?: string; error?: string }) => {
      const products = Array.isArray(data.products) ? data.products : []
      const source: 'mock' | 'real' = data.source === 'real' ? 'real' : 'mock'
      const error =
        data.error ??
        (products.length === 0
          ? 'The catalogue came back empty. Add products in Hub → Products → PowerBody, or switch the data source back to Mock.'
          : null)

      useQuizStore.getState().setCatalogueProducts(products)
      return { products, source, error }
    })
    .catch((err: Error) => {
      // Let the next caller try again rather than caching the failure forever.
      inflight = null
      console.error('[loadCatalogue]', err)
      return { products: [], source: 'mock' as const, error: err.message }
    })

  return inflight
}
