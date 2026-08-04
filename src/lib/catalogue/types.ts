import type { Goal } from '@/lib/types'

// ─── Stack slot taxonomy ───────────────────────────────────────────────────────
// A slot represents a functional JOB in the user's stack.
// Multiple products can fill the same slot — the engine picks the best one.

export type StackSlot =
  | 'protein'       // whey, plant protein, casein, mass gainer
  | 'performance'   // creatine, beta-alanine
  | 'energy'        // pre-workout (stim or stim-free)
  | 'hydration'     // electrolytes, hydration mixes
  | 'recovery'      // collagen, joint support, BCAAs/EAAs
  | 'health'        // omega-3, vitamin D, multivitamin
  | 'sleep'         // magnesium, sleep blends
  | 'vegan-support' // plant protein, vegan omega-3, algae DHA
  | 'gut'           // probiotics, fibre, greens
  | 'menopause'     // hormonal balance / menopause support blends

export const STACK_SLOTS: StackSlot[] = [
  'protein', 'performance', 'energy', 'hydration',
  'recovery', 'health', 'sleep', 'vegan-support', 'gut', 'menopause',
]

export const SLOT_LABELS: Record<StackSlot, string> = {
  protein: 'Protein',
  performance: 'Performance',
  energy: 'Energy / Pre-Workout',
  hydration: 'Hydration',
  recovery: 'Recovery',
  health: 'Health',
  sleep: 'Sleep',
  'vegan-support': 'Vegan Support',
  gut: 'Gut Health',
  menopause: 'Menopause Support',
}

// ─── Dietary tags ──────────────────────────────────────────────────────────────

export type DietaryTag =
  | 'vegan'
  | 'vegetarian'
  | 'gluten-free'
  | 'dairy-free'
  | 'nut-free'
  | 'halal'
  | 'keto-friendly'

// ─── Swap groups ──────────────────────────────────────────────────────────────
// Products within the same swap group can replace each other in a stack.
// Used for the future product-swapping feature.

export type SwapGroup =
  | 'protein-whey'
  | 'protein-plant'
  | 'protein-mass'
  | 'protein-clear'
  | 'creatine'
  | 'pre-workout-stim'
  | 'pre-workout-stim-free'
  | 'aminos'
  | 'electrolytes'
  | 'omega-3'
  | 'magnesium'
  | 'vitamin-d'
  | 'multivitamin'
  | 'collagen'
  | 'sleep-support'
  | 'fat-burner'
  | 'adaptogen'
  | 'probiotic'
  | 'greens'
  | 'fibre'
  | 'menopause'
  | 'vitamin-c'
  | 'general'

// ─── Variant ──────────────────────────────────────────────────────────────────

export interface CatalogueVariant {
  /** Stable internal ID — Shopify GID once connected, otherwise a slug */
  id: string
  /** Display title shown in flavour/size picker, e.g. "Chocolate Fudge / 500g" */
  title: string
  /** Flavour name, null for unflavoured or non-powder formats */
  flavour: string | null
  /** Size/serving count, e.g. "500g", "60 caps", "30 servings" */
  size: string | null
  price: number
  compareAtPrice: number | null
  available: boolean
  /**
   * Real remaining units when the store tracks inventory (Shopify
   * `quantityAvailable`). Null/undefined when untracked or unknown — the shop then
   * shows no count. Drives the honest "Only N left" low-stock chip; never invented.
   */
  inventory?: number | null
  /** Supplier/Shopify SKU for this variant. Null when not tracked. */
  sku?: string | null
  /**
   * Shopify variant GID — populated when connected to live Storefront API.
   * Null in mock/development mode.
   */
  shopifyVariantId: string | null
  /**
   * Shopify selling-plan GID for this variant's subscription, read from the
   * variant's selling-plan allocations. Null until Recharge/selling plans are
   * configured. Attached to the cart line so Shopify checkout creates the
   * subscription (and Recharge picks it up).
   */
  sellingPlanId?: string | null
}

// ─── Consumption protocol ─────────────────────────────────────────────────────
// How a product is taken — drives how much you need per month on subscription.

export type ConsumptionCadence =
  | 'daily'        // taken ~every day, an anchor (protein, creatine, multivitamin…)
  | 'per-workout'  // tied to training sessions (pre-workout, intra/EAA…)
  | 'as-needed'    // when a trigger hits — just need enough for the month (electrolytes, sleep…)

/**
 * The life signal that drives how often an `as-needed` drink is used, so the
 * Pour Plan can size a right-sized monthly allowance for it (see the Pour Plan
 * spec). Inferred/tagged per product; the quiz asks about the strongest driver
 * (sweat) and infers the rest from goals + lifestyle.
 */
export type AsNeededTrigger = 'sweat' | 'sleep' | 'stress' | 'immunity' | 'digestion'

