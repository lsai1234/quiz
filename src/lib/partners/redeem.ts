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
 * The discount **stacks** on top of the bundle and subscription rates. That is a
 * decision, not an oversight — see `docs/PARTNER_PROGRAMME_BUILD.md` §0 D2. On
 * the deepest rung it means an attributed first order can lose a few pounds,
 * recovered from month two. The margin floor still applies per line underneath,
 * so nothing is ever sold below cost however the discounts add up.
 *
 * Server-only.
 */
import { checkCode, normaliseCode } from './codes'
import * as repo from './repo'
import type { Partner, PartnerCode } from './types'

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
 * Multiplicative, not additive: 20% off then 20% off is 36%, not 40%. Adding
 * them would overstate what comes off at every rung and, at the deep end, could
 * ask for more than the price can carry.
 */
export function stackDiscount(existingPct: number, partnerPct: number): number {
  const combined = 1 - (1 - clamp(existingPct)) * (1 - clamp(partnerPct))
  return Math.round(combined * 10000) / 10000
}

function clamp(pct: number): number {
  if (!Number.isFinite(pct)) return 0
  return Math.min(1, Math.max(0, pct))
}
