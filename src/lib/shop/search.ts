import type { CatalogueProduct } from '@/lib/catalogue/types'
import { SLOT_LABELS } from '@/lib/catalogue/types'
import { GOAL_LABELS } from '@/lib/quiz-goals'
import { DIETARY_LABEL } from '@/lib/product-facts'

/**
 * Shop search: a weighted, in-memory index over the catalogue.
 *
 * There is no `/api/search`, deliberately. `lib/catalogue/load.ts` exists
 * because the quiz and the reveal reading different catalogues produced £0.00
 * "Product unavailable" cards — a search endpoint would reintroduce exactly that
 * split, a second server-side opinion about what is sellable. The whole
 * catalogue is already in the browser (one `/api/catalogue` response, shared by
 * every caller), so search is a filter over what we are certainly showing.
 *
 * Two properties matter more than raw ranking quality:
 *
 *   · It searches what the product IS, not just what it is CALLED. A title-only
 *     match throws away `goals`, `stackSlots`, `actives` and the variant
 *     flavours — which is most of what people actually type.
 *   · Relevance is never sold. `marginPriority` is not an input here and must
 *     not become one; see `compareHits` and the test that asserts it. A search
 *     that puts the profitable answer above the correct one costs more trust
 *     than the margin is worth.
 */

// ─── Field weights ─────────────────────────────────────────────────────────────

/**
 * What a match in each field is worth. Exported so the ordering can be asserted
 * rather than admired: the ranking is only defensible while `title` outranks
 * `description`, and that is easy to lose in a later edit.
 */
export const FIELD_WEIGHTS = {
  /** They typed the name. */
  title: 10,
  shortName: 10,
  /** "protein", "creatine" — the name of a shelf. */
  category: 8,
  swapGroup: 8,
  /** "sleep", "recovery", "hydration" — what it is FOR. */
  goal: 6,
  slot: 6,
  /** "chocolate", "500g" are real queries people type. */
  variant: 5,
  dietary: 4,
  format: 4,
  /** "magnesium glycinate", "beta alanine". */
  active: 3,
  /** Last resort, and noisy — hence the floor. */
  description: 2,
} as const

/** An exact whole-token hit is worth double a prefix hit of the same field. */
const EXACT_MULTIPLIER = 2

/** Below this length a prefix match is too loose to be worth anything. */
const MIN_PREFIX_LENGTH = 2

/** Fuzzy matching only ever applies to tokens at least this long. */
const MIN_FUZZY_LENGTH = 4

/** Awarded once when a product matched every token in the query. */
const ALL_TOKENS_BONUS = 6

// ─── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Lowercase, strip accents and punctuation, collapse whitespace.
 *
 * Punctuation becomes a space rather than nothing, so "pre-workout" tokenises as
 * two tokens and is reachable by typing "pre workout" — which is how most people
 * write it.
 */
export function normalise(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9£%]+/g, ' ')
    .trim()
}

/** Normalise and split. Single-character tokens are dropped as noise. */
export function tokenize(input: string): string[] {
  const normalised = normalise(input)
  if (!normalised) return []
  return normalised.split(' ').filter((t) => t.length > 1)
}

// ─── The index ─────────────────────────────────────────────────────────────────

interface IndexedProduct {
  product: CatalogueProduct
  /** Token → the best weight that token carries on this product. */
  tokens: Map<string, number>
  /** Catalogue position, so `featured` order and stable sorting survive. */
  position: number
}

export interface SearchIndex {
  entries: IndexedProduct[]
  /** Every distinct token in the index — the "did you mean" vocabulary. */
  vocabulary: string[]
}

/** A product's searchable text, field by field, with what each field is worth. */
function fieldsOf(product: CatalogueProduct): Array<{ text: string; weight: number }> {
  const fields: Array<{ text: string; weight: number }> = [
    { text: product.title, weight: FIELD_WEIGHTS.title },
    { text: product.category, weight: FIELD_WEIGHTS.category },
    { text: product.swapGroup, weight: FIELD_WEIGHTS.swapGroup },
    { text: product.description, weight: FIELD_WEIGHTS.description },
    { text: product.shortReason, weight: FIELD_WEIGHTS.description },
  ]

  if (product.shortName) fields.push({ text: product.shortName, weight: FIELD_WEIGHTS.shortName })

  // Goals and slots are indexed by their LABEL as well as their id: nobody types
  // "sleep-better", they type "sleep", and nobody types "vegan-support" at all.
  for (const goal of product.goals) {
    fields.push({ text: goal, weight: FIELD_WEIGHTS.goal })
    if (GOAL_LABELS[goal]) fields.push({ text: GOAL_LABELS[goal], weight: FIELD_WEIGHTS.goal })
  }
  for (const slot of product.stackSlots) {
    fields.push({ text: slot, weight: FIELD_WEIGHTS.slot })
    if (SLOT_LABELS[slot]) fields.push({ text: SLOT_LABELS[slot], weight: FIELD_WEIGHTS.slot })
  }
  for (const tag of product.dietaryTags) {
    fields.push({ text: tag, weight: FIELD_WEIGHTS.dietary })
    if (DIETARY_LABEL[tag]) fields.push({ text: DIETARY_LABEL[tag], weight: FIELD_WEIGHTS.dietary })
  }
  for (const format of product.formats) {
    fields.push({ text: format, weight: FIELD_WEIGHTS.format })
  }
  for (const variant of product.variants) {
    if (variant.flavour) fields.push({ text: variant.flavour, weight: FIELD_WEIGHTS.variant })
    if (variant.size) fields.push({ text: variant.size, weight: FIELD_WEIGHTS.variant })
  }
  for (const active of product.actives ?? []) {
    fields.push({ text: active.name, weight: FIELD_WEIGHTS.active })
  }

  return fields
}

