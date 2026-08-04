/**
 * Map a supplier product onto our `CatalogueProduct`.
 *
 * PowerBody only sends commerce basics (name, brand, category, price, stock…).
 * This does the straightforward field mapping plus a LIGHT, deterministic
 * classification (category/keyword → stack slot, swap group, goals) so an added
 * product is immediately usable in the shop and quiz. The richer CHRGD-only
 * attributes — claim-safe copy, dietary nuance, effect onset, etc. — are filled
 * by the AI autopopulate step in Phase 1b, which layers on top of this.
 */
import type { AsNeededTrigger, CatalogueProduct, CatalogueVariant, ConsumptionCadence, DietaryTag, PourAnchor, StackSlot, SwapGroup } from '@/lib/catalogue/types'
import type { Goal } from '@/lib/types'
import type { SupplierProduct } from './types'

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

interface Classification {
  stackSlots: StackSlot[]
  swapGroup: SwapGroup
  goals: Goal[]
  hasStimulants: boolean
  cadence: ConsumptionCadence
  dietaryTags: DietaryTag[]
  isReadyToDrink: boolean
}

interface Rule {
  test: (t: string) => boolean
  result: Omit<Classification, 'dietaryTags' | 'isReadyToDrink'>
}

// Ordered — first match wins. Deliberately conservative; Phase 1b refines.
const RULES: Rule[] = [
  { test: (t) => /clear whey|clear protein/.test(t), result: { stackSlots: ['protein'], swapGroup: 'protein-clear', goals: ['muscle', 'recovery'], hasStimulants: false, cadence: 'daily' } },
  { test: (t) => /(vegan|plant).*protein|protein.*(vegan|plant)/.test(t), result: { stackSlots: ['protein', 'vegan-support'], swapGroup: 'protein-plant', goals: ['muscle', 'recovery'], hasStimulants: false, cadence: 'daily' } },
  { test: (t) => /diet whey|diet protein/.test(t), result: { stackSlots: ['protein'], swapGroup: 'protein-whey', goals: ['muscle', 'cutting'], hasStimulants: false, cadence: 'daily' } },
  { test: (t) => /isolate|whey|protein shake|casein|protein/.test(t), result: { stackSlots: ['protein'], swapGroup: 'protein-whey', goals: ['muscle', 'recovery'], hasStimulants: false, cadence: 'daily' } },
  { test: (t) => /creatine/.test(t), result: { stackSlots: ['performance'], swapGroup: 'creatine', goals: ['performance', 'muscle'], hasStimulants: false, cadence: 'daily' } },
  { test: (t) => /beta-?alanine/.test(t), result: { stackSlots: ['performance'], swapGroup: 'aminos', goals: ['performance'], hasStimulants: false, cadence: 'per-workout' } },
  { test: (t) => /(stim-?free|caffeine-?free|pump).*(pre-?workout)|pump pre/.test(t), result: { stackSlots: ['energy'], swapGroup: 'pre-workout-stim-free', goals: ['energy', 'performance'], hasStimulants: false, cadence: 'per-workout' } },
  { test: (t) => /pre-?workout/.test(t), result: { stackSlots: ['energy'], swapGroup: 'pre-workout-stim', goals: ['energy', 'performance'], hasStimulants: true, cadence: 'per-workout' } },
  { test: (t) => /energy water|energy drink/.test(t), result: { stackSlots: ['energy'], swapGroup: 'pre-workout-stim', goals: ['energy', 'hydration'], hasStimulants: true, cadence: 'per-workout' } },
  { test: (t) => /eaa|bcaa|amino/.test(t), result: { stackSlots: ['recovery', 'hydration'], swapGroup: 'aminos', goals: ['recovery', 'hydration'], hasStimulants: false, cadence: 'per-workout' } },
  { test: (t) => /electrolyte|hydro|hydrate/.test(t), result: { stackSlots: ['hydration'], swapGroup: 'electrolytes', goals: ['hydration'], hasStimulants: false, cadence: 'per-workout' } },
  { test: (t) => /collagen/.test(t), result: { stackSlots: ['recovery'], swapGroup: 'collagen', goals: ['recovery', 'skin-hair-nails'], hasStimulants: false, cadence: 'daily' } },
  { test: (t) => /omega|fish oil/.test(t), result: { stackSlots: ['health'], swapGroup: 'omega-3', goals: ['health'], hasStimulants: false, cadence: 'daily' } },
  { test: (t) => /magnesium/.test(t), result: { stackSlots: ['sleep'], swapGroup: 'magnesium', goals: ['sleep-better', 'less-stress'], hasStimulants: false, cadence: 'daily' } },
  { test: (t) => /vitamin d/.test(t), result: { stackSlots: ['health'], swapGroup: 'vitamin-d', goals: ['health', 'immune'], hasStimulants: false, cadence: 'daily' } },
  { test: (t) => /vitamin c/.test(t), result: { stackSlots: ['health'], swapGroup: 'vitamin-c', goals: ['immune', 'health'], hasStimulants: false, cadence: 'daily' } },
  { test: (t) => /multivitamin|multi-vitamin/.test(t), result: { stackSlots: ['health'], swapGroup: 'multivitamin', goals: ['health'], hasStimulants: false, cadence: 'daily' } },
  { test: (t) => /probiotic|bio-?culture/.test(t), result: { stackSlots: ['gut'], swapGroup: 'probiotic', goals: ['gut-health'], hasStimulants: false, cadence: 'daily' } },
  { test: (t) => /greens|spirulina|chlorella/.test(t), result: { stackSlots: ['gut'], swapGroup: 'greens', goals: ['gut-health', 'health'], hasStimulants: false, cadence: 'daily' } },
  { test: (t) => /ashwagandha|adaptogen/.test(t), result: { stackSlots: ['health'], swapGroup: 'adaptogen', goals: ['less-stress', 'focus'], hasStimulants: false, cadence: 'daily' } },
]

