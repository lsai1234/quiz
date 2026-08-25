/**
 * Turning a roster row plus its supplier product into a catalogue product.
 *
 * TWO SOURCES, AND EACH OWNS WHAT IT KNOWS
 * ────────────────────────────────────────
 * PowerBody own the DESCRIPTION — picture, name, category, blurb — and today's
 * commercials: what they charge us and how many they have. Those are facts about
 * their product that we cannot invent and should never overwrite from a
 * spreadsheet, because a sheet is a snapshot and a price that is a week old is
 * worse than no price.
 *
 * The roster owns the JUDGEMENT — which swap group, what is in it, who must not
 * take it, how many servings, whether it counts as a drink. `getProductInfo`
 * cannot answer any of that, and the quiz reads almost nothing else.
 *
 * So the supplier wins on description and money, and the roster wins on meaning.
 * Prices are never read from the sheet at all: a cost column is a snapshot, and
 * a product we cannot reach the supplier for arrives UNPRICED and says so rather
 * than arriving confidently wrong.
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { SupplierProduct } from './types'
import type { RosterRow } from './roster-csv'
import { listPriceFor } from '@/lib/pricing/list-price'
import { rhythmForSwap, classifySupplierProduct } from './mapping'

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export interface RosterImportResult {
  product: CatalogueProduct
  /** True when PowerBody answered for this SKU, so picture and blurb are real. */
  enriched: boolean
  /** What is missing or assumed, named per product for the review screen. */
  notes: string[]
}

/**
 * Build a catalogue product from a roster row, enriched by the supplier when we
 * could reach them.
 *
 * `supplier` is null for a SKU whose product id could not be resolved — the
 * product is still built, because it is orderable (PowerBody take a SKU on
 * `createOrder`; we already send `product_id` empty) and the quiz reads the
 * roster's fields, not theirs. What it lacks is a picture and a description,
 * which is a review-screen problem rather than a blocker.
 */
