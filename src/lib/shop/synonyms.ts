import type { DietaryTag } from '@/lib/catalogue/types'
import type { ShopSort } from './shop-query'
import { normalise } from './search'

/**
 * How people actually talk, translated into what the catalogue actually holds.
 *
 * Two tables, deliberately separate, because they do different things:
 *
 *   · EXPANSIONS add search TEXT. "pwo" becomes "pre workout", which the index
 *     already knows about. Nothing structural happens.
 *   · INTENTS set STATE. "no caffeine" is not a word to search for — it is
 *     `stimFree: true`, a filter. Searching for the text would return every
 *     product whose description mentions caffeine, i.e. the exact opposite.
 *
 * ── A synonym is copy ────────────────────────────────────────────────────────
 * Every phrase here is run through `isClaimSafe()` in `synonyms.test.ts`. That
 * is not ceremony. The day someone maps "hangover cure" to electrolytes we have
 * published a medical claim, in a lookup table, where no copy review will ever
 * look for it. The lint is the only thing standing between a helpful-seeming
 * synonym and a regulatory problem.
 */

// ─── Expansions ────────────────────────────────────────────────────────────────

export interface Expansion {
  /** What someone types. Matched on normalised whole tokens. */
  phrase: string
  /** Tokens added to the search alongside the original. */
  expandsTo: string[]
}

/**
 * Term expansions. Additive only — the shopper's own words are always still
 * searched, so an expansion can widen a result set but never replace it.
 */
export const EXPANSIONS: Expansion[] = [
  // Pre-workout, written every way it gets written. ("pre workout" needs no
  // entry of its own — the index tokenises "pre-workout" to the same two words.)
  { phrase: 'pwo', expandsTo: ['pre', 'workout'] },
  { phrase: 'preworkout', expandsTo: ['pre', 'workout'] },

  // Category vernacular.
  { phrase: 'salts', expandsTo: ['electrolytes', 'hydration'] },
  { phrase: 'electrolyte', expandsTo: ['hydration'] },
  { phrase: 'shake', expandsTo: ['powder', 'protein'] },
  { phrase: 'gym', expandsTo: ['performance'] },
  { phrase: 'aminos', expandsTo: ['amino', 'acids', 'recovery'] },
  { phrase: 'eaa', expandsTo: ['amino', 'acids'] },
  { phrase: 'bcaa', expandsTo: ['amino', 'acids'] },
  { phrase: 'probiotics', expandsTo: ['probiotic', 'gut'] },
  { phrase: 'greens', expandsTo: ['gut', 'health'] },

  // Goals, in the words people use for them rather than our slugs.
  { phrase: 'gains', expandsTo: ['muscle'] },
  { phrase: 'bulk', expandsTo: ['muscle'] },
  { phrase: 'mass', expandsTo: ['bulking', 'muscle'] },
  { phrase: 'lean', expandsTo: ['cutting'] },
  { phrase: 'tired', expandsTo: ['energy'] },
  { phrase: 'brain fog', expandsTo: ['focus'] },
  { phrase: 'immunity', expandsTo: ['immune'] },
  { phrase: 'joints', expandsTo: ['recovery'] },
  { phrase: 'sore', expandsTo: ['recovery'] },
  { phrase: 'cramp', expandsTo: ['hydration', 'magnesium'] },

  // Dietary, colloquially. Hyphenated tags ("dairy-free") need no entry: they
  // already tokenise to the two words someone would type.
  { phrase: 'veggie', expandsTo: ['vegetarian'] },
  { phrase: 'plant based', expandsTo: ['vegan'] },
]

// ─── Intents ───────────────────────────────────────────────────────────────────

/**
 * Structured state inferred from a query. Every field is optional — an intent
 * says only what it knows, and `applyShopQuery` merges it over the filters the
 * shopper set by hand.
 */
export interface QueryIntent {
  stimFree?: boolean
  onDealOnly?: boolean
  inStockOnly?: boolean
  subscribable?: boolean
  priceMin?: number
  priceMax?: number
  sort?: ShopSort
  dietary?: DietaryTag[]
}

interface IntentRule {
  phrase: string
  intent: QueryIntent
}

/**
 * Phrases that mean a filter rather than a word.
 *
 * Longest phrase first at match time, so "caffeine free" is consumed whole and
 * never leaves a stray "free" behind to be searched for.
 */
