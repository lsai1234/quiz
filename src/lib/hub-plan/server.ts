/**
 * The member hub on its own (server-only): joining, the payment going
 * through, a stack order moving the next payment, cancelling and keeping it.
 * The rules are in `./plan`; this file is where they meet Stripe, the store
 * and the emails.
 *
 * Mock payments take no money: joining activates straight away, so the whole
 * journey (shop → quiz → hub) can be walked without Stripe.
 */
import type { UserRecord } from '@/lib/db/users'
import { kvGet, kvSet } from '@/lib/db/kv'
import { normaliseGuideSeed, type GuideSeed } from '@/lib/guide/build'
import type { Order } from '@/lib/orders/types'
import { firstChargeAt, hubPlanOpen, hubPlanView, newHubPlan, nextChargeAfterOrder, refundable, type HubPlan, type HubPlanView } from './plan'
import { getHubPlan, saveHubPlan } from './store'

type Who = Pick<UserRecord, 'id' | 'email' | 'name'>

export type HubPlanRefusal = 'off' | 'included' | 'already'

export class HubPlanRefused extends Error {
  constructor(public code: HubPlanRefusal) {
    super(code)
  }
}

const MONTH = 30 * 86_400_000
const addMonth = (d: Date) => {
  const x = new Date(d)
  x.setUTCMonth(x.getUTCMonth() + 1)
  return x.toISOString()
}

async function stripeOn(): Promise<boolean> {
  const [{ syncPortalRuntime }, { getPaymentSource }] = await Promise.all([import('@/lib/portal/store'), import('@/lib/payments')])
  await syncPortalRuntime()
  return getPaymentSource() === 'stripe'
}

/* ── What the quiz told us, for a member with no order ─────────────────── */

/** Where a hub-only member's quiz answers land: the training plan's first setup reads them. */
const startKey = (userId: string) => `hub-start:${userId}`

export interface HubStart {
  seed: GuideSeed
  at: string
}

export async function getHubStart(userId: string): Promise<HubStart | null> {
  return (await kvGet<HubStart>(startKey(userId))) ?? null
}

/** Save the day, goals, first name and training answers from the quiz. Nothing about their health. */
export async function saveHubStart(userId: string, raw: unknown, now = new Date()): Promise<HubStart> {
  const seed = normaliseGuideSeed(raw)
  const start = { seed: { ...seed, stackName: null }, at: now.toISOString() }
  await kvSet(startKey(userId), start)
  return start
}

/** They have answered the quiz somewhere we can read it: an order, a plan, or the hub's own setup. */
export async function hasAnswers(user: Pick<UserRecord, 'id' | 'email'>): Promise<boolean> {
  if (await getHubStart(user.id)) return true
  const { getSubscription } = await import('@/lib/db/hub-data')
  if ((await getSubscription(user.id))?.guideSeed) return true
  const { latestPaidOrderFor } = await import('@/lib/orders/repo')
  return Boolean((await latestPaidOrderFor({ userId: user.id, email: user.email }))?.guideSeed)
}

/* ── Joining ──────────────────────────────────────────────────────────── */

export interface JoinState {
  onSale: boolean
  monthly: number
  /** Why they can't join, when they can't. */
  refusal: HubPlanRefusal | null
  /** Their first payment waits for free days a stack gave them (ISO), or null. */
  firstChargeAt: string | null
}

