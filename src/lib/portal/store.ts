/**
 * Founders Hub settings + product store — database-backed, serverless-safe.
 *
 * Founder-managed state (product field overrides, removed/imported products,
 * the data-source mode, pricing overrides) persists in the app database via
 * ./persist.ts. Reads go to the database on each call rather than a module
 * cache, so on serverless every instance sees the latest edits; SQLite makes
 * the same reads effectively free locally.
 *
 * Pricing overrides and the data-source mode are *consumed* by synchronous
 * module state (`stack-blueprint/pricing`, `data-source`) that the rest of the
 * app reads everywhere. `syncPortalRuntime()` hydrates that module state from
 * the database — server entry points that depend on either call it first
 * (see resolve.ts and the API routes).
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { DataSourceMode } from '@/lib/data-source'
import { getDataSourceMode, setDataSourceOverride } from '@/lib/data-source'
import type { SupplierMode } from '@/lib/supplier'
import { getSupplierMode, setSupplierOverride } from '@/lib/supplier'
import type { PaymentMode } from '@/lib/payments'
import { getPaymentMode, setPaymentOverride } from '@/lib/payments'
import {
  setPricingOverrides,
  getPricingOverrides,
  resetPricingOverrides,
  type PricingConfig,
} from '@/lib/stack-blueprint/pricing'
import { readJson, writeJson } from './persist'

export type ProductOverrides = Record<string, Partial<CatalogueProduct>>

const PRODUCTS_FILE = 'products'
const SETTINGS_FILE = 'settings'

interface PersistedProducts {
  overrides: ProductOverrides
  removedIds: string[]
  imported: CatalogueProduct[]
}

interface PersistedSettings {
  dataSourceMode?: DataSourceMode
  supplierMode?: SupplierMode
  paymentMode?: PaymentMode
  pricingOverrides?: Partial<PricingConfig>
}

const EMPTY_PRODUCTS: PersistedProducts = { overrides: {}, removedIds: [], imported: [] }

async function loadProducts(): Promise<PersistedProducts> {
  const stored = await readJson<PersistedProducts>(PRODUCTS_FILE, EMPTY_PRODUCTS)
  return {
    overrides: stored.overrides ?? {},
    removedIds: stored.removedIds ?? [],
    imported: stored.imported ?? [],
  }
}

async function loadSettings(): Promise<PersistedSettings> {
  return readJson<PersistedSettings>(SETTINGS_FILE, {})
}

async function saveSettings(patch: Partial<PersistedSettings>): Promise<void> {
  const current = await loadSettings()
  await writeJson<PersistedSettings>(SETTINGS_FILE, { ...current, ...patch })
}

// ── Runtime sync ──
// Pushes persisted settings into the synchronous module state the app reads
// (pricing config, data-source override). Cheap enough to call per request;
// a short TTL keeps hot paths from re-reading the database on every call.
const SYNC_TTL_MS = 5_000
let lastSyncedAt = 0

export async function syncPortalRuntime(force = false): Promise<void> {
  if (!force && Date.now() - lastSyncedAt < SYNC_TTL_MS) return
  try {
    const settings = await loadSettings()
    setPricingOverrides(settings.pricingOverrides ?? {})
    setDataSourceOverride(settings.dataSourceMode ?? null)
    setSupplierOverride(settings.supplierMode ?? null)
    setPaymentOverride(settings.paymentMode ?? null)
    lastSyncedAt = Date.now()
  } catch {
    /* unreachable database — keep current in-memory state */
  }
}

// ── Data source ──
export async function getDataSourceSetting(): Promise<DataSourceMode> {
  const settings = await loadSettings()
  // Persisted portal choice wins; otherwise whatever the environment resolves.
  return settings.dataSourceMode ?? getDataSourceMode()
}
export async function setDataSourceSetting(mode: DataSourceMode): Promise<void> {
  await saveSettings({ dataSourceMode: mode })
  setDataSourceOverride(mode)
  lastSyncedAt = Date.now()
}

