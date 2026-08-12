/**
 * What it costs this member to leave, and whether we may charge it at all.
 *
 * The one place that decides an exit. Everything upstream of it computes
 * figures — `cancelSettlement` the forecast, `exitStatement` the ledger — and
 * everything downstream moves money or state. This is where the two arithmetics
 * and the five reasons for charging nothing meet.
 *
 * Pure: the caller fetches the subscription, the orders and the consent answer,
 * and this decides. That split is deliberate — the decision is the part worth
 * testing exhaustively, and it should not need a database to do it.
 */
import type { Order } from '@/lib/orders/types'
import type { MemberSubscription } from './types'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { cancelSettlement, nextFreeExitMonth, paidToDateOf, shippedValueOf } from './mock'
import { exitStatement, ledgerDivergence, ledgerIsComplete, type ExitStatement } from './exit-ledger'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Why this member is leaving without paying.
 *
 * Ordered by precedence in `waiverFor`, strongest first. The order matters: a
 * member inside the cooling-off period who ALSO has an unaccepted price rise
 * should be told about the statutory right, because that is the one with
 * consequences beyond the balance.
 */
export type WaiverReason =
  /** They never agreed to terms that disclose a settlement. E-4, the legal gate. */
  | 'consent-not-given'
  /** Consumer Contracts Regulations 2013 — 14 days from the first order. */
  | 'cooling-off'
  /** They are leaving inside a price-increase notice period they did not accept. */
  | 'price-increase-notice'
  /** We changed their plan ourselves, because a product became unavailable. */
  | 'we-changed-your-plan'
  /** The arithmetic came to nothing, or to less than it costs to collect. */
  | 'nothing-owed'

export interface Waiver {
  reason: WaiverReason
  /** What to tell the member, in their words rather than ours. */
  explanation: string
}

export interface ExitQuote {
  /** What to charge (£). Zero whenever `waiver` is set. */
  settlement: number
  /** Where the figure came from. `forecast` when the ledger is too thin to bill from. */
  source: 'ledger' | 'forecast'
  /** The itemised statement, when we have one worth showing. */
  statement: ExitStatement | null
  /** Set when nothing is payable, with the reason. */
  waiver: Waiver | null
  /** What the model says, kept alongside for comparison. */
  forecast: number
  /** What we owe THEM, if their payments outran their deliveries (£). */
  overpayment: number
  /** Ledger vs forecast, for a founder rather than the member. */
  divergence: ReturnType<typeof ledgerDivergence>
  /**
   * The next cycle at which leaving costs nothing — the "or wait until…" option.
   *
   * Null when the plan is already free to leave, or when no free window falls
   * inside the horizon.
   */
  freeExitMonth: number | null
}

/**
 * Whether a plan is inside the statutory cancellation window.
 *
 * Runs from the FIRST ORDER rather than from signup: the Consumer Contracts
 * Regulations start the clock when the goods arrive, and for a subscription that
 * is the first box. Falls back to `startedAt` when no order is available.
 */
export function withinCoolingOff(
  sub: MemberSubscription,
  orders: Order[],
  now: Date = new Date(),
  days = 14,
): boolean {
  const first = orders
    .filter((o) => o.channel === 'subscription')
    .map((o) => o.createdAt)
    .sort()[0]
  const from = new Date(first ?? sub.startedAt)
  if (Number.isNaN(from.getTime())) return false
  return now.getTime() - from.getTime() <= days * DAY_MS
}

/**
 * Whether a price rise has been notified but has not yet taken effect.
 *
 * The notice email promises exactly this: *"you can cancel free of charge any
 * time before that date"*. A member acting on that promise must not then be
 * shown a bill, so this is a waiver rather than a discount.
 */
export function insidePriceIncreaseNotice(sub: MemberSubscription, now: Date = new Date()): boolean {
  return (sub.billingHistory ?? []).some(
    (change) =>
      change.reason === 'price-increase' &&
      change.noticeSentAt != null &&
      new Date(change.effectiveFrom).getTime() > now.getTime(),
  )
}

