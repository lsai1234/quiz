import type { ShopifyProduct } from './types'
import type { Product, ProductVariant, Goal, StackLevel } from '@/lib/types'
import { getProducts, SHOPIFY_LIVE } from './operations'
import { MOCK_PRODUCTS } from '@/lib/mock-products'

// ─── Tag parsing helpers ───────────────────────────────────────────────────────

const VALID_GOALS: Goal[] = ['muscle', 'energy', 'performance', 'hydration', 'recovery', 'health', 'cutting', 'bulking']
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

function metaValue(metafields: ShopifyProduct['metafields'], key: string): string | null {
  return metafields.find((m) => m?.key === key)?.value ?? null
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

  const rawPriority = metaValue(p.metafields, 'stack_priority')
  const stackPriority = rawPriority ? parseInt(rawPriority, 10) : deriveDefaultPriority(p.productType)

  const subcategory = metaValue(p.metafields, 'subcategory') ?? deriveSubcategory(p)
  const safeWording = metaValue(p.metafields, 'safe_wording') ?? p.description
  const accentColor = metaValue(p.metafields, 'accent_color') ?? defaultAccentColor(p.productType)

  return {
    id: p.handle,
    shopifyProductId: p.id,
    handle: p.handle,
    name: p.title,
    category: p.productType || 'Supplement',
    subcategory,
    price: defaultVariant?.price ?? 0,
    description: p.description,
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

// ─── Public catalogue fetch ───────────────────────────────────────────────────

let _catalogueCache: Product[] | null = null
let _cacheTime = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function fetchCatalogue(): Promise<Product[]> {
  if (!SHOPIFY_LIVE) return MOCK_PRODUCTS as Product[]

  const now = Date.now()
  if (_catalogueCache && now - _cacheTime < CACHE_TTL_MS) return _catalogueCache

  try {
    const shopifyProducts = await getProducts(50)
    _catalogueCache = shopifyProducts.map(mapShopifyProduct)
    _cacheTime = now
    return _catalogueCache
  } catch (err) {
    console.error('[catalogue] Shopify fetch failed, falling back to mocks:', err)
    return MOCK_PRODUCTS as Product[]
  }
}
