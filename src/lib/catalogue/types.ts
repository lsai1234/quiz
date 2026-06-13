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
   * Shopify variant GID — populated when connected to live Storefront API.
   * Null in mock/development mode.
   */
  shopifyVariantId: string | null
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
  /** Price of the default (first available) variant */
  basePrice: number
  compareAtPrice: number | null
  subscriptionEligible: boolean

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
  /** Can this product appear in the recommended core stack? */
  isCoreEligible: boolean
  /** Can this product appear as an upgrade/booster suggestion? */
  isBoosterEligible: boolean
  /** Contains stimulants (caffeine, synephrine, etc.) */
  hasStimulants: boolean

  // ── UX copy ───────────────────────────────────────────────────────────────────
  /** Short legal/claim-safe reason shown on the product card */
  shortReason: string
  /** Warnings shown in fine print, e.g. "Contains caffeine", "Not for under 18s" */
  warnings: string[]

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
