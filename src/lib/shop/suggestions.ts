import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import type { Goal } from '@/lib/types'
import { ALL_GOALS } from '@/lib/types'
import { GOAL_LABELS } from '@/lib/quiz-goals'
import { DIETARY_LABEL } from '@/lib/product-facts'
import { groupByCategory } from './categories'
import { normalise, searchProducts, type SearchIndex } from './search'
import { parseQuery } from './synonyms'

/**
 * What the search box offers while you type.
 *
 * Three kinds of row, in the order they earn their place:
 *
 *   1. **Products** — the answer, when the answer is one product. Most searches
 *      here are for a thing ("creatine", "magnesium"), and the fastest path is
 *      straight into its sheet rather than through a results grid.
 *   2. **Jumps** — a whole shelf, when the words name one. "Sleep" is not a
 *      product, it is a category and a goal, and offering "Sleep · 3 products"
 *      turns a vague search into a filter the shopper chose.
 *   3. **Recents** — only on an empty box, because they answer a different
 *      question ("what was I doing") and would be noise beside real matches.
 *   4. **Examples** — also only on an empty box, and only to fill the space
 *      recents have not. Nothing on the page tells a shopper that a whole
 *      sentence works here, and a placeholder cannot carry that; a tappable
 *      "vegan protein under £30" teaches it in one go.
 *
 * Everything here is pure so it can be tested without a DOM: the component
 * renders this list and owns nothing but the keyboard.
 */

/** How many product rows at most. Beyond this the results grid is the right UI. */
export const MAX_PRODUCT_SUGGESTIONS = 5

/** How many shelf jumps at most, so products always dominate the list. */
export const MAX_JUMP_SUGGESTIONS = 3

/** Below this many characters a suggestion list is guesswork, not help. */
const MIN_QUERY_LENGTH = 2

export type JumpFacet = 'category' | 'goal' | 'dietary'

export type Suggestion =
  | { kind: 'product'; id: string; product: CatalogueProduct }
  | { kind: 'jump'; id: string; facet: JumpFacet; value: string; label: string; count: number }
  | { kind: 'recent'; id: string; query: string }
  | { kind: 'example'; id: string; query: string }

/**
 * Sentences the shop can actually read, offered on an empty box.
 *
 * Every one is parseable by `synonyms.ts` AND returns products today — an
 * example that needed the AI fallback, or that came back empty, would teach the
 * wrong lesson twice over. `suggestions.test.ts` runs each one through
 * `applyShopQuery` against the real catalogue, so a price bound that outlives
 * the products behind it fails the build rather than the shopper.
 */
export const EXAMPLE_QUERIES = [
  'vegan protein under £40',
  'stim free pre workout',
  'something for sleep',
  'cheapest electrolytes',
] as const

/** Rows an empty box aims to fill, between recents and examples. */
const EMPTY_BOX_ROWS = 4

export interface SuggestionInput {
  index: SearchIndex
  products: CatalogueProduct[]
  /** The raw, undebounced input value — suggestions track the box, not the results. */
  query: string
  recent: string[]
}

/** Every facet value the catalogue actually carries, with its label and size. */
interface FacetOption {
  facet: JumpFacet
  value: string
  label: string
  count: number
}

function facetOptions(products: CatalogueProduct[]): FacetOption[] {
  const options: FacetOption[] = []

  for (const section of groupByCategory(products)) {
    options.push({
      facet: 'category',
      value: section.category,
      label: section.category,
      count: section.products.length,
    })
  }

  for (const goal of ALL_GOALS) {
    const count = products.filter((p) => p.goals.includes(goal)).length
    if (count > 0) options.push({ facet: 'goal', value: goal, label: GOAL_LABELS[goal] ?? goal, count })
  }

  for (const tag of Object.keys(DIETARY_LABEL) as DietaryTag[]) {
    const count = products.filter((p) => p.dietaryTags.includes(tag)).length
    if (count > 0) options.push({ facet: 'dietary', value: tag, label: DIETARY_LABEL[tag], count })
  }

  return options
}

/**
 * Does this facet's name start with what they have typed?
 *
 * Prefix, not substring: "gut" should offer Gut Health, but "health" should not
 * drag in Gut Health alongside Health — a jump row is a strong suggestion and a
 * loose match makes it a wrong one.
 */
function labelMatches(label: string, tokens: string[]): boolean {
  const words = normalise(label).split(' ')
  return tokens.some((token) => words.some((word) => word.startsWith(token)))
}

/**
 * Build the suggestion list for the current box.
 *
 * An empty (or one-character) box shows recent searches and nothing else. From
 * two characters, products lead and shelf jumps follow — and recents drop away,
 * because by then the shopper is answering the question rather than reopening it.
 */
export function buildSuggestions({ index, products, query, recent }: SuggestionInput): Suggestion[] {
  const trimmed = query.trim()

  if (normalise(trimmed).length < MIN_QUERY_LENGTH) {
    const rows: Suggestion[] = recent.map((q) => ({ kind: 'recent', id: `recent:${q}`, query: q }))
    // Examples fill what history has not — a shopper with a full history has
    // already learned what the box does.
    const seen = new Set(recent.map((q) => normalise(q)))
    for (const example of EXAMPLE_QUERIES) {
      if (rows.length >= EMPTY_BOX_ROWS) break
      if (seen.has(normalise(example))) continue
      rows.push({ kind: 'example', id: `example:${example}`, query: example })
    }
    return rows
  }

  // Parsed, not raw: "vegan protein" should suggest proteins, and the search
  // text the parser hands back is the part that is actually a product name.
  const parsed = parseQuery(trimmed)
  const text = parsed.text || normalise(trimmed)
  const tokens = normalise(trimmed).split(' ').filter(Boolean)

  const suggestions: Suggestion[] = []

  for (const hit of searchProducts(index, text).hits.slice(0, MAX_PRODUCT_SUGGESTIONS)) {
    suggestions.push({ kind: 'product', id: `product:${hit.product.id}`, product: hit.product })
  }

  const jumps = facetOptions(products)
    .filter((option) => labelMatches(option.label, tokens))
    // The biggest shelf first: a jump is only worth offering if it lands
    // somewhere worth being.
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_JUMP_SUGGESTIONS)

  for (const jump of jumps) {
    suggestions.push({
      kind: 'jump',
      id: `jump:${jump.facet}:${jump.value}`,
      facet: jump.facet,
      value: jump.value,
      label: jump.label,
      count: jump.count,
    })
  }

  return suggestions
}

/** A jump row, as the change it makes to the query. */
export function jumpPatch(suggestion: Extract<Suggestion, { kind: 'jump' }>): {
  categories?: string[]
  goals?: Goal[]
  dietary?: DietaryTag[]
} {
  switch (suggestion.facet) {
    case 'category':
      return { categories: [suggestion.value] }
    case 'goal':
      return { goals: [suggestion.value as Goal] }
    case 'dietary':
      return { dietary: [suggestion.value as DietaryTag] }
  }
}
