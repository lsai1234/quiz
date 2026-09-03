import { normalise } from './search'

/**
 * The last few things someone searched for, kept in their own browser.
 *
 * Deliberately `localStorage` and nothing else. A recent-search list is a
 * convenience, not a record: it is worth nothing to us on a server, it is one of
 * the more revealing things a supplement shop could store about a person (a
 * search history here is a list of what someone thinks is wrong with them), and
 * `/api/analytics` already answers the only question the business has — what
 * people search for in aggregate, with contact-shaped queries dropped.
 *
 * So it never leaves the device, and every access is wrapped: storage throws
 * outright in some private-browsing modes, and a shop that white-screens because
 * someone opened it in a locked-down browser would be a poor trade for a list of
 * five strings.
 */

export const RECENT_SEARCHES_KEY = 'chrgd.shop.recent-searches'

/** Enough to be useful, few enough to scan without scrolling. */
export const MAX_RECENT_SEARCHES = 5

/** A query longer than this is a sentence, not something to re-run by tapping. */
const MAX_LENGTH = 60

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v.length <= MAX_LENGTH)
      .slice(0, MAX_RECENT_SEARCHES)
  } catch {
    // Unavailable, disabled, or holding something that is not ours. Either way
    // there are no recent searches, which is a perfectly good answer.
    return []
  }
}

function write(values: string[]): void {
  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(values))
  } catch {
    /* nothing to do — the list is a convenience, not state we depend on */
  }
}

/** The stored list, most recent first. Never throws; empty when unavailable. */
export function readRecentSearches(): string[] {
  if (typeof window === 'undefined') return []
  return read()
}

/**
 * Record a search, and return the new list.
 *
 * Compared on the NORMALISED form so "Whey Protein" does not sit above "whey
 * protein" as if they were different searches — but the shopper's own spelling
 * and casing is what gets stored and shown back.
 */
export function rememberSearch(query: string): string[] {
  if (typeof window === 'undefined') return []
  const trimmed = query.trim().slice(0, MAX_LENGTH)
  if (!trimmed) return read()

  const key = normalise(trimmed)
  if (!key) return read()

  const next = [trimmed, ...read().filter((v) => normalise(v) !== key)].slice(0, MAX_RECENT_SEARCHES)
  write(next)
  return next
}

/** Forget everything. Offered in the dropdown, because it should be one tap. */
export function clearRecentSearches(): string[] {
  if (typeof window === 'undefined') return []
  try {
    window.localStorage.removeItem(RECENT_SEARCHES_KEY)
  } catch {
    /* see the module comment */
  }
  return []
}