const DEFAULT_CLASSIFICATION: Omit<Classification, 'dietaryTags' | 'isReadyToDrink'> = {
  stackSlots: ['health'],
  swapGroup: 'general',
  goals: ['health'],
  hasStimulants: false,
  cadence: 'daily',
}

function formatsFor(text: string, isRtd: boolean): string[] {
  if (isRtd) return ['liquid']
  if (/caps|capsule|softgel|tablet|\btab\b|tablets/.test(text)) return ['capsule']
  return ['powder']
}

// Rhythm tags seeded from the swap group (Pour Plan — cadence/anchor/trigger).
const ANCHOR_BY_SWAP: Partial<Record<SwapGroup, PourAnchor>> = {
  multivitamin: 'morning', 'vitamin-d': 'morning', 'vitamin-c': 'morning', 'omega-3': 'morning',
  greens: 'midday', probiotic: 'morning', adaptogen: 'morning', fibre: 'morning',
  collagen: 'evening', magnesium: 'wind-down', 'sleep-support': 'wind-down',
  'pre-workout-stim': 'pre-workout', 'pre-workout-stim-free': 'pre-workout', aminos: 'pre-workout',
  electrolytes: 'hot-days', creatine: 'morning',
  'protein-whey': 'post-workout', 'protein-plant': 'post-workout', 'protein-clear': 'post-workout', 'protein-mass': 'post-workout',
}
const AS_NEEDED_BY_SWAP: Partial<Record<SwapGroup, AsNeededTrigger>> = {
  electrolytes: 'sweat', 'sleep-support': 'sleep', magnesium: 'sleep', 'vitamin-c': 'immunity',
}
const MOST_DAYS_SWAP = new Set<SwapGroup>(['greens', 'probiotic'])

/** Seed the Pour Plan rhythm from the swap group: as-needed triggers, "most
 *  days" cadence, and the anchor moment. */
export function rhythmForSwap(
  swap: SwapGroup,
  baseCadence: ConsumptionCadence,
): { cadence: ConsumptionCadence; daysPerWeek?: number; asNeededTrigger?: AsNeededTrigger; anchor?: PourAnchor } {
  const anchor = ANCHOR_BY_SWAP[swap]
  const asNeededTrigger = AS_NEEDED_BY_SWAP[swap]
  if (asNeededTrigger) return { cadence: 'as-needed', asNeededTrigger, anchor }
  const daysPerWeek = MOST_DAYS_SWAP.has(swap) ? 4 : undefined
  return { cadence: baseCadence, daysPerWeek, anchor }
}

