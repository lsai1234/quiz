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
import { variantLabels, commonProductName } from './variant-labels'
import { putNamesRightWayRound } from './variant-naming'

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
export interface VariantFacts {
  /** Units PowerBody held for this exact SKU when the index was crawled. */
  qty: number
  /**
   * PowerBody's own full name for this exact SKU.
   *
   * Absent until the detail call reaches the SKU. Without it a flavour has no
   * label but its code, which is precisely the bug this field exists to fix:
   * import used to look up only a row's MAIN sku, so a six-flavour product
   * arrived with one real name and five raw codes in its picker.
   */
  name?: string | null
  /**
   * What PowerBody charge us for THIS sku.
   *
   * Siblings under one master SKU are normally the same tub in different
   * flavours and cost the same to the penny, so pricing them all off the row's
   * main SKU was right often enough to look right. It is wrong the moment the
   * siblings are different things: glycine is sold as 100 × 1000mg vcaps and as
   * 454g of the same powder, and the bag costs nearly twice the bottle — so
   * both went on the shelf at the bottle's price.
   *
   * Absent falls back to the main SKU's cost, which is the old behaviour.
   */
  wholesalePrice?: number | null
  /** The supplier's RRP for this sku — the was-price on this variant. */
  rrp?: number | null
  /**
   * Servings in this sku (`portion_count`). 33 for the capsules, 454 for the
   * powder: not something any ratio between the two could have produced, since
   * their sizes are not even in the same unit.
   */
  servings?: number | null
  /**
   * This SKU's own photograph.
   *
   * PowerBody hold one per product id, and every flavour is its own product at
   * their end — so the pictures exist, one per flavour, and import kept only
   * the row's main one because that was the only detail call it made.
   */
  imageUrl?: string | null
}

/**
 * The size a supplier name carries at its end — "…- 454 grams", "…- 100 vcaps".
 *
 * Only for the variant's `size` field, which is a LABEL: it is what separates
 * two rows in the picker when the flavour column is empty, and it is what the
 * per-serving maths falls back to scaling by when nothing knows the real count.
 * A name it cannot read gives null rather than a guess — an invented size is a
 * per-serving price that is confidently wrong.
 */
export function sizeFromName(name: string | null | undefined): string | null {
  if (!name) return null
  const match = name.match(
    /(\d[\d.]*)\s*(kg|g|grams?|ml|l|litres?|caps?|capsules?|vcaps?|softgels?|tablets?|tabs?|servings?|sachets?|bars?)\b\s*$/i,
  )
  return match ? `${match[1]} ${match[2]}`.trim() : null
}

/**
 * @param variantFacts per-SKU stock, keyed by SKU, from the crawled feed index.
 *   Without it every flavour inherits the parent's availability, which is wrong
 *   in the way that matters: a customer picks Chocolate, we take the order, and
 *   PowerBody have none. Each flavour is its own SKU with its own stock.
 */
