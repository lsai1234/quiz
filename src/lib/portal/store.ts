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

import { DEFAULT_CONSULT_ROLLOUT, normaliseConsultRollout, type ConsultRollout } from '@/lib/experiments/consult'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { DataSourceMode } from '@/lib/data-source'
import { getDataSourceMode, setDataSourceOverride } from '@/lib/data-source'
import type { SupplierMode } from '@/lib/supplier'
import { getSupplierMode, setSupplierOverride } from '@/lib/supplier'
import type { OrderingMode } from '@/lib/supplier/ordering'
import { getAutoSendSetting, getOrderingMode, setAutoSendOverride, setOrderingOverride } from '@/lib/supplier/ordering'
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
  getPricingConfig,
  resetPricingOverrides,
  type PricingConfig,
} from '@/lib/stack-blueprint/pricing'
import { normaliseRoster } from './top-products'
import { spreadServings } from '@/lib/catalogue/servings'
import {
  applyPatch,
  composeOverride,
  foldOverride,
  overrideFor,
  withoutDerived,
  type ProductPatch,
} from '@/lib/catalogue/patch'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { mutateJson, readJson, withResult, writeJson } from './persist'
import { kvCompareAndSet, kvGetRaw } from '@/lib/db/kv'

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
  /** Paid orders go to PowerBody by themselves — see `lib/orders/auto-send`. */
  autoSendPaid?: boolean
  /** When it was last switched on (ISO). Orders paid before it are left alone. */
  autoSendSince?: string | null
  paymentMode?: PaymentMode
  /** Test-mode or live-mode Stripe keys. Separate from `paymentMode` on
   *  purpose — see `lib/payments/keys.ts`. */
  stripeEnvironment?: StripeEnvironment
  pricingOverrides?: Partial<PricingConfig>
  /** Which quiz customers get, and how the adaptive one behaves. See
   *  `lib/experiments/assignment.ts`. Absent = off, everyone gets v1. */
  quizExperiment?: QuizExperimentConfig
  consultRollout?: ConsultRollout
  /** The Meta (Facebook/Instagram) Pixel. See `lib/analytics/meta-pixel.ts`. */
  metaPixel?: MetaPixelSettings
}

export interface MetaPixelSettings {
  /** The Pixel's numeric id, from Meta Events Manager. Null = not connected. */
  pixelId: string | null
  /** Off keeps the id saved but loads nothing — a pause, not a disconnect. */
  enabled: boolean
}

/** A Pixel id is a string of digits — 15 or 16 today; allow some room either way. */
export function normalisePixelId(input: unknown): string | null {
  const id = typeof input === 'string' ? input.replace(/\s+/g, '') : ''
  return /^\d{8,20}$/.test(id) ? id : null
}

const EMPTY_PRODUCTS: PersistedProducts = { overrides: {}, removedIds: [], imported: [], topProductIds: [] }

function normaliseProducts(stored: Partial<PersistedProducts> | null | undefined): PersistedProducts {
  return {
    overrides: stored?.overrides ?? {},
    removedIds: stored?.removedIds ?? [],
    imported: stored?.imported ?? [],
    topProductIds: stored?.topProductIds ?? [],
  }
}

/**
 * Fold any override still sitting over an imported product into its record.
 *
 * Applied to every read, so the shop and the hub see the folded product
 * straight away, and to every write, so the first save after this shipped
 * stores it and the override is gone. See `foldOverride` for the rules.
 */
function needsFold(state: PersistedProducts): boolean {
  const importedIds = new Set(state.imported.map((p) => p.id))
  return Object.keys(state.overrides).some((id) => importedIds.has(id))
}

function foldImportedOverrides(state: PersistedProducts): PersistedProducts {
  const importedIds = new Set(state.imported.map((p) => p.id))
  const stale = Object.keys(state.overrides).filter((id) => importedIds.has(id))
  if (stale.length === 0) return state
  const overrides = { ...state.overrides }
  const costRatio = getPricingConfig().defaultCostRatio
  const imported = state.imported.map((p) => {
    const override = overrides[p.id]
    return override ? foldOverride(p, override, { costRatio }) : p
  })
  for (const id of stale) delete overrides[id]
  return { ...state, overrides, imported }
}

