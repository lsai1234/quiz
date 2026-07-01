import type { StackBlueprint } from './types'
import type { CatalogueProduct, ConsumptionCadence } from '@/lib/catalogue/types'
import type { QuizAnswers, Budget, StackLevel, StackPreference } from '@/lib/types'

const DAYS_PER_MONTH = 30

// ─── Config ──────────────────────────────────────────────────────────────────
// All pricing rules live here so they can be changed without touching UI code.
// The portal (final phase) will edit these — they're written as data, not logic.

/** A volume/value discount tier. Qualifies when the order meets every set threshold. */
export interface DiscountTier {
  id: string
  label: string
  /** Minimum order subtotal (£) to qualify. */
  minSubtotal?: number
  /** Minimum number of products to qualify. */
  minItems?: number
  /** Discount as a fraction, 0–1. */
  discountPct: number
}

export const PRICING_CONFIG = {
  /** Subscription discount applied to subscription products (0–1). The base
   *  "subscribe & save"; overridden by the per-bundle rate below and can be
   *  beaten by a subscriptionTier for bigger orders. */
  subscriptionDiscount: 0.15,
  /**
   * Fixed subscribe-&-save discount per bundle (stack level). This is the
   * headline selling point shown on each bundle: bigger bundle, better rate.
   * The resolved rate is still margin-floored per line and can be beaten by a
   * subscriptionTier. Falls back to `subscriptionDiscount` if a level is unset.
   */
  levelSubscriptionDiscount: {
    essentials: 0.15,
    performance: 0.2,
    complete: 0.25,
  } as Record<StackLevel, number>,
  /** Label shown on the subscription saving line. */
  subscriptionPlanLabel: 'CHRGD Monthly Stack Plan',

  // ── One-off bundle discount tiers (best-qualifying wins) ──
  bundleTiers: [
    // First tier aligned to the free-delivery threshold (£50) so both perks kick
    // in together — no dead zone where delivery is free but the discount isn't.
    { id: 'bundle-50', label: '£50+ bundle', minSubtotal: 50, discountPct: 0.1 },
    { id: 'bundle-90', label: '£90+ bundle', minSubtotal: 90, discountPct: 0.15 },
    { id: 'bundle-120', label: '£120+ bundle', minSubtotal: 120, discountPct: 0.2 },
  ] as DiscountTier[],
  // ── Extra subscription discount tiers, on top of the base rate (best wins) ──
  subscriptionTiers: [] as DiscountTier[],

  // ── Per-bundle hard price caps ──
  /**
   * The maximum discounted one-off total (£) a stack may reach for each budget
   * tier. The factory selects products up to (and as close as possible to) this
   * ceiling and never over it; the AI personaliser is gated to the same cap.
   * null = no upper cap (the open-ended top tier).
   */
  budgetCaps: {
    'under-30': 30,
    '30-50': 50,
    '50-80': 80,
    '80-plus': null,
  } as Record<Budget, number | null>,

  // ── Margin / profit guardrails ──
  /** When a product has no explicit cost, estimate it as price × this. */
  defaultCostRatio: 0.35,
  /** Never discount a line below cost × (1 + this). */
  marginFloorPct: 0.15,
  /** Minimum flat monthly value for the subscription to be offered (£). */
  minSubscriptionMonthly: 25,

  // ── Subscription cadence / commitment ──
  /** Products with more servings than this are candidates for a monthly refill SKU. */
  maxSubscriptionServings: 35,
  /** Never schedule a delivery more than this many months apart. */
  maxDeliveryMonths: 3,
  /** Bill one flat amount every month (smoothed average); minimum term protects it. */
  subscriptionFlatMonthly: true,
  /** Minimum subscription commitment in months (per-product can override up). */
  minSubscriptionMonths: 4,

  // ── Fulfilment ──
  /** Order total (£) at or above which delivery is free. Advertised on the
   *  bundle selector; 0 disables the free-delivery messaging entirely. */
  freeDeliveryThreshold: 50,

  /** First-cycle intro offer. */
  introOffer: {
    /** Discount on the first month, 0–1 (e.g. 0.5 = 50% off). 0 disables it. */
    firstMonthDiscount: 0.5,
  },
}