export function rosterRowToProduct(row: RosterRow, supplier: SupplierProduct | null): RosterImportResult {
  const notes: string[] = []
  const id = slugify(row.name || row.sku) || slugify(row.sku)

  // ── Money comes from the supplier, never from the sheet ──────────────────
  // A cost column is a snapshot of what PowerBody charged on the day somebody
  // typed it. Pricing a live shop off that is how a stale figure turns into a
  // real margin, so it is not read: cost is theirs, and the shelf price is our
  // own rule applied to it (`listPriceFor` — cost × 2 → .99). A product we
  // could not reach them for therefore arrives UNPRICED and says so, which is
  // the honest failure. Unpriced also means it sits under the quiz's £8 floor
  // and cannot be recommended, so a guess can never reach a customer.
  const cost = supplier?.wholesalePrice ?? 0
  const sellPrice = cost > 0 ? listPriceFor(cost) : 0
  if (cost <= 0) {
    notes.push('No cost from PowerBody, so this has no price yet and cannot be recommended. Fix the lookup, or set the cost here.')
  }
  const rrp = supplier?.rrp ?? null
  const stock = supplier?.stock ?? row.stock ?? 0

  if (!supplier) notes.push('No picture or description — PowerBody could not be reached for this SKU.')
  else if (!supplier.imageUrl) notes.push('PowerBody have no image for this product.')

  // Classification: the roster decides the swap group, and the keyword
  // classifier fills the slots and goals the sheet leaves blank. Deriving them
  // from the group rather than asking for two more columns keeps the sheet to
  // the decisions a person actually has an opinion about.
  const classified = classifySupplierProduct({
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    category: supplier?.category ?? '',
    description: '',
    imageUrl: null,
    wholesalePrice: cost,
    rrp: rrp ?? cost,
    currency: 'GBP',
    stock,
    inStock: stock > 0,
    barcode: null,
    flavours: [],
    servings: row.servings,
    weightGrams: row.weightGrams,
    vatRate: null,
    detailed: true,
    productId: supplier?.productId ?? null,
    updatedAt: new Date().toISOString(),
  })

  if (row.swapGroup === 'general') {
    notes.push('Swap group is "general", which fails readiness: no alternatives and no targeted scoring.')
  }

  const formats = row.formats.length > 0 ? row.formats : classified.isReadyToDrink ? ['liquid'] : ['powder']
  const servings = row.servings && row.servings > 0 ? row.servings : 30
  if (!row.servings) notes.push('No serving count on the row — assumed 30, which sizes the subscription.')

  // One variant per flavour SKU, each keeping its own code so every one stays
  // orderable. Prices are shared because a flavour of one tub costs one price;
  // a different SIZE is a different product and must not be listed here.
  const variantSkus = row.variantSkus.length > 0 ? row.variantSkus : [row.sku]
  const variants: CatalogueVariant[] = variantSkus.map((sku, index) => ({
    id: variantSkus.length === 1 ? id : `${id}-${slugify(sku)}`,
    title: index === 0 ? row.name : sku,
    flavour: null,
    size: null,
    price: sellPrice,
    compareAtPrice: rrp,
    available: stock > 0,
    inventory: index === 0 ? stock : null,
    sku,
  }))
  if (variantSkus.length > 1) {
    notes.push(
      `${variantSkus.length} flavours merged into one product. Confirm they are flavours of the same size — ` +
        'a different size has its own cost, servings and weight and must stay separate.',
    )
  }

  const rhythm = rhythmForSwap(row.swapGroup, classified.cadence)

  const product: CatalogueProduct = {
    id,
    title: supplier?.name || row.name,
    handle: id,
    description: supplier?.description ?? '',
    imageUrl: supplier?.imageUrl ?? null,
    category: supplier?.category || row.swapGroup,
    stackSlots: classified.stackSlots,
    goals: classified.goals,
    dietaryTags: row.dietaryTags,
    formats,
    variants,
    defaultVariantId: variants.find((v) => v.available)?.id ?? variants[0]?.id ?? null,
    basePrice: sellPrice,
    compareAtPrice: rrp,
    cost,
    weightGrams: row.weightGrams ?? supplier?.weightGrams ?? null,
    vatRate: supplier?.vatRate ?? null,
    supplierRrp: rrp,
    subscriptionEligible: row.subscriptionEligible,
    subscriptionProductId: null,
    isSubscriptionOnly: false,
    servings,
    consumption: {
      cadence: rhythm.cadence,
      servingsPerUnit: servings,
      ...(rhythm.daysPerWeek ? { daysPerWeek: rhythm.daysPerWeek } : {}),
      ...(rhythm.asNeededTrigger ? { asNeededTrigger: rhythm.asNeededTrigger } : {}),
      ...(rhythm.anchor ? { anchor: rhythm.anchor } : {}),
    },
    swapGroup: row.swapGroup,
    recommendationPriority: row.recommendationPriority ?? 5,
    marginPriority: 5,
    isCoreEligible: classified.stackSlots.length > 0,
    isBoosterEligible: false,
    hasStimulants: row.hasStimulants || classified.hasStimulants,
    ...(row.contraindications.length > 0 ? { contraindications: row.contraindications } : {}),
    ...(row.actives.length > 0 ? { actives: row.actives } : {}),
    shortReason: row.shortReason,
    // A safety note the quiz has no question for still has to reach the
    // customer, so it goes in the fine print rather than being dropped.
    warnings: [
      ...(row.hasStimulants || classified.hasStimulants ? ['Contains caffeine'] : []),
      ...row.otherWarnings,
    ],
  }

  if (servings > 35 && row.subscriptionEligible) {
    notes.push(
      `${servings} servings is more than a month, so it cannot subscribe as itself — map a monthly refill.`,
    )
  }

  return { product, enriched: Boolean(supplier), notes }
}
