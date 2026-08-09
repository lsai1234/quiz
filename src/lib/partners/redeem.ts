/**
 * Redeeming a partner's code — the one place a code turns into money off.
 *
 * Every checkout path goes through `redeemPartnerCode`, and none of them decide
 * anything for themselves. The browser sends a string; what comes back is either
 * a validated discount or a reason, and the reason is always sayable out loud.
 * A code that quietly does nothing is the worst outcome available here: the
 * customer believes they got a discount and the partner believes they earned a
 * commission, and neither is true.
 *
 * The discount **replaces** the bundle or subscription rate the order would
 * otherwise have earned rather than stacking on top of it, and it only applies
 * to curated bundles, quiz stacks and subscriptions — not to general shop
 * sales. See `docs/PARTNER_PROGRAMME_BUILD.md` §0 D2. The margin floor still
 * applies per line underneath, so nothing is ever sold below cost.
 *
 * Server-only.
 */
import { checkCode, normaliseCode } from './codes'
import * as repo from './repo'
import type { Partner, PartnerCode } from './types'

/**
 * What is being bought. `quiz` covers both journeys that build a stack — the
 * quiz itself and the curated bundle landing pages — because both check out
 * through `/api/cart` carrying a `quiz` source.
 */
export type RedeemChannel = 'quiz' | 'subscription' | 'shop'

/**
 * Where a code works.
 *
 * Bundles, quiz stacks and subscriptions only. A code is an acquisition cost
 * paid to bring someone into the programme, and it is priced against what a
 * stack is worth over its life — a single tub off the shop shelf has neither a
 * renewal behind it nor the basket size to carry 25% and a commission, so a
 * code there is a straight loss with nothing to recover it from.
 *
 * Refused out loud rather than silently ignored: a customer who typed a code
 * and was charged full price without being told is the outcome this whole
 * module exists to prevent.
 */
const ELIGIBLE_CHANNELS: readonly RedeemChannel[] = ['quiz', 'subscription']

export function worksOn(channel: RedeemChannel | null | undefined): boolean {
  // An unstated channel is eligible. Every caller that can be in the shop says
  // so; defaulting the other way would silently kill codes on any journey that
  // forgot to pass one, which is the failure mode that is hard to notice.
  return channel == null || ELIGIBLE_CHANNELS.includes(channel)
}

export interface RedeemContext {
  /** Order subtotal before any discount (£). */
  subtotal: number
  /**
   * The buyer's email, to decide whether this is their first order. Null for a
   * checkout where we do not know yet — treated as a first order, because
   * refusing a genuine new customer is worse than honouring a code twice for
   * someone who checked out as a guest under two addresses.
   */
  email?: string | null
  /** What is being bought — see `worksOn`. */
  channel?: RedeemChannel | null
  now?: Date
}

export type Redemption =
  | { ok: true; code: PartnerCode; partner: Partner; discountPct: number }
  | { ok: false; reason: string }

/**
 * Validate a typed code and return what it takes off, or why it does not.
 *
 * `hasOrdered` is injected so the rules stay testable without an orders table,
 * and so a caller that already knows (the subscription path, where the member is
 * signed in) does not pay for a second lookup.
 */
export async function redeemPartnerCode(
  input: string | null | undefined,
  context: RedeemContext,
  hasOrdered: (email: string) => Promise<boolean> = defaultHasOrdered,
): Promise<Redemption> {
  const typed = (input ?? '').trim()
  if (!typed) return { ok: false, reason: 'Enter a code.' }

  // Before the lookup, so the answer is the same whether or not the code is
  // real: in the shop no code works, and saying which ones exist there would
  // only help someone guessing at them.
  if (!worksOn(context.channel)) {
    return {
      ok: false,
      reason: 'Discount codes apply to bundles and subscriptions, not single products from the shop.',
    }
  }

  const code = await repo.getCode(normaliseCode(typed))
  if (!code) return { ok: false, reason: 'We don’t recognise that code.' }

  const partner = await repo.getPartner(code.partnerId)
  // A code whose partner has been deleted is not a code. Refuse rather than
  // discount an order nobody can be paid for.
  if (!partner) return { ok: false, reason: 'That code is no longer active.' }

  // Only ask the orders table when the answer can actually change the outcome.
  const isFirstOrder =
    !code.terms.firstOrderOnly || !context.email ? true : !(await hasOrdered(context.email))

  const check = checkCode(code, {
    subtotal: context.subtotal,
    isFirstOrder,
    partnerStatus: partner.status,
    now: context.now,
  })
  if (!check.ok) return { ok: false, reason: check.reason }

  return { ok: true, code, partner, discountPct: check.discountPct }
}

/** Whether this email has bought before. Imported lazily to keep the domains apart. */
async function defaultHasOrdered(email: string): Promise<boolean> {
  const { hasOrdered } = await import('@/lib/orders/repo')
  return hasOrdered(email)
}

/**
 * Bank a redemption against the code's usage count.
 *
 * Called once, when an order is actually raised — never while someone is only
 * typing a code into the box. A cap that counted attempts would exhaust itself
 * on people who never bought, which is the same mistake the intro-allocation
 * ledger exists to avoid.
 *
 * Never throws: a usage counter is not worth failing a paid checkout over. The
 * order carries the attribution either way, so nothing is lost but the tally.
 */
export async function recordCodeUse(code: string): Promise<void> {
  try {
    const existing = await repo.getCode(normaliseCode(code))
    if (!existing) return
    await repo.updateCode(existing.code, {
      terms: { ...existing.terms, uses: existing.terms.uses + 1 },
    })
  } catch (err) {
    console.error('[partners] could not record code use:', err)
  }
}

/**
 * Combine a partner's code with a discount already being given.
 *
 * The DEEPER of the two, not the two compounded. A code replaces what the order
 * had earned: "25% off" is the whole story a partner has to tell, rather than
 * "25% off, compounded with a rate you would have to work out from the receipt".
 *
 * It used to compound, and that was the single most expensive thing in the
 * programme — on the deepest rung it came to 36% off AND a commission.
 *
 * The deeper of the two rather than "the code always wins", so a rate set above
 * the code can never turn that code into a penalty for the customer using it.
 */
export function replaceDiscount(existingPct: number, partnerPct: number): number {
  return Math.max(clamp(existingPct), clamp(partnerPct))
}

function clamp(pct: number): number {
  if (!Number.isFinite(pct)) return 0
  return Math.min(1, Math.max(0, pct))
}
