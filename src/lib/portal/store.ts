/**
 * Founders Hub settings + product store.
 *
 * Durable via the key→JSON store in ./persist.ts (Postgres `kv` table when
 * `DATABASE_URL` is set, `.data/` JSON files otherwise). It holds the chosen
 * data-source mode, per-product field overrides, the set of products removed
 * from the catalogue, products added via bulk import, and (delegated to the
 * pricing module for the in-memory copy) the pricing overrides.
 *
 * Hydration model: state lives in module memory per instance and is loaded via
 * `hydrateStore()` — once per process on the fs backend, re-read on a short TTL
 * on the database backend so other serverless instances' writes show up.
 * Every mutation hydrates first (so a cold instance can never save over data it
 * hasn't seen) and persists the whole document after (last write wins — fine
 * for a couple of founders).
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { DataSourceMode } from '@/lib/data-source'
import { getDataSourceMode, setDataSourceOverride } from '@/lib/data-source'
import {
  setPricingOverrides,
  getPricingOverrides,
  resetPricingOverrides,
  type PricingConfig,
} from '@/lib/stack-blueprint/pricing'
import { hasDatabase } from '@/lib/db'
import { readJson, writeJson } from './persist'

export type ProductOverrides = Record<string, Partial<CatalogueProduct>>

const PRODUCTS_FILE = 'products'
const PRICING_FILE = 'pricing'
const SETTINGS_FILE = 'settings'

interface PersistedProducts {
  overrides: ProductOverrides
  removedIds: string[]
  imported: CatalogueProduct[]
}

interface PersistedSettings {
  dataSourceMode: DataSourceMode
}

const state = {
  // Starts as whatever the environment resolves to (mock by default).
  dataSourceMode: getDataSourceMode() as DataSourceMode,
  productOverrides: {} as ProductOverrides,
  removedIds: new Set<string>(),
  imported: [] as CatalogueProduct[],
}

const HYDRATE_TTL_MS = 5_000
let hydratedAt = 0

/**
 * Load persisted state into module memory. Call before reading store state on
 * a request path (`getResolvedCatalogue` does; mutations do it themselves).
 */
export async function hydrateStore(): Promise<void> {
  const stale = hasDatabase()
    ? Date.now() - hydratedAt > HYDRATE_TTL_MS
    : hydratedAt === 0
  if (!stale) return
  hydratedAt = Date.now()

  const [products, pricing, settings] = await Promise.all([
    readJson<PersistedProducts>(PRODUCTS_FILE, { overrides: {}, removedIds: [], imported: [] }),
    readJson<Partial<PricingConfig> | null>(PRICING_FILE, null),
    readJson<PersistedSettings | null>(SETTINGS_FILE, null),
  ])

  state.productOverrides = products.overrides ?? {}
  state.removedIds = new Set<string>(products.removedIds ?? [])
  state.imported = products.imported ?? []
  // Only apply when a value was ever persisted — otherwise leave the module
  // defaults (env-resolved data source, default pricing) untouched.
  if (pricing) setPricingOverrides(pricing)
  if (settings?.dataSourceMode) {
    state.dataSourceMode = settings.dataSourceMode
    setDataSourceOverride(settings.dataSourceMode)
  }
}

async function save(): Promise<void> {
  await writeJson<PersistedProducts>(PRODUCTS_FILE, {
    overrides: state.productOverrides,
    removedIds: [...state.removedIds],
    imported: state.imported,
  })
}

// ── Data source ──
export async function getDataSourceSetting(): Promise<DataSourceMode> {
  await hydrateStore()
  return state.dataSourceMode
}
export async function setDataSourceSetting(mode: DataSourceMode): Promise<void> {
  state.dataSourceMode = mode
  setDataSourceOverride(mode)
  await writeJson<PersistedSettings>(SETTINGS_FILE, { dataSourceMode: mode })
}

// ── Pricing (in-memory copy delegated to the pricing module) ──
export async function getPortalPricingOverrides(): Promise<Partial<PricingConfig>> {
  await hydrateStore()
  return getPricingOverrides()
}
export async function setPortalPricingOverrides(overrides: Partial<PricingConfig>): Promise<void> {
  setPricingOverrides(overrides)
  await writeJson<Partial<PricingConfig>>(PRICING_FILE, overrides ?? {})
}
export async function resetPortalPricing(): Promise<void> {
  resetPricingOverrides()
  await writeJson<Partial<PricingConfig>>(PRICING_FILE, {})
}

// ── Product overrides ──
export function getProductOverrides(): ProductOverrides {
  return state.productOverrides
}
export function getProductOverride(id: string): Partial<CatalogueProduct> | undefined {
  return state.productOverrides[id]
}
export async function setProductOverride(id: string, patch: Partial<CatalogueProduct>): Promise<void> {
  await hydrateStore()
  state.productOverrides[id] = { ...state.productOverrides[id], ...patch }
  await save()
}
export async function clearProductOverride(id: string): Promise<void> {
  await hydrateStore()
  delete state.productOverrides[id]
  await save()
}

// ── Removed products (hidden from the catalogue everywhere) ──
export function getRemovedProductIds(): Set<string> {
  return state.removedIds
}
export async function markProductRemoved(id: string): Promise<void> {
  await hydrateStore()
  state.removedIds.add(id)
  // Removing supersedes any prior field overrides for that product.
  delete state.productOverrides[id]
  await save()
}
export async function restoreProduct(id: string): Promise<void> {
  await hydrateStore()
  state.removedIds.delete(id)
  await save()
}

// ── Imported products (added via bulk import) ──
export function getImportedProducts(): CatalogueProduct[] {
  return state.imported
}
export async function addImportedProducts(products: CatalogueProduct[]): Promise<void> {
  await hydrateStore()
  // De-dupe on id: a re-import of the same handle replaces the prior version.
  const byId = new Map(state.imported.map((p) => [p.id, p]))
  for (const p of products) byId.set(p.id, p)
  state.imported = [...byId.values()]
  await save()
}

/** Merge stored field overrides onto a catalogue (used by the read path). */
export function applyProductOverrides(
  products: CatalogueProduct[],
  overrides: ProductOverrides = state.productOverrides,
): CatalogueProduct[] {
  if (Object.keys(overrides).length === 0) return products
  return products.map((p) => (overrides[p.id] ? { ...p, ...overrides[p.id] } : p))
}