/**
 * Whether we changed their plan for them recently.
 *
 * A substitution or a removal we made because a product went away is our
 * decision, not theirs — `changes/apply.ts` already waives the per-line
 * settlement for it, and the same reasoning has to hold when the member responds
 * by leaving altogether. Otherwise "we swapped your protein" quietly becomes a
 * reason they owe us money.
 */
export function followsInvoluntaryChange(
  sub: MemberSubscription,
  now: Date = new Date(),
  withinDays = 60,
): boolean {
  const cutoff = now.getTime() - withinDays * DAY_MS
  return (sub.billingHistory ?? []).some(
    (change) =>
      (change.reason === 'out-of-stock' || change.reason === 'discontinued') &&
      new Date(change.createdAt).getTime() >= cutoff,
  )
}

/**
 * The reason this exit costs nothing, or null when it costs something.
 *
 * Consent comes first because it is the only one that is not a kindness: a
 * member who was told "no fee" cannot be charged one whatever the arithmetic
 * says, and whatever else is also true of their account.
 */
export function waiverFor(input: {
  sub: MemberSubscription
  orders: Order[]
  settlement: number
  consentCoversSettlement: boolean
  now?: Date
}): Waiver | null {
  const now = input.now ?? new Date()

  if (!input.consentCoversSettlement) {
    return {
      reason: 'consent-not-given',
      explanation:
        'You joined under terms that said cancelling was free, so there is nothing to settle.',
    }
  }
  if (withinCoolingOff(input.sub, input.orders, now)) {
    return {
      reason: 'cooling-off',
      explanation:
        'You are within 14 days of your first delivery, so your statutory right to cancel applies — there is nothing to pay. Send back anything unopened for a refund.',
    }
  }
  if (insidePriceIncreaseNotice(input.sub, now)) {
    return {
      reason: 'price-increase-notice',
      explanation:
        'We told you your price was going up and said you could leave free of charge before it took effect. That still stands.',
    }
  }
  if (followsInvoluntaryChange(input.sub, now)) {
    return {
      reason: 'we-changed-your-plan',
      explanation:
        'We changed your plan ourselves because a product became unavailable, so there is nothing for you to settle.',
    }
  }
  if (input.settlement <= 0) {
    return {
      reason: 'nothing-owed',
      explanation: 'Your payments have covered everything we have sent you. There is nothing to pay.',
    }
  }
  return null
}

/**
 * Price an exit.
 *
 * The ledger is preferred and the forecast is the fallback — see
 * `ledgerIsComplete` for why a half-populated ledger must never be billed from.
 * A waiver zeroes the charge but does NOT hide the statement: a member who owes
 * nothing is still entitled to see what we sent and what they paid, and a
 * founder needs it to answer a question about the account later.
 */
export function quoteExit(input: {
  sub: MemberSubscription
  orders: Order[]
  consentCoversSettlement: boolean
  now?: Date
  config?: PricingConfig
}): ExitQuote {
  const config = input.config ?? getPricingConfig()
  const forecast = cancelSettlement(input.sub, config)

  const complete = ledgerIsComplete(input.orders)
  const statement = input.orders.length > 0 ? exitStatement(input.orders, config) : null
  const source: ExitQuote['source'] = complete ? 'ledger' : 'forecast'
  const computed = complete && statement ? statement.settlement : forecast

  const waiver = waiverFor({
    sub: input.sub,
    orders: input.orders,
    settlement: computed,
    consentCoversSettlement: input.consentCoversSettlement,
    now: input.now,
  })

  return {
    settlement: waiver ? 0 : computed,
    source,
    statement,
    waiver,
    forecast,
    overpayment: statement?.overpayment ?? Math.max(0, paidToDateOf(input.sub) - shippedValueOf(input.sub)),
    divergence: statement ? ledgerDivergence(statement, forecast) : null,
    // Only worth offering when there is something to avoid. An exit that is
    // already free — waived, or simply paid off — has no "or wait until…".
    freeExitMonth:
      waiver == null && computed > 0
        ? nextFreeExitMonth(input.sub, input.sub.monthsActive, 12, config)
        : null,
  }
}