// ─── Runtime config resolution (portal-overridable) ──────────────────────────
// PRICING_CONFIG holds the defaults. The portal can override any of it at
// runtime; getPricingConfig() returns the merged, current config. With no
// overrides it equals the defaults, so behaviour is unchanged until edited.

export type PricingConfig = typeof PRICING_CONFIG

let _overrides: Partial<PricingConfig> = {}
let _current: PricingConfig = PRICING_CONFIG

function recomputeConfig() {
  _current = {
    ...PRICING_CONFIG,
    ..._overrides,
    introOffer: { ...PRICING_CONFIG.introOffer, ...(_overrides.introOffer ?? {}) },
    bundleTiers: _overrides.bundleTiers ?? PRICING_CONFIG.bundleTiers,
    subscriptionTiers: _overrides.subscriptionTiers ?? PRICING_CONFIG.subscriptionTiers,
    budgetCaps: _overrides.budgetCaps ?? PRICING_CONFIG.budgetCaps,
    levelSubscriptionDiscount: {
      ...PRICING_CONFIG.levelSubscriptionDiscount,
      ...(_overrides.levelSubscriptionDiscount ?? {}),
    },
  }
}

/** Replace the current pricing overrides (portal save / client sync). */
export function setPricingOverrides(overrides: Partial<PricingConfig>): void {
  _overrides = overrides ?? {}
  recomputeConfig()
}

export function getPricingOverrides(): Partial<PricingConfig> {
  return _overrides
}

/** The current pricing config — defaults merged with any portal overrides. */
export function getPricingConfig(): PricingConfig {
  return _current
}

/** Clear all overrides (back to defaults). */
export function resetPricingOverrides(): void {
  _overrides = {}
  _current = PRICING_CONFIG
}

// ─── Discount tiers & margin helpers ─────────────────────────────────────────

/** Best-qualifying tier for an order. Returns the highest discount it unlocks. */
export function resolveTier(
  tiers: DiscountTier[],
  subtotal: number,
  itemCount: number,
): { pct: number; tier: DiscountTier | null } {
  let best: DiscountTier | null = null
  for (const t of tiers) {
    const meetsSubtotal = t.minSubtotal == null || subtotal >= t.minSubtotal
    const meetsItems = t.minItems == null || itemCount >= t.minItems
    if (meetsSubtotal && meetsItems && (!best || t.discountPct > best.discountPct)) best = t
  }
  return { pct: best?.discountPct ?? 0, tier: best }
}

/** Cost of one unit — explicit, or estimated from price. */
export function unitCostOf(product: Pick<CatalogueProduct, 'cost' | 'basePrice'>, unitPrice: number, config = getPricingConfig()): number {
  if (product.cost != null) return product.cost
  return Math.round(unitPrice * config.defaultCostRatio * 100) / 100
}

/**
 * Apply a discount to a unit price, but never below the margin floor
 * (cost × (1+floor)). The floor is capped at the list price, so a product whose
 * cost is already above the floor simply gets no discount (never a markup).
 */
export function discountWithFloor(unitPrice: number, rate: number, cost: number, config = getPricingConfig()): number {
  const discounted = unitPrice * (1 - rate)
  const floor = Math.min(unitPrice, cost * (1 + config.marginFloorPct))
  return Math.max(discounted, floor)
}

// ─── Per-bundle price caps ────────────────────────────────────────────────────

/** The hard discounted one-off cap (£) for a budget tier, or null when uncapped. */
export function budgetCapFor(budget: Budget | null, config = getPricingConfig()): number | null {
  if (!budget) return null
  return config.budgetCaps[budget] ?? null
}

/**
 * The discounted one-off total for a set of (price, cost) lines: the best
 * qualifying bundle-tier discount applied per line with the margin floor — the
 * SAME maths `calculatePricing` uses for `oneOffTotal`, so the cap enforced at
 * selection/personalisation time matches the price shown at the reveal.
 */
export function discountedOneOffTotal(
  lines: { price: number; cost: number }[],
  config = getPricingConfig(),
): number {
  const subtotal = lines.reduce((s, l) => s + l.price, 0)
  const { pct } = resolveTier(config.bundleTiers, subtotal, lines.length)
  const total = lines.reduce((s, l) => s + discountWithFloor(l.price, pct, l.cost, config), 0)
  return Math.round(total * 100) / 100
}

// ─── Subscription qualification & resolution ─────────────────────────────────

