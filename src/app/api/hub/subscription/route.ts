import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { getSubscription, saveSubscription, listFeedback, getQuiz } from '@/lib/db/hub-data'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { createMockSubscription } from '@/lib/recharge/mock'
import { seedsDemoSubscription } from '@/lib/recharge/demo-seed'
import { syncSubscriptionToStripe } from '@/lib/payments/subscription-sync'
import { syncPortalRuntime } from '@/lib/portal/store'
import { getPaymentSource } from '@/lib/payments'
import type { MemberSubscription } from '@/lib/recharge/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/hub/subscription → { subscription, feedback, quiz, seeded }
 *
 * The member's stored subscription + check-in history. `subscription` is **null**
 * for an account that has never subscribed, and the hub renders `NoSubscription`
 * for that — which is a real state, not an error.
 *
 * It was not always null. This route used to seed the sample blueprint for any
 * account without one and save it, so somebody who had signed up and bought
 * nothing opened the hub to a stack, a monthly figure and delivery dates that
 * were invented, stored, and manageable. The seed is now confined to deployments
 * that cannot take money — see `seedsDemoSubscription`, which is also what keeps
 * `npm run dev` demoable with no credentials.
 */
export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let subscription = await getSubscription(user.id)
  let seeded = false
  if (!subscription && seedsDemoSubscription()) {
    const { products } = await getResolvedCatalogue()
    subscription = createMockSubscription(products, user.email ?? '')
    await saveSubscription(user.id, subscription)
    seeded = true
  }

  const [feedback, quiz] = await Promise.all([listFeedback(user.id), getQuiz(user.id)])
  return NextResponse.json({ subscription: subscription ?? null, feedback, quiz, seeded })
}

/**
 * PUT /api/hub/subscription
 * Body: { subscription: MemberSubscription } → { ok } | { error }
 *
 * Persists the latest subscription state after a hub mutation, AND tells Stripe.
 *
 * The mutation helpers are pure client-side functions, so the document arrives
 * whole and what actually changed is worked out here by diffing against what we
 * hold. That diff is the point: this route used to save and return, which meant
 * cancelling in the hub left Stripe billing happily on, and adding a product
 * shipped more for the same money.
 *
 * Stripe goes first and a refusal is a 502 with nothing saved — a stored plan
 * that disagrees with the card charge is worse than a change that didn't happen,
 * because nobody notices until a statement arrives. Cancellation is the one
 * exception: it always persists (see `syncSubscriptionToStripe`).
 *
 * The Stripe ids are never taken from the request. A client that could rewrite
 * `stripeSubscriptionId` could point our billing calls at somebody else's plan.
 */
export async function PUT(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: { subscription?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const incoming = body.subscription as MemberSubscription | undefined
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.lines)) {
    return NextResponse.json({ error: 'subscription must be a MemberSubscription' }, { status: 400 })
  }

  const previous = await getSubscription(user.id)
  if (!previous) {
    // Nothing to diff against and no Stripe link to keep in step.
    await saveSubscription(user.id, incoming)
    return NextResponse.json({ ok: true })
  }

  // Server-held fields the browser has no business changing.
  const subscription: MemberSubscription = {
    ...incoming,
    stripeSubscriptionId: previous.stripeSubscriptionId,
    stripeCustomerId: previous.stripeCustomerId,
    shippingAddress: previous.shippingAddress,
    monthsActive: previous.monthsActive,
    billingStatus: previous.billingStatus,
  }

  await syncPortalRuntime()
  const sync = await syncSubscriptionToStripe(previous, subscription)
  if (!sync.ok) {
    return NextResponse.json(
      { error: 'We couldn’t update your billing just now. Nothing has changed — please try again.' },
      { status: 502 },
    )
  }
  if (sync.cancelError) {
    // The member is out either way; this needs reconciling in Stripe by hand.
    console.error(`[hub] subscription cancelled locally but NOT in Stripe for ${user.id}:`, sync.cancelError)
  }

  await saveSubscription(user.id, subscription)
  await creditNewlySkippedBoxes(user.id, previous, subscription)
  await creditNewlySkippedLines(user.id, previous, subscription)
  return NextResponse.json({ ok: true })
}

