/**
 * Telling the quiz that this visit is a partner claiming their starter stack.
 *
 * ── What this carries, and what it deliberately does not ────────────────────
 * An INTENT, not a credential. It says "the person in this tab pressed Claim my
 * free stack a minute ago"; it proves nothing about who they are.
 *
 * Who they are comes from the partner session cookie, which is httpOnly, set
 * when they signed the agreement, and checked server-side by `/api/cart`. That
 * split is the whole design: nothing a browser can write decides whether an
 * order is free.
 *
 * ── Why the code is gone ────────────────────────────────────────────────────
 * There used to be a `PS-…` code here, typed into the discount box like any
 * other. It worked, and it was the wrong shape:
 *
 *   • It made a partner do admin. Read a code, hold it across a ninety-second
 *     quiz, find the discount box, paste it — four steps to receive a gift.
 *   • It put a 100%-off string into the world. Single-use and capped, but still
 *     a thing that could be screenshotted, forwarded and tried.
 *   • It made the free stack look like a discount, which it is not. A discount
 *     comes off a price; this replaces the journey.
 *
 * The link from the portal is now the only door, and pressing the button in it
 * is the only way to open this flag.
 *
 * ── Why `sessionStorage` ────────────────────────────────────────────────────
 * The intent belongs to this visit. It survives the quiz and a refresh, and
 * dies with the tab — where a cookie would sit for weeks and quietly turn an
 * ordinary order into a claim long after they meant it.
 *
 * Pure: no DOM at module scope. Every function guards its own access so this
 * can be imported from a server component.
 */

const KEY = 'chrgd.claiming-starter'

/** They pressed the button. This visit is a claim. */
export function markClaimingStarter(): void {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    /* Private mode, blocked storage. The quiz runs as an ordinary quiz and the
       partner is told at the end why their stack is not free, which is a bad
       day but an honest one. */
  }
}

/** Is this visit a claim? */
export function isClaimingStarter(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Forget it.
 *
 * Called when the order is placed, not when the reveal reads it. A refresh
 * restarts the quiz (the blueprint is deliberately not persisted), and a
 * partner made to redo the quiz must not silently lose the free stack they
 * came for. Once it is spent, leaving the flag would make their NEXT quiz look
 * like a claim and end in a refusal.
 */
export function clearClaim(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}