/**
 * Build the token → weight map for one product.
 *
 * A token that appears in several fields keeps the HIGHEST weight rather than
 * the sum. Summing would let a long description outrank a title, which is the
 * single most common way a naive weighted index goes wrong.
 */
function indexProduct(product: CatalogueProduct, position: number): IndexedProduct {
  const tokens = new Map<string, number>()
  for (const { text, weight } of fieldsOf(product)) {
    for (const token of tokenize(text)) {
      const existing = tokens.get(token)
      if (existing === undefined || weight > existing) tokens.set(token, weight)
    }
  }
  return { product, tokens, position }
}

/**
 * Index the catalogue. Cheap enough to rebuild whenever the catalogue changes —
 * tens of products, a few hundred tokens each — so there is no invalidation
 * protocol to get wrong.
 */
export function buildIndex(products: CatalogueProduct[]): SearchIndex {
  const entries = products.map(indexProduct)
  const vocabulary = new Set<string>()
  for (const entry of entries) for (const token of entry.tokens.keys()) vocabulary.add(token)
  return { entries, vocabulary: [...vocabulary] }
}

// ─── Fuzzy matching ────────────────────────────────────────────────────────────

/**
 * True when `a` and `b` are one edit apart — a substitution, an insertion, a
 * deletion, or a transposition of adjacent characters (Damerau).
 *
 * Bounded at one edit and written as a single walk rather than a distance
 * matrix, because that is all we need and the matrix is the expensive part.
 * Identical strings return false: the caller has already tried exact matching,
 * and "did you mean the thing you typed" is not a suggestion.
 */
export function isNearMatch(a: string, b: string): boolean {
  if (a === b) return false
  const diff = a.length - b.length
  if (diff > 1 || diff < -1) return false

  if (diff === 0) {
    let mismatches = 0
    let first = -1
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        mismatches++
        if (first === -1) first = i
        if (mismatches > 2) return false
      }
    }
    if (mismatches === 1) return true
    // Two mismatches are only forgivable as one transposition of neighbours.
    if (mismatches === 2) {
      return a[first] === b[first + 1] && a[first + 1] === b[first] && a.slice(first + 2) === b.slice(first + 2)
    }
    return false
  }

  // One string is a character longer: walk both, allowing a single skip.
  const longer = diff === 1 ? a : b
  const shorter = diff === 1 ? b : a
  let i = 0
  let j = 0
  let skipped = false
  while (i < longer.length && j < shorter.length) {
    if (longer[i] === shorter[j]) {
      i++
      j++
      continue
    }
    if (skipped) return false
    skipped = true
    i++
  }
  return true
}

/**
 * The closest indexed term to a mistyped one, or null.
 *
 * Used only by the empty state ("Did you mean creatine?"). Prefers the term that
 * appears on the most products, so a typo resolves towards a real shelf rather
 * than a one-off word buried in a description.
 */
export function suggestTerm(index: SearchIndex, input: string): string | null {
  const tokens = tokenize(input)
  const frequency = new Map<string, number>()
  for (const entry of index.entries) {
    for (const token of entry.tokens.keys()) frequency.set(token, (frequency.get(token) ?? 0) + 1)
  }

  let best: string | null = null
  let bestCount = 0
  for (const token of tokens) {
    if (token.length < MIN_FUZZY_LENGTH) continue
    if (frequency.has(token)) continue // it is a real term — nothing to suggest
    for (const candidate of index.vocabulary) {
      if (!isNearMatch(token, candidate)) continue
      const count = frequency.get(candidate) ?? 0
      if (count > bestCount) {
        best = candidate
        bestCount = count
      }
    }
  }
  return best
}

// ─── Scoring ───────────────────────────────────────────────────────────────────

export interface SearchHit {
  product: CatalogueProduct
  score: number
  /** Which query tokens this product matched — for highlighting, and for tests. */
  matched: string[]
}

