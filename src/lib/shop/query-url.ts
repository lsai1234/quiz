import type { DietaryTag, StackSlot } from '@/lib/catalogue/types'
import { STACK_SLOTS } from '@/lib/catalogue/types'
import type { Goal } from '@/lib/types'
import { ALL_GOALS } from '@/lib/types'
import { DIETARY_LABEL } from '@/lib/product-facts'
import { EMPTY_QUERY, SHOP_SORTS, type ShopQuery, type ShopSort } from './shop-query'

/**
 * A `ShopQuery` in a URL, and back.
 *
 * The point is that a narrowed shop is a place, not a mood. Before this, filter
 * state lived in component state: it could not be shared, bookmarked, linked
 * from an email, or survive a reload. `/shop?q=magnesium&d=vegan&sort=price-asc`
 * now restores exactly.
 *
 * ── Two rules ────────────────────────────────────────────────────────────────
 *
 * 1. **Keys are short**, because a URL people are meant to share has to survive
 *    being read aloud and pasted into a message. `d` not `dietaryTags`.
 *
 * 2. **`decodeShopQuery` never throws.** Someone will hand-edit this, a link
 *    will be truncated by a mail client, and a category we no longer stock will
 *    outlive its products. Every value is validated against what the app
 *    actually accepts and silently dropped otherwise — a shop that renders a
 *    crash screen because a stale link says `sort=cheapest` is worse than one
 *    that quietly ignores it.
 */

const KEYS = {
  q: 'q',
  dietary: 'd',
  categories: 'c',
  goals: 'g',
  slots: 'sl',
  formats: 'f',
  priceMin: 'min',
  priceMax: 'max',
  stimFree: 'stim',
  inStockOnly: 'stock',
  onDealOnly: 'deal',
  subscribable: 'sub',
  minRating: 'r',
  sort: 'sort',
} as const

/**
 * Caps on anything free-text. Not paranoia about attacks — the values are only
 * ever compared against catalogue strings — but a 40kB `?c=` should not become
 * 40kB of comparisons on every keystroke.
 */
const MAX_VALUES = 20
const MAX_VALUE_LENGTH = 64
const MAX_QUERY_LENGTH = 120

const DIETARY_TAGS = Object.keys(DIETARY_LABEL) as DietaryTag[]

// ─── Encoding ──────────────────────────────────────────────────────────────────

/**
 * Only what differs from `EMPTY_QUERY` is written, so a plain shop keeps a plain
 * URL and a shared link contains exactly the narrowing that was on screen.
 */
export function encodeShopQuery(query: ShopQuery): URLSearchParams {
  const params = new URLSearchParams()
  const q = query.q.trim()
  if (q) params.set(KEYS.q, q)
  if (query.dietary.length > 0) params.set(KEYS.dietary, query.dietary.join(','))
  if (query.categories.length > 0) params.set(KEYS.categories, query.categories.join(','))
  if (query.goals.length > 0) params.set(KEYS.goals, query.goals.join(','))
  if (query.slots.length > 0) params.set(KEYS.slots, query.slots.join(','))
  if (query.formats.length > 0) params.set(KEYS.formats, query.formats.join(','))
  if (query.priceMin !== null) params.set(KEYS.priceMin, String(query.priceMin))
  if (query.priceMax !== null) params.set(KEYS.priceMax, String(query.priceMax))
  if (query.stimFree) params.set(KEYS.stimFree, '1')
  if (query.inStockOnly) params.set(KEYS.inStockOnly, '1')
  if (query.onDealOnly) params.set(KEYS.onDealOnly, '1')
  if (query.subscribable) params.set(KEYS.subscribable, '1')
  if (query.minRating !== null) params.set(KEYS.minRating, String(query.minRating))
  if (query.sort !== EMPTY_QUERY.sort) params.set(KEYS.sort, query.sort)
  return params
}

/** The query as a query string, with the `?`, or '' when nothing is narrowing. */
export function shopQuerySearch(query: ShopQuery): string {
  const params = encodeShopQuery(query).toString()
  return params ? `?${params}` : ''
}

// ─── Decoding ──────────────────────────────────────────────────────────────────

function list(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key)
  if (!raw) return []
  return [...new Set(
    raw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v.length <= MAX_VALUE_LENGTH),
  )].slice(0, MAX_VALUES)
}

/** A positive, finite money value, or null. Rejects `-5`, `abc`, `Infinity`. */
function money(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key)
  if (raw === null) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100) / 100
}

function flag(params: URLSearchParams, key: string): boolean {
  return params.get(key) === '1'
}

/**
 * Read a URL into a query.
 *
 * Unknown keys are ignored; unrecognised values are dropped rather than carried
 * through as strings nothing will ever match. Categories and formats are the
 * exception — they are catalogue-defined, so they cannot be validated here and
 * are passed through as given. A category we have stopped stocking then filters
 * to nothing, which `ShopNoResults` already handles gracefully.
 */
export function decodeShopQuery(input: URLSearchParams | string | null | undefined): ShopQuery {
  if (!input) return EMPTY_QUERY
  let params: URLSearchParams
  try {
    params = typeof input === 'string' ? new URLSearchParams(input) : input
  } catch {
    return EMPTY_QUERY
  }

  const sortRaw = params.get(KEYS.sort)
  const sort: ShopSort = (SHOP_SORTS as readonly string[]).includes(sortRaw ?? '')
    ? (sortRaw as ShopSort)
    : EMPTY_QUERY.sort

  const rating = money(params, KEYS.minRating)

  return {
    q: (params.get(KEYS.q) ?? '').slice(0, MAX_QUERY_LENGTH),
    dietary: list(params, KEYS.dietary).filter((t): t is DietaryTag => DIETARY_TAGS.includes(t as DietaryTag)),
    categories: list(params, KEYS.categories),
    goals: list(params, KEYS.goals).filter((g): g is Goal => ALL_GOALS.includes(g as Goal)),
    slots: list(params, KEYS.slots).filter((sl): sl is StackSlot => STACK_SLOTS.includes(sl as StackSlot)),
    formats: list(params, KEYS.formats),
    priceMin: money(params, KEYS.priceMin),
    priceMax: money(params, KEYS.priceMax),
    stimFree: flag(params, KEYS.stimFree),
    inStockOnly: flag(params, KEYS.inStockOnly),
    onDealOnly: flag(params, KEYS.onDealOnly),
    subscribable: flag(params, KEYS.subscribable),
    // A star rating above 5 would filter to nothing forever, with no control on
    // screen able to explain why.
    minRating: rating !== null && rating <= 5 ? rating : null,
    sort,
  }
}
