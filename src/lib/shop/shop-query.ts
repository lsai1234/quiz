import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import type { Goal } from '@/lib/types'
import { dealInfo } from './merchandising'
import { hasRating } from './ratings'
import { buildIndex, searchProducts, type SearchIndex } from './search'
import { parseQuery, type QueryIntent } from './synonyms'

/**
 * The shop's filter model — everything that narrows what a shopper is looking
 * at, in one serialisable object.
 *
 * Named `shop-query` rather than `filters` on purpose: `lib/catalogue/filters.ts`
 * is the ENGINE's filtering (which products may fill a stack slot, what the quiz
 * is allowed to recommend). It has no business growing a sort order or a "show
 * me the deals" toggle, and this has no business being consulted when building
 * someone's stack. Two different jobs that would quietly merge if they shared a
 * file.
 */

export type ShopSort = 'relevance' | 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'saving'

export interface ShopQuery {
  q: string
  /** AND — every selected tag must be present. Matches the shop's existing behaviour. */
  dietary: DietaryTag[]
  /** OR within the facet. */
  categories: string[]
  goals: Goal[]
  formats: string[]
  priceMin: number | null
  priceMax: number | null
  stimFree: boolean
  inStockOnly: boolean
  onDealOnly: boolean
  subscribable: boolean
  minRating: number | null
  sort: ShopSort
}

export const EMPTY_QUERY: ShopQuery = {
  q: '',
  dietary: [],
  categories: [],
  goals: [],
  formats: [],
  priceMin: null,
  priceMax: null,
  stimFree: false,
  inStockOnly: false,
  onDealOnly: false,
  subscribable: false,
  minRating: null,
  sort: 'relevance',
}

/**
 * Nothing at all is narrowing the shop — the "Clear all" affordance's enabled
 * state, and the reset target.
 *
 * Not the browse/results switch: see `needsResultsView`, which is a narrower
 * question. Sort is excluded here deliberately — a sort with no filter and no
 * query has nothing to reorder.
 */
export function isEmptyQuery(query: ShopQuery): boolean {
  return (
    query.q.trim() === '' &&
    query.dietary.length === 0 &&
    query.categories.length === 0 &&
    query.goals.length === 0 &&
    query.formats.length === 0 &&
    query.priceMin === null &&
    query.priceMax === null &&
    !query.stimFree &&
    !query.inStockOnly &&
    !query.onDealOnly &&
    !query.subscribable &&
    query.minRating === null
  )
}

/**
 * True when the query asks for something the category shelves cannot show.
 *
 * This — not `isEmptyQuery` — is the browse/results switch, because the shelves
 * are already a filtered view: the dietary chips have always narrowed every
 * shelf in place, and that works. Ticking "Vegan" should keep you on the
 * shelves, exactly as it does today; typing "magnesium", or asking for a price
 * range or a sort order, is what the horizontal decks genuinely cannot express.
 *
 * Categories are on the results side despite having a shelf each: picking two of
 * them is a comparison, and scrolling between two decks is not how you make one.
 */
export function needsResultsView(query: ShopQuery): boolean {
  return (
    query.q.trim() !== '' ||
    query.categories.length > 0 ||
    query.goals.length > 0 ||
    query.formats.length > 0 ||
    query.priceMin !== null ||
    query.priceMax !== null ||
    query.stimFree ||
    query.inStockOnly ||
    query.onDealOnly ||
    query.subscribable ||
    query.minRating !== null ||
    query.sort !== 'relevance'
  )
}

/** How many filters are on — the number on the "Filters (3)" button. */
export function activeFilterCount(query: ShopQuery): number {
  let count =
    query.dietary.length + query.categories.length + query.goals.length + query.formats.length
  if (query.priceMin !== null || query.priceMax !== null) count++
  if (query.stimFree) count++
  if (query.inStockOnly) count++
  if (query.onDealOnly) count++
  if (query.subscribable) count++
  if (query.minRating !== null) count++
  return count
}

// ─── Predicates ────────────────────────────────────────────────────────────────

/** Buyable right now — at least one variant the supplier says is in stock. */
function isInStock(product: CatalogueProduct): boolean {
  return product.variants.some((v) => v.available)
}

