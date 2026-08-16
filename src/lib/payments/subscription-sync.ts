/**
 * Keeping Stripe in step with a member's plan.
 *
 * Our `MemberSubscription` document is the source of truth for WHAT someone gets;
 * Stripe holds the schedule and the card, and is the thing that actually takes
 * the money. When one moves the other has to follow, and until this existed only
 * one direction worked: `lib/changes` re-priced Stripe when a supplier forced a
 * change, but everything the MEMBER did in the hub — cancel, pause, add a
 * product, remove one, change how much they get through — was written to the
 * database and never mentioned to Stripe. A member could cancel and keep being
 * charged.
 *
 * ── Ordering ──
 * Stripe goes FIRST, and a failure means we do not save. That is the same rule
 * `applyChangeEvent` follows, for the same reason: a stored plan that disagrees
 * with the card charge is worse than a change that did not happen, because
 * nobody finds out about it until a member reads their statement.
 *
 * The ONE exception is cancellation, which must never be blocked — see
 * `syncCancellation`.
 *
 * Server-only. No-ops cleanly in mock mode and for subscriptions that never went
 * through Stripe, so the whole hub keeps working without keys.
 */
import type { MemberSubscription } from '@/lib/recharge/types'
import { getPaymentSource } from './index'

/** Nothing to sync: mock payments, or a plan Stripe has never heard of. */
function stripeIdFor(sub: MemberSubscription): string | null {
  if (getPaymentSource() !== 'stripe') return null
  return sub.stripeSubscriptionId ?? null
}

export type SyncOutcome =
  /** Stripe now agrees with the plan (or there was nothing to tell it). */
  | { ok: true }
  /** Stripe refused. The caller must NOT persist the change. */
  | { ok: false; error: string }