/**
 * Credit a box the member has just skipped.
 *
 * The Terms promise it — *"the value of the skipped box is credited against your
 * next one"* — and until now nothing did: the skip set a flag, dispatch sends
 * nothing, and Stripe billed the full monthly anyway. A member who skipped paid
 * in full for an empty month.
 *
 * Priced SERVER-SIDE from the lines actually due in that cycle, never from the
 * document the browser sent — the value of a box is money, and this route
 * already takes a whole subscription from the client.
 *
 * Only boxes that are newly skipped by THIS request are credited, and the
 * idempotency key is the box itself, so an unskip-then-reskip cannot stack
 * credits. Never throws: a credit that fails to reach Stripe is a bookkeeping
 * problem, and failing the member's skip over it would be a worse one.
 */
async function creditNewlySkippedBoxes(
  userId: string,
  previous: MemberSubscription,
  next: MemberSubscription,
): Promise<void> {
  if (!next.stripeCustomerId || getPaymentSource() !== 'stripe') return

  const wasSkipped = (sub: MemberSubscription, id: string) => sub.deliveryOverrides?.[id]?.skipped === true
  const newlySkipped = Object.keys(next.deliveryOverrides ?? {}).filter(
    (id) => wasSkipped(next, id) && !wasSkipped(previous, id),
  )
  if (newlySkipped.length === 0) return

  const { creditForSkippedBox } = await import('@/lib/recharge/schedule')
  const { creditCustomerBalance } = await import('@/lib/payments/stripe')

  for (const id of newlySkipped) {
    const amount = creditForSkippedBox(previous, id)
    if (amount <= 0) continue
    try {
      await creditCustomerBalance({
        customerId: next.stripeCustomerId,
        amount,
        description: `CHRGD — credit for the box you skipped (${id})`,
        idempotencyKey: `skip:${next.stripeSubscriptionId ?? userId}:${id}`,
      })
    } catch (err) {
      console.error(`[hub] skip credit of £${amount} failed to reach Stripe for ${userId}:`, err)
    }
  }
}

/**
 * Credit a single item the member has just pulled out of their next box.
 *
 * The twin of `creditNewlySkippedBoxes`, for the half of the product that skips
 * ONE line rather than the whole delivery — "Skip next", and pulling an item out
 * of a box from the delivery sheet. Both bank a `pendingCredit` on the line, the
 * hub prints it as "credit to next payment", and until now no part of that
 * reached Stripe: the member was shown a credit, and then billed in full.
 *
 * Showing a credit that never arrives is worse than not offering one, and it is
 * the exact figure the change-confirmation screens put in front of someone
 * before they commit — so it has to be real.
 *
 * The DELTA is what gets credited, never the running total: `pendingCredit`
 * accumulates on the line, and crediting the balance each time would pay a
 * member twice for the first skip. Keyed on the line's new ship date, which is
 * unique per skip of that line, so a replayed PUT cannot stack credits.
 */
async function creditNewlySkippedLines(
  userId: string,
  previous: MemberSubscription,
  next: MemberSubscription,
): Promise<void> {
  if (!next.stripeCustomerId || getPaymentSource() !== 'stripe') return

  const before = new Map(previous.lines.map((l) => [l.id, l.pendingCredit ?? 0]))
  const { creditCustomerBalance } = await import('@/lib/payments/stripe')

  for (const line of next.lines) {
    const delta = round((line.pendingCredit ?? 0) - (before.get(line.id) ?? 0))
    if (delta <= 0) continue
    try {
      await creditCustomerBalance({
        customerId: next.stripeCustomerId,
        amount: delta,
        description: `CHRGD — credit for ${line.productTitle}, not in your next box`,
        // Keyed on the running TOTAL, not the delta or the ship date: the total
        // only ever climbs, so every credit event has its own key, while a
        // replayed PUT carrying identical state lands on the one already spent.
        idempotencyKey: `skipline:${next.stripeSubscriptionId ?? userId}:${line.id}:${line.pendingCredit ?? 0}`,
      })
    } catch (err) {
      console.error(`[hub] line credit of £${delta} failed to reach Stripe for ${userId}:`, err)
    }
  }
}

const round = (n: number) => Math.round(n * 100) / 100