/**
 * Safety flags the quiz screens for, and that a product can be contraindicated
 * against. A product carrying a flag in `contraindications` is HARD-REMOVED from
 * the recommendation for anyone who ticked that flag (see scoreProduct).
 *   • pregnancy  — pregnant or breastfeeding (avoid certain botanicals/stimulants)
 *   • medication — on prescription medication (avoid interaction-prone blends)
 */
export type SafetyFlag = 'pregnancy' | 'medication'

/** When a drink is best taken — drives the Pour Plan protocol copy (guidance,
 *  not a rigid schedule). */
export type PourAnchor =
  | 'morning' | 'midday' | 'evening'        // daily anchors
  | 'pre-workout' | 'post-workout'          // per-workout
  | 'hot-days' | 'wind-down' | 'run-down'   // as-needed moments

export interface ProductConsumption {
  cadence: ConsumptionCadence
  /** Number of servings in one (default) container. */
  servingsPerUnit: number
  /**
   * For `daily` cadence: how many days a week it's taken (7 = every day, 3–4 =
   * "most days" like greens). Defaults to 7 when omitted.
   */
  daysPerWeek?: number
  /** For `as-needed` cadence: which life signal sets its monthly allowance. */
  asNeededTrigger?: AsNeededTrigger
  /** When to drink it — feeds the Pour Plan protocol note. */
  anchor?: PourAnchor
}

// ─── Effect onset ──────────────────────────────────────────────────────────────
// WHEN a benefit becomes noticeable. Orthogonal to recommendationBasis (which
// says WHETHER feelings should drive a change): onset says when a feeling is even
// valid to judge. Drives the hub's check-in expectation-setting so a slow-build
// product (vitamin C, omega-3) is never flagged "not working" before its time,
// and an immediate product (pre-workout) is reviewed straight away.

export type EffectOnset =
  | 'immediate'  // felt the same session — pre-workout, electrolytes
  | 'short'      // ~1–3 weeks — sleep, energy, recovery, gut
  | 'long'       // ~6–12 weeks, subtle/preventative — omega-3, vitamin D/C, collagen, multivitamin
  | 'none'       // never consciously felt — protein, creatine

// ─── Social proof ───────────────────────────────────────────────────────────────
// Aggregate customer rating shown on shop cards and the product sheet. Only ever
// derived from real review data — the live Shopify mapper reads it from a review
// app's rating metafields, and it stays absent when a product has no reviews (the
// UI then shows no stars). The mock catalogue attaches representative demo ratings
// so the feature is visible in local/dev.

export interface ProductRating {
  /** Mean star rating, 0–5. */
  average: number
  /** Number of reviews the average is based on. Never shown when 0. */
  count: number
}

// ─── Product ──────────────────────────────────────────────────────────────────

export interface CatalogueProduct {
  // ── Identity ────────────────────────────────────────────────────────────────
  /** Unique internal slug — matches Shopify handle when live */
  id: string
  title: string
  handle: string
  /** Short, one-sentence description shown on cards */
  description: string
  imageUrl: string | null

  // ── Classification ───────────────────────────────────────────────────────────
  /** Primary display category (Protein, Pre-Workout, Health…) */
  category: string
  /**
   * Which stack slots this product is eligible for.
   * A product can fill multiple slots (e.g. BCAAs fit both 'recovery' and 'hydration').
   */
  stackSlots: StackSlot[]
  goals: Goal[]
  dietaryTags: DietaryTag[]
  /** Physical format of the product, e.g. ['powder', 'capsule', 'liquid'] */
  formats: string[]