/**
 * One product against one set of constraints.
 *
 * Split out from `applyShopQuery` because `facetCounts` needs to run it with a
 * facet knocked out, and a second copy of these rules that drifts from the first
 * is how a filter panel starts lying about its counts.
 */
function matches(product: CatalogueProduct, query: ShopQuery): boolean {
  if (!query.dietary.every((tag) => product.dietaryTags.includes(tag))) return false
  if (query.categories.length > 0 && !query.categories.includes(product.category)) return false
  if (query.goals.length > 0 && !query.goals.some((g) => product.goals.includes(g))) return false
  if (query.formats.length > 0) {
    const formats = product.formats.map((f) => f.toLowerCase())
    if (!query.formats.some((f) => formats.includes(f.toLowerCase()))) return false
  }

  const { price, onDeal } = dealInfo(product)
  if (query.priceMin !== null && price < query.priceMin) return false
  if (query.priceMax !== null && price > query.priceMax) return false

  if (query.stimFree && product.hasStimulants) return false
  if (query.inStockOnly && !isInStock(product)) return false
  if (query.onDealOnly && !onDeal) return false
  if (query.subscribable && !product.subscriptionEligible) return false
  if (query.minRating !== null) {
    if (!hasRating(product.rating) || product.rating.average < query.minRating) return false
  }
  return true
}

// ─── Sorting ───────────────────────────────────────────────────────────────────

/**
 * There is no "Newest" sort because `CatalogueProduct` has no created-at field.
 * Deriving one from import order would look like information and be noise, and a
 * missing sort is better than a lying one.
 */
function sortProducts(products: CatalogueProduct[], sort: ShopSort): CatalogueProduct[] {
  const out = [...products]
  switch (sort) {
    case 'price-asc':
      return out.sort((a, b) => dealInfo(a).price - dealInfo(b).price)
    case 'price-desc':
      return out.sort((a, b) => dealInfo(b).price - dealInfo(a).price)
    case 'saving':
      return out.sort((a, b) => dealInfo(b).pct - dealInfo(a).pct)
    case 'rating':
      // Unrated products sink rather than sorting as zero-star, which would read
      // as "rated badly" for something nobody has reviewed yet.
      return out.sort((a, b) => {
        const ra = hasRating(a.rating) ? a.rating.average : -1
        const rb = hasRating(b.rating) ? b.rating.average : -1
        if (rb !== ra) return rb - ra
        return (b.rating?.count ?? 0) - (a.rating?.count ?? 0)
      })
    case 'relevance':
    case 'featured':
    default:
      // Catalogue order — already the engine's own ranking.
      return out
  }
}

// ─── Applying ──────────────────────────────────────────────────────────────────

export interface ShopQueryResult {
  products: CatalogueProduct[]
  /** The query actually applied, after phrasing was folded in. */
  effective: ShopQuery
  /** What the phrasing implied, for the UI to show back (SS2 renders it as chips). */
  intent: QueryIntent
  /** Intent phrases that fired, in the shopper's words. */
  matchedPhrases: string[]
  /** True when results only exist because of the one-edit fallback pass. */
  fuzzy: boolean
}

/**
 * Merge what the phrasing implied into the filters the shopper set by hand.
 *
 * Hand-set filters WIN. Someone who has explicitly ticked a box has said
 * something more definite than someone who typed a word that we guessed at, and
 * having a chip they set silently overridden by their own search text is the
 * most confusing failure this code could have.
 */
function mergeIntent(query: ShopQuery, intent: QueryIntent): ShopQuery {
  const merged: ShopQuery = { ...query }
  if (intent.dietary) {
    merged.dietary = [...new Set([...query.dietary, ...intent.dietary])]
  }
  if (intent.stimFree && !merged.stimFree) merged.stimFree = true
  if (intent.onDealOnly && !merged.onDealOnly) merged.onDealOnly = true
  if (intent.inStockOnly && !merged.inStockOnly) merged.inStockOnly = true
  if (intent.subscribable && !merged.subscribable) merged.subscribable = true
  if (intent.priceMax !== undefined && query.priceMax === null) merged.priceMax = intent.priceMax
  if (intent.priceMin !== undefined && query.priceMin === null) merged.priceMin = intent.priceMin
  // Sort is the exception to "hand-set wins" only in that `relevance` is the
  // default nobody chose, so a phrasing like "cheapest" may claim it.
  if (intent.sort && query.sort === 'relevance') merged.sort = intent.sort
  return merged
}

