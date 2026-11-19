import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import type { Goal } from '@/lib/types'
import { GOALS_DATA, WELLBEING_DATA } from '@/lib/quiz-goals'
import { applyShopQuery, type ShopQuery, type ShopSort } from './shop-query'
import type { SearchIndex } from './search'
import { parseQuery, stripPhrase } from './synonyms'

/**
 * The finder: "Choose it myself" at the top of the shop.
 *
 * Five quick questions, one at a time, each of which is one of the shop's own
 * filters. The finder keeps no answers of its own. It reads `ShopQuery` to know
 * what is answered and writes `ShopQuery` to answer, so the address bar, the
 * chips in the filter bar, the shelves and the finder can never disagree: remove
 * a chip and the question it came from is open again; open a shared link and
 * the finder is already filled in.
 *
 * Counts come from `applyShopQuery`, the function the shelves themselves run,
 * so "Vegan · 12" is the twelve the shelves will then show, search text and all.
 */

export type FinderQuestionId = 'goal' | 'avoid' | 'format' | 'budget' | 'sort'

export interface FinderOption {
  id: string
  label: string
  /** A `QuizIcon` name, for the goals: the same glyphs as the quiz and the goal row. */
  icon?: string
}

export interface FinderQuestion {
  id: FinderQuestionId
  title: string
  /** `multi` toggles any number and moves on with Next; `single` moves on as soon as it's picked. */
  kind: 'single' | 'multi'
  options: FinderOption[]
  /** The "nothing / any" answer: clears the question and moves on. */
  none?: string
  /** False for the one question that orders rather than narrows. */
  counts: boolean
}

/** The goals, in the finder's words. Short, so a row of them can be scanned. */
const GOAL_LABEL: Record<Goal, string> = {
  muscle: 'Build muscle',
  cutting: 'Get lean',
  bulking: 'Bulk up',
  energy: 'Energy',
  performance: 'Performance',
  recovery: 'Recovery',
  hydration: 'Hydration',
  health: 'Everyday health',
  'sleep-better': 'Sleep',
  'less-stress': 'Stress',
  focus: 'Focus',
  immune: 'Immune',
  'skin-hair-nails': 'Skin, hair & nails',
  'gut-health': 'Gut health',
  menopause: 'Menopause',
}

/** The quiz's goal order, so the two agree on what exists and in what order. */
const GOAL_ORDER = [...GOALS_DATA, ...WELLBEING_DATA]

/** "Anything you avoid?", as the dietary tag (or caffeine) that answers it. */
const AVOID: Array<{ id: DietaryTag | 'caffeine'; label: string }> = [
  { id: 'vegan', label: 'Animal products' },
  { id: 'dairy-free', label: 'Dairy' },
  { id: 'gluten-free', label: 'Gluten' },
  { id: 'nut-free', label: 'Nuts' },
  { id: 'caffeine', label: 'Caffeine' },
]

const FORMAT_LABEL: Record<string, string> = {
  powder: 'Scoop and shake',
  capsules: 'Capsules',
  tablets: 'Tablets',
  effervescent: 'Fizzy tablets',
  liquid: 'Ready to drink',
  gummies: 'Gummies',
  bar: 'Bars',
  bars: 'Bars',
}

/** Budget ceilings on offer, kept to the ones below the dearest product. */
const BUDGETS = [15, 20, 30, 40]

const SORTS: Array<{ id: ShopSort; label: string }> = [
  { id: 'relevance', label: 'Best match' },
  { id: 'rating', label: 'Top rated' },
  { id: 'price-asc', label: 'Lowest price' },
  { id: 'saving', label: 'Biggest saving' },
]

const formatLabel = (f: string) => FORMAT_LABEL[f] ?? f.charAt(0).toUpperCase() + f.slice(1)

/**
 * The questions this catalogue can answer. An option nothing in the shop could
 * match is left out altogether: a goal no product serves, a format nobody sells.
 */
