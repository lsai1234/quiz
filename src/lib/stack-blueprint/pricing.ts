import type { StackBlueprint } from './types'
import type { CatalogueProduct, ConsumptionCadence } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'

const DAYS_PER_MONTH = 30

// ─── Config ──────────────────────────────────────────────────────────────────
// All discount rates live here so they can be changed without touching UI code.

export const PRICING_CONFIG = {
  /** One-off bundle discount applied to the whole stack subtotal (0–1). The
   *  default is 0 because the one-off saving currently comes from per-product
   *  RRP markdowns; the portal can switch on a flat bundle % here later. */
  bundleDiscount: 0,
  /** Monthly subscription discount applied to subscription products (0–1). */
  subscriptionDiscount: 0.15,
  /** Label shown on the subscription saving line. */
  subscriptionPlanLabel: 'CHRGD Monthly Stack Plan',
  /**
   * Preferred approach: a product that lasts longer than a month stays the SAME
   * product and simply ships less often (every N months). A product only flips
   * to a different monthly SKU when `subscriptionProductId` is explicitly set
   * (in the portal). This threshold flags, for the portal, products long enough
   * that a smaller monthly refill *could* be worth offering.
   */
  maxSubscriptionDaysOfSupply: 35,
  /** Never schedule a delivery more than this many months apart. */
  maxDeliveryMonths: 6,
  /**
   * Bill ONE flat amount every month (the long-run average) instead of lumpy
   * per-delivery charges; items still ship on their own cadence. The minimum
   * term below protects against early-cancel, since the flat amount is smoothed.
   */
  subscriptionFlatMonthly: true,
  /** Minimum subscription commitment in months (per-product can override up). */
  minSubscriptionMonths: 4,
  /** First-cycle intro offer. */
  introOffer: {
    /** Discount on the first month, 0–1 (e.g. 0.5 = 50% off). 0 disables it. */
    firstMonthDiscount: 0.5,
  },
}

// ─── Subscription qualification & resolution ─────────────────────────────────

/**
 * Whether a product is itself a sensible monthly subscription item: flagged
 * subscriptionEligible AND lasting roughly a month. Products that fail this
 * should be mapped to a monthly refill via `subscriptionProductId`.
 */