/**
 * Keep the store as it was before overrides were first folded in.
 *
 * The fold is one-way: it writes founder overrides into the imported records
 * and drops the overrides. If any rule in it turns out wrong, this copy is what
 * puts it right. Written once — only if no backup exists — and never read by
 * the app.
 */
let backedUp = false
async function backupBeforeFold(): Promise<void> {
  if (backedUp) return
  try {
    const raw = await kvGetRaw(`portal:${PRODUCTS_FILE}`)
    if (raw === null) {
      backedUp = true
      return
    }
    const stored = normaliseProducts(JSON.parse(raw) as PersistedProducts)
    if (!needsFold(stored)) {
      backedUp = true
      return
    }
    await kvCompareAndSet(`portal:${PRODUCTS_FILE}-before-fold`, stored, null)
    backedUp = true
  } catch {
    // Unreadable now means `mutateJson` will refuse the write anyway.
  }
}

/** For reading: never throws, an unreadable store reads as empty (the shop must render). */
async function loadProducts(): Promise<PersistedProducts> {
  return foldImportedOverrides(normaliseProducts(await readJson<PersistedProducts>(PRODUCTS_FILE, EMPTY_PRODUCTS)))
}

/**
 * Every change to the product store goes through here.
 *
 * Fresh read, change, and a write that only lands if nobody else wrote in
 * between — otherwise the change is applied again to what is there now. A store
 * that cannot be read is never written over, and a write that fails throws, so
 * no screen can say "Saved" about something that was not. See `mutateJson`.
 *
 * `change` may run more than once, so it must only change the state it is given.
 */