// ── Supplier (PowerBody) ──
export async function getSupplierSetting(): Promise<SupplierMode> {
  const settings = await loadSettings()
  return settings.supplierMode ?? getSupplierMode()
}
export async function setSupplierSetting(mode: SupplierMode): Promise<void> {
  await saveSettings({ supplierMode: mode })
  setSupplierOverride(mode)
  lastSyncedAt = Date.now()
}

// ── Payments (Stripe) ──
export async function getPaymentSetting(): Promise<PaymentMode> {
  const settings = await loadSettings()
  return settings.paymentMode ?? getPaymentMode()
}
export async function setPaymentSetting(mode: PaymentMode): Promise<void> {
  await saveSettings({ paymentMode: mode })
  setPaymentOverride(mode)
  lastSyncedAt = Date.now()
}

// ── Pricing ──
export async function getPortalPricingOverrides(): Promise<Partial<PricingConfig>> {
  const settings = await loadSettings()
  return settings.pricingOverrides ?? {}
}
export async function setPortalPricingOverrides(overrides: Partial<PricingConfig>): Promise<void> {
  await saveSettings({ pricingOverrides: overrides })
  setPricingOverrides(overrides)
  lastSyncedAt = Date.now()
}
export async function resetPortalPricing(): Promise<void> {
  await saveSettings({ pricingOverrides: {} })
  resetPricingOverrides()
  lastSyncedAt = Date.now()
}
// Re-export for callers that need the currently-hydrated (module) overrides.
export { getPricingOverrides as getHydratedPricingOverrides }

// ── Product overrides ──
export async function getProductOverrides(): Promise<ProductOverrides> {
  return (await loadProducts()).overrides
}
export async function getProductOverride(id: string): Promise<Partial<CatalogueProduct> | undefined> {
  return (await loadProducts()).overrides[id]
}
export async function setProductOverride(id: string, patch: Partial<CatalogueProduct>): Promise<void> {
  const state = await loadProducts()
  state.overrides[id] = { ...state.overrides[id], ...patch }
  await writeJson(PRODUCTS_FILE, state)
}
export async function clearProductOverride(id: string): Promise<void> {
  const state = await loadProducts()
  delete state.overrides[id]
  await writeJson(PRODUCTS_FILE, state)
}

// ── Removed products (hidden from the catalogue everywhere) ──
export async function getRemovedProductIds(): Promise<Set<string>> {
  return new Set((await loadProducts()).removedIds)
}
export async function markProductRemoved(id: string): Promise<void> {
  const state = await loadProducts()
  if (!state.removedIds.includes(id)) state.removedIds.push(id)
  // Removing supersedes any prior field overrides for that product.
  delete state.overrides[id]
  await writeJson(PRODUCTS_FILE, state)
}
export async function restoreProduct(id: string): Promise<void> {
  const state = await loadProducts()
  state.removedIds = state.removedIds.filter((r) => r !== id)
  await writeJson(PRODUCTS_FILE, state)
}

// ── Imported products (added via bulk import) ──
export async function getImportedProducts(): Promise<CatalogueProduct[]> {
  return (await loadProducts()).imported
}
export async function addImportedProducts(products: CatalogueProduct[]): Promise<void> {
  const state = await loadProducts()
  // De-dupe on id: a re-import of the same handle replaces the prior version.
  const byId = new Map(state.imported.map((p) => [p.id, p]))
  for (const p of products) byId.set(p.id, p)
  state.imported = [...byId.values()]
  await writeJson(PRODUCTS_FILE, state)
}

/** The full founder-managed product state in one read (for the read path). */
export async function getPersistedProducts(): Promise<PersistedProducts> {
  return loadProducts()
}

/** Merge stored field overrides onto a catalogue (pure helper). */
export function applyProductOverrides(
  products: CatalogueProduct[],
  overrides: ProductOverrides,
): CatalogueProduct[] {
  if (Object.keys(overrides).length === 0) return products
  return products.map((p) => (overrides[p.id] ? { ...p, ...overrides[p.id] } : p))
}
