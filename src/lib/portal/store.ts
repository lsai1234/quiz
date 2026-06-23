/**
 * Portal settings + product-overrides store.
 *
 * In-memory (resets on server restart) per the agreed mock-first approach — the
 * seam to swap for Vercel KV / Postgres lives here. It holds the admin's chosen
 * data-source mode and the per-product field overrides, and delegates pricing
 * overrides to the pricing module (the single source of the current config).
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

export type ProductOverrides = Record<string, Partial<CatalogueProduct>>

const state = {
  // Starts as whatever the environment resolves to (mock by default).
  dataSourceMode: getDataSourceMode() as DataSourceMode,
  productOverrides: {} as ProductOverrides,
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
}
export function clearProductOverride(id: string): void {
  delete state.productOverrides[id]
}

/** Merge stored field overrides onto a catalogue (used by the read path). */
export function applyProductOverrides(
  products: CatalogueProduct[],
  overrides: ProductOverrides = state.productOverrides,
): CatalogueProduct[] {
  if (Object.keys(overrides).length === 0) return products
  return products.map((p) => (overrides[p.id] ? { ...p, ...overrides[p.id] } : p))
}
