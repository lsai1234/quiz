/**
 * Data-source resolver
 * ────────────────────
 * Single decision point for whether the app serves the built-in MOCK catalogue
 * or the REAL one — the products we have curated into our own catalogue from the
 * PowerBody supplier feed.
 *
 *   mock → the sample catalogue in `catalogue/mock-catalogue.ts`, plus anything
 *          added from the supplier. Best while building: every journey works
 *          with no credentials and no supplier calls.
 *   real → ONLY the products added from PowerBody in the Founders Hub. This is
 *          the shop we actually sell. It starts empty — add products in
 *          Hub → Products → PowerBody and they appear here.
 *
 * Two things are deliberately NOT part of this decision:
 *
 *   • Where supplier data is read from (`SUPPLIER_SOURCE`) and whether orders
 *     really get placed (`SUPPLIER_ORDERING`) are separate switches, in
 *     `lib/supplier/`. You can browse the real PowerBody feed and add products
 *     while the shop still serves the mock catalogue, and vice versa.
 *   • Credentials. There is nothing to authenticate against here — `real` reads
 *     products we have already imported and stored. That is why there is no
 *     `auto` mode and no credentials check: unlike the supplier and payment
 *     resolvers, this one cannot silently fall back, so it doesn't pretend to.
 *
 * A previous storefront integration used to be the "live" side of this switch.
 * It has been removed: PowerBody is the catalogue source and Stripe takes
 * payment.
 *
 * NOTE: this module is isomorphic — it runs on the server and in the browser.
 * For the browser build to see the override, the var must be `NEXT_PUBLIC_*`
 * (Next.js only inlines those into client bundles).
 */

export type DataSource = 'mock' | 'real'
/** Same values as `DataSource`: with no credentials to check, the requested
 *  mode and the effective source cannot disagree. */
export type DataSourceMode = DataSource

// Runtime override set by the portal (server in-memory, or synced to the client).
// Takes precedence over env so the catalogue can be flipped without a redeploy.
let _runtimeOverride: DataSourceMode | null = null

export function setDataSourceOverride(mode: DataSourceMode | null): void {
  _runtimeOverride = mode
}

export function getDataSourceOverride(): DataSourceMode | null {
  return _runtimeOverride
}

/** Normalise anything we might be given into a mode. Unknown values, and the
 *  retired `shopify`/`auto` settings, read as `mock` — the safe default. */
function parseMode(raw: string): DataSourceMode {
  return raw.trim().toLowerCase() === 'real' ? 'real' : 'mock'
}

/**
 * The requested mode. Order: portal runtime override → env → `mock` default.
 * `NEXT_PUBLIC_DATA_SOURCE` wins over `DATA_SOURCE` so the client and server
 * resolve identically.
 */
export function getDataSourceMode(): DataSourceMode {
  if (_runtimeOverride) return _runtimeOverride
  return parseMode((process.env.NEXT_PUBLIC_DATA_SOURCE ?? process.env.DATA_SOURCE ?? 'mock').toString())
}

/** The catalogue the app should serve right now. */
export function getDataSource(): DataSource {
  return getDataSourceMode()
}

/** Convenience boolean for call sites that just need "is this the real shop?". */
export function isLiveCatalogue(): boolean {
  return getDataSource() === 'real'
}
