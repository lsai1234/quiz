/**
 * Founders Hub settings + product store.
 *
 * Durable across restarts via JSON files under `.data/` (see ./persist.ts) — the
 * seam to swap for Vercel KV / Postgres lives here. It holds the chosen
 * data-source mode, per-product field overrides, the set of products removed from
 * the catalogue, and products added via bulk import. Pricing overrides are
 * delegated to the pricing module (the single source of the current config).
 *
 * `dataSourceMode` stays in-memory (it tracks the running process / env), but the
 * founder-managed collections are hydrated from disk on first load and re-saved
 * on every mutation.
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
import { readJson, writeJson } from './persist'

export type ProductOverrides = Record<string, Partial<CatalogueProduct>>

const PRODUCTS_FILE = 'products'

interface PersistedProducts {
  overrides: ProductOverrides
  removedIds: string[]
  imported: CatalogueProduct[]
}

const persisted: PersistedProducts = readJson<PersistedProducts>(PRODUCTS_FILE, {
  overrides: {},
  removedIds: [],
  imported: [],
})

const state = {
  // Starts as whatever the environment resolves to (mock by default).
  dataSourceMode: getDataSourceMode() as DataSourceMode,
  productOverrides: persisted.overrides ?? {},
  removedIds: new Set<string>(persisted.removedIds ?? []),
  imported: persisted.imported ?? [],
}

function save(): void {
  writeJson<PersistedProducts>(PRODUCTS_FILE, {
    overrides: state.productOverrides,
    removedIds: [...state.removedIds],
    imported: state.imported,
  })
}

// ── Data source ──
export function getDataSourceSetting(): DataSourceMode {
  return state.dataSourceMode
}
export function setDataSourceSetting(mode: DataSourceMode): void {
  state.dataSourceMode = mode
  setDataSourceOverride(mode)
}

// ── Pricing (delegated to the pricing module) ──
export function getPortalPricingOverrides(): Partial<PricingConfig> {
  return getPricingOverrides()
}
export function setPortalPricingOverrides(overrides: Partial<PricingConfig>): void {
  setPricingOverrides(overrides)
}
export function resetPortalPricing(): void {
  resetPricingOverrides()
}

// ── Product overrides ──
export function getProductOverrides(): ProductOverrides {
  return state.productOverrides
}
export function getProductOverride(id: string): Partial<CatalogueProduct> | undefined {
  return state.productOverrides[id]
}
export function setProductOverride(id: string, patch: Partial<CatalogueProduct>): void {
  state.productOverrides[id] = { ...state.productOverrides[id], ...patch }
  save()
}
export function clearProductOverride(id: string): void {
  delete state.productOverrides[id]
  save()
}

// ── Removed products (hidden from the catalogue everywhere) ──
export function getRemovedProductIds(): Set<string> {
  return state.removedIds
}
export function markProductRemoved(id: string): void {
  state.removedIds.add(id)
  // Removing supersedes any prior field overrides for that product.
  delete state.productOverrides[id]
  save()
}
export function restoreProduct(id: string): void {
  state.removedIds.delete(id)
  save()
}

// ── Imported products (added via bulk import) ──
export function getImportedProducts(): CatalogueProduct[] {
  return state.imported
}
export function addImportedProducts(products: CatalogueProduct[]): void {
  // De-dupe on id: a re-import of the same handle replaces the prior version.
  const byId = new Map(state.imported.map((p) => [p.id, p]))
  for (const p of products) byId.set(p.id, p)
  state.imported = [...byId.values()]
  save()
}

/** Merge stored field overrides onto a catalogue (used by the read path). */
export function applyProductOverrides(
  products: CatalogueProduct[],
  overrides: ProductOverrides = state.productOverrides,
): CatalogueProduct[] {
  if (Object.keys(overrides).length === 0) return products
  return products.map((p) => (overrides[p.id] ? { ...p, ...overrides[p.id] } : p))
}