export async function joinState(user: Pick<UserRecord, 'id' | 'email'> | null, now = new Date()): Promise<JoinState> {
  const { getOfferSettings } = await import('@/lib/offer/store')
  const settings = await getOfferSettings()
  const { hubOnSale } = await import('@/lib/offer/settings')
  const base = { onSale: hubOnSale(settings), monthly: settings.hubPrice.monthly }
  if (!base.onSale) return { ...base, refusal: 'off', firstChargeAt: null }
  if (!user) return { ...base, refusal: null, firstChargeAt: null }
  if (hubPlanOpen(await getHubPlan(user.id), now)) return { ...base, refusal: 'already', firstChargeAt: null }
  const { getSubscription } = await import('@/lib/db/hub-data')
  const box = await getSubscription(user.id)
  if (box && box.status !== 'cancelled') return { ...base, refusal: 'included', firstChargeAt: null }
  const { hubAccess } = await import('@/lib/hub/access')
  const access = await hubAccess(user, now)
  const until = access.state === 'member' && access.until ? `${access.until}T00:00:00.000Z` : null
  return { ...base, refusal: null, firstChargeAt: firstChargeAt(until, now) }
}

/**
 * Start a membership: a Stripe checkout, or under mock payments the
 * membership itself. Where they land after paying: the quiz in hub mode when
 * we don't have their answers yet, else the hub.
 */
export async function startHubPlan(user: Who, origin: string, now = new Date()): Promise<{ checkoutUrl: string; mock: boolean }> {
  const state = await joinState(user, now)
  if (state.refusal) throw new HubPlanRefused(state.refusal)
  const next = (await hasAnswers(user)) ? '/myhub?joined=1' : '/?then=hub'
  const had = await getHubPlan(user.id)
  const plan: HubPlan = {
    ...newHubPlan({ userId: user.id, email: user.email, monthly: state.monthly }, now),
    stripeCustomerId: had?.stripeCustomerId ?? null,
    nextChargeAt: state.firstChargeAt,
    freeUntil: state.firstChargeAt,
  }
  await saveHubPlan(plan, now)

  if (await stripeOn()) {
    const { createHubPlanSession } = await import('@/lib/payments/stripe')
    const base = origin || process.env.APP_URL || ''
    const { url } = await createHubPlanSession({
      monthly: plan.monthly,
      clientReferenceId: user.id,
      customerId: plan.stripeCustomerId,
      customerEmail: user.email,
      firstChargeAt: state.firstChargeAt,
      successUrl: `${base}${next}`,
      cancelUrl: `${base}/shop/hub`,
    })
    if (!url) throw new Error('Stripe returned no checkout URL.')
    return { checkoutUrl: url, mock: false }
  }

  await activateHubPlan(user.id, {}, now)
  return { checkoutUrl: next, mock: true }
}

/**
 * The payment went through (or, under mock payments, they joined). Idempotent:
 * a redelivered webhook finds it active and changes nothing but the ids.
 */
export async function activateHubPlan(
  userId: string,
  input: { stripeSubscriptionId?: string | null; stripeCustomerId?: string | null; email?: string | null },
  now = new Date(),
): Promise<HubPlan | null> {
  const plan = await getHubPlan(userId)
  if (!plan) return null
  const wasActive = plan.status === 'active' && plan.startedAt
  const next: HubPlan = {
    ...plan,
    status: plan.status === 'cancelled' || plan.status === 'pending' ? 'active' : plan.status,
    startedAt: wasActive ? plan.startedAt : now.toISOString(),
    nextChargeAt: plan.nextChargeAt ?? addMonth(now),
    stripeSubscriptionId: input.stripeSubscriptionId ?? plan.stripeSubscriptionId,
    stripeCustomerId: input.stripeCustomerId ?? plan.stripeCustomerId,
    email: plan.email ?? input.email ?? null,
    endsAt: null,
    cancelledAt: null,
  }
  const saved = await saveHubPlan(next, now)
  if (!wasActive) {
    const { getUserById } = await import('@/lib/db/users')
    const user = await getUserById(userId)
    const first = user?.name ? user.name.trim().split(/\s+/)[0] : null
    const { sendWelcomeEmail } = await import('./emails')
    await sendWelcomeEmail(saved, first, now)
  }
  return saved
}

/**
 * A paid order: its 90 free days push the next payment back (`./plan`).
 * Every route to a paid order calls this (`orders/service`). Never throws.
 */
