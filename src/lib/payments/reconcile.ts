/**
 * Our plans against Stripe's subscriptions, every night (`/api/cron/daily`).
 *
 * The plan we store and the subscription Stripe bills are kept in step by the
 * webhook and by every hub change (`subscription-sync`). Each of those can fail
 * quietly: a webhook that never arrived, a cancel that reached us and not
 * Stripe. Nobody notices until a statement does. This compares the two for
 * every plan Stripe bills and says where they disagree, on the Founders Hub's
 * Monitoring page (`health.ts`, "Stripe agrees with our plans").
 *
 * It changes one thing itself: the plan's day, which is Stripe's by definition
 * (`recharge/billing-day`), so a plan whose day disagrees is corrected and
 * counted. Everything else is money or a member's status, and is for a founder
 * to look at, not for a job to rewrite.
 */
import type { MemberSubscription } from '@/lib/recharge/types'

export type ReconcileKind =
  /** Stripe has no such subscription. */
  | 'missing'
  /** We say it's running and Stripe has ended it, or the other way round. */
  | 'status'
  /** The monthly Stripe charges isn't the plan's. */
  | 'amount'

export interface ReconcileFinding {
  userId: string
  email: string | null
  kind: ReconcileKind
  /** One sentence for the Monitoring page. */
  detail: string
}

export interface ReconcileResult {
  at: string
  checked: number
  findings: ReconcileFinding[]
  /** Plans whose day was corrected to Stripe's. */
  daysFixed: number
  /** Stripe couldn't be asked about these (an outage); checked again tomorrow. */
  unreachable: number
}

/** What we read off a Stripe subscription. */
export interface StripeView {
  status: string
  /** Pause collection set: Stripe isn't charging. */
  paused: boolean
  /** Every recurring line, in pence. */
  monthlyPence: number
  /** The billing day, as a UK day (`billingDayOfAnchor`). */
  billingDay: number | null
}

export const RECONCILE_KEY = 'payments:reconcile:last'

const ENDED = new Set(['canceled', 'incomplete_expired'])

/** Compare one plan with its Stripe subscription. Pure. */
export function compare(sub: MemberSubscription, stripe: StripeView | null, expectedMonthly: number): ReconcileKind | null {
  if (!stripe) return 'missing'
  const ours = sub.status
  const stripeEnded = ENDED.has(stripe.status)
  if (ours === 'cancelled' && !stripeEnded) return 'status'
  if (ours !== 'cancelled' && stripeEnded) return 'status'
  if (ours === 'paused' && !stripe.paused && !stripeEnded) return 'status'
  if (ours === 'active' && stripe.paused) return 'status'
  if (ours !== 'cancelled' && Math.abs(stripe.monthlyPence - Math.round(expectedMonthly * 100)) > 1) return 'amount'
  return null
}

export function describe(kind: ReconcileKind, sub: MemberSubscription, stripe: StripeView | null, expectedMonthly: number): string {
  switch (kind) {
    case 'missing':
      return `Stripe has no subscription ${sub.stripeSubscriptionId} for this plan.`
    case 'status':
      return `Our plan is ${sub.status}; Stripe’s subscription is ${stripe?.paused ? 'paused' : stripe?.status}.`
    case 'amount':
      return `Stripe charges £${((stripe?.monthlyPence ?? 0) / 100).toFixed(2)} a month; the plan is £${expectedMonthly.toFixed(2)}.`
  }
}

/**
 * Run the comparison over every plan Stripe bills. The Stripe reads and the
 * plan writes are passed in, so the rules are tested without either.
 */
export async function reconcile(deps: {
  plans: { userId: string; subscription: MemberSubscription }[]
  read: (stripeSubscriptionId: string) => Promise<StripeView | null>
  /** What Stripe should be charging each month for a plan (its monthly and its postage). */
  expectedMonthly: (sub: MemberSubscription) => number
  saveDay: (userId: string, sub: MemberSubscription, day: number) => Promise<void>
  now?: Date
}): Promise<ReconcileResult> {
  const findings: ReconcileFinding[] = []
  let checked = 0
  let daysFixed = 0
  let unreachable = 0
  for (const { userId, subscription: sub } of deps.plans) {
    if (!sub.stripeSubscriptionId) continue
    let stripe: StripeView | null
    try {
      stripe = await deps.read(sub.stripeSubscriptionId)
    } catch {
      unreachable++
      continue
    }
    checked++
    const expected = deps.expectedMonthly(sub)
    const kind = compare(sub, stripe, expected)
    if (kind) findings.push({ userId, email: sub.customerEmail || null, kind, detail: describe(kind, sub, stripe, expected) })
    if (stripe?.billingDay && sub.status !== 'cancelled' && stripe.billingDay !== sub.dispatchDayOfMonth) {
      await deps.saveDay(userId, sub, stripe.billingDay)
      daysFixed++
    }
  }
  return { at: (deps.now ?? new Date()).toISOString(), checked, findings, daysFixed, unreachable }
}

/** The real run: our plans, Stripe's subscriptions, the result kept for Monitoring. Server-only. */
export async function reconcileWithStripe(): Promise<ReconcileResult | null> {
  const { getPaymentSource } = await import('./index')
  if (getPaymentSource() !== 'stripe') return null
  const [{ listSubscriptions, isPlanDocument, saveSubscription }, { getStripeClient }, { billingDayOfAnchor }, { recurringDeliveryOption }, { kvSet }] = await Promise.all([
    import('@/lib/db/hub-data'),
    import('./stripe'),
    import('@/lib/recharge/billing-day'),
    import('@/lib/pricing/delivery'),
    import('@/lib/db/kv'),
  ])
  const stripe = getStripeClient()
  const plans = (await listSubscriptions()).filter((p) => isPlanDocument(p.subscription))
  const result = await reconcile({
    plans,
    read: async (id) => {
      try {
        const s = await stripe.subscriptions.retrieve(id)
        const monthlyPence = s.items.data.reduce((sum, item) => sum + (item.price?.unit_amount ?? 0) * (item.quantity ?? 1), 0)
        return {
          status: s.status,
          paused: Boolean(s.pause_collection),
          monthlyPence,
          billingDay: typeof s.billing_cycle_anchor === 'number' && s.billing_cycle_anchor > 0 ? billingDayOfAnchor(s.billing_cycle_anchor) : null,
        }
      } catch (err) {
        // Stripe's "no such subscription" is an answer; anything else is an outage.
        if ((err as { code?: string }).code === 'resource_missing') return null
        throw err
      }
    },
    expectedMonthly: (sub) => sub.flatMonthly + (recurringDeliveryOption(sub.flatMonthly)?.price ?? 0),
    saveDay: async (userId, sub, day) => {
      await saveSubscription(userId, { ...sub, dispatchDayOfMonth: day })
    },
  })
  await kvSet(RECONCILE_KEY, result)
  return result
}
