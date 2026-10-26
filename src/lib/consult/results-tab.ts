/**
 * The consult whose results this tab is showing.
 *
 * Set when the consult hands off, cleared when the visitor starts something
 * else. Tab-scoped, like the consult's own "this tab was running it" marker
 * (`persist.ts`): a refresh on the results page reopens them, a new tab the
 * next day does not.
 *
 * Its own tiny module, with no imports, so the home page can ask "is there a
 * consult's results page to rebuild?" without loading any of the consult's
 * code; `results.ts` does the rebuilding, loaded only when the answer is yes.
 */

export const RESULTS_SESSION_KEY = 'chrgd-consult-results'

function tab(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function markResultsOpen(consultId: string): void {
  try {
    tab()?.setItem(RESULTS_SESSION_KEY, consultId)
  } catch {
    // Storage unavailable: a reload lands on the hero, as it did before.
  }
}

export function clearResultsOpen(): void {
  try {
    tab()?.removeItem(RESULTS_SESSION_KEY)
  } catch {
    // Nothing to do.
  }
}

/** The consult id this tab's results page belongs to, or null. */
export function resultsOpenFor(): string | null {
  try {
    return tab()?.getItem(RESULTS_SESSION_KEY) ?? null
  } catch {
    return null
  }
}

/**
 * "Change my answers" on the results page, for a customer: the home page
 * reopens the consult on its review. A plain hash so a click fires
 * `hashchange` on the page that is already open.
 */
export const CHANGE_ANSWERS_HASH = '#change-answers'