export interface SearchOptions {
  /**
   * Allow one-edit matches. Off by default: `searchProducts` turns it on for a
   * second pass only when the exact pass found nothing, so fuzzy matching can
   * never pollute a query that was already working.
   */
  fuzzy?: boolean
}

/** The best contribution a single query token can draw from one product. */
function tokenScore(entry: IndexedProduct, token: string, fuzzy: boolean): number {
  let best = 0
  for (const [indexed, weight] of entry.tokens) {
    if (indexed === token) {
      best = Math.max(best, weight * EXACT_MULTIPLIER)
      continue
    }
    if (token.length >= MIN_PREFIX_LENGTH && indexed.startsWith(token)) {
      best = Math.max(best, weight)
      continue
    }
    if (fuzzy && token.length >= MIN_FUZZY_LENGTH && isNearMatch(token, indexed)) {
      // Deliberately below a prefix hit: a guess should never outrank something
      // the shopper actually typed the start of.
      best = Math.max(best, weight / 2)
    }
  }
  return best
}

/** Is any variant of this product buyable right now? */
function inStock(product: CatalogueProduct): boolean {
  return product.variants.some((v) => v.available)
}

/**
 * Tie-breaks, in order: in stock, then the founders' roster position, then the
 * engine's recommendation priority, then how many people have reviewed it, then
 * title for stability.
 *
 * `marginPriority` is absent by design. Adding it here would make the shop's
 * answer to a direct question depend on what we earn from it — see the module
 * comment, and `search.test.ts`, which fails if it ever appears.
 */
function compareHits(a: SearchHit, b: SearchHit): number {
  if (b.score !== a.score) return b.score - a.score

  const stockDelta = Number(inStock(b.product)) - Number(inStock(a.product))
  if (stockDelta !== 0) return stockDelta

  const rankA = a.product.topRank ?? Number.MAX_SAFE_INTEGER
  const rankB = b.product.topRank ?? Number.MAX_SAFE_INTEGER
  if (rankA !== rankB) return rankA - rankB

  if (b.product.recommendationPriority !== a.product.recommendationPriority) {
    return b.product.recommendationPriority - a.product.recommendationPriority
  }

  const reviewsA = a.product.rating?.count ?? 0
  const reviewsB = b.product.rating?.count ?? 0
  if (reviewsA !== reviewsB) return reviewsB - reviewsA

  return a.product.title.localeCompare(b.product.title)
}

export interface SearchResult {
  hits: SearchHit[]
  /** True when the hits came from the one-edit fallback pass. */
  fuzzy: boolean
}

function runPass(index: SearchIndex, tokens: string[], fuzzy: boolean): SearchHit[] {
  const hits: SearchHit[] = []
  for (const entry of index.entries) {
    let score = 0
    const matched: string[] = []
    for (const token of tokens) {
      const contribution = tokenScore(entry, token, fuzzy)
      if (contribution > 0) {
        score += contribution
        matched.push(token)
      }
    }
    if (score === 0) continue
    // Matching the whole phrase beats matching more of one word.
    if (matched.length === tokens.length && tokens.length > 1) score += ALL_TOKENS_BONUS
    hits.push({ product: entry.product, score, matched })
  }
  return hits.sort(compareHits)
}

/**
 * Search the index. Exact first; a single one-edit pass only if that found
 * nothing, which is what keeps "creatiine" working without letting fuzzy
 * matching loosen queries that were already fine.
 */
export function searchProducts(index: SearchIndex, query: string, options: SearchOptions = {}): SearchResult {
  const tokens = tokenize(query)
  if (tokens.length === 0) return { hits: [], fuzzy: false }

  const exact = runPass(index, tokens, false)
  if (exact.length > 0 || options.fuzzy === false) return { hits: exact, fuzzy: false }

  const loose = runPass(index, tokens, true)
  return { hits: loose, fuzzy: loose.length > 0 }
}

// ─── Analytics hygiene ─────────────────────────────────────────────────────────

/** Anything that looks like a contact detail rather than a product query. */
const CONTACT_SHAPED = [/@/, /\d{6,}/]

/**
 * A search query, made safe to record.
 *
 * `/api/analytics` carries no PII today and this must not be the thing that
 * changes that. Search boxes collect whatever someone types, including the
 * occasional email address or order number pasted into the wrong field — so the
 * query is normalised, capped, and dropped entirely when it looks like contact
 * data. Returns null when there is nothing safe to send; callers omit the
 * property rather than sending a placeholder.
 */
export function queryForAnalytics(query: string): string | null {
  // Tested against the RAW string: normalisation strips "@", which would quietly
  // turn an email address into a query that looks perfectly innocuous.
  if (CONTACT_SHAPED.some((re) => re.test(query))) return null
  const normalised = normalise(query)
  if (!normalised) return null
  return normalised.slice(0, 64)
}
