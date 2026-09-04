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
 * How long the shop will wait for the catalogue before saying so.
 *
 * Without this the fetch has no deadline: a route that hangs rather than
 * erroring — a cold serverless function, a supplier call with no timeout of its
 * own, a wedged database connection — leaves the promise pending forever, and
 * the shop sits on its loading skeleton with no explanation and no way out.
 * That is a worse failure than an error, because it looks like the page is
 * still working.
 */
const CATALOGUE_TIMEOUT_MS = 15_000

/**
 * The catalogue, fetched once and cached for the session.
 *
 * An empty result is reported as an error rather than quietly substituting
 * sample data: a real shop with no products is a thing the founder needs to
 * see, and a stack built from products we don't sell is worse than no stack.
 */
export function loadCatalogue(): Promise<CatalogueLoad> {
  if (inflight) return inflight

  inflight = fetch('/api/catalogue', { signal: AbortSignal.timeout(CATALOGUE_TIMEOUT_MS) })
    .then((r) => {
      // A 500 usually answers with an HTML error page, and parsing that as JSON
      // throws "Unexpected token <" — a message that tells whoever is reading
      // the shop nothing at all. Say what actually happened instead.
      if (!r.ok) throw new Error(`The catalogue could not be loaded (${r.status}).`)
      return r.json()
    })
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
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError'
      return {
        products: [],
        source: 'mock' as const,
        error: timedOut
          ? 'The catalogue took too long to load. Check the connection and try again.'
          : err.message,
      }
    })

  return inflight
}