async function mutateProducts<R>(change: (state: PersistedProducts) => R): Promise<R> {
  await backupBeforeFold()
  return mutateJson<PersistedProducts, R>(PRODUCTS_FILE, EMPTY_PRODUCTS, (stored) => {
    const state = foldImportedOverrides(normaliseProducts(stored))
    const result = change(state)
    state.imported = state.imported.map(withoutDerived)
    return withResult(state, result)
  })
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
    setAutoSendOverride(settings.autoSendPaid ?? null, settings.autoSendSince ?? null)
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

// ── Meta Pixel ──
// Set in the Founders Hub. `NEXT_PUBLIC_META_PIXEL_ID` is the fallback for an
// environment nobody has configured through the hub — a hub setting, once
// saved, always wins, including one that switches the Pixel off.
export async function getMetaPixelSettings(): Promise<MetaPixelSettings> {
  const settings = await loadSettings()
  if (settings.metaPixel) {
    return { pixelId: normalisePixelId(settings.metaPixel.pixelId), enabled: settings.metaPixel.enabled === true }
  }
  const fromEnv = normalisePixelId(process.env.NEXT_PUBLIC_META_PIXEL_ID)
  return { pixelId: fromEnv, enabled: fromEnv !== null }
}
export async function setMetaPixelSettings(next: MetaPixelSettings): Promise<void> {
  const pixelId = normalisePixelId(next.pixelId)
  await saveSettings({ metaPixel: { pixelId, enabled: pixelId !== null && next.enabled === true } })
}
/** The id the browser should load, or null when the Pixel is off or unset. */
export async function getLiveMetaPixelId(): Promise<string | null> {
  const s = await getMetaPixelSettings()
  return s.enabled ? s.pixelId : null
}

// ── Amp Consult rollout (H11) ──
// Whether the hero offers the consult, alongside the quiz, instead of it, or
// as one side of an A/B split. Normalised on the way out as well as in, like
// the quiz experiment, so a bad row can't switch anything on.
export async function getConsultRollout(): Promise<ConsultRollout> {
  const settings = await loadSettings()
  return normaliseConsultRollout(settings.consultRollout ?? DEFAULT_CONSULT_ROLLOUT)
}
export async function setConsultRollout(rollout: ConsultRollout): Promise<void> {
  await saveSettings({ consultRollout: normaliseConsultRollout(rollout) })
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

// ── Automatic sending of paid orders ──
export async function getAutoSendPaidSetting(): Promise<boolean> {
  const settings = await loadSettings()
  return settings.autoSendPaid ?? getAutoSendSetting()
}
export async function setAutoSendPaidSetting(on: boolean): Promise<void> {
  const since = on ? new Date().toISOString() : null
  await saveSettings({ autoSendPaid: on, autoSendSince: since })
  setAutoSendOverride(on, since)
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
// Only the sample catalogue's products still use these — an imported product is
// edited in its own record (see `foldImportedOverrides`).
export async function getProductOverrides(): Promise<ProductOverrides> {
  return (await loadProducts()).overrides
}
export async function getProductOverride(id: string): Promise<Partial<CatalogueProduct> | undefined> {
  return (await loadProducts()).overrides[id]
}

/** The base (sample) product a stored override sits over, if `id` is one. */
function baseProduct(id: string): CatalogueProduct | undefined {
  return (MOCK_CATALOGUE as CatalogueProduct[]).find((p) => p.id === id)
}

/** Thrown when a change names a product the store does not hold. */
export class ProductNotFound extends Error {
  constructor(readonly id: string) {
    super(`There is no product “${id}”.`)
    this.name = 'ProductNotFound'
  }
}

/**
 * Change one product inside a mutation. Returns the product as it now stands,
 * or undefined when `id` is neither imported nor a sample product.
 */
function editInState(
  state: PersistedProducts,
  id: string,
  change: (current: CatalogueProduct) => CatalogueProduct | null,
): CatalogueProduct | undefined {
  const index = state.imported.findIndex((p) => p.id === id)
  if (index !== -1) {
    const next = change(state.imported[index])
    if (next) state.imported[index] = withoutDerived({ ...next, id })
    return state.imported[index]
  }
  const base = baseProduct(id)
  if (!base) return undefined
  const current = state.overrides[id] ? composeOverride(base, state.overrides[id]) : base
  const next = change(current)
  if (!next) return current
  const override = overrideFor(base, { ...next, id })
  if (Object.keys(override).length === 0) delete state.overrides[id]
  else state.overrides[id] = override
  return composeOverride(base, override)
}

/**
 * Change one product, wherever it is stored, in one safe write.
 *
 * `change` gets the product as it stands (imported record, or sample product
 * with its override composed on) and returns what it should become, or null to
 * leave it alone. Imported products are rewritten in place; a sample product
 * gets the difference stored as its override. Returns the product as saved.
 */
export async function editStoredProduct(
  id: string,
  change: (current: CatalogueProduct) => CatalogueProduct | null,
): Promise<CatalogueProduct> {
  return mutateProducts((state) => {
    const saved = editInState(state, id, change)
    if (!saved) throw new ProductNotFound(id)
    return saved
  })
}

/**
 * Apply a patch to a product (see `catalogue/patch` for the rules: null clears,
 * variants are edits by id, servings spread over the master's size).
 *
 * Kept under its old name because a lot of callers use it. It no longer stacks
 * an override over an imported product — that is what hid every later sync,
 * pull and price change behind a frozen copy. A patch for a product this store
 * does not hold is kept as an override, as it always was, so it applies if that
 * product turns up.
 */
export async function setProductOverride(id: string, patch: Partial<CatalogueProduct>): Promise<void> {
  // A raw patch never moves a product's address, its review state or its rank.
  const { id: _id, handle: _handle, review: _review, topRank: _rank, ...safe } = patch
  void _id; void _handle; void _review; void _rank
  patch = safe
  await mutateProducts((state) => {
    const saved = editInState(state, id, (current) => applyPatch(current, patch as ProductPatch))
    if (!saved) state.overrides[id] = { ...state.overrides[id], ...patch }
  })
}
export async function clearProductOverride(id: string): Promise<void> {
  await mutateProducts((state) => {
    delete state.overrides[id]
  })
}

/** What `restructureProducts` lets a change do, all inside one write. */
export interface ProductWorkbench {
  /** A product as stored now (imported record, or sample product with its edits). */
  get(id: string): CatalogueProduct | undefined
  /** Save a product that already exists. */
  put(product: CatalogueProduct): void
  /** Add a new imported product under an id nothing else has; returns that id. */
  add(product: CatalogueProduct): string
  /** Take a product off sale (soft — it can be restored). */
  remove(id: string): void
  /** Delete an imported product outright (for one that was never on sale). */
  discard(id: string): void
  /** Put a removed product back on sale. */
  restore(id: string): void
  /** Whether a product is currently removed. */
  isRemoved(id: string): boolean
  /** Another stored product (not `exceptId`) that sells any of these SKUs, live first. */
  holderOf(skus: string[], exceptId: string): { product: CatalogueProduct; state: 'live' | 'pending' | 'removed' } | null
  /** Swap one product for another on the Top 25, keeping its place. */
  repointRoster(fromId: string, toId: string): void
}

/**
 * Change the SHAPE of the catalogue — split, merge, combine — in one write.
 *
 * These move SKUs between products, so each is several changes that only make
 * sense together: a split that saved the new product and then failed to save
 * the old one would sell the same SKU twice. Everything `change` does lands, or
 * none of it does.
 */
export async function restructureProducts<R>(change: (bench: ProductWorkbench) => R): Promise<R> {
  return mutateProducts((state) => {
    const bench: ProductWorkbench = {
      get: (id) => {
        const imported = state.imported.find((p) => p.id === id)
        if (imported) return imported
        const base = baseProduct(id)
        return base && state.overrides[id] ? composeOverride(base, state.overrides[id]) : base
      },
      put: (product) => {
        if (!editInState(state, product.id, () => product)) throw new ProductNotFound(product.id)
      },
      add: (product) => {
        const id = freeProductId(product.id, state.imported)
        state.imported.push(withoutDerived({ ...product, id, handle: id }))
        return id
      },
      remove: (id) => {
        if (!state.removedIds.includes(id)) state.removedIds.push(id)
      },
      discard: (id) => {
        state.imported = state.imported.filter((p) => p.id !== id)
        state.removedIds = state.removedIds.filter((r) => r !== id)
        delete state.overrides[id]
      },
      restore: (id) => {
        state.removedIds = state.removedIds.filter((r) => r !== id)
      },
      isRemoved: (id) => state.removedIds.includes(id),
      holderOf: (skus, exceptId) => {
        const others = { imported: state.imported.filter((p) => p.id !== exceptId), removedIds: state.removedIds }
        const hit = productHoldingSkus(others, skus)
        return hit ? { product: hit.product, state: hit.state } : null
      },
      repointRoster: (fromId, toId) => {
        const roster = state.topProductIds ?? []
        if (!roster.includes(fromId)) return
        state.topProductIds = roster.includes(toId)
          ? roster.filter((r) => r !== fromId)
          : roster.map((r) => (r === fromId ? toId : r))
      },
    }
    return change(bench)
  })
}

// ── Removed products (hidden from the catalogue everywhere) ──
export async function getRemovedProductIds(): Promise<Set<string>> {
  return new Set((await loadProducts()).removedIds)
}
/**
 * Take a product off sale everywhere. Soft: its record and any edits stay, so
 * `restoreProduct` brings it back exactly as it was.
 */
export async function markProductRemoved(id: string): Promise<void> {
  await mutateProducts((state) => {
    if (!state.removedIds.includes(id)) state.removedIds.push(id)
  })
}
export async function restoreProduct(id: string): Promise<void> {
  await mutateProducts((state) => {
    state.removedIds = state.removedIds.filter((r) => r !== id)
  })
}

// ── Imported products (added from the PowerBody supplier feed) ──
export async function getImportedProducts(): Promise<CatalogueProduct[]> {
  return (await loadProducts()).imported
}

/**
 * Write products back by id (replacing the stored record of each).
 *
 * For a caller holding whole, current records. Anything that READ products to
 * work out a change should use `updateImportedProducts` instead, so the change
 * is applied to the store as it is at write time rather than as it was read.
 */
export async function addImportedProducts(products: CatalogueProduct[]): Promise<void> {
  await mutateProducts((state) => {
    const byId = new Map(state.imported.map((p) => [p.id, p]))
    for (const p of products) byId.set(p.id, withoutDerived(p))
    state.imported = [...byId.values()]
  })
}

/**
 * Change imported products in one safe write.
 *
 * `change` gets every imported product as stored right now and returns the ones
 * it changed (matched back by id; ids not in the store are ignored) plus
 * whatever it wants to hand back. Use this for the sync, the stock memory and
 * the bulk passes: a pass that read the list, worked for a minute and then wrote
 * the whole list back would put back every edit made in that minute.
 */
export async function updateImportedProducts<R>(
  change: (imported: CatalogueProduct[]) => { products: CatalogueProduct[]; result: R },
): Promise<R> {
  return mutateProducts((state) => {
    const { products, result } = change(state.imported.map((p) => ({ ...p })))
    if (products.length > 0) {
      const byId = new Map(products.map((p) => [p.id, p]))
      state.imported = state.imported.map((p) => byId.get(p.id) ?? p)
    }
    return result
  })
}

/** How one incoming product fared in `importProducts`. */
/**
 * `newSkus` on the non-added outcomes: SKUs of the incoming product that NO
 * stored product sells — a flavour the spreadsheet gained since last time, say.
 * They are not added silently onto the matched product; the screen offers it.
 */
export type ImportOutcome =
  | { status: 'added'; id: string; title: string }
  | { status: 'already'; id: string; title: string; state: 'live' | 'pending'; skus: string[]; newSkus: string[] }
  | { status: 'removed'; id: string; title: string; skus: string[]; newSkus: string[] }
  | { status: 'refreshed'; id: string; title: string; newSkus: string[] }

/** Which stored product already sells one of these SKUs, preferring a live one. */
export function productHoldingSkus(
  state: Pick<PersistedProducts, 'imported' | 'removedIds'>,
  skus: string[],
): { product: CatalogueProduct; state: 'live' | 'pending' | 'removed'; skus: string[] } | null {
  const wanted = new Set(skus.filter(Boolean).map((s) => s.toUpperCase()))
  if (wanted.size === 0) return null
  const removed = new Set(state.removedIds)
  const rank = { live: 0, pending: 1, removed: 2 } as const
  let best: { product: CatalogueProduct; state: 'live' | 'pending' | 'removed'; skus: string[] } | null = null
  for (const product of state.imported) {
    const shared = product.variants.map((v) => v.sku).filter((s): s is string => Boolean(s && wanted.has(s.toUpperCase())))
    if (shared.length === 0) continue
    const where = removed.has(product.id) ? 'removed' : product.review?.status === 'pending' ? 'pending' : 'live'
    if (!best || rank[where] < rank[best.state]) best = { product, state: where, skus: shared }
  }
  return best
}

/**
 * Add products from the supplier, never duplicating or un-publishing one.
 *
 * A re-import used to replace the stored product with a fresh pending copy —
 * so re-running a spreadsheet to pick up one fix quietly took the whole range
 * off sale and threw away every price, picture and name worked out since. Now:
 *
 *   · a product whose SKUs are already on a stored product is NOT added again;
 *     the outcome says where they are (and a removed one can be restored);
 *   · `refresh` lets a spreadsheet re-run update the fields it owns on a product
 *     that is still waiting for review — never on one already on sale;
 *   · a new product gets an id no stored product has, removed ones included.
 */
export async function importProducts(
  products: CatalogueProduct[],
  options: { refresh?: (current: CatalogueProduct, incoming: CatalogueProduct) => CatalogueProduct } = {},
): Promise<ImportOutcome[]> {
  return mutateProducts((state) => {
    const outcomes: ImportOutcome[] = []
    for (const incoming of products) {
      const skus = incoming.variants.map((v) => v.sku).filter((s): s is string => Boolean(s))
      const holder = productHoldingSkus(state, skus)
      if (holder) {
        const newSkus = skus.filter((sku) => !productHoldingSkus(state, [sku]))
        if (holder.state === 'removed') {
          outcomes.push({ status: 'removed', id: holder.product.id, title: holder.product.title, skus: holder.skus, newSkus })
        } else if (holder.state === 'pending' && options.refresh) {
          const index = state.imported.findIndex((p) => p.id === holder.product.id)
          state.imported[index] = withoutDerived({ ...options.refresh(holder.product, incoming), id: holder.product.id })
          outcomes.push({ status: 'refreshed', id: holder.product.id, title: holder.product.title, newSkus })
        } else {
          outcomes.push({ status: 'already', id: holder.product.id, title: holder.product.title, state: holder.state, skus: holder.skus, newSkus })
        }
        continue
      }
      const id = freeProductId(incoming.id, state.imported)
      const stored = withoutDerived({ ...incoming, id, handle: id })
      state.imported.push(stored)
      outcomes.push({ status: 'added', id, title: stored.title })
    }
    return outcomes
  })
}

/** `id`, or `id-2`, `id-3`… — whichever no stored product (removed ones included) has. */
function freeProductId(id: string, existing: CatalogueProduct[]): string {
  const taken = new Set(existing.map((p) => p.id))
  for (const base of MOCK_CATALOGUE as CatalogueProduct[]) taken.add(base.id)
  if (!taken.has(id)) return id
  for (let n = 2; ; n += 1) if (!taken.has(`${id}-${n}`)) return `${id}-${n}`
}

/**
 * Imported products still waiting on review.
 *
 * Read from the imported list directly rather than through the catalogue
 * resolver, which filters them out on purpose — the hub is the one place they
 * are supposed to be visible.
 */
export async function getPendingReviewProducts(): Promise<CatalogueProduct[]> {
  const { imported, removedIds } = await loadProducts()
  const removed = new Set(removedIds)
  return imported.filter((p) => p.review?.status === 'pending' && !removed.has(p.id))
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
  await mutateProducts((state) => {
    const replacing = new Set(options.replacing ?? [])
    if (replacing.size > 0) {
      state.imported = state.imported.filter((p) => !replacing.has(p.id) || p.id === product.id)
      for (const id of replacing) delete state.overrides[id]
      const index = state.imported.findIndex((p) => p.id === product.id)
      if (index === -1) state.imported.push(product)
      else state.imported[index] = product
      return
    }
    const index = state.imported.findIndex((p) => p.id === product.id)
    if (index === -1) return
    state.imported[index] = product
  })
}

/**
 * Drop an imported product entirely.
 *
 * Distinct from `markProductRemoved`: discarding something that was never
 * approved should leave no trace, not add it to a removed-ids list that would
 * then block re-importing the same SKU after a second look.
 */
export async function discardImportedProduct(id: string): Promise<void> {
  await mutateProducts((state) => {
    state.imported = state.imported.filter((p) => p.id !== id)
    state.removedIds = state.removedIds.filter((r) => r !== id)
    delete state.overrides[id]
  })
}

// ── Top 25 roster (the products the quiz reaches for first) ──
export async function getTopProductIds(): Promise<string[]> {
  return normaliseRoster((await loadProducts()).topProductIds ?? [])
}
export async function setTopProductIds(ids: string[]): Promise<void> {
  await mutateProducts((state) => {
    state.topProductIds = normaliseRoster(ids)
  })
}

/** The full founder-managed product state in one read (for the read path). */
export async function getPersistedProducts(): Promise<PersistedProducts> {
  return loadProducts()
}

/**
 * Merge stored field overrides onto a catalogue (pure helper).
 *
 * After the fold only sample products carry overrides, but this stays general:
 * it is the read path, and it must never be the reason a product disappears.
 */
export function applyProductOverrides(
  products: CatalogueProduct[],
  overrides: ProductOverrides,
): CatalogueProduct[] {
  if (Object.keys(overrides).length === 0) return products
  return products.map((p) => {
    const override = overrides[p.id]
    if (!override) return p
    const merged = composeOverride(p, override)

    /*
      A serving count a founder typed beats the supplier's.

      The merge is shallow, and `servings` is a PRODUCT field while the shop
      reads the SELECTED SKU's own count (`servingsForVariant`) — so an override
      saying 20 sat on top of variants saying 12 and the shelf went on saying 12
      for ever. Spread here for overrides written before edits spread at save.

      Only the SKUs of the master's size, because that is the unit the number
      describes: 100 capsules beside a 454g bag are 33 servings and 454, and
      those keep their own (see `catalogue/split`).
    */
    // An override written by the current editor carries its SKUs whole, each
    // with exactly the count that was saved — spreading over them again would
    // overwrite a flavour's own number with the master's.
    if (override.servings === undefined || override.servings === null || override.variants) return merged
    const variants = spreadServings(merged, merged.servings)
    return variants ? { ...merged, variants } : merged
  })
}
