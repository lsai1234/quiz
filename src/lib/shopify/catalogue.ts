import type { ShopifyProduct } from './types'
import type { Product, ProductVariant, Goal, StackLevel } from '@/lib/types'
import type { CatalogueProduct, CatalogueVariant, StackSlot, DietaryTag, SwapGroup, ProductConsumption } from '@/lib/catalogue/types'
import { getProducts } from './operations'
import { getDataSource } from '@/lib/data-source'
import { MOCK_PRODUCTS } from '@/lib/mock-products'

// ─── Tag parsing helpers ───────────────────────────────────────────────────────

const VALID_GOALS: Goal[] = [
  'muscle', 'energy', 'performance', 'hydration', 'recovery', 'health', 'cutting', 'bulking',
  'sleep-better', 'less-stress', 'focus', 'immune', 'skin-hair-nails', 'menopause', 'gut-health',
]
const VALID_LEVELS: StackLevel[] = ['essentials', 'performance', 'complete']

function parseGoalTags(tags: string[]): Goal[] {
  return tags
    .filter((t) => t.startsWith('goal:'))
    .map((t) => t.replace('goal:', '') as Goal)
    .filter((g) => VALID_GOALS.includes(g))
}

function parseStackLevels(tags: string[]): StackLevel[] {
  const levels = tags
    .filter((t) => t.startsWith('stack:'))
    .map((t) => t.replace('stack:', '') as StackLevel)
    .filter((l) => VALID_LEVELS.includes(l))
  return levels.length > 0 ? levels : ['essentials', 'performance', 'complete']
}

const PRODUCT_TYPE_TAG_MAP: Record<string, string> = {
  'product-type:protein': 'Protein',
  'product-type:pre-workout': 'Pre-Workout',
  'product-type:performance': 'Performance',
  'product-type:amino-acids': 'Amino Acids',
  'product-type:hydration': 'Hydration',
  'product-type:health': 'Health',
  'product-type:recovery': 'Recovery',
  'product-type:body-composition': 'Body Composition',
}

function parseCategoryFromTags(tags: string[]): string | null {
  for (const tag of tags) {
    const mapped = PRODUCT_TYPE_TAG_MAP[tag]
    if (mapped) return mapped
  }
  return null
}

function metaValue(metafields: ShopifyProduct['metafields'], key: string): string | null {
  return metafields.find((m) => m?.key === key)?.value ?? null
}

// Shopify descriptions are full marketing copy — cut to the first sentence,
// hard-capped so cards stay scannable
function shortDescription(text: string, maxLen = 140): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLen) return clean
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0]
  if (firstSentence.length <= maxLen) return firstSentence
  return clean.slice(0, maxLen - 1).replace(/\s+\S*$/, '') + '…'
}

// ─── Main mapping function ────────────────────────────────────────────────────

export function mapShopifyProduct(p: ShopifyProduct): Product {
  const variants: ProductVariant[] = p.variants.edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    price: parseFloat(node.priceV2.amount),
    compareAtPrice: node.compareAtPriceV2 ? parseFloat(node.compareAtPriceV2.amount) : null,
    availableForSale: node.availableForSale,
    image: node.image?.url ?? null,
  }))

  const defaultVariant = variants[0]
  const firstImage = p.images.edges[0]?.node.url ?? null

  const goalTags = parseGoalTags(p.tags)
  const stackLevels = parseStackLevels(p.tags)

  // Use our product-type:* tags for category (seeded via seed-shopify-tags.mjs)
  // Fall back to Shopify productType or title-derived value
  const category = parseCategoryFromTags(p.tags) ?? deriveDefaultCategory(p) ?? (p.productType || 'Supplement')

  const rawPriority = metaValue(p.metafields, 'stack_priority')
  const stackPriority = rawPriority ? parseInt(rawPriority, 10) : deriveDefaultPriority(category)

  const subcategory = metaValue(p.metafields, 'subcategory') ?? deriveSubcategory(p)
  const safeWording = metaValue(p.metafields, 'safe_wording') ?? shortDescription(p.description)
  const accentColor = metaValue(p.metafields, 'accent_color') ?? defaultAccentColor(category)

  return {
    id: p.handle,
    shopifyProductId: p.id,
    handle: p.handle,
    name: p.title,
    category,
    subcategory,
    price: defaultVariant?.price ?? 0,
    description: shortDescription(p.description),
    safeWording,
    goalTags,
    stimulant: p.tags.includes('stimulant'),
    vegan: p.tags.includes('vegan'),
    beginner: p.tags.includes('beginner'),
    stackPriority,
    stackLevels,
    shopifyVariantId: defaultVariant?.id ?? '',
    accentColor,
    image: firstImage,
    variants,
  }
}