export function finderQuestions(products: CatalogueProduct[]): FinderQuestion[] {
  const goals = new Set(products.flatMap((p) => p.goals))
  const dietary = new Set(products.flatMap((p) => p.dietaryTags))
  const anyStims = products.some((p) => p.hasStimulants)
  const formats = [...new Set(products.flatMap((p) => p.formats.map((f) => f.toLowerCase())))]
  const dearest = products.reduce((max, p) => Math.max(max, p.basePrice), 0)

  return [
    {
      id: 'goal',
      title: "What's it for?",
      kind: 'single',
      counts: true,
      options: GOAL_ORDER.filter((g) => goals.has(g.id)).map((g) => ({ id: g.id, label: GOAL_LABEL[g.id] ?? g.label, icon: g.icon })),
    },
    {
      id: 'avoid',
      title: 'Anything you avoid?',
      kind: 'multi',
      counts: true,
      none: 'Nothing',
      options: AVOID.filter((a) => (a.id === 'caffeine' ? anyStims : dietary.has(a.id))),
    },
    {
      id: 'format',
      title: 'How do you like to take it?',
      kind: 'single',
      counts: true,
      none: "Don't mind",
      options: formats.map((f) => ({ id: f, label: formatLabel(f) })),
    },
    {
      id: 'budget',
      title: 'Spend per product?',
      kind: 'single',
      counts: true,
      none: 'Any price',
      options: BUDGETS.filter((b) => b < dearest).map((b) => ({ id: String(b), label: `Under £${b}` })),
    },
    {
      id: 'sort',
      title: 'Show the best first by',
      kind: 'single',
      counts: false,
      options: SORTS,
    },
  ]
}

// ─── Reading and writing the query ────────────────────────────────────────────

/** Is this option part of the query right now? */
export function isSelected(query: ShopQuery, question: FinderQuestionId, option: string): boolean {
  switch (question) {
    case 'goal':
      return query.goals.includes(option as Goal)
    case 'avoid':
      return option === 'caffeine' ? query.stimFree : query.dietary.includes(option as DietaryTag)
    case 'format':
      return query.formats.some((f) => f.toLowerCase() === option)
    case 'budget':
      return query.priceMax === Number(option)
    case 'sort':
      return query.sort === option
  }
}

/** Does the query already say something about this question? */
export function isAnswered(query: ShopQuery, question: FinderQuestionId): boolean {
  switch (question) {
    case 'goal':
      return query.goals.length > 0
    case 'avoid':
      return query.dietary.length > 0 || query.stimFree
    case 'format':
      return query.formats.length > 0
    case 'budget':
      return query.priceMax !== null
    case 'sort':
      return query.sort !== 'relevance'
  }
}

/**
 * Pick an option. A single-answer question replaces its answer (and picking the
 * one already picked takes it back off); a multi-answer one toggles.
 */
export function pick(query: ShopQuery, question: FinderQuestionId, option: string): ShopQuery {
  const on = isSelected(query, question, option)
  switch (question) {
    case 'goal':
      return { ...query, goals: on ? [] : [option as Goal] }
    case 'avoid':
      if (option === 'caffeine') return { ...query, stimFree: !on }
      return {
        ...query,
        dietary: on ? query.dietary.filter((d) => d !== option) : [...query.dietary, option as DietaryTag],
      }
    case 'format':
      return { ...query, formats: on ? [] : [option] }
    case 'budget':
      return { ...query, priceMax: on ? null : Number(option) }
    case 'sort':
      return { ...query, sort: option as ShopSort }
  }
}

/** The "nothing / any" answer: the question says nothing about the shop. */
export function clearAnswer(query: ShopQuery, question: FinderQuestionId): ShopQuery {
  switch (question) {
    case 'goal':
      return { ...query, goals: [] }
    case 'avoid':
      return { ...query, dietary: [], stimFree: false }
    case 'format':
      return { ...query, formats: [] }
    case 'budget':
      return { ...query, priceMax: null }
    case 'sort':
      return { ...query, sort: 'relevance' }
  }
}

/** How many products the shop shows for this query: the shelves' own count. */
export function countFor(products: CatalogueProduct[], query: ShopQuery, index?: SearchIndex): number {
  return applyShopQuery(products, query, index).products.length
}

/**
 * How many products picking this option would leave. For an option already
 * picked, what the shop shows now. Null for the question that only orders.
 */
export function optionCount(
  products: CatalogueProduct[],
  query: ShopQuery,
  question: FinderQuestion,
  option: string,
  index?: SearchIndex,
): number | null {
  if (!question.counts) return null
  const next = isSelected(query, question.id, option) ? query : pick(query, question.id, option)
  return countFor(products, next, index)
}

/**
 * Where the finder should be: the first question nothing has answered and the
 * shopper hasn't moved past, or the end.
 */
export function firstOpen(questions: FinderQuestion[], query: ShopQuery, passed: ReadonlySet<FinderQuestionId> = new Set()): number {
  const i = questions.findIndex((q) => !isAnswered(query, q.id) && !passed.has(q.id))
  return i === -1 ? questions.length : i
}

/**
 * True when every filter on is one the finder sets, so the finder can show the
 * query as its answers. Search text is left to the caller: typed into the
 * finder, it belongs to the finder; typed into the search box, it doesn't.
 */