  // ── Pricing & variants ───────────────────────────────────────────────────────
  /** All available flavour/size combinations */
  variants: CatalogueVariant[]
  /**
   * The flavour picked by default on the Pour Plan (the "crowd favourite").
   * Portal-settable; when unset the Pour Plan falls back to the first available
   * variant (and unflavoured for functional drinks). The customer changes flavour
   * on the Pour Plan — it is never asked in the quiz.
   */
  defaultVariantId?: string | null
  /** Price of the default (first available) variant */
  basePrice: number
  compareAtPrice: number | null
  /** Cost of goods for one (default) unit. Used for margin/profit guardrails.
   *  When omitted, estimated as basePrice × PRICING_CONFIG.defaultCostRatio. */
  cost?: number
  subscriptionEligible: boolean
  /**
   * Number of servings in one unit/container at the recommended dose.
   * Used to size the monthly subscription — a product with far more servings
   * than a month's worth ships less often rather than subscribing per month.
   * See `qualifiesForSubscription` in stack-blueprint/pricing.
   */
  servings: number
  /**
   * The correlating product to bill/ship monthly when this product is put on
   * subscription. Used so the monthly plan is always available even for items
   * that last longer than a month (e.g. a 90-day creatine tub maps to a
   * monthly-sized refill). `null`/omitted means the product subscribes as itself.
   * Settable in the portal; resolved via `getSubscriptionProduct`.
   */
  subscriptionProductId?: string | null
  /**
   * True for products that ONLY exist as a monthly subscription equivalent of
   * another product. They are hidden from quiz recommendations, boosters and
   * swap lists — they only ever appear as a subscription resolution target.
   */
  isSubscriptionOnly?: boolean
  /**
   * How the product is consumed — drives the monthly subscription quantity.
   * When omitted, it's derived from the stack slot (energy/hydration =
   * per-workout, everything else = daily) and servings.
   */
  consumption?: ProductConsumption
  /** Minimum subscription commitment in months for this product (portal-set). */
  minSubscriptionMonths?: number
  /**
   * Whether changes to this product should be driven by how the customer FEELS
   * (`subjective` — sleep, energy, stress) or by an objective need they won't
   * necessarily feel (`objective` — protein, creatine, vitamins). When omitted
   * it's derived from the stack slot. Drives the hub's keep-vs-change advice.
   */
  recommendationBasis?: 'objective' | 'subjective'
  /**
   * When this product's benefit becomes noticeable. When omitted it's derived
   * from the stack slot / recommendationBasis (see `effectOnsetForProduct` in
   * src/lib/feedback.ts). Read from the `chrgd.effect_onset` metafield live.
   */
  effectOnset?: EffectOnset

  // ── Stack logic ───────────────────────────────────────────────────────────────
  /**
   * Products in the same swap group are interchangeable in the stack.
   * Used by the future swap-product feature.
   */
  swapGroup: SwapGroup
  /**
   * How strongly the engine should prefer this product (1 = lowest, 10 = highest).
   * Influences scoring within a swap group.
   */
  recommendationPriority: number
  /**
   * Business margin priority (1–10). Can be used to prefer higher-margin
   * products when recommendation scores are equal.
   */
  marginPriority: number
  /**
   * Position on the founders' Top 25 — the hand-picked roster the quiz should
   * reach for first. 1 is the top pick; absent means "not on the roster", which
   * is the normal case and carries no penalty.
   *
   * Set by the catalogue resolver from the roster the hub manages
   * (`lib/portal/top-products.ts`), never stored on the product itself, so
   * reordering the roster reprioritises the quiz without editing 25 products.
   */
  topRank?: number | null
  /** Can this product appear in the recommended core stack? */
  isCoreEligible: boolean
  /** Can this product appear as an upgrade/booster suggestion? */
  isBoosterEligible: boolean
  /** Contains stimulants (caffeine, synephrine, etc.) */
  hasStimulants: boolean
  /**
   * Safety flags this product is contraindicated against. Anyone who ticked a
   * matching flag on the safety screen has it removed from their recommendation
   * (hard gate in scoreProduct). Absent/empty = no contraindications.
   */
  contraindications?: SafetyFlag[]
  /**
   * Key active ingredients per serving — the dose/ingredient data the supplier
   * feed can't provide, maintained for the curated quiz-core. Reserved for the
   * active-ingredient dedup + total dose caps (Phase 5); optional until then.
   */
  actives?: Array<{ name: string; mg?: number }>


  // ── UX copy ───────────────────────────────────────────────────────────────────
  /** Short legal/claim-safe reason shown on the product card */
  shortReason: string
  /** Warnings shown in fine print, e.g. "Contains caffeine", "Not for under 18s" */
  warnings: string[]
  /**
   * Aggregate customer rating for social proof. Optional: only ever set from real
   * review data (live: review-app metafields; mock: representative demo ratings).
   * Absent when a product has no reviews — the shop then renders no stars for it.
   */
  rating?: ProductRating
  /**
   * True when a sold-out product is genuinely being restocked, so the shop shows
   * "Back in stock soon" instead of a dead "Sold out". Set from real signals only
   * (live: a `chrgd.restocking` metafield, or a continue-selling variant). Absent
   * means unknown — the shop keeps the plain "Sold out".
   */
  restockingSoon?: boolean

  // ── Shopify connection ────────────────────────────────────────────────────────
  /**
   * Shopify product GID — null until connected to live Storefront API.
   * When set, the variants[].shopifyVariantId fields are used for cart line items.
   */
  shopifyProductId: string | null
}

// ─── Catalogue query options ──────────────────────────────────────────────────

export interface CatalogueFilterOptions {
  slots?: StackSlot[]
  goals?: Goal[]
  dietary?: DietaryTag[]
  swapGroup?: SwapGroup
  coreOnly?: boolean
  boostersOnly?: boolean
  stimFree?: boolean
}