export async function extendHubPlanFor(order: Pick<Order, 'id' | 'userId' | 'email' | 'createdAt' | 'status'>, now = new Date()): Promise<void> {
  try {
    if (order.status !== 'paid') return
    let userId = order.userId
    if (!userId && order.email) {
      const { getUserByEmail } = await import('@/lib/db/users')
      userId = (await getUserByEmail(order.email))?.id ?? null
    }
    if (!userId) return
    const plan = await getHubPlan(userId)
    if (!plan || plan.status !== 'active') return
    const moved = nextChargeAfterOrder(plan, order.createdAt, now)
    if (plan.nextChargeAt && Date.parse(moved.nextChargeAt) <= Date.parse(plan.nextChargeAt)) return
    if (plan.stripeSubscriptionId && (await stripeOn())) {
      const { moveHubPlanCharge } = await import('@/lib/payments/stripe')
      await moveHubPlanCharge(plan.stripeSubscriptionId, moved.nextChargeAt)
    }
    const saved = await saveHubPlan({ ...plan, ...moved }, now)
    const { sendMovedEmail } = await import('./emails')
    await sendMovedEmail(saved, order.id)
  } catch (err) {
    console.error('[hub-plan] could not move the next payment for an order:', err)
  }
}

/* ── Cancelling and keeping it ───────────────────────────────────────── */

export async function cancelHubPlan(userId: string, now = new Date()): Promise<HubPlan | null> {
  const plan = await getHubPlan(userId)
  if (!plan || plan.status !== 'active') return plan
  const stripe = plan.stripeSubscriptionId && (await stripeOn())
  const refund = refundable(plan, now)
  let next: HubPlan
  if (refund) {
    if (stripe) {
      const { cancelStripeSubscription, refundPayment } = await import('@/lib/payments/stripe')
      await cancelStripeSubscription(plan.stripeSubscriptionId!)
      await refundPayment(plan.lastPaymentIntentId!)
    }
    next = { ...plan, status: 'cancelled', endsAt: now.toISOString(), nextChargeAt: null, cancelledAt: now.toISOString() }
  } else {
    let endsAt = plan.nextChargeAt ?? new Date(now.getTime() + MONTH).toISOString()
    if (stripe) {
      const { setHubPlanCancelAtPeriodEnd } = await import('@/lib/payments/stripe')
      endsAt = (await setHubPlanCancelAtPeriodEnd(plan.stripeSubscriptionId!, true)).endsAt ?? endsAt
    }
    next = { ...plan, status: 'cancelling', endsAt, cancelledAt: now.toISOString() }
  }
  const saved = await saveHubPlan(next, now)
  const { sendCancelledEmail } = await import('./emails')
  await sendCancelledEmail(saved, refund)
  return saved
}

export async function resumeHubPlan(userId: string, now = new Date()): Promise<HubPlan | null> {
  const plan = await getHubPlan(userId)
  if (!plan || plan.status !== 'cancelling' || !hubPlanOpen(plan, now)) return plan
  if (plan.stripeSubscriptionId && (await stripeOn())) {
    const { setHubPlanCancelAtPeriodEnd } = await import('@/lib/payments/stripe')
    await setHubPlanCancelAtPeriodEnd(plan.stripeSubscriptionId, false)
  }
  return saveHubPlan({ ...plan, status: 'active', nextChargeAt: plan.nextChargeAt ?? plan.endsAt, endsAt: null, cancelledAt: null }, now)
}

/** Their membership for the hub, or null when they've never joined. */
export async function memberHubPlanView(userId: string, now = new Date()): Promise<HubPlanView | null> {
  const plan = await getHubPlan(userId)
  if (!plan || plan.status === 'pending') return plan ? hubPlanView(plan, now, false) : null
  if (plan.status === 'cancelled') return null
  return hubPlanView(plan, now, await stripeOn())
}