// ─── Fallback derivation helpers ─────────────────────────────────────────────

function deriveDefaultCategory(p: ShopifyProduct): string | null {
  const title = p.title.toLowerCase()
  if (title.includes('whey') || title.includes('plant protein') || title.includes('vegan protein') || title.includes('mass') || title.includes('gainer') || title.includes('isolate') || title.includes('casein')) return 'Protein'
  if (title.includes('creatine')) return 'Performance'
  if (title.includes('pre-workout') || title.includes('preworkout') || title.includes('pre workout')) return 'Pre-Workout'
  if (title.includes('bcaa') || title.includes('amino') || title.includes('eaa')) return 'Amino Acids'
  if (title.includes('electrolyte') || title.includes('hydration')) return 'Hydration'
  if (title.includes('omega') || title.includes('vitamin') || title.includes('magnesium') || title.includes('mineral') || title.includes('multivitamin')) return 'Health'
  if (title.includes('collagen') || title.includes('sleep') || title.includes('recovery') || title.includes('joint')) return 'Recovery'
  if (title.includes('fat burner') || title.includes('thermo') || title.includes('slimming') || title.includes('weight loss')) return 'Body Composition'
  return null
}

function deriveDefaultPriority(productType: string): number {
  const map: Record<string, number> = {
    'Protein': 10,
    'Performance': 9,
    'Pre-Workout': 8,
    'Body Composition': 7,
    'Hydration': 7,
    'Amino Acids': 6,
    'Health': 5,
    'Recovery': 4,
  }
  return map[productType] ?? 5
}

function deriveSubcategory(p: ShopifyProduct): string {
  // Try to infer from title if no metafield set
  const title = p.title.toLowerCase()
  if (title.includes('whey')) return 'Whey'
  if (title.includes('plant') || title.includes('vegan')) return 'Plant-based'
  if (title.includes('creatine')) return 'Creatine'
  if (title.includes('stim-free') || title.includes('stimfree')) return 'Stim-free'
  if (title.includes('pre-workout') || title.includes('pre workout')) return 'Standard'
  if (title.includes('bcaa')) return 'BCAA'
  if (title.includes('electrolyte')) return 'Electrolytes'
  if (title.includes('omega')) return 'Essential Fats'
  if (title.includes('vitamin d')) return 'Vitamins'
  if (title.includes('magnesium')) return 'Minerals'
  if (title.includes('collagen')) return 'Joint Support'
  if (title.includes('sleep')) return 'Sleep'
  if (title.includes('mass') || title.includes('gainer')) return 'Mass Gainer'
  if (title.includes('thermo') || title.includes('fat')) return 'Thermogenic'
  return p.productType || 'General'
}

function defaultAccentColor(productType: string): string {
  const map: Record<string, string> = {
    'Protein': '#cfff32',
    'Performance': '#cfff32',
    'Pre-Workout': '#f97316',
    'Hydration': '#38bdf8',
    'Amino Acids': '#818cf8',
    'Health': '#fbbf24',
    'Recovery': '#818cf8',
    'Body Composition': '#f87171',
  }
  return map[productType] ?? '#cfff32'
}

// ─── Shopify → CatalogueProduct mapper ───────────────────────────────────────