/**
 * Whether a product is itself a sensible monthly subscription item: flagged
 * subscriptionEligible AND lasting roughly a month. Products that fail this
 * should be mapped to a monthly refill via `subscriptionProductId`.
 */
export function qualifiesForSubscription(
  product: Pick<CatalogueProduct, 'subscriptionEligible' | 'servings'>,
  config = getPricingConfig(),
): boolean {
  return (
    product.subscriptionEligible &&
    product.servings <= config.maxSubscriptionServings
  )
}

/**
 * Resolve the product that should be billed/shipped monthly when `product` is
 * put on subscription. Falls back to the product itself when no (valid) mapping
 * is set, so the monthly plan is always available.
 */
export function getSubscriptionProduct(
  product: CatalogueProduct,
  catalogue: CatalogueProduct[],
): CatalogueProduct {
  const mappedId = product.subscriptionProductId
  if (mappedId && mappedId !== product.id) {
    const mapped = catalogue.find((p) => p.id === mappedId)
    if (mapped) return mapped
    // Mapping set but not found in catalogue — fall back to self.
  }
  return product
}

// ─── Consumption → monthly quantity ──────────────────────────────────────────

/** Approximate training sessions per month, from the quiz training frequency. */
export function workoutsPerMonth(answers?: QuizAnswers | null): number {
  switch (answers?.trainingFrequency) {
    case '1-2x': return 6
    case '3-4x': return 15
    case '5-6x': return 24
    case 'daily': return 30
    default: return 12 // unknown → assume ~3×/week
  }
}

/**
 * The consumption protocol for a product — explicit if set, otherwise derived
 * from its stack slots (energy/hydration are taken per-workout, the rest daily)
 * and servings (servings per container at the normal dose).
 */
export function resolveConsumption(product: CatalogueProduct): { cadence: ConsumptionCadence; servingsPerUnit: number } {
  if (product.consumption) return product.consumption
  const perWorkout = product.stackSlots.some((s) => s === 'energy' || s === 'hydration')
  return {
    cadence: perWorkout ? 'per-workout' : 'daily',
    servingsPerUnit: product.servings > 0 ? product.servings : DAYS_PER_MONTH,
  }
}

// ─── Usage levels (the customisation journey's sliders) ──────────────────────
// A member dials in how much they get through on a friendly, no-maths scale.
// Each level is a multiplier on servings-per-occasion: 'light' = fewer servings
// per day/workout (a tub lasts longer, ships less often), 'heavy' = more.
// 'standard' is the suggested default — what the engine picks automatically.

export const USAGE_LEVELS = ['light', 'standard', 'heavy'] as const
export type UsageLevel = (typeof USAGE_LEVELS)[number]

/** Servings consumed per occasion (per day for daily, per session for per-workout). */
export const USAGE_SERVINGS_PER_OCCASION: Record<UsageLevel, number> = {
  light: 0.5,
  standard: 1,
  heavy: 2,
}

export const DEFAULT_USAGE_LEVEL: UsageLevel = 'standard'

/** How a product is sized into a subscription line: cadence + ship schedule. */
export interface LineSizing {
  cadence: ConsumptionCadence
  /** Servings in one container. */
  servingsPerUnit: number
  /** Times taken per month (~30 daily, training sessions/month per-workout). */
  occasionsPerMonth: number
  /** The usage level applied (member-chosen, defaults to 'standard'). */
  usageLevel: UsageLevel
  /** Units sent each shipment. */
  unitsPerShipment: number
  /** Ship cadence in months. */
  shipEveryMonths: number
  /** Average units consumed per month (unitsPerShipment / shipEveryMonths). */
  monthlyUnits: number
}

/**
 * Size a product into a subscription line: derive its consumption protocol and
 * the nearest sensible ship schedule for the member's training frequency and
 * chosen usage level. Shared by `buildSubscriptionPlan` (initial stack) and the
 * hub's add/cadence helpers so every line is sized the same way.
 *
 * `usageLevel` scales servings-per-occasion (the journey's per-product slider);
 * 'standard' reproduces the previous one-serving-per-occasion default.
 */
