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
import type { OrderingMode } from '@/lib/supplier/ordering'
import { getOrderingMode, setOrderingOverride } from '@/lib/supplier/ordering'
import type { PaymentMode, StripeEnvironment } from '@/lib/payments'
import {
  getPaymentMode,
  setPaymentOverride,
  getStripeEnvironment,
  setStripeEnvironmentOverride,
} from '@/lib/payments'
import {
  normaliseExperiment,
  DEFAULT_QUIZ_EXPERIMENT,
  type QuizExperimentConfig,
} from '@/lib/experiments/assignment'
import {
  setPricingOverrides,
  getPricingOverrides,
  resetPricingOverrides,
  type PricingConfig,
} from '@/lib/stack-blueprint/pricing'
import { normaliseRoster } from './top-products'
import { readJson, writeJson } from './persist'

export type ProductOverrides = Record<string, Partial<CatalogueProduct>>

const PRODUCTS_FILE = 'products'
const SETTINGS_FILE = 'settings'

interface PersistedProducts {
  overrides: ProductOverrides
  removedIds: string[]
  imported: CatalogueProduct[]
  /** The Top 25 roster, in order. See `./top-products.ts`. */
  topProductIds?: string[]
}

interface PersistedSettings {
  dataSourceMode?: DataSourceMode
  supplierMode?: SupplierMode
  /** Whether a queue "Send" really reaches PowerBody. Separate from
   *  `supplierMode` on purpose — see `lib/supplier/ordering.ts`. */
  orderingMode?: OrderingMode
  paymentMode?: PaymentMode
  /** Test-mode or live-mode Stripe keys. Separate from `paymentMode` on
   *  purpose — see `lib/payments/keys.ts`. */
  stripeEnvironment?: StripeEnvironment
  pricingOverrides?: Partial<PricingConfig>
  /** Which quiz customers get, and how the adaptive one behaves. See
   *  `lib/experiments/assignment.ts`. Absent = off, everyone gets v1. */
  quizExperiment?: QuizExperimentConfig
}

const EMPTY_PRODUCTS: PersistedProducts = { overrides: {}, removedIds: [], imported: [], topProductIds: [] }

async function loadProducts(): Promise<PersistedProducts> {
  const stored = await readJson<PersistedProducts>(PRODUCTS_FILE, EMPTY_PRODUCTS)
  return {
    overrides: stored.overrides ?? {},
    removedIds: stored.removedIds ?? [],
    imported: stored.imported ?? [],
    topProductIds: stored.topProductIds ?? [],
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
    setOrderingOverride(settings.orderingMode ?? null)
    setPaymentOverride(settings.paymentMode ?? null)
    setStripeEnvironmentOverride(settings.stripeEnvironment ?? null)
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

// ── Quiz experiment ──
// Which quiz customers get (v1, the questionnaire that ships today, or v2, the
// adaptive interview) and how v2 behaves. Read on every `/api/config` call, so
// it goes through the same short-lived persist cache as everything else here.
//
// `normaliseExperiment` is applied on the way OUT as well as in: a settings row
// written by an older build, or half-written by a failed request, must not be
// able to switch an experiment on or hand the quiz a nonsense budget.
export async function getQuizExperiment(): Promise<QuizExperimentConfig> {
  const settings = await loadSettings()
  return normaliseExperiment(settings.quizExperiment ?? DEFAULT_QUIZ_EXPERIMENT)
}
export async function setQuizExperiment(config: QuizExperimentConfig): Promise<void> {
  await saveSettings({ quizExperiment: normaliseExperiment(config) })
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

// ── Order sending (simulate vs live PowerBody) ──
export async function getOrderingSetting(): Promise<OrderingMode> {
  const settings = await loadSettings()
  return settings.orderingMode ?? getOrderingMode()
}
export async function setOrderingSetting(mode: OrderingMode): Promise<void> {
  await saveSettings({ orderingMode: mode })
  setOrderingOverride(mode)
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

// ── Which Stripe (test keys vs live keys) ──
// Deliberately its own setting rather than a fourth `PaymentMode`. "Do not
// charge anybody" and "charge in the live world" are different questions, and
// folding them into one control makes going back to mock for an afternoon also
// throw away which world you were in.
export async function getStripeEnvironmentSetting(): Promise<StripeEnvironment> {
  const settings = await loadSettings()
  return settings.stripeEnvironment ?? getStripeEnvironment()
}
export async function setStripeEnvironmentSetting(env: StripeEnvironment): Promise<void> {
  await saveSettings({ stripeEnvironment: env })
  setStripeEnvironmentOverride(env)
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

// ── Imported products (added from the PowerBody supplier feed) ──
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

/**
 * Imported products still waiting on review.
 *
 * Read from the imported list directly rather than through the catalogue
 * resolver, which filters them out on purpose — the hub is the one place they
 * are supposed to be visible.
 */
export async function getPendingReviewProducts(): Promise<CatalogueProduct[]> {
  const { imported, removedIds, overrides } = await loadProducts()
  const removed = new Set(removedIds)
  return applyProductOverrides(
    imported.filter((p) => p.review?.status === 'pending' && !removed.has(p.id)),
    overrides,
  )
}

/**
 * Replace one imported product wholesale (review edits, approval).
 *
 * `replacing` swaps several products for this one — combining flavours into a
 * single product with variants. Done in one write on purpose: deleting the
 * sources and adding the combined product separately would, if the second half
 * failed, leave a founder with neither.
 */
export async function saveImportedProduct(
  product: CatalogueProduct,
  options: { replacing?: string[] } = {},
): Promise<void> {
  const state = await loadProducts()
  const replacing = new Set(options.replacing ?? [])

  if (replacing.size > 0) {
    state.imported = state.imported.filter((p) => !replacing.has(p.id))
    for (const id of replacing) delete state.overrides[id]
    state.imported.push(product)
    await writeJson(PRODUCTS_FILE, state)
    return
  }

  const index = state.imported.findIndex((p) => p.id === product.id)
  if (index === -1) return
  state.imported[index] = product
  await writeJson(PRODUCTS_FILE, state)
}

/**
 * Drop an imported product entirely.
 *
 * Distinct from `markProductRemoved`: discarding something that was never
 * approved should leave no trace, not add it to a removed-ids list that would
 * then block re-importing the same SKU after a second look.
 */
export async function discardImportedProduct(id: string): Promise<void> {
  const state = await loadProducts()
  state.imported = state.imported.filter((p) => p.id !== id)
  delete state.overrides[id]
  await writeJson(PRODUCTS_FILE, state)
}

// ── Top 25 roster (the products the quiz reaches for first) ──
export async function getTopProductIds(): Promise<string[]> {
  return normaliseRoster((await loadProducts()).topProductIds ?? [])
}
export async function setTopProductIds(ids: string[]): Promise<void> {
  const state = await loadProducts()
  state.topProductIds = normaliseRoster(ids)
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
