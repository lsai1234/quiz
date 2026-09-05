/**
 * Leaving a stack to buy its products one at a time.
 *
 * ── What this is for ────────────────────────────────────────────────────────
 * The reveal offers one thing: the stack, as a subscription or a one-off, at
 * the price the quiz worked out. That is the product, and almost everybody
 * should take it.
 *
 * Some people will not. They want two of the five, or they want to buy one and
 * think about the rest, and the only door out of the reveal is "customise" —
 * which still ends in a stack. Those people currently leave. A quiet way to say
 * "buy these separately instead" turns an abandon into an order.
 *
 * ── The trade has to be stated before it is made ────────────────────────────
 * A partner's code takes 25% off, and it works on stacks and subscriptions, not
 * on single products off the shelf (see `worksOn` in `lib/partners/redeem`).
 * So somebody who walks out of their stack and buys à la carte pays full price.
 *
 * That is a legitimate choice and a bad surprise. It is put in front of them
 * BEFORE they go, in the sentence that offers the door — not discovered at
 * checkout when the total is higher than the one they were just shown.
 *
 * ── The partner is still paid ───────────────────────────────────────────────
 * They introduced this customer. Losing the discount is the customer's own
 * decision; the partner losing their commission for it is not, and until this
 * flow existed that is exactly what happened — a code that could not discount a
 * shop basket was dropped entirely, so the order recorded no partner at all.
 *
 * A referral code on a basket it cannot discount now attributes at 0% off. See
 * `redeemPartnerCode`'s `attributionOnly`.
 *
 * ── The stack is not thrown away ────────────────────────────────────────────
 * It stays in the quiz store, and the shop shows a way back to it for as long
 * as the tab is open. Somebody who leaves to look at prices and thinks better
 * of it must not have to redo the quiz to get their discount back.
 *
 * Pure: no DOM at module scope, no network. The two browser functions guard
 * their own access so this can be imported from a server component.
 */

/** Where the shop's "back to your stack" link goes. */
export const STACK_RETURN_HREF = '/#stack'

/**
 * The hash that reopens the reveal.
 *
 * The scroll experience is one route with five acts and no URL of its own, so
 * "go back to my stack" has nowhere to point. The hash is read once on arrival
 * and cleared, the same trick `/shop#basket` uses to open the basket drawer
 * from a page that does not own it.
 */
export const STACK_RETURN_HASH = '#stack'

/** Set while a shopper is in the shop having left their stack behind. */
const KEY = 'chrgd.from-stack'

export interface StackHandoff {
  /** How many products the stack had, for the copy. */
  items: number
  /** The discount they are giving up, 0–1. Zero when they had no code. */
  discountPct: number
}

/**
 * Remember that this shopper came out of a stack.
 *
 * `sessionStorage`, not a query parameter: the flag has to survive them
 * browsing around the shop, and a parameter is lost on the first link they
 * follow. It is not `localStorage` either — coming back in a week to a bar
 * about a stack you have forgotten is worse than not having one.
 */
export function markCameFromStack(handoff: StackHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(handoff))
  } catch {
    /* Private mode, blocked storage. The shop simply shows no bar. */
  }
}

/** What they left behind, or null. */
export function readStackHandoff(): StackHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StackHandoff>
    const items = Number(parsed.items)
    if (!Number.isFinite(items) || items <= 0) return null
    const pct = Number(parsed.discountPct)
    return { items, discountPct: Number.isFinite(pct) ? Math.min(1, Math.max(0, pct)) : 0 }
  } catch {
    return null
  }
}

/** Forget it — they went back, or they checked out. */
export function clearStackHandoff(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}

/**
 * What the shopper is giving up, in words, or null when it is nothing.
 *
 * Null for somebody with no code: telling them they are "losing 0%" invents a
 * loss to warn them about, and the warning is only worth making when it is
 * true. They still get the door, just without the caveat.
 */
export function whatIsLost(discountPct: number): string | null {
  if (!discountPct || discountPct <= 0) return null
  return `${Math.round(discountPct * 100)}% off`
}
