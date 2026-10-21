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
 * What leaving costs depends on what is on the stack, and less is lost than it
 * looks:
 *
 *   • A partner's code works on stacks and subscriptions, not on single
 *     products off the shelf (see `worksOn` in `lib/partners/redeem`). Its
 *     discount stays behind.
 *   • A store code (the founders' campaign codes, the daily code) works on
 *     single products too — `redeemPartnerCode`'s store-code exception — and
 *     so does a founder code (`founderCodeWorksOn` admits the shop). Nothing is
 *     lost, but the code is held in the results page's state and does not
 *     travel with the products. Only a code from a `?ref=` link comes back by
 *     itself, because the basket's code box re-applies the cookie.
 *   • The one-off bundle deal (`bundleTiers`) is priced in the shop basket by
 *     the same `priceOneOffLines` as the stack, so it stays for as long as the
 *     basket stays over the threshold.
 *
 * Losing a partner's discount is a legitimate choice and a bad surprise. It is
 * put in front of them BEFORE they go, in the sentences that offer the door
 * (`leavingStackNotes`) — not discovered at checkout when the total is higher
 * than the one they were just shown.
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
 * ── The stack is not thrown away, but it is not saved either ────────────────
 * It stays in the quiz store, and the shop shows a way back to it. That store
 * holds the blueprint in memory only (`partialize` in `lib/store`): it survives
 * a client-side trip to the shop and back, not a reload. So neither screen
 * says it is saved.
 *
 * Pure: no DOM at module scope, no network. The two browser functions guard
 * their own access so this can be imported from a server component.
 */

import type { CodeKind } from '@/components/checkout/PartnerCodeBox'
import { formatGBP, getPricingConfig, resolveTier, type DiscountTier } from '@/lib/stack-blueprint/pricing'

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
  /**
   * The discount they are giving up, 0–1: a partner's code, the only kind that
   * does not work in the shop. Zero when they had none. See `stackOnlyRate`.
   */
  discountPct: number
}

/**
 * Remember that this shopper came out of a stack.
 *
 * `sessionStorage`, not a query parameter: the flag has to survive them
 * browsing around the shop, and a parameter is lost on the first link they
 * follow. It is not `localStorage` either — coming back in a week to a bar
 * about a stack you have forgotten is worse than not having one.
 *
 * `discountPct` is the stack-only part (`stackOnlyRate`), never a store code's
 * rate: that code works in the shop, so the bar has nothing to say about it.
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
 * Pass the stack-only rate (`stackOnlyRate`), not any code's rate: a store code
 * is not given up by going to the shop.
 *
 * Null for somebody with no such code: telling them they are "losing 0%"
 * invents a loss to warn them about, and the warning is only worth making when
 * it is true. They still get the door, just without the caveat.
 */
export function whatIsLost(discountPct: number): string | null {
  if (!discountPct || discountPct <= 0) return null
  return `${Math.round(discountPct * 100)}% off`
}

/**
 * The part of a code's rate (0–1) that stays behind with the stack.
 *
 * A partner's code only. A store code and a founder code work on single
 * products as well, so leaving costs neither of them anything. A code of
 * unknown kind is read as a partner's: warning of a loss that turns out not to
 * be one costs less than missing one that is real.
 */
export function stackOnlyRate(kind: CodeKind | null | undefined, rate: number): number {
  if (kind === 'store' || kind === 'founder') return 0
  return Number.isFinite(rate) && rate > 0 ? Math.min(1, rate) : 0
}

export interface LeavingStack {
  /** The applied code as the receipt names it, or null. */
  code: string | null
  kind: CodeKind | null
  /** The code's rate, 0–1. Zero for a founder code, which rewrites prices instead. */
  rate: number
  /** Each product's price, one of each — what the shop basket will be given. */
  prices: number[]
}

const pounds = (n: number) => (Number.isInteger(n) ? `£${n}` : formatGBP(n))

/** "is £50 or more", "has 3 or more products" — the tier's own condition. */
function tierCondition(tier: DiscountTier): string | null {
  const parts: string[] = []
  if (tier.minSubtotal != null && tier.minSubtotal > 0) parts.push(`is ${pounds(tier.minSubtotal)} or more`)
  if (tier.minItems != null && tier.minItems > 1) parts.push(`has ${tier.minItems} or more products`)
  return parts.length > 0 ? parts.join(' and ') : null
}

/**
 * What changes when this stack's products go to the shop, one sentence for each
 * thing that actually applies. Empty when nothing changes.
 *
 * The bundle deal is read from the live `bundleTiers` against the basket these
 * products make, through the same `resolveTier` the basket prices with — so
 * the threshold and rate are the ones the shop will charge, not a copy of them.
 * It is left out when a code that works in the shop covers it.
 */
export function leavingStackNotes(stack: LeavingStack, config = getPricingConfig()): string[] {
  const notes: string[] = []
  const subtotal = Math.round(stack.prices.reduce((sum, p) => sum + p, 0) * 100) / 100
  const { tier } = resolveTier(config.bundleTiers, subtotal, stack.prices.length)
  const tierRate = tier?.discountPct ?? 0

  const lost = whatIsLost(stackOnlyRate(stack.kind, stack.rate))
  if (lost) {
    notes.push(`${stack.code ?? 'Your code'} works on stacks and subscriptions, not single products, so its ${lost} won’t apply in the shop.`)
  }

  const travels = stack.code !== null && (stack.kind === 'store' || stack.kind === 'founder')
  if (travels) {
    notes.push(`${stack.code} works on single products too. If your shop basket doesn’t show it, enter it there.`)
  }

  const covered = travels && (stack.kind === 'founder' || stack.rate >= tierRate)
  if (tier && tierRate > 0 && !covered) {
    const pct = `${Math.round(tierRate * 1000) / 10}%`
    const condition = tierCondition(tier)
    notes.push(
      condition
        ? `The shop takes ${pct} off when your basket ${condition}.`
        : `The shop takes ${pct} off too.`,
    )
  }

  return notes
}