/**
 * Run a query over the catalogue: parse the phrasing, search the text, apply the
 * filters, sort the survivors.
 *
 * Order matters. Search runs BEFORE filtering so `relevance` order is available
 * to sort by, and filtering runs on the hits rather than the other way round so
 * a filtered-out product cannot occupy a relevance slot.
 */
export function applyShopQuery(
  products: CatalogueProduct[],
  query: ShopQuery,
  index?: SearchIndex,
): ShopQueryResult {
  const raw = query.q.trim()
  const parsed = raw ? parseQuery(raw) : { text: '', intent: {}, matchedPhrases: [] }
  const effective = mergeIntent(query, parsed.intent)

  let candidates: CatalogueProduct[]
  let fuzzy = false

  if (parsed.text) {
    const searchIndex = index ?? buildIndex(products)
    const result = searchProducts(searchIndex, parsed.text)
    fuzzy = result.fuzzy
    candidates = result.hits.map((hit) => hit.product)
  } else {
    candidates = products
  }

  const filtered = candidates.filter((p) => matches(p, effective))

  // Relevance is only meaningful when there was text to be relevant to. Without
  // it, "relevance" means the catalogue's own order — which is what `featured`
  // is, so the two coincide and `sortProducts` leaves the order alone.
  const sorted = sortProducts(filtered, effective.sort)

  return { products: sorted, effective, intent: parsed.intent, matchedPhrases: parsed.matchedPhrases, fuzzy }
}

// ─── Facets ────────────────────────────────────────────────────────────────────

export interface FacetCounts {
  dietary: Record<string, number>
  categories: Record<string, number>
  goals: Record<string, number>
  formats: Record<string, number>
  stimFree: number
  inStockOnly: number
  onDealOnly: number
  subscribable: number
}

/**
 * How many products each facet option would leave.
 *
 * Every count is computed with that facet's OWN constraint removed. This is the
 * detail that decides whether a filter panel feels good or feels broken: with
 * the constraint left in, every option you have not selected reads "0" and the
 * only escape is Clear All. It is the sort of thing people notice without being
 * able to name.
 *
 * Cheap at this catalogue size — a handful of passes over tens of products.
 */
export function facetCounts(products: CatalogueProduct[], query: ShopQuery): FacetCounts {
  const countWith = (patch: Partial<ShopQuery>, predicate: (p: CatalogueProduct) => boolean) => {
    const relaxed = { ...query, ...patch }
    return products.filter((p) => matches(p, relaxed) && predicate(p)).length
  }

  const dietary: Record<string, number> = {}
  for (const tag of collect(products, (p) => p.dietaryTags)) {
    dietary[tag] = countWith({ dietary: query.dietary.filter((t) => t !== tag) }, (p) =>
      p.dietaryTags.includes(tag as DietaryTag),
    )
  }

  const categories: Record<string, number> = {}
  for (const category of collect(products, (p) => [p.category])) {
    categories[category] = countWith({ categories: [] }, (p) => p.category === category)
  }

  const goals: Record<string, number> = {}
  for (const goal of collect(products, (p) => p.goals)) {
    goals[goal] = countWith({ goals: [] }, (p) => p.goals.includes(goal as Goal))
  }

  const formats: Record<string, number> = {}
  for (const format of collect(products, (p) => p.formats.map((f) => f.toLowerCase()))) {
    formats[format] = countWith({ formats: [] }, (p) =>
      p.formats.some((f) => f.toLowerCase() === format),
    )
  }

  return {
    dietary,
    categories,
    goals,
    formats,
    stimFree: countWith({ stimFree: false }, (p) => !p.hasStimulants),
    inStockOnly: countWith({ inStockOnly: false }, isInStock),
    onDealOnly: countWith({ onDealOnly: false }, (p) => dealInfo(p).onDeal),
    subscribable: countWith({ subscribable: false }, (p) => p.subscriptionEligible),
  }
}

/** Every distinct value a product field takes across the catalogue. */
function collect(products: CatalogueProduct[], pick: (p: CatalogueProduct) => string[]): string[] {
  const seen = new Set<string>()
  for (const product of products) for (const value of pick(product)) if (value) seen.add(value)
  return [...seen]
}