export function finderCanShow(query: ShopQuery): boolean {
  return (
    query.categories.length === 0 &&
    query.slots.length === 0 &&
    query.goals.length <= 1 &&
    query.formats.length <= 1 &&
    query.priceMin === null &&
    !query.inStockOnly &&
    !query.onDealOnly &&
    !query.subscribable &&
    query.minRating === null
  )
}

// ─── Typed answers ────────────────────────────────────────────────────────────

/**
 * Goal words someone might type. Names of the goals only, the same words the
 * goal row and the quiz already show, never a promise about what a product does.
 */
const GOAL_WORDS: Record<string, Goal> = {
  muscle: 'muscle',
  strength: 'muscle',
  lean: 'cutting',
  cutting: 'cutting',
  bulk: 'bulking',
  bulking: 'bulking',
  energy: 'energy',
  performance: 'performance',
  recovery: 'recovery',
  hydration: 'hydration',
  sleep: 'sleep-better',
  stress: 'less-stress',
  focus: 'focus',
  immune: 'immune',
  immunity: 'immune',
  skin: 'skin-hair-nails',
  gut: 'gut-health',
  menopause: 'menopause',
}

const FORMAT_WORDS: Record<string, string> = {
  powder: 'powder',
  powders: 'powder',
  capsule: 'capsules',
  capsules: 'capsules',
  caps: 'capsules',
  fizzy: 'effervescent',
  effervescent: 'effervescent',
  gummies: 'gummies',
}

/** The phrasing the finder turns into answers. Anything else stays search text. */
const FOLDED = new Set(['dietary', 'stimFree', 'priceMax', 'sort'])

export interface TypedAnswer {
  query: ShopQuery
  /** The words that became answers, in the shopper's own words, to show back. */
  matched: string[]
  /** Which questions those words answered. */
  answered: FinderQuestionId[]
}

/**
 * "Vegan protein under £40", read into answers.
 *
 * The phrasing rules are the search box's own (`parseQuery`): diets, caffeine,
 * price ceilings and sort words become the filters they stand for. A goal word
 * and a format word become those answers too. What's left ("protein") is
 * searched for, as it would be from the search box. Everything runs here in the
 * browser: nothing typed is sent anywhere.
 *
 * Answers already given stay unless the words say otherwise.
 */
export function readTyped(raw: string, query: ShopQuery, formats: readonly string[]): TypedAnswer {
  const parsed = parseQuery(raw)
  const matched = [...parsed.matchedPhrases]
  const answered = new Set<FinderQuestionId>()
  let next: ShopQuery = { ...query }
  // Commas and the like are not words: "sleep capsules, no caffeine" is three answers.
  let rest = raw.replace(/[^\p{L}\p{N}£.\s-]/gu, ' ')

  const { intent } = parsed
  if (intent.dietary?.length) {
    next.dietary = [...new Set([...next.dietary, ...intent.dietary])]
    answered.add('avoid')
  }
  if (intent.stimFree) {
    next.stimFree = true
    answered.add('avoid')
  }
  if (intent.priceMax !== undefined) {
    next.priceMax = intent.priceMax
    answered.add('budget')
  }
  if (intent.sort) {
    next.sort = intent.sort
    answered.add('sort')
  }
  // The phrases the finder turned into answers come out of the text; any other
  // phrase ("on sale") stays in, for the shop's search to read as it always has.
  for (const phrase of parsed.matchedPhrases) {
    const own = parseQuery(phrase).intent
    const keys = Object.keys(own)
    if (keys.length > 0 && keys.every((k) => FOLDED.has(k))) rest = stripPhrase(rest, phrase)
  }

  const words = rest.toLowerCase().split(/[^a-z£0-9]+/).filter(Boolean)
  const goalWord = words.find((w) => GOAL_WORDS[w])
  if (goalWord) {
    next.goals = [GOAL_WORDS[goalWord]]
    matched.push(goalWord)
    answered.add('goal')
    rest = stripPhrase(rest, goalWord)
  }
  const formatWord = words.find((w) => FORMAT_WORDS[w] && formats.includes(FORMAT_WORDS[w]))
  if (formatWord) {
    next.formats = [FORMAT_WORDS[formatWord]]
    matched.push(formatWord)
    answered.add('format')
    rest = stripPhrase(rest, formatWord)
  }

  rest = rest.replace(/\s+/g, ' ').trim()
  if (rest) matched.push(rest)
  next = { ...next, q: rest }
  return { query: next, matched, answered: [...answered] }
}
