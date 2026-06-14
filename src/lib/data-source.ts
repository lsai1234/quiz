/**
 * Data-source resolver
 * ────────────────────
 * Single decision point for whether the app reads MOCK data or LIVE Shopify
 * data. Replaces scattered `SHOPIFY_LIVE` checks so the whole app (quiz, hub,
 * portal) agrees on one answer.
 *
 * Resolution order (highest priority first):
 *   1. Explicit override  — DATA_SOURCE / NEXT_PUBLIC_DATA_SOURCE = mock|shopify
 *   2. `auto` (default)   — use Shopify when Storefront credentials are present
 *   3. Fallback           — mock
 *
 * The override is read from an env var for now. The portal (later phase) will
 * persist a runtime override in the database; `getDataSourceMode()` is the only
 * place that needs to change when that lands.
 *
 * NOTE: this module is isomorphic — it runs on the server and in the browser.
 * For the browser build to see the override and credentials, the relevant vars
 * must be `NEXT_PUBLIC_*` (Next.js only inlines those into client bundles).
 */

export type DataSource = 'mock' | 'shopify'
export type DataSourceMode = 'auto' | 'mock' | 'shopify'

/** True when Storefront API credentials are configured. */
export function hasShopifyCredentials(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN &&
      process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN,
  )
}

/**
 * The requested mode, before credentials are taken into account.
 * `NEXT_PUBLIC_DATA_SOURCE` wins over `DATA_SOURCE` so the client and server
 * resolve identically when both are set.
 */
export function getDataSourceMode(): DataSourceMode {
  const raw = (
    process.env.NEXT_PUBLIC_DATA_SOURCE ??
    process.env.DATA_SOURCE ??
    'auto'
  )
    .toString()
    .trim()
    .toLowerCase()

  return raw === 'mock' || raw === 'shopify' ? raw : 'auto'
}

/**
 * The effective data source the app should read from right now.
 * A forced `shopify` mode still falls back to mock when credentials are
 * missing — there is nothing to fetch without them.
 */
export function getDataSource(): DataSource {
  const mode = getDataSourceMode()

  if (mode === 'mock') return 'mock'

  if (mode === 'shopify') {
    if (hasShopifyCredentials()) return 'shopify'
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[data-source] DATA_SOURCE=shopify but Storefront credentials are missing — falling back to mock.',
      )
    }
    return 'mock'
  }

  // auto
  return hasShopifyCredentials() ? 'shopify' : 'mock'
}

/** Convenience boolean for call sites that just need "is live Shopify?". */
export function isShopifyLive(): boolean {
  return getDataSource() === 'shopify'
}