export function sizeConsumption(
  product: CatalogueProduct,
  answers?: QuizAnswers | null,
  config = getPricingConfig(),
  usageLevel: UsageLevel = DEFAULT_USAGE_LEVEL,
): LineSizing {
  const woPerMonth = workoutsPerMonth(answers)
  const { cadence, servingsPerUnit } = resolveConsumption(product)
  const occasionsPerMonth = cadence === 'daily' ? DAYS_PER_MONTH : Math.max(woPerMonth, 1)
  const servingsPerOccasion = USAGE_SERVINGS_PER_OCCASION[usageLevel] ?? 1
  const servingsPerMonth = occasionsPerMonth * servingsPerOccasion
  const monthsOneUnitLasts = servingsPerMonth > 0 ? servingsPerUnit / servingsPerMonth : config.maxDeliveryMonths

  let unitsPerShipment: number
  let shipEveryMonths: number
  if (monthsOneUnitLasts >= 1) {
    unitsPerShipment = 1
    shipEveryMonths = Math.min(config.maxDeliveryMonths, Math.max(1, Math.round(monthsOneUnitLasts)))
  } else {
    unitsPerShipment = Math.max(1, Math.round(servingsPerMonth / servingsPerUnit))
    shipEveryMonths = 1
  }

  return {
    cadence,
    servingsPerUnit,
    occasionsPerMonth,
    usageLevel,
    unitsPerShipment,
    shipEveryMonths,
    monthlyUnits: unitsPerShipment / shipEveryMonths,
  }
}

/** A single line in the monthly subscription, after deduplication. */
export interface SubscriptionLine {
  /** The monthly product that will actually be billed/shipped. */
  product: CatalogueProduct
  /** Slot ids this line fulfils — more than one when slots share a sub product. */
  coversSlotIds: string[]
  /** How the product is taken. */
  cadence: ConsumptionCadence
  /** Times taken per month: ~30 for daily, training sessions/month for per-workout. */
  occasionsPerMonth: number
  /** Servings in one container. */
  servingsPerUnit: number
  /** The member's chosen usage level for this line (defaults to 'standard'). */
  usageLevel: UsageLevel
  /** Units sent each shipment. */
  unitsPerShipment: number
  /** Ship cadence in months (e.g. 2 = one unit every two months). */
  shipEveryMonths: number
  /** Average units consumed per month (unitsPerShipment / shipEveryMonths). */
  monthlyUnits: number
  /** The variant id that will be billed/shipped (internal id, or Shopify GID when live). */
  variantId: string
  /** Shopify selling-plan GID for this line, when configured. */
  sellingPlanId: string | null
  /** Undiscounted price of one unit. */
  unitPrice: number
  /** Cost of goods for one unit. */
  unitCost: number
  /** Discounted amount billed each delivery (unitsPerShipment × discounted unit price). */
  pricePerDelivery: number
  /** Amortised undiscounted monthly cost. */
  monthlyBaseline: number
  /** Amortised monthly cost after the subscription discount. */
  monthlyPrice: number
}

/**
 * Build the deduplicated monthly subscription from a blueprint: each slot's
 * product is resolved to its subscription product, and slots that resolve to
 * the SAME subscription product are merged into one line (billed once).
 * Slots whose resolved product isn't subscriptionEligible are skipped.
 */
interface RawSubLine {
  product: CatalogueProduct
  coversSlotIds: string[]
  cadence: ConsumptionCadence
  occasionsPerMonth: number
  servingsPerUnit: number
  usageLevel: UsageLevel
  unitsPerShipment: number
  shipEveryMonths: number
  monthlyUnits: number
  variant: CatalogueProduct['variants'][number] | undefined
  productRef: CatalogueProduct
  unitPrice: number
}

/** Options for building/pricing a subscription plan. */
export interface SubscriptionPlanOptions {
  /** Per-product usage level chosen in the customisation journey. */
  usageByProductId?: Record<string, UsageLevel>
  /** The bundle/stack level, for the fixed subscribe-&-save rate. */
  level?: StackLevel
}

/**
 * The bundle (stack level) for a blueprint: explicit `level` if set, otherwise
 * derived from how many products it has — bigger stack = higher bundle.
 */
export function stackLevelOf(blueprint: Pick<StackBlueprint, 'slots'> & { level?: StackLevel }): StackLevel {
  if (blueprint.level) return blueprint.level
  const n = blueprint.slots.length
  if (n <= 3) return 'essentials'
  if (n <= 5) return 'performance'
  return 'complete'
}

