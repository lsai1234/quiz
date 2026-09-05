/**
 * Carrying a starter code from the page that issued it to the checkout that
 * spends it.
 *
 * ── The step this removes ───────────────────────────────────────────────────
 * A partner finished signing, was shown an eight-character code, and had to get
 * it into a box on a different page with a ninety-second quiz in between. Close
 * the tab, lose the clipboard, take a phone call — and they are back in their
 * account hunting for it. It was the last manual step in the journey and the
 * only one that could strand somebody holding a free stack they could not
 * spend.
 *
 * ── Why this is not the referral cookie ─────────────────────────────────────
 * A starter is deliberately kept out of `partner_ref`, and this does not
 * quietly put it back. The two are different objects:
 *
 *   • `partner_ref` is a THIRTY-DAY cookie, settable by anyone with a URL
 *     (`?ref=…`), read on every visit. A starter in it would apply itself to an
 *     unrelated order weeks later and silently spend a partner's one free box.
 *   • This is `sessionStorage`, written only by our own signing page, to the
 *     one tab that just signed, and gone when that tab closes. It carries a
 *     decision the partner made ten seconds ago across a single navigation.
 *
 * That is the distinction the checkout cares about: not "typed versus stored",
 * but "did a person just choose this, in front of us". `PartnerCodeBox` applies
 * a starter from here and refuses one from the cookie for exactly that reason.
 *
 * Pure: no DOM at module scope. Both functions guard their own access so this
 * can be imported from a server component.
 */

const KEY = 'chrgd.starter-code'

/** Hand the code to the quiz the partner is about to take. */
export function carryStarterCode(code: string): void {
  try {
    sessionStorage.setItem(KEY, code)
  } catch {
    /* Private mode, blocked storage. They still have the code on screen and the
       box still takes it — this removes a step, it is not load-bearing. */
  }
}

/** The code this tab is carrying, or null. */
export function readStarterCode(): string | null {
  try {
    return sessionStorage.getItem(KEY) || null
  } catch {
    return null
  }
}

/**
 * Forget it.
 *
 * Called when the order is placed, not when the code is applied. A refresh
 * mid-reveal restarts the quiz (the blueprint is deliberately not persisted),
 * and a partner who has to redo the quiz must not also have to go and find
 * their code again. Once it is spent, though, leaving it would re-apply a used
 * code to their next stack and refuse it — a confusing end to a journey that
 * has just worked.
 */
export function clearStarterCode(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}