/** Best-effort classification for an added product. Phase 1b's AI supersedes it. */
export function classifySupplierProduct(sp: SupplierProduct): Classification {
  // Classify from the authoritative category + name only — the marketing
  // description name-drops ingredients ("…with beta-alanine") that would
  // otherwise mis-route a product (a pre-workout is not a beta-alanine).
  const text = `${sp.category} ${sp.name}`.toLowerCase()
  const isReadyToDrink = /ready to drink|\brtd\b|shake|energy water|\bcan\b/.test(text) || /ready to drink/i.test(sp.category)
  const base = RULES.find((r) => r.test(text))?.result ?? DEFAULT_CLASSIFICATION
  const dietaryTags: DietaryTag[] = /vegan|plant/.test(text) ? ['vegan', 'vegetarian'] : []
  return { ...base, dietaryTags, isReadyToDrink }
}

/**
 * Map a `SupplierProduct` to a `CatalogueProduct` ready to add to the catalogue.
 * `basePrice` is the supplier RRP (our sell price); `cost` is the wholesale price
 * (drives margin guardrails). Every variant carries the supplier SKU so stock can
 * be re-synced against the supplier later (daily check / stock-alerts).
 */
export function supplierProductToCatalogue(sp: SupplierProduct): CatalogueProduct {
  const id = slugify(sp.name)
  const c = classifySupplierProduct(sp)
  const formats = formatsFor(`${sp.category} ${sp.name}`.toLowerCase(), c.isReadyToDrink)
  const available = sp.inStock

  const variants: CatalogueVariant[] =
    sp.flavours.length > 0
      ? sp.flavours.map((flavour) => ({
          id: `${id}-${slugify(flavour)}`,
          title: flavour,
          flavour,
          size: null,
          price: sp.rrp,
          compareAtPrice: null,
          available,
          inventory: sp.stock,
          // Keep the supplier SKU on every variant so a product resolves back to
          // one supplier item for stock re-sync.
          sku: sp.sku,
          shopifyVariantId: null,
        }))
      : [{
          id,
          title: sp.name,
          flavour: null,
          size: null,
          price: sp.rrp,
          compareAtPrice: null,
          available,
          inventory: sp.stock,
          sku: sp.sku,
          shopifyVariantId: null,
        }]

  const servingsPerUnit = sp.servings ?? 30
  const rhythm = rhythmForSwap(c.swapGroup, c.cadence)

  return {
    id,
    title: sp.name,
    handle: id,
    description: sp.description,
    imageUrl: sp.imageUrl,
    category: sp.category,
    stackSlots: c.stackSlots,
    goals: c.goals,
    dietaryTags: c.dietaryTags,
    formats,
    variants,
    defaultVariantId: variants.find((v) => v.available)?.id ?? variants[0]?.id ?? null,
    basePrice: sp.rrp,
    compareAtPrice: null,
    cost: sp.wholesalePrice,
    // Fulfilment economics. PowerBody charge delivery by weight band and their
    // `createOrder` call needs a weight, so an added product without one can be
    // neither priced nor shipped accurately — readiness flags it.
    weightGrams: sp.weightGrams ?? null,
    vatRate: sp.vatRate ?? null,
    supplierRrp: sp.rrp,
    subscriptionEligible: true,
    subscriptionProductId: null,
    isSubscriptionOnly: false,
    servings: servingsPerUnit,
    consumption: {
      cadence: rhythm.cadence,
      servingsPerUnit,
      ...(rhythm.daysPerWeek ? { daysPerWeek: rhythm.daysPerWeek } : {}),
      ...(rhythm.asNeededTrigger ? { asNeededTrigger: rhythm.asNeededTrigger } : {}),
      ...(rhythm.anchor ? { anchor: rhythm.anchor } : {}),
    },
    swapGroup: c.swapGroup,
    recommendationPriority: 5,
    marginPriority: 5,
    // Classified products are eligible for the core stack; unclassified defaults
    // (slot 'health') still surface in the shop.
    isCoreEligible: c.stackSlots.length > 0,
    isBoosterEligible: false,
    hasStimulants: c.hasStimulants,
    shortReason: '',
    warnings: c.hasStimulants ? ['Contains caffeine'] : [],
    shopifyProductId: null,
  }
}