/**
 * The bundle tier a quiz stack-preference maps to. Single source of truth shared
 * by the budget step's advertised save-rate AND the stack the member actually
 * gets, so the two can never drift. 'balanced' and any unset value → performance.
 */
export function levelForStackPreference(pref: StackPreference | null | undefined): StackLevel {
  return pref === 'simple' ? 'essentials' : pref === 'complete' ? 'complete' : 'performance'
}

/** Whether an order total qualifies for free delivery (threshold > 0 and met). */
export function qualifiesForFreeDelivery(total: number, config = getPricingConfig()): boolean {
  return config.freeDeliveryThreshold > 0 && total >= config.freeDeliveryThreshold
}

/** The fixed subscribe-&-save rate for a bundle/level (before any tier upgrade). */
export function levelSubscriptionRate(level: StackLevel | undefined, config = getPricingConfig()): number {
  return (level && config.levelSubscriptionDiscount[level]) || config.subscriptionDiscount
}

/**
 * The effective subscription discount for an order: the bundle's fixed per-level
 * rate, beaten by any qualifying subscription tier.
 */
export function resolveSubscriptionRate(
  monthlySubtotal: number,
  itemCount: number,
  config = getPricingConfig(),
  level?: StackLevel,
): number {
  return Math.max(levelSubscriptionRate(level, config), resolveTier(config.subscriptionTiers, monthlySubtotal, itemCount).pct)
}