function failure(action: string, err: unknown): SyncOutcome {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[payments] Stripe rejected ${action}:`, message)
  return { ok: false, error: message }
}

/**
 * Push a changed monthly amount to Stripe.
 *
 * Skips when the amount hasn't moved by at least a penny — hub mutations save
 * the whole document, so most writes are not price changes and should not churn
 * Stripe.
 */
export async function syncMonthlyAmount(
  sub: MemberSubscription,
  previousMonthly: number,
): Promise<SyncOutcome> {
  const id = stripeIdFor(sub)
  if (!id) return { ok: true }
  if (Math.abs(sub.flatMonthly - previousMonthly) < 0.01) return { ok: true }

  try {
    const { updateSubscriptionAmount } = await import('./stripe')
    await updateSubscriptionAmount(id, sub.flatMonthly)
    return { ok: true }
  } catch (err) {
    return failure('the new monthly amount', err)
  }
}

/**
 * Stop billing in Stripe when a member cancels.
 *
 * **Never blocks the cancellation.** Withholding someone's right to leave until
 * a third-party API cooperates is exactly the kind of term that gets struck
 * down, and the member has already been told they can cancel whenever they like.
 * So this reports failure for the caller to log and reconcile, and the caller
 * cancels regardless — the worst case is a subscription we must clean up in the
 * Stripe dashboard, which is a far better failure than a customer who cannot
 * escape.
 */
export async function syncCancellation(sub: MemberSubscription): Promise<SyncOutcome> {
  const id = stripeIdFor(sub)
  if (!id) return { ok: true }
  try {
    const { cancelStripeSubscription } = await import('./stripe')
    await cancelStripeSubscription(id)
    return { ok: true }
  } catch (err) {
    return failure('the cancellation', err)
  }
}

/**
 * Re-rate the postage line when a plan's monthly moves across a delivery band.
 *
 * Runs after `syncMonthlyAmount` and is deliberately separate from it: the plan
 * price and the postage price are two Stripe items, and conflating them is the
 * bug that made `updateSubscriptionAmount` careful about which item it writes to
 * in the first place.
 *
 * Skips when the rate has not actually changed, so an ordinary hub save that
 * moves the monthly within a band does not touch Stripe twice.
 *
 * A failure here is reported, but the caller treats it the way it treats a
 * failed price change — see `syncSubscriptionToStripe`, which refuses to persist
 * a plan Stripe would not accept.
 */
export async function syncDeliveryLine(
  sub: MemberSubscription,
  previousMonthly: number,
): Promise<SyncOutcome> {
  const id = stripeIdFor(sub)
  if (!id) return { ok: true }

  const { recurringDeliveryOption } = await import('@/lib/pricing/delivery')
  const before = recurringDeliveryOption(previousMonthly)?.price ?? 0
  const after = recurringDeliveryOption(sub.flatMonthly)
  if (Math.abs((after?.price ?? 0) - before) < 0.01) return { ok: true }

  try {
    const { updateSubscriptionDelivery } = await import('./stripe')
    await updateSubscriptionDelivery(id, after)
    return { ok: true }
  } catch (err) {
    return failure('the new delivery rate', err)
  }
}

/** Pause billing in Stripe. Invoices raised while paused are voided, not banked. */
export async function syncPause(sub: MemberSubscription): Promise<SyncOutcome> {
  const id = stripeIdFor(sub)
  if (!id) return { ok: true }
  try {
    const { pauseStripeSubscription } = await import('./stripe')
    await pauseStripeSubscription(id)
    return { ok: true }
  } catch (err) {
    return failure('the pause', err)
  }
}

/** Resume billing after a pause or snooze. */
export async function syncResume(sub: MemberSubscription): Promise<SyncOutcome> {
  const id = stripeIdFor(sub)
  if (!id) return { ok: true }
  try {
    const { resumeStripeSubscription } = await import('./stripe')
    await resumeStripeSubscription(id)
    return { ok: true }
  } catch (err) {
    return failure('the resume', err)
  }
}

/**
 * Reconcile Stripe with an incoming version of a member's plan.
 *
 * The single entry point for the hub's save route, which receives a whole
 * document rather than a named action — so what changed has to be worked out by
 * diffing against what we hold. Order matters:
 *
 *  1. **Status first.** A cancellation makes any price change irrelevant, and
 *     re-pricing a subscription we are about to cancel is a wasted call that can
 *     fail and block the cancellation.
 *  2. **Then the amount**, but never for a plan that is no longer billing.
 *
 * Returns `ok: false` only for failures the caller should refuse to persist. A
 * failed CANCELLATION is reported as `ok: true` with `cancelError` set: the
 * member is leaving either way, and the caller logs it rather than trapping them.
 */
export async function syncSubscriptionToStripe(
  previous: MemberSubscription,
  next: MemberSubscription,
): Promise<SyncOutcome & { cancelError?: string }> {
  const wasBilling = previous.status === 'active'
  const nowBilling = next.status === 'active'

  if (next.status === 'cancelled' && previous.status !== 'cancelled') {
    const result = await syncCancellation(next)
    // Deliberately `ok: true` — see the doc comment.
    return result.ok ? { ok: true } : { ok: true, cancelError: result.error }
  }

  if (next.status === 'paused' && wasBilling) {
    const result = await syncPause(next)
    if (!result.ok) return result
  }

  if (nowBilling && previous.status === 'paused') {
    const result = await syncResume(next)
    if (!result.ok) return result
  }

  // A cancelled or paused plan is not being billed, so there is no amount to
  // move — and Stripe would reject the attempt on a cancelled subscription.
  if (next.status === 'cancelled') return { ok: true }

  const amount = await syncMonthlyAmount(next, previous.flatMonthly)
  if (!amount.ok) return amount

  // Postage second, and only once the plan price is safely on Stripe. Both are
  // driven by the same number, so a plan that crossed a delivery band needs both
  // — and until this ran, it got the first and never the second: a plan that
  // grew past the free line kept paying postage, and one that shrank below it
  // was never charged any, in both cases for as long as it lived.
  return syncDeliveryLine(next, previous.flatMonthly)
}
