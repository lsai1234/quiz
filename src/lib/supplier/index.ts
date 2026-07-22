/**
 * Supplier resolver (PowerBody)
 * ─────────────────────────────
 * Single decision point for whether the app reads its catalogue / stock / price
 * and places dropship orders against MOCK data or the LIVE PowerBody API. This
 * is the supplier-side twin of `src/lib/data-source.ts`, kept deliberately
 * identical in shape so there is one obvious pattern for "mock vs live".
 *
 * Resolution order (highest priority first):
 *   1. Portal runtime override  — set from the Founders Hub, persisted in the DB
 *   2. Explicit env             — SUPPLIER_SOURCE = mock | powerbody | auto
 *   3. Default                  — MOCK (mock-first while PowerBody access is pending)
 *
 * Mock is the default ON PURPOSE: we do not have PowerBody API credentials yet,
 * so the whole app runs against the mock supplier until `SUPPLIER_SOURCE` is
 * flipped (and credentials are present). The live adapter is the only thing that
 * changes when access lands — every caller talks to the `SupplierProvider`
 * interface, never to PowerBody directly.
 *
 * Server-only: catalogue/stock/order calls happen in route handlers, so unlike
 * the data-source resolver this does not need a `NEXT_PUBLIC_*` mirror.
 */

export type SupplierSource = 'mock' | 'powerbody'
export type SupplierMode = 'auto' | 'mock' | 'powerbody'

/** True when the PowerBody API credentials are configured. */
export function hasPowerBodyCredentials(): boolean {
  return Boolean(process.env.POWERBODY_API_URL && process.env.POWERBODY_API_KEY)
}

// Runtime override set by the portal (server in-memory, hydrated from the DB by
// `syncPortalRuntime()`). Takes precedence over env so the supplier can be
// flipped without a redeploy.
let _runtimeOverride: SupplierMode | null = null

export function setSupplierOverride(mode: SupplierMode | null): void {
  _runtimeOverride = mode
}

export function getSupplierOverride(): SupplierMode | null {
  return _runtimeOverride
}

/**
 * The requested mode, before credentials are taken into account.
 * Order: portal runtime override → env → `mock` default.
 */
export function getSupplierMode(): SupplierMode {
  if (_runtimeOverride) return _runtimeOverride
  const raw = (process.env.SUPPLIER_SOURCE ?? 'mock').toString().trim().toLowerCase()

  if (raw === 'powerbody') return 'powerbody'
  if (raw === 'auto') return 'auto'
  // Default and anything unrecognised → mock (mock-first).
  return 'mock'
}

/**
 * The effective supplier the app should read from right now.
 * A forced `powerbody` mode still falls back to mock when credentials are
 * missing — there is nothing to fetch without them.
 */
export function getSupplierSource(): SupplierSource {
  const mode = getSupplierMode()

  if (mode === 'mock') return 'mock'

  if (mode === 'powerbody') {
    if (hasPowerBodyCredentials()) return 'powerbody'
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[supplier] SUPPLIER_SOURCE=powerbody but PowerBody credentials are missing — falling back to mock.',
      )
    }
    return 'mock'
  }

  // auto
  return hasPowerBodyCredentials() ? 'powerbody' : 'mock'
}

/** Convenience boolean for call sites that just need "is live PowerBody?". */
export function isPowerBodyLive(): boolean {
  return getSupplierSource() === 'powerbody'
}