export function buildSubscriptionPlan(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  answers?: QuizAnswers | null,
  config = getPricingConfig(),
  opts: SubscriptionPlanOptions = {},
): SubscriptionLine[] {
  const round = (n: number) => Math.round(n * 100) / 100
  const usageByProductId = opts.usageByProductId ?? {}
  const level = stackLevelOf({ ...blueprint, level: opts.level ?? blueprint.level })

  // ── Pass 1: build raw, deduplicated lines (no discount applied yet) ──
  const raw = new Map<string, RawSubLine>()
  for (const slot of blueprint.slots) {
    const slotProduct = catalogue.find((p) => p.id === slot.selectedProductId)
    if (!slotProduct) continue

    const sub = getSubscriptionProduct(slotProduct, catalogue)
    if (!sub.subscriptionEligible) continue

    const existing = raw.get(sub.id)
    if (existing) {
      existing.coversSlotIds.push(slot.slotId)
      continue
    }

    // Self-subscription respects the chosen variant; a mapped refill uses its default.
    const variant =
      sub.id === slotProduct.id
        ? sub.variants.find((v) => v.id === slot.selectedVariantId) ??
          sub.variants.find((v) => v.available) ??
          sub.variants[0]
        : sub.variants.find((v) => v.available) ?? sub.variants[0]
    const unitPrice = variant?.price ?? sub.basePrice

    const sizing = sizeConsumption(sub, answers, config, usageByProductId[sub.id])

    raw.set(sub.id, {
      product: sub,
      coversSlotIds: [slot.slotId],
      cadence: sizing.cadence,
      occasionsPerMonth: sizing.occasionsPerMonth,
      servingsPerUnit: sizing.servingsPerUnit,
      usageLevel: sizing.usageLevel,
      unitsPerShipment: sizing.unitsPerShipment,
      shipEveryMonths: sizing.shipEveryMonths,
      monthlyUnits: sizing.monthlyUnits,
      variant,
      productRef: sub,
      unitPrice,
    })
  }

  // ── Resolve the order-level discount, then apply it (with the margin floor) ──
  const rawLines = [...raw.values()]
  const monthlySubtotal = rawLines.reduce((s, r) => s + r.monthlyUnits * r.unitPrice, 0)
  const rate = resolveSubscriptionRate(monthlySubtotal, rawLines.length, config, level)

  return rawLines.map((r) => {
    const unitCost = unitCostOf(r.productRef, r.unitPrice, config)
    const discountedUnit = discountWithFloor(r.unitPrice, rate, unitCost, config)
    return {
      product: r.product,
      coversSlotIds: r.coversSlotIds,
      cadence: r.cadence,
      occasionsPerMonth: r.occasionsPerMonth,
      servingsPerUnit: r.servingsPerUnit,
      usageLevel: r.usageLevel,
      unitsPerShipment: r.unitsPerShipment,
      shipEveryMonths: r.shipEveryMonths,
      monthlyUnits: r.monthlyUnits,
      variantId: r.variant?.shopifyVariantId ?? r.variant?.id ?? r.product.id,
      sellingPlanId: r.variant?.sellingPlanId ?? null,
      unitPrice: round(r.unitPrice),
      unitCost: round(unitCost),
      pricePerDelivery: round(r.unitsPerShipment * discountedUnit),
      monthlyBaseline: round(r.monthlyUnits * r.unitPrice),
      monthlyPrice: round(r.monthlyUnits * discountedUnit),
    }
  })
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StackPricing {
  /** Sum of selected variant prices (or basePrice fallback). */
  oneOffTotal: number
  /** Sum of selected variant prices BEFORE the bundle discount — the "regular"
   *  one-off price the discount is applied to. Equals oneOffTotal when no
   *  bundle discount qualifies. */
  oneOffSubtotal: number
  /** Sum of compareAtPrice (RRP) across all slots. Equals oneOffTotal when no compare prices exist. */
  rrpTotal: number
  /** rrpTotal − oneOffTotal. 0 when no compare prices exist. */
  bundleSaving: number
  /** bundleSaving / rrpTotal expressed as 0–100. 0 when no compare prices exist. */
  bundleSavingPct: number
  /** The resolved one-off bundle discount tier, 0–100. */
  bundleDiscountPct: number
  /** Label of the qualifying bundle tier (e.g. "£90+ bundle"), null if none. */
  bundleTierLabel: string | null
  /** One-off gross margin (oneOffTotal − cost of goods). PORTAL-facing, not shown to customers. */
  oneOffMargin: number
  /** One-off margin as a percentage of oneOffTotal. */
  oneOffMarginPct: number
  /**
   * Monthly price of the subscription: each slot resolved to its subscription
   * product, deduplicated, with subscriptionDiscount applied to each line.
   */
  subscriptionTotal: number
  /** Undiscounted price of the (deduplicated) subscription products — the baseline for subscriptionSaving. */
  subscriptionItemsOneOffTotal: number
  /** subscriptionItemsOneOffTotal − subscriptionTotal */
  subscriptionSaving: number
  /** subscriptionSaving / subscriptionItemsOneOffTotal expressed as 0–100. */
  subscriptionSavingPct: number
  /** Number of distinct products in the monthly subscription (after dedupe). */
  subscriptionItemCount: number
  /** Number of slots whose subscription product differs from the one-off product (flipped to a monthly refill). */
  subscriptionSwappedCount: number
  /** Number of slots that can't subscribe at all (resolved product isn't subscriptionEligible). */
  excludedFromSubscriptionCount: number
  /** Minimum subscription commitment in months for this stack (≥ 1). */
  subscriptionMinMonths: number
  /** Flat monthly price billed on the first cycle, after the intro discount. */
  subscriptionFirstMonth: number
  /** Intro discount applied to the first month, 0–100. */
  subscriptionIntroDiscountPct: number
  /** Total the customer commits to across the minimum term (first month + the rest). */
  subscriptionMinTermTotal: number
  /** Subscription gross margin per month (monthly total − monthly cost of goods). PORTAL-facing. */
  subscriptionMonthlyMargin: number
  /** Margin across the whole minimum commitment (committed revenue − cost of goods shipped in the term). PORTAL-facing. */
  subscriptionCommittedMargin: number
  /** True when the minimum-term commitment is profitable even if the customer cancels at the earliest point. */
  subscriptionProfitableOnCancel: boolean
  /** True when the flat monthly meets the minimum order value to offer a subscription. */
  subscriptionMinOrderMet: boolean
  /** The bundle tier (stack level) the subscription rate is based on. */
  bundleLevel: StackLevel
  /** The fixed subscribe-&-save discount for this bundle, 0–100 (the headline selling point). */
  subscriptionDiscountPct: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve the price for a single slot: selected variant → basePrice fallback. */
function slotPrice(slot: StackBlueprint['slots'][number], product: CatalogueProduct): number {
  if (slot.selectedVariantId) {
    const variant = product.variants.find((v) => v.id === slot.selectedVariantId)
    if (variant) return variant.price
  }
  // Fall back to first available variant then basePrice
  const firstAvailable = product.variants.find((v) => v.available)
  return firstAvailable?.price ?? product.basePrice
}

/** Resolve the RRP (compareAtPrice) for a single slot. Falls back to the slot price when absent. */
function slotRrp(slot: StackBlueprint['slots'][number], product: CatalogueProduct): number {
  if (slot.selectedVariantId) {
    const variant = product.variants.find((v) => v.id === slot.selectedVariantId)
    if (variant?.compareAtPrice) return variant.compareAtPrice
  }
  // Try first available variant's compareAtPrice, then product-level, then slot price
  const firstAvailable = product.variants.find((v) => v.available)
  return (
    firstAvailable?.compareAtPrice ??
    product.compareAtPrice ??
    slotPrice(slot, product)
  )
}

// ─── Main calculation ─────────────────────────────────────────────────────────

/**
 * Compute the full pricing breakdown for a StackBlueprint.
 * All values are rounded to 2 dp.
 * Returns zeroed-out pricing when the catalogue is empty or products are missing.
 */
export function calculatePricing(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  answers?: QuizAnswers | null,
  config = getPricingConfig(),
  opts: SubscriptionPlanOptions = {},
): StackPricing {
  const round = (n: number) => Math.round(n * 100) / 100
  const bundleLevel = stackLevelOf({ ...blueprint, level: opts.level ?? blueprint.level })

  // ── One-off bundle (tiered discount, margin-floored per line) ──
  const oneOffLines: { price: number; rrp: number; cost: number }[] = []
  for (const slot of blueprint.slots) {
    const product = catalogue.find((p) => p.id === slot.selectedProductId)
    if (!product) continue
    const price = slotPrice(slot, product)
    oneOffLines.push({ price, rrp: slotRrp(slot, product), cost: unitCostOf(product, price, config) })
  }
  const oneOffSubtotal = oneOffLines.reduce((s, l) => s + l.price, 0)
  const rrpTotal = oneOffLines.reduce((s, l) => s + l.rrp, 0)
  const bundleTier = resolveTier(config.bundleTiers, oneOffSubtotal, oneOffLines.length)
  const oneOffTotal = round(
    oneOffLines.reduce((s, l) => s + discountWithFloor(l.price, bundleTier.pct, l.cost, config), 0),
  )
  const oneOffCost = round(oneOffLines.reduce((s, l) => s + l.cost, 0))
  const bundleSaving = round(rrpTotal - oneOffTotal)
  const oneOffMargin = round(oneOffTotal - oneOffCost)

  // ── Monthly subscription (resolved, deduplicated, quantity-aware) ──
  const subPlan = buildSubscriptionPlan(blueprint, catalogue, answers, config, { ...opts, level: bundleLevel })
  const subscriptionDiscountRate = resolveSubscriptionRate(
    subPlan.reduce((s, l) => s + l.monthlyBaseline, 0),
    subPlan.length,
    config,
    bundleLevel,
  )
  let subscriptionTotal = 0
  let subscriptionItemsOneOffTotal = 0
  for (const line of subPlan) {
    subscriptionItemsOneOffTotal += line.monthlyBaseline
    subscriptionTotal += line.monthlyPrice
  }
  subscriptionTotal = round(subscriptionTotal)
  subscriptionItemsOneOffTotal = round(subscriptionItemsOneOffTotal)
  const subscriptionSaving = round(subscriptionItemsOneOffTotal - subscriptionTotal)

  // Minimum commitment: the config floor, raised by any product that requires a
  // longer term (set in the portal).
  const subscriptionMinMonths = subPlan.reduce(
    (min, line) => Math.max(min, line.product.minSubscriptionMonths ?? 0),
    config.minSubscriptionMonths,
  )

  // Intro offer: a discount on the first month; the rest bill at the flat total.
  const introDiscount = subPlan.length > 0 ? config.introOffer.firstMonthDiscount : 0
  const subscriptionFirstMonth = round(subscriptionTotal * (1 - introDiscount))
  const subscriptionMinTermTotal = round(
    subscriptionFirstMonth + Math.max(0, subscriptionMinMonths - 1) * subscriptionTotal,
  )

  // ── Margin / profit guardrails (portal-facing, not shown to customers) ──
  let monthlyCost = 0
  let committedCost = 0
  for (const line of subPlan) {
    monthlyCost += line.monthlyUnits * line.unitCost
    // Deliveries within the minimum term (first delivery at signup / month 0).
    const deliveries = Math.floor((subscriptionMinMonths - 1) / line.shipEveryMonths) + 1
    committedCost += deliveries * line.unitsPerShipment * line.unitCost
  }
  const subscriptionMonthlyMargin = round(subscriptionTotal - monthlyCost)
  const subscriptionCommittedMargin = round(subscriptionMinTermTotal - committedCost)
  const subscriptionProfitableOnCancel = subPlan.length > 0 && subscriptionCommittedMargin >= 0
  const subscriptionMinOrderMet = subPlan.length > 0 && subscriptionTotal >= config.minSubscriptionMonthly

  // Per-slot counts: how many flip to a refill, how many can't subscribe at all.
  let subscriptionSwappedCount = 0
  let excludedFromSubscriptionCount = 0
  for (const slot of blueprint.slots) {
    const product = catalogue.find((p) => p.id === slot.selectedProductId)
    if (!product) continue
    const sub = getSubscriptionProduct(product, catalogue)
    if (!sub.subscriptionEligible) {
      excludedFromSubscriptionCount += 1
    } else if (sub.id !== product.id) {
      subscriptionSwappedCount += 1
    }
  }

  return {
    oneOffTotal,
    oneOffSubtotal: round(oneOffSubtotal),
    rrpTotal: round(rrpTotal),
    bundleSaving,
    bundleSavingPct: rrpTotal > 0 ? Math.round((bundleSaving / rrpTotal) * 100) : 0,
    bundleDiscountPct: Math.round(bundleTier.pct * 1000) / 10,
    bundleTierLabel: bundleTier.tier?.label ?? null,
    oneOffMargin,
    oneOffMarginPct: oneOffTotal > 0 ? Math.round((oneOffMargin / oneOffTotal) * 100) : 0,
    subscriptionTotal,
    subscriptionItemsOneOffTotal,
    subscriptionSaving,
    subscriptionSavingPct:
      subscriptionItemsOneOffTotal > 0
        ? Math.round((subscriptionSaving / subscriptionItemsOneOffTotal) * 100)
        : 0,
    subscriptionItemCount: subPlan.length,
    subscriptionSwappedCount,
    excludedFromSubscriptionCount,
    subscriptionMinMonths,
    subscriptionFirstMonth,
    subscriptionIntroDiscountPct: Math.round(introDiscount * 100),
    subscriptionMinTermTotal,
    subscriptionMonthlyMargin,
    subscriptionCommittedMargin,
    subscriptionProfitableOnCancel,
    subscriptionMinOrderMet,
    bundleLevel,
    subscriptionDiscountPct: Math.round(subscriptionDiscountRate * 1000) / 10,
  }
}

// ─── Usage clamp (keeps the journey's sliders profitable) ────────────────────

/**
 * The usage levels a product may be set to in the customisation journey without
 * dropping the whole plan below the minimum monthly order value. Heavier usage
 * only ever raises revenue, so the cap is the *lighter* end; combined with the
 * per-unit margin floor (`discountWithFloor`) and the `maxDeliveryMonths` cadence
 * cap, this is what stops a member dialling the subscription into the red.
 */
export function allowedUsageLevels(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  answers: QuizAnswers | null | undefined,
  productId: string,
  usageByProductId: Record<string, UsageLevel>,
  config = getPricingConfig(),
): UsageLevel[] {
  const allowed = USAGE_LEVELS.filter((level) => {
    const trial = { ...usageByProductId, [productId]: level }
    const total = calculatePricing(blueprint, catalogue, answers, config, { usageByProductId: trial }).subscriptionTotal
    return total >= config.minSubscriptionMonthly
  })
  // Never strand a product with no options — always allow at least 'standard'.
  return allowed.length > 0 ? allowed : [DEFAULT_USAGE_LEVEL]
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Format a number as £X.XX — always 2 decimal places, UK currency. */
export function formatGBP(amount: number): string {
  return `£${amount.toFixed(2)}`
}

/** Format a saving amount. Returns empty string when saving is ≤ 0. */
export function formatSaving(amount: number, pct: number): string {
  if (amount <= 0) return ''
  return `Save ${formatGBP(amount)} (${pct}% off)`
}