export function rosterRowToProduct(
  row: RosterRow,
  supplier: SupplierProduct | null,
  variantFacts?: Map<string, VariantFacts>,
): RosterImportResult {
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

  /*
    An accessory is one unit and has no dose, so it has no format in the sense
    the rest of this means it, no serving count, and nothing to subscribe to.
    Left on the defaults it arrives as a powder with thirty servings and a
    monthly plan — which is exactly how three shakers reached the shelf
    advertising servings they do not have.
  */
  const accessory = row.swapGroup === 'accessory'
  const formats = row.formats.length > 0 ? row.formats : accessory ? ['accessory'] : classified.isReadyToDrink ? ['liquid'] : ['powder']
  // The sheet's judgement first, then what PowerBody actually report for the
  // main SKU (`portion_count`), and only then the assumption — a real number
  // from the supplier beats a 30 we made up.
  const servings = accessory
    ? 1
    : row.servings && row.servings > 0
      ? row.servings
      : supplier?.servings && supplier.servings > 0
        ? supplier.servings
        : 30
  if (!accessory && !row.servings && !(supplier?.servings && supplier.servings > 0)) {
    notes.push('No serving count on the row or from PowerBody — assumed 30, which sizes the subscription.')
  }

  // One variant per flavour SKU, each keeping its own code so every one stays
  // orderable — and each priced from its OWN cost where PowerBody answered for
  // it. The rule used to be that siblings share a price, on the reasoning that
  // a flavour of one tub costs one price. That is true of flavours and false of
  // everything else somebody puts under one master SKU, and the sheet cannot be
  // relied on to only ever hold flavours: the glycine row merged 100 capsules
  // with a 454g bag, and both went live at the capsules' price and the
  // capsules' serving count.
  const variantSkus = row.variantSkus.length > 0 ? row.variantSkus : [row.sku]
  /*
    Labels are worked out across the whole set at once, because a flavour is
    only identifiable by what the siblings do NOT have in common — see
    `variant-labels`. The row's own SKU carries the main supplier name, which
    is the one name we always have.
  */
  const siblingNames = variantSkus.map((sku) =>
    sku === row.sku ? (supplier?.name ?? row.name) : (variantFacts?.get(sku)?.name ?? null),
  )
  const labels = variantLabels(
    variantSkus.map((sku, i) => ({ sku, name: siblingNames[i] })),
  )
  /*
    The product is what the siblings SHARE; a flavour is what tells them apart.

    Both come out of one comparison, and only half of it was being used: the
    title was the row's MAIN sku's name, and a main sku is one flavour of the
    product. So a four-flavour hydration powder went on the shelf called
    "Hydration+, Blue Raspberry - 240 grams" with "Hydration+" listed under it
    as one of its flavours — the two ends swapped over.
  */
  const sharedName = commonProductName(siblingNames.filter((n): n is string => Boolean(n)))
  const variants: CatalogueVariant[] = variantSkus.map((sku, index) => {
    // Per-SKU stock when the crawl reached this flavour; the parent's otherwise.
    // Falling back rather than defaulting to zero is deliberate: an unknown
    // flavour showing as out of stock hides a product we can probably sell,
    // which is the worse of the two mistakes at import time. The nightly sync
    // corrects it either way.
    const facts = variantFacts?.get(sku)
    const units = facts ? facts.qty : stock
    const label = labels[index]
    // This SKU's own money, falling back to the row's when the lookup did not
    // reach it — never a guess, always either its own figure or the main one.
    const variantCost = facts?.wholesalePrice != null && facts.wholesalePrice > 0 ? facts.wholesalePrice : cost
    const variantPrice = variantCost > 0 ? listPriceFor(variantCost) : sellPrice
    const variantRrp = facts?.rrp != null && facts.rrp > 0 ? facts.rrp : rrp
    const variantServings = facts?.servings != null && facts.servings > 0 ? facts.servings : null
    return {
      id: variantSkus.length === 1 ? id : `${id}-${slugify(sku)}`,
      title: label.label,
      /*
        The label IS the flavour when there is more than one sibling: it is
        whatever distinguishes this SKU from the others, which for a merged
        product is the flavour by construction. A single-variant product has
        nothing to distinguish, so it has no flavour either.
      */
      flavour: variantSkus.length > 1 && label.named ? label.label : null,
      size: sizeFromName(facts?.name ?? (sku === row.sku ? supplier?.name : null)),
      price: variantPrice,
      compareAtPrice: variantRrp,
      available: units > 0,
      inventory: facts ? facts.qty : index === 0 ? stock : null,
      sku,
      // Its own picture when PowerBody sent one for this SKU. Absent falls back
      // to the product's, which is what every variant used to show.
      ...(facts?.imageUrl ? { imageUrl: facts.imageUrl } : {}),
      ...(variantServings !== null ? { servings: variantServings } : {}),
      ...(variantCost > 0 ? { cost: variantCost } : {}),
    }
  })
  /*
    Say which flavours are still showing a code. It is the one import fault a
    founder cannot diagnose from the review screen — "P45757" looks like data
    we chose rather than a lookup that did not land.
  */
  const unlabelled = labels.filter((l) => !l.named)
  if (unlabelled.length > 0 && variantSkus.length > 1) {
    notes.push(
      `${unlabelled.length} of ${variantSkus.length} flavours have no name from PowerBody and are ` +
        `showing their code (${unlabelled.slice(0, 4).map((l) => l.sku).join(', ')}` +
        `${unlabelled.length > 4 ? '…' : ''}). Run “Fix flavour names” once the feed index has them.`,
    )
  }

  const unknownVariants = variantSkus.filter((sku) => variantFacts && !variantFacts.has(sku))
  if (variantFacts && unknownVariants.length > 0) {
    notes.push(
      `${unknownVariants.length} of ${variantSkus.length} flavours are not in the crawled product list ` +
        `(${unknownVariants.slice(0, 4).join(', ')}${unknownVariants.length > 4 ? '…' : ''}) — ` +
        'their stock is assumed from the main SKU until the next sync.',
    )
  }
  if (variantSkus.length > 1) {
    notes.push(
      `${variantSkus.length} SKUs merged into one product. Each keeps its own price, servings and stock, so ` +
        'a different size is priced honestly — check the weight, which is still the main SKU\'s.',
    )
  }
  /*
    The one thing a founder cannot see from a list of flavour names: these
    siblings are not the same thing. Different prices or different serving
    counts under one master SKU means the sheet merged two products, which is
    allowed now and is worth saying out loud — it is the difference between
    "Glycine, 6 flavours" and "Glycine, capsules or a bag of powder".
  */
  const distinctPrices = new Set(variants.map((v) => v.price))
  const distinctServings = new Set(variants.map((v) => v.servings ?? servings))
  if (variantSkus.length > 1 && (distinctPrices.size > 1 || distinctServings.size > 1)) {
    notes.push(
      'These SKUs are not the same product: ' +
        [
          distinctPrices.size > 1 ? `${distinctPrices.size} different prices` : null,
          distinctServings.size > 1 ? `${distinctServings.size} different serving counts` : null,
        ].filter(Boolean).join(' and ') +
        '. They are listed as sizes with their own price each — split them into separate products if they ' +
        'should not share a page.',
    )
  }

  const defaultVariant = variants.find((v) => v.available) ?? variants[0]
  const rhythm = rhythmForSwap(row.swapGroup, classified.cadence)

  const product: CatalogueProduct = {
    id,
    // The shared name when the siblings have one; the main SKU's otherwise,
    // which is right for a product that genuinely has a single SKU.
    title: sharedName || supplier?.name || row.name,
    handle: id,
    description: supplier?.description ?? '',
    imageUrl: supplier?.imageUrl ?? null,
    category: supplier?.category || row.swapGroup,
    stackSlots: classified.stackSlots,
    goals: classified.goals,
    dietaryTags: row.dietaryTags,
    formats,
    variants,
    defaultVariantId: defaultVariant?.id ?? null,
    // The default VARIANT's price, which is only the main SKU's while they all
    // cost the same. `basePrice` is what the quiz and every summary quote, and
    // quoting a price no variant on the page is sold at is the shape of the
    // bug this file just fixed.
    basePrice: defaultVariant?.price ?? sellPrice,
    compareAtPrice: defaultVariant?.compareAtPrice ?? rrp,
    cost,
    weightGrams: row.weightGrams ?? supplier?.weightGrams ?? null,
    vatRate: supplier?.vatRate ?? null,
    supplierRrp: rrp,
    // An accessory can be bought as often as somebody likes; it cannot be a
    // monthly plan, because there is no month's worth of it.
    subscriptionEligible: row.subscriptionEligible && !accessory,
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
    // A top-25 rank IS a recommendation priority — it is the founder saying
    // which products the quiz should reach for first, and importing it as a
    // flat 5 throws that judgement away. Rank 1 becomes 10, rank 25 becomes 6,
    // and everything unranked stays at the neutral 5, so a ranked product
    // always outranks an unranked one without swamping the goal scoring.
    recommendationPriority:
      row.recommendationPriority ??
      (row.top25Rank && row.top25Rank > 0 ? Math.max(6, 10 - Math.floor((row.top25Rank - 1) / 6)) : 5),
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

  if (servings > 35 && row.subscriptionEligible && !accessory) {
    notes.push(
      `${servings} servings is more than a month, so it cannot subscribe as itself — map a monthly refill.`,
    )
  }

  /*
    Last: put the two ends of the naming the right way round.

    `sharedName` is what the siblings have in common, and it finds nothing when
    their supplier names are inconsistent — "Protein Bars, Caramel Chaos - 12 x
    60g" beside "Bars, Chocolate Chip Cookie Dough - 12 x 60g" share no opening
    word at all. The title then falls back to the MAIN sku's name, which is one
    flavour of the product, and the product goes live named after it with its
    own name sitting underneath as a flavour.

    `putNamesRightWayRound` sees that from the strings alone: the title opens
    with one of the rows and keeps going, so that row is wearing the name and
    the title is carrying that row's flavour. It is the same correction the
    founder presses on a product already in the shop, applied here so it does
    not have to be.
  */
  const righted = putNamesRightWayRound(product)
  if (righted) {
    notes.push(
      `Imported as “${product.title}”, which is one of its own flavours — renamed to ` +
        `“${righted.title}” from what the flavours have in common. Check it reads like a product.`,
    )
  }

  return {
    product: righted ? { ...product, title: righted.title, variants: righted.variants } : product,
    enriched: Boolean(supplier),
    notes,
  }
}