const VALID_STACK_SLOTS: StackSlot[] = ['protein', 'performance', 'energy', 'hydration', 'recovery', 'health', 'sleep', 'vegan-support', 'gut', 'menopause']
const VALID_DIETARY_TAGS: DietaryTag[] = ['vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'nut-free', 'halal', 'keto-friendly']
const VALID_SWAP_GROUPS: SwapGroup[] = [
  'protein-whey', 'protein-plant', 'protein-mass', 'protein-clear', 'creatine',
  'pre-workout-stim', 'pre-workout-stim-free', 'aminos', 'electrolytes', 'omega-3',
  'magnesium', 'vitamin-d', 'multivitamin', 'collagen', 'sleep-support', 'fat-burner',
  'adaptogen', 'probiotic', 'greens', 'fibre', 'menopause', 'vitamin-c', 'general',
]

function parseStackSlots(tags: string[]): StackSlot[] {
  return tags
    .filter((t) => t.startsWith('slot:'))
    .map((t) => t.replace('slot:', '') as StackSlot)
    .filter((s) => VALID_STACK_SLOTS.includes(s))
}

function parseDietaryTags(tags: string[]): DietaryTag[] {
  return tags
    .filter((t) => t.startsWith('dietary:'))
    .map((t) => t.replace('dietary:', '') as DietaryTag)
    .filter((d) => VALID_DIETARY_TAGS.includes(d))
}

function parseSwapGroup(tags: string[]): SwapGroup {
  const found = tags
    .filter((t) => t.startsWith('swap:'))
    .map((t) => t.replace('swap:', '') as SwapGroup)
    .find((s) => VALID_SWAP_GROUPS.includes(s))
  return found ?? 'general'
}

// ─── Fallback derivation — used when explicit tags are absent ─────────────────

function deriveStackSlots(p: ShopifyProduct): StackSlot[] {
  const t = p.title.toLowerCase()
  const pt = (p.productType ?? '').toLowerCase()
  const slots: StackSlot[] = []

  const isProtein = t.includes('protein') || t.includes('whey') || t.includes('mass') || t.includes('gainer') || t.includes('isolate') || t.includes('casein') || pt === 'protein'
  const isPerformance = t.includes('creatine') || pt === 'performance'
  const isPreWorkout = t.includes('pre-workout') || t.includes('pre workout') || t.includes('preworkout') || pt.includes('pre-workout') || pt.includes('pre workout')
  const isHydration = t.includes('electrolyte') || t.includes('hydration') || pt === 'hydration'
  const isAmino = t.includes('bcaa') || t.includes('amino') || t.includes('eaa') || pt.includes('amino')
  const isSleep = t.includes('sleep') || t.includes('zma') || (t.includes('magnesium') && t.includes('sleep'))
  const isHealth = t.includes('vitamin') || t.includes('omega') || t.includes('multivitamin') || t.includes('mineral') || pt === 'health' || pt === 'vitamins'
  const isRecovery = t.includes('collagen') || t.includes('joint') || t.includes('glucosamine') || (t.includes('recovery') && !isSleep) || pt === 'recovery'
  const isMagnesium = t.includes('magnesium')
  const isVegan = p.tags.includes('vegan') || t.includes('plant protein') || t.includes('vegan protein')
  const isFatBurner = t.includes('fat burner') || t.includes('fat direct') || t.includes('fat-x') || t.includes('slender') || t.includes('pro cut') || t.includes('fat transporter') || pt.includes('slimming') || pt.includes('weight management') || pt.includes('body composition') || pt.includes('thermogenic')
  const isGut = t.includes('probiotic') || t.includes('gut') || t.includes('greens') || t.includes('fibre') || t.includes('fiber') || t.includes('digestive') || pt.includes('gut') || pt.includes('digestive')
  const isMenopause = t.includes('menopause') || t.includes('peri-menopause') || t.includes('perimenopause') || t.includes('hormonal balance') || pt.includes('menopause')

  if (isProtein)    slots.push('protein')
  if (isPerformance) slots.push('performance')
  if (isPreWorkout) slots.push('energy')
  if (isHydration)  slots.push('hydration')
  if (isAmino)      slots.push('recovery', 'hydration')
  if (isMagnesium)  slots.push('sleep', 'recovery')
  else if (isSleep) slots.push('sleep', 'recovery')
  if (isHealth)     slots.push('health')
  if (isRecovery && !isAmino && !isMagnesium) slots.push('recovery')
  if (isVegan && isProtein) slots.push('vegan-support')
  if (isGut)        slots.push('gut', 'health')
  if (isMenopause)  slots.push('menopause', 'health')
  if (isFatBurner && slots.length === 0) slots.push('health')

  return [...new Set(slots)] as StackSlot[]
}

function deriveGoals(p: ShopifyProduct, slots: StackSlot[]): ReturnType<typeof parseGoalTags> {
  const goals = new Set<string>()
  if (slots.includes('protein')) {
    goals.add('muscle'); goals.add('recovery')
    if (p.title.toLowerCase().includes('mass') || p.title.toLowerCase().includes('gainer')) goals.add('bulking')
  }
  if (slots.includes('performance'))  { goals.add('muscle'); goals.add('performance') }
  if (slots.includes('energy'))       { goals.add('energy'); goals.add('performance') }
  if (slots.includes('hydration'))    { goals.add('hydration'); goals.add('performance') }
  if (slots.includes('recovery'))     { goals.add('recovery') }
  if (slots.includes('health'))       { goals.add('health') }
  if (slots.includes('sleep'))        { goals.add('recovery'); goals.add('health'); goals.add('sleep-better'); goals.add('less-stress') }
  if (slots.includes('vegan-support')) goals.add('health')

  // Wellbeing goal inference from product title
  const t = p.title.toLowerCase()
  if (t.includes('magnesium') || t.includes('sleep'))            { goals.add('sleep-better'); goals.add('less-stress') }
  if (t.includes('ashwagandha') || t.includes('theanine'))       { goals.add('less-stress') }
  if (t.includes('omega') || t.includes('fish oil'))             { goals.add('focus') }
  if (t.includes('multivitamin') || t.includes('multi vitamin') || t.includes('multi-vitamin')) {
    goals.add('immune'); goals.add('focus'); goals.add('energy')
  }
  if (t.includes('vitamin d') || t.includes('vitamin c'))        { goals.add('immune') }
  if (t.includes('collagen'))                                    { goals.add('skin-hair-nails'); goals.add('immune') }
  // Fat burner / thermogenic → cutting goal
  if (t.includes('fat burner') || t.includes('fat direct') || t.includes('fat-x') || t.includes('slender') || t.includes('pro cut') || t.includes('fat transporter')) {
    goals.add('cutting')
  }
  // BCAA / EAA / amino → recovery + muscle
  if (t.includes('bcaa') || t.includes('eaa') || t.includes('amino')) {
    goals.add('recovery'); goals.add('muscle')
  }
  // Electrolytes → hydration + energy
  if (t.includes('electrolyte') || t.includes('hydration+')) {
    goals.add('hydration'); goals.add('energy')
  }
  // Gut health → probiotics, greens, fibre, digestive blends
  if (t.includes('probiotic') || t.includes('gut') || t.includes('greens') || t.includes('fibre') || t.includes('fiber') || t.includes('digestive')) {
    goals.add('gut-health'); goals.add('health'); goals.add('immune')
  }
  // Menopause support blends
  if (t.includes('menopause') || t.includes('perimenopause') || t.includes('peri-menopause') || t.includes('hormonal balance')) {
    goals.add('menopause'); goals.add('health')
  }
  // Ashwagandha / adaptogens → stress + (often) menopause support
  if (t.includes('ashwagandha') || t.includes('rhodiola')) {
    goals.add('less-stress')
  }
  return [...goals] as ReturnType<typeof parseGoalTags>
}

function deriveSwapGroup(p: ShopifyProduct): SwapGroup {
  const t = p.title.toLowerCase()
  if (t.includes('plant protein') || t.includes('vegan protein')) return 'protein-plant'
  if (t.includes('mass') || t.includes('gainer'))                return 'protein-mass'
  if (t.includes('whey') || t.includes('isolate') || t.includes('casein') || (t.includes('protein') && !t.includes('plant'))) return 'protein-whey'
  if (t.includes('creatine'))          return 'creatine'
  if (t.includes('stim-free') || t.includes('stimfree')) return 'pre-workout-stim-free'
  if (t.includes('pre-workout') || t.includes('pre workout') || t.includes('preworkout')) return 'pre-workout-stim'
  if (t.includes('electrolyte') || t.includes('hydration')) return 'electrolytes'
  if (t.includes('bcaa') || t.includes('amino') || t.includes('eaa')) return 'aminos'
  if (t.includes('omega'))             return 'omega-3'
  if (t.includes('magnesium'))         return 'magnesium'
  if (t.includes('vitamin d'))         return 'vitamin-d'
  if (t.includes('multivitamin') || t.includes('multi vitamin')) return 'multivitamin'
  if (t.includes('collagen'))          return 'collagen'
  if (t.includes('sleep'))             return 'sleep-support'
  if (t.includes('fat burner') || t.includes('thermo')) return 'fat-burner'
  if (t.includes('menopause') || t.includes('hormonal balance')) return 'menopause'
  if (t.includes('probiotic') || t.includes('gut'))     return 'probiotic'
  if (t.includes('greens'))            return 'greens'
  if (t.includes('fibre') || t.includes('fiber'))       return 'fibre'
  if (t.includes('ashwagandha') || t.includes('rhodiola')) return 'adaptogen'
  if (t.includes('vitamin c') || t.includes('zinc'))    return 'vitamin-c'
  return 'general'
}

function deriveDietaryTags(p: ShopifyProduct): DietaryTag[] {
  const tags: DietaryTag[] = []
  const allTags = p.tags.map(t => t.toLowerCase())
  if (allTags.includes('vegan'))       tags.push('vegan', 'vegetarian', 'dairy-free')
  if (allTags.includes('vegetarian'))  tags.push('vegetarian')
  if (allTags.includes('gluten-free') || allTags.includes('gluten free')) tags.push('gluten-free')
  if (allTags.includes('dairy-free') || allTags.includes('dairy free'))   tags.push('dairy-free')
  return [...new Set(tags)] as DietaryTag[]
}

function deriveBoosterEligible(slots: StackSlot[]): boolean {
  // Products that fit into non-core slots are typically good booster candidates
  return slots.some(s => ['recovery', 'hydration', 'health', 'sleep'].includes(s)) &&
         !slots.includes('protein') &&
         !slots.includes('performance')
}

function derivePriority(p: ShopifyProduct, slots: StackSlot[]): number {
  const t = p.title.toLowerCase()
  if (slots.includes('protein'))     return 10
  if (slots.includes('performance')) return 9
  if (slots.includes('energy'))      return 8
  if (slots.includes('hydration'))   return 7
  // Fat burners have a narrow use case (cutting only) — priority stays low so
  // the hard eligibility gate in the factory does the real work. When cutting IS
  // selected they rank correctly via goal-affinity boosts.
  if (t.includes('fat burner') || t.includes('fat direct') || t.includes('slender') || t.includes('fat-x') || t.includes('pro cut')) return 5
  if (slots.includes('health'))      return 6
  if (slots.includes('recovery'))    return 5
  if (slots.includes('sleep'))       return 5
  return deriveDefaultPriority(p.productType ?? '')
}

export function mapShopifyToCatalogueProduct(p: ShopifyProduct): CatalogueProduct {
  const variants: CatalogueVariant[] = p.variants.edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    flavour: null,
    size: null,
    price: parseFloat(node.priceV2.amount),
    compareAtPrice: node.compareAtPriceV2 ? parseFloat(node.compareAtPriceV2.amount) : null,
    available: node.availableForSale,
    shopifyVariantId: node.id,
    sellingPlanId: node.sellingPlanAllocations?.edges?.[0]?.node?.sellingPlan?.id ?? null,
  }))

  const defaultVariant = variants[0]
  const firstImage = p.images.edges[0]?.node.url ?? null

  // Parse explicit tags first; fall back to title/productType inference so
  // products work correctly even before the seed-shopify-tags script is run.
  const explicitSlots   = parseStackSlots(p.tags)
  const stackSlots      = explicitSlots.length > 0 ? explicitSlots : deriveStackSlots(p)

  const explicitGoals   = parseGoalTags(p.tags)
  const derivedGoals    = deriveGoals(p, stackSlots)
  // Always merge: explicit tags are authoritative, derived goals fill wellbeing gaps
  const goals           = [...new Set([...explicitGoals, ...derivedGoals])] as Goal[]

  const explicitDietary = parseDietaryTags(p.tags)
  const dietaryTags     = explicitDietary.length > 0 ? explicitDietary : deriveDietaryTags(p)

  const explicitSwap    = parseSwapGroup(p.tags)
  const swapGroup       = explicitSwap !== 'general' ? explicitSwap : deriveSwapGroup(p)

  const hasStimulants     = p.tags.includes('stimulant') || p.title.toLowerCase().includes('pre-workout') && !p.title.toLowerCase().includes('stim-free')
  const isCoreEligible    = p.tags.includes('core-eligible')    || stackSlots.includes('protein') || stackSlots.includes('performance')
  const isBoosterEligible = p.tags.includes('booster-eligible') || deriveBoosterEligible(stackSlots)

  const rawPriority = metaValue(p.metafields, 'stack_priority')
  const recommendationPriority = rawPriority ? parseInt(rawPriority, 10) : derivePriority(p, stackSlots)

  const rawMarginPriority = metaValue(p.metafields, 'margin_priority')
  const marginPriority = rawMarginPriority ? parseInt(rawMarginPriority, 10) : 5

  const shortReason = metaValue(p.metafields, 'safe_wording') ?? shortDescription(p.description)
  const subscriptionEligible = metaValue(p.metafields, 'subscription_eligible') === 'true'

  // Servings in one unit at the recommended dose — defaults to ~a month's worth
  // when the metafield isn't set yet, so untagged live products still behave sensibly.
  const rawServings = metaValue(p.metafields, 'servings')
  const servings = rawServings ? parseInt(rawServings, 10) : 30

  // The correlating monthly subscription product (a Shopify handle, since our
  // catalogue ids ARE handles) and whether this product is a refill-only item.
  const subscriptionProductId = metaValue(p.metafields, 'subscription_product_handle') || null
  const isSubscriptionOnly = metaValue(p.metafields, 'subscription_only') === 'true'

  // Consumption protocol (how it's taken) — drives monthly subscription quantity.
  const rawCadence = metaValue(p.metafields, 'consumption_cadence')
  const rawServingsPerUnit = metaValue(p.metafields, 'servings_per_unit')
  let consumption: ProductConsumption | undefined
  if (rawCadence === 'daily' || rawCadence === 'per-workout') {
    consumption = { cadence: rawCadence, servingsPerUnit: (rawServingsPerUnit ? parseInt(rawServingsPerUnit, 10) : 0) || servings }
  }

  const rawMinMonths = metaValue(p.metafields, 'min_subscription_months')
  const minSubscriptionMonths = rawMinMonths ? parseInt(rawMinMonths, 10) : undefined

  const rawCost = metaValue(p.metafields, 'cost')
  const cost = rawCost ? parseFloat(rawCost) : undefined

  const rawBasis = metaValue(p.metafields, 'recommendation_basis')
  const recommendationBasis = rawBasis === 'objective' || rawBasis === 'subjective' ? rawBasis : undefined

  const rawOnset = metaValue(p.metafields, 'effect_onset')
  const effectOnset =
    rawOnset === 'immediate' || rawOnset === 'short' || rawOnset === 'long' || rawOnset === 'none' ? rawOnset : undefined

  const category = parseCategoryFromTags(p.tags) ?? deriveDefaultCategory(p) ?? (p.productType || 'Supplement')

  const rawFormats = metaValue(p.metafields, 'formats')
  const formats = rawFormats ? rawFormats.split(',').map((f) => f.trim()) : ['powder']

  return {
    id: p.handle,
    title: p.title,
    handle: p.handle,
    description: shortDescription(p.description),
    imageUrl: firstImage,
    category,
    stackSlots,
    goals,
    dietaryTags,
    formats,
    variants,
    basePrice: defaultVariant?.price ?? 0,
    compareAtPrice: defaultVariant?.compareAtPrice ?? null,
    cost,
    subscriptionEligible,
    servings,
    subscriptionProductId,
    isSubscriptionOnly,
    consumption,
    minSubscriptionMonths,
    recommendationBasis,
    effectOnset,
    swapGroup,
    recommendationPriority,
    marginPriority,
    isCoreEligible,
    isBoosterEligible,
    hasStimulants,
    shortReason,
    warnings: [],
    shopifyProductId: p.id,
  }
}

// ─── Public catalogue fetch ───────────────────────────────────────────────────

let _catalogueCache: Product[] | null = null
let _cacheTime = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function fetchCatalogue(): Promise<Product[]> {
  if (getDataSource() === 'mock') {
    console.log('[catalogue] data source is mock — using MOCK_PRODUCTS')
    return MOCK_PRODUCTS as Product[]
  }

  const now = Date.now()
  if (_catalogueCache && now - _cacheTime < CACHE_TTL_MS) return _catalogueCache

  try {
    const shopifyProducts = await getProducts(50)
    console.log(`[catalogue] Fetched ${shopifyProducts.length} products from Shopify`)
    _catalogueCache = shopifyProducts.map(mapShopifyProduct)
    _cacheTime = now
    return _catalogueCache
  } catch (err) {
    // Re-throw so the API route can surface it in debug mode
    console.error('[catalogue] Shopify fetch failed:', err)
    throw err
  }
}
