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
  | 'joint-support'
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
  /** Stable internal ID — a slug derived from the product name. */
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
   * Real remaining units when the supplier reports them (
   * `quantityAvailable`). Null/undefined when untracked or unknown — the shop then
   * shows no count. Drives the honest "Only N left" low-stock chip; never invented.
   */
  inventory?: number | null
  /** Supplier SKU for this variant — how it maps back to PowerBody. Null when
   *  not tracked (a variant we made up rather than one they carry). */
  sku?: string | null
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
 *   • shellfish  — shellfish allergy. Added because the roster genuinely
 *     contains products that carry one (krill oil, glucosamine from shellfish),
 *     and a contraindication the quiz cannot ask about is one it cannot act on.
 *     A flag with no question behind it is decoration, so the safety screen asks.
 */
export type SafetyFlag = 'pregnancy' | 'medication' | 'shellfish'

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
// derived from real review data — read from a review
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
  /** Unique internal slug, used in URLs. */
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

  // ── Fulfilment economics ──────────────────────────────────────────────────────
  /**
   * Shipped weight of one unit in grams.
   *
   * Not cosmetic: PowerBody price dropship delivery by WEIGHT band, and their
   * `createOrder` call takes a `weight` parameter, so without this we can
   * neither predict what an order costs us nor place it accurately. Absent means
   * the margin model falls back to `delivery.defaultProductGrams` and says it
   * guessed. Readiness flags it.
   */
  weightGrams?: number | null
  /**
   * VAT rate for this product (0–1). Absent = the standard rate.
   *
   * Nearly all sports nutrition is standard-rated, but some products sold as
   * food (certain bars, flapjacks, drinks) are zero-rated, and getting that
   * wrong is a 20% error on the product's whole margin. PowerBody return a
   * `vat_rate` per product, so this is populated from the feed where available.
   */
  vatRate?: number | null
  /**
   * The supplier's recommended retail price (£ inc VAT).
   *
   * PowerBody's feed carries this as `detail_price` and they ask that the
   * manufacturer's RRP be adhered to. Kept so the hub can show where our price
   * sits against the market rather than only against our own costs.
   */
  supplierRrp?: number | null
  /**
   * PowerBody's own `product_id` for this product, once anything has resolved it.
   *
   * Worth storing because resolving it is the expensive part. A SKU above their
   * feed's 3,000-product ceiling cannot be looked up by paging at all, and the
   * binary search that finds it costs tens of throttled requests. The id itself
   * never changes, so paying for it twice is pure waste — and every later call
   * (picture, description, live cost) is one request with no paging and no
   * deadline once it is known.
   *
   * A shortcut, never a source of truth: price, stock and name are still fetched
   * live, and a stale id can only ever cost a wasted call, never a wrong price.
   */
  supplierProductId?: string | null
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

  /**
   * Set on products imported from the supplier, until a founder has checked
   * them. See `ProductReview` — while this says `pending` the product is held
   * out of the shop and the quiz entirely.
   */
  review?: ProductReview

}

// ─── Import review ────────────────────────────────────────────────────────────

/**
 * Where a field's value came from.
 *
 * Worth recording because an import is three different kinds of information
 * wearing the same clothes: what the supplier actually sent, what our own rules
 * computed, and what a language model wrote. Reviewing them as if they were
 * equally trustworthy is how an invented claim reaches a customer, so the review
 * screen labels every field with this.
 */
export type FieldSource =
  /** Straight from the PowerBody feed. */
  | 'supplier'
  /** Computed by one of our own rules (e.g. list price = cost × 2). */
  | 'rule'
  /** Written by the AI classifier/copywriter. Needs a human before it goes live. */
  | 'ai'
  /** Our deterministic keyword classifier — no model involved. */
  | 'heuristic'
  /** Edited by a founder. */
  | 'founder'

export interface ProductReview {
  /** `pending` products are invisible to the shop and quiz until approved. */
  status: 'pending' | 'approved'
  /** Per-field provenance, for the review screen. */
  sources: Partial<Record<keyof CatalogueProduct, FieldSource>>
  /** Fields a founder has explicitly confirmed or corrected. */
  confirmed: string[]
  importedAt: string
  approvedAt?: string
  approvedBy?: string
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