export function qualifiesForSubscription(
  product: Pick<CatalogueProduct, 'subscriptionEligible' | 'daysOfSupply'>,
  config = PRICING_CONFIG,
): boolean {
  return (
    product.subscriptionEligible &&
    product.daysOfSupply <= config.maxSubscriptionDaysOfSupply
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
 * and daysOfSupply (which doubles as doses-per-container at one dose per use).
 */
export function resolveConsumption(product: CatalogueProduct): { cadence: ConsumptionCadence; dosesPerUnit: number } {
  if (product.consumption) return product.consumption
  const perWorkout = product.stackSlots.some((s) => s === 'energy' || s === 'hydration')
  return {
    cadence: perWorkout ? 'per-workout' : 'daily',
    dosesPerUnit: product.daysOfSupply > 0 ? product.daysOfSupply : DAYS_PER_MONTH,
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
  /** Doses in one container. */
  dosesPerUnit: number
  /** Units sent each shipment. */
  unitsPerShipment: number
  /** Ship cadence in months (e.g. 2 = one unit every two months). */
  shipEveryMonths: number
  /** Average units consumed per month (unitsPerShipment / shipEveryMonths). */
  monthlyUnits: number
  /** Undiscounted price of one unit. */
  unitPrice: number
  /** Discounted amount billed each delivery (unitsPerShipment × unitPrice × discount). */
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
export function buildSubscriptionPlan(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[],
  answers?: QuizAnswers | null,
  config = PRICING_CONFIG,
): SubscriptionLine[] {
  const round = (n: number) => Math.round(n * 100) / 100
  const lines = new Map<string, SubscriptionLine>()
  const woPerMonth = workoutsPerMonth(answers)

  for (const slot of blueprint.slots) {
    const slotProduct = catalogue.find((p) => p.id === slot.selectedProductId)
    if (!slotProduct) continue

    const sub = getSubscriptionProduct(slotProduct, catalogue)
    if (!sub.subscriptionEligible) continue

    const existing = lines.get(sub.id)
    if (existing) {
      // Two slots resolve to the same subscription product — bill it once.
      existing.coversSlotIds.push(slot.slotId)
      continue
    }

    // Self-subscription respects the chosen variant; a mapped refill uses its
    // own default available variant.
    const unitPrice =
      sub.id === slotProduct.id
        ? slotPrice(slot, sub)
        : sub.variants.find((v) => v.available)?.price ?? sub.basePrice

    // How much is needed per month, from the consumption protocol + answers.
    const { cadence, dosesPerUnit } = resolveConsumption(sub)
    const occasionsPerMonth = cadence === 'daily' ? DAYS_PER_MONTH : Math.max(woPerMonth, 1)
    const monthsOneUnitLasts = dosesPerUnit / occasionsPerMonth

    let unitsPerShipment: number
    let shipEveryMonths: number
    if (monthsOneUnitLasts >= 1) {
      // One unit lasts a month or more → ship one unit, spaced out (capped).
      unitsPerShipment = 1
      shipEveryMonths = Math.min(config.maxDeliveryMonths, Math.max(1, Math.round(monthsOneUnitLasts)))
    } else {
      // Need more than one unit a month → ship several each month.
      unitsPerShipment = Math.max(1, Math.round(occasionsPerMonth / dosesPerUnit))
      shipEveryMonths = 1
    }
    // "Pay for what ships": monthly cost is the per-delivery cost amortised over
    // the delivery interval — so the headline £/mo and the schedule always agree.
    const monthlyUnits = unitsPerShipment / shipEveryMonths
    const discounted = (n: number) => n * (1 - config.subscriptionDiscount)

    lines.set(sub.id, {
      product: sub,
      coversSlotIds: [slot.slotId],
      cadence,
      occasionsPerMonth,
      dosesPerUnit,
      unitsPerShipment,
      shipEveryMonths,
      monthlyUnits,
      unitPrice: round(unitPrice),
      pricePerDelivery: round(discounted(unitsPerShipment * unitPrice)),
      monthlyBaseline: round(monthlyUnits * unitPrice),
      monthlyPrice: round(discounted(monthlyUnits * unitPrice)),
    })
  }

  return [...lines.values()]
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StackPricing {
  /** Sum of selected variant prices (or basePrice fallback). */
  oneOffTotal: number
  /** Sum of compareAtPrice (RRP) across all slots. Equals oneOffTotal when no compare prices exist. */
  rrpTotal: number
  /** rrpTotal − oneOffTotal. 0 when no compare prices exist. */
  bundleSaving: number
  /** bundleSaving / rrpTotal expressed as 0–100. 0 when no compare prices exist. */
  bundleSavingPct: number
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
  config = PRICING_CONFIG,
): StackPricing {
  const round = (n: number) => Math.round(n * 100) / 100

  // ── One-off bundle ──
  let oneOffSubtotal = 0
  let rrpTotal = 0
  for (const slot of blueprint.slots) {
    const product = catalogue.find((p) => p.id === slot.selectedProductId)
    if (!product) continue
    oneOffSubtotal += slotPrice(slot, product)
    rrpTotal += slotRrp(slot, product)
  }
  const oneOffTotal = round(oneOffSubtotal * (1 - config.bundleDiscount))
  const bundleSaving = round(rrpTotal - oneOffTotal)

  // ── Monthly subscription (resolved, deduplicated, quantity-aware) ──
  const subPlan = buildSubscriptionPlan(blueprint, catalogue, answers, config)
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
    rrpTotal: round(rrpTotal),
    bundleSaving,
    bundleSavingPct: rrpTotal > 0 ? Math.round((bundleSaving / rrpTotal) * 100) : 0,
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
  }
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
