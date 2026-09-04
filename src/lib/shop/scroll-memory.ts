/**
 * Where the shopper was on the shelf.
 *
 * The browser restores scroll on a back-navigation, but not usefully here: the
 * shop fetches its catalogue on the client, so at the moment the browser tries
 * to restore, the page is a skeleton a fraction of its final height and the
 * restore clamps to the bottom of that. Coming back from a product page landed
 * you near the top, every time, however far down you had been.
 *
 * So the position is remembered explicitly and reapplied once the shelves are
 * actually there. `sessionStorage`, because it is per-tab and should not
 * outlive the session — a position from yesterday is not where you were.
 */

const KEY = 'chrgd:shop-scroll'

/** Every access is guarded: a private window or blocked site data throws. */
export function rememberScroll(y: number): void {
  try {
    sessionStorage.setItem(KEY, String(Math.round(y)))
  } catch {
    /* Not remembering where you were is a small loss; a crash is not. */
  }
}

export function readScroll(): number | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw === null) return null
    const y = Number(raw)
    return Number.isFinite(y) && y >= 0 ? y : null
  } catch {
    return null
  }
}

export function forgetScroll(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* Nothing to do. */
  }
}