export const INTENT_RULES: IntentRule[] = [
  { phrase: 'no caffeine', intent: { stimFree: true } },
  { phrase: 'caffeine free', intent: { stimFree: true } },
  { phrase: 'stim free', intent: { stimFree: true } },
  { phrase: 'stimulant free', intent: { stimFree: true } },
  { phrase: 'without caffeine', intent: { stimFree: true } },
  { phrase: 'decaf', intent: { stimFree: true } },

  { phrase: 'on offer', intent: { onDealOnly: true } },
  { phrase: 'on sale', intent: { onDealOnly: true } },
  { phrase: 'reduced', intent: { onDealOnly: true } },
  { phrase: 'discounted', intent: { onDealOnly: true } },

  { phrase: 'in stock', intent: { inStockOnly: true } },
  { phrase: 'available now', intent: { inStockOnly: true } },

  { phrase: 'subscription', intent: { subscribable: true } },
  { phrase: 'subscribe', intent: { subscribable: true } },
  { phrase: 'monthly', intent: { subscribable: true } },

  { phrase: 'cheapest', intent: { sort: 'price-asc' } },
  { phrase: 'cheap', intent: { sort: 'price-asc' } },
  { phrase: 'budget', intent: { sort: 'price-asc' } },
  { phrase: 'best rated', intent: { sort: 'rating' } },
  { phrase: 'top rated', intent: { sort: 'rating' } },
  { phrase: 'highest rated', intent: { sort: 'rating' } },
  { phrase: 'biggest saving', intent: { sort: 'saving' } },

  { phrase: 'vegan', intent: { dietary: ['vegan'] } },
  { phrase: 'vegetarian', intent: { dietary: ['vegetarian'] } },
  { phrase: 'halal', intent: { dietary: ['halal'] } },
  { phrase: 'keto', intent: { dietary: ['keto-friendly'] } },
  { phrase: 'nut free', intent: { dietary: ['nut-free'] } },
]

/**
 * Price bounds, but only when the shopper was explicit about the direction.
 *
 * A bare "£30" is deliberately NOT read as a ceiling. It is at least as likely
 * to mean "around £30" or to be part of a product name, and until the parse is
 * shown back as an editable chip (SS2) a silent wrong filter is worse than no
 * filter — it removes products with no way to see why.
 */
const PRICE_PATTERNS: Array<{ re: RegExp; bound: 'priceMax' | 'priceMin' }> = [
  { re: /\b(?:under|below|less than|cheaper than|max|up to)\s*£?\s*(\d+(?:\.\d{1,2})?)\b/, bound: 'priceMax' },
  { re: /\b(?:over|above|more than|from|at least|min)\s*£?\s*(\d+(?:\.\d{1,2})?)\b/, bound: 'priceMin' },
]

export interface ParsedQuery {
  /** What is left to search for once intent phrases have been consumed. */
  text: string
  /** Everything the phrasing implied. */
  intent: QueryIntent
  /** The intent phrases that fired, in the shopper's own words — for the UI. */
  matchedPhrases: string[]
}

/** Whole-token phrase match, so "veganism" never fires the "vegan" rule. */
function containsPhrase(haystack: string, phrase: string): boolean {
  return new RegExp(`(?:^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`).test(haystack)
}

function removePhrase(haystack: string, phrase: string): string {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return haystack.replace(new RegExp(`(?:^| )${escaped}(?= |$)`, 'g'), ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Read a raw query into search text plus structured intent.
 *
 * Order matters: prices first (they are the most specific), then intent phrases
 * longest-first, then expansions over whatever survives. Each intent phrase is
 * REMOVED from the text — "stim free pre workout" should search for "pre
 * workout" with the filter set, not search for the word "free".
 *
 * Dietary phrases are removed like any other intent, and the tag is the only
 * thing that decides the question. Leaving "vegan" in the text as well made it
 * count twice — once as a filter, once as a term the dietary tag itself matched
 * — so "vegan protein" returned every vegan product in the shop, protein or
 * not. The tag is the source of truth for whether something is vegan; a title
 * that says so without the tag to back it is a catalogue bug, not a match.
 */
export function parseQuery(raw: string): ParsedQuery {
  const intent: QueryIntent = {}
  const matchedPhrases: string[] = []

  // Prices come off the RAW string, before normalisation, because normalising
  // turns "25.50" into two tokens and a ceiling of £25 is not the one they
  // asked for. Everything after this point works on normalised text.
  let source = raw.toLowerCase()
  for (const { re, bound } of PRICE_PATTERNS) {
    const match = source.match(re)
    if (!match) continue
    const value = Number(match[1])
    if (!Number.isFinite(value) || value <= 0) continue
    intent[bound] = value
    matchedPhrases.push(match[0].trim())
    source = source.replace(match[0], ' ')
  }

  let text = normalise(source)

  const byLength = [...INTENT_RULES].sort((a, b) => b.phrase.length - a.phrase.length)
  for (const rule of byLength) {
    if (!containsPhrase(text, rule.phrase)) continue
    matchedPhrases.push(rule.phrase)
    if (rule.intent.dietary) {
      intent.dietary = [...new Set([...(intent.dietary ?? []), ...rule.intent.dietary])]
    } else {
      Object.assign(intent, rule.intent)
    }
    text = removePhrase(text, rule.phrase)
  }

  return { text: expand(text), intent, matchedPhrases }
}

/**
 * Append expansion tokens to the query text. Additive: the original words stay,
 * so an expansion can only ever widen the result set.
 */
export function expand(text: string): string {
  if (!text) return text
  const added: string[] = []
  for (const { phrase, expandsTo } of EXPANSIONS) {
    if (!containsPhrase(text, phrase)) continue
    for (const token of expandsTo) {
      if (!containsPhrase(text, token) && !added.includes(token)) added.push(token)
    }
  }
  return added.length > 0 ? `${text} ${added.join(' ')}` : text
}
