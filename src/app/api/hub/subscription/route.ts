import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { getStoredPlan, saveSubscription, listFeedback, getQuiz } from '@/lib/db/hub-data'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { createMockSubscription } from '@/lib/recharge/mock'
import { boxCreditMoves, type BoxCreditMove } from '@/lib/hub/skip-credits'
import { cleanRoutine } from '@/lib/recharge/routine'
import { normaliseIncomingSubscription } from '@/lib/recharge/reprice'
import { seedsDemoSubscription } from '@/lib/recharge/demo-seed'
import { syncSubscriptionToStripe } from '@/lib/payments/subscription-sync'
import { syncPortalRuntime } from '@/lib/portal/store'
import { getPaymentSource } from '@/lib/payments'
import type { MemberSubscription } from '@/lib/recharge/types'
import { extrasDroppedBySkip, keepStoredExtras } from '@/lib/hub/next-box'
import { reportErrorAsync } from '@/lib/monitoring/report'

export const dynamic = 'force-dynamic'

/**
 * GET /api/hub/subscription → { subscription, version, feedback, quiz, seeded }
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
 *
 * `version` is the stored plan's fingerprint (`getStoredPlan`). The hub sends it
 * back with every change, so a change made to a plan that has since moved on is
 * caught rather than saved over the newer one.
 */
export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const stored = await getStoredPlan(user.id)
  let subscription = stored?.subscription ?? null
  let version = stored?.version ?? null
  let seeded = false
  // Never over someone who joined the hub on its own: a demo box plan would contradict what they bought.
  const { getHubPlan } = await import('@/lib/hub-plan/store')
  // Nor over a sample member (Settings → Test views): their state is the scenario's.
  const { isSampleEmail } = await import('@/lib/samples/domain')
  if (!subscription && seedsDemoSubscription(user.email) && !isSampleEmail(user.email) && !(await getHubPlan(user.id))) {
    const { products } = await getResolvedCatalogue()
    subscription = createMockSubscription(products, user.email ?? '')
    version = await saveSubscription(user.id, subscription)
    seeded = true
  }

  const [feedback, quiz] = await Promise.all([listFeedback(user.id), getQuiz(user.id)])
  return NextResponse.json({ subscription, version, feedback, quiz, seeded })
}

/**
 * PUT /api/hub/subscription
 * Body: { subscription: MemberSubscription, version?: string }
 *   → { ok, version, subscription } | { error, code? }
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
 *
 * It changes a plan; it never creates one. Plans are made by checkout (and, where
 * no money can be taken, the demo seed). This route used to save whatever it was
 * sent into an account that had no plan, and since any plan that isn't cancelled
 * opens the whole hub (`hubAccessFrom`), anyone signed in could give themselves a
 * subscription at £0 with one request. An account with no plan is now a 409.
 *
 * `version` is the fingerprint the hub was given with the plan it is showing.
 * When it no longer matches what is stored, the plan has moved on since (another
 * tab, another device, a renewal), and saving this document would quietly undo
 * that. The answer is a 409 with the current plan and its version, so the hub can
 * make the member's change again on top of it (`hub-store`). Optional, so an
 * older client still saves as it did.
 *
 * A save answers with the plan as stored (re-priced here, see below) and its new
 * version, which the hub carries into its next change.
 */
export async function PUT(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: { subscription?: unknown; version?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const incoming = body.subscription as MemberSubscription | undefined
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.lines)) {
    return NextResponse.json({ error: 'subscription must be a MemberSubscription' }, { status: 400 })
  }

  const stored = await getStoredPlan(user.id)
  if (!stored) {
    return NextResponse.json({ error: 'There’s no plan on this account to change.', code: 'no-plan' }, { status: 409 })
  }
  const previous = stored.subscription
  if (typeof body.version === 'string' && body.version !== stored.version) {
    return NextResponse.json(
      {
        error: 'Your plan changed somewhere else, so we’ve loaded the latest.',
        code: 'stale',
        subscription: previous,
        version: stored.version,
      },
      { status: 409 },
    )
  }

  // Server-held fields the browser has no business changing.
  const claimed: MemberSubscription = keepStoredExtras(previous, {
    ...incoming,
    stripeSubscriptionId: previous.stripeSubscriptionId,
    stripeCustomerId: previous.stripeCustomerId,
    shippingAddress: previous.shippingAddress,
    monthsActive: previous.monthsActive,
    billingStatus: previous.billingStatus,
    // Their routine is theirs to change, but only to the choices on offer.
    routine: incoming.routine === undefined ? previous.routine : cleanRoutine(incoming.routine) ?? previous.routine,
    // Stripe bills a linked plan on its own day and each box is raised by that
    // charge, so the day is Stripe's (`billing-day`), not the browser's.
    dispatchDayOfMonth: previous.stripeSubscriptionId ? previous.dispatchDayOfMonth : incoming.dispatchDayOfMonth,
    // The old one-offs were never charged or packed: a plan Stripe bills takes no new ones.
    deliveryOverrides: previous.stripeSubscriptionId
      ? pinLegacyOneOffs(previous, incoming.deliveryOverrides)
      : incoming.deliveryOverrides,
  })

  await syncPortalRuntime()

  /* Everything above is identity; this is the money. The prices, the monthly
     total, the subscribe-&-save rate, the skip credits and the shipped counts
     are all re-derived from what we already hold — see `normaliseIncomingSubscription`,
     which is also where the list of what a hand-written PUT used to be able to
     do is written down. */
  const { products } = await getResolvedCatalogue()
  const priced = normaliseIncomingSubscription(previous, claimed, products)
  if (!priced.ok) {
    return NextResponse.json({ error: priced.reason }, { status: 400 })
  }
  /* A skipped box's credit, both ways (`hub/skip-credits`): recorded on the box
     before the plan is saved, paid or taken back in Stripe after. */
  const billed = Boolean(previous.stripeCustomerId) && getPaymentSource() === 'stripe'
  const moves = boxCreditMoves(previous, priced.subscription, { billed })
  const subscription = moves.subscription

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
    reportErrorAsync(sync.cancelError, { surface: 'myhub', severity: 'critical', path: '/api/hub/subscription', userId: user.id, context: { step: 'cancel-in-stripe' } })
  }

  const version = await saveSubscription(user.id, subscription)
  await unchargeSkippedExtras(user.id, previous, subscription)
  await settleSkippedBoxes(user.id, subscription, moves)
  await creditNewlySkippedLines(user.id, previous, subscription)
  return NextResponse.json({ ok: true, version, subscription })
}

/**
 * Credit a box the member has just skipped, or take back the credit for one
 * they've just restored.
 *
 * The Terms promise it: *"the value of the skipped box is credited against your
 * next one"*. The value is priced SERVER-SIDE from the lines due in that cycle
 * (`creditForSkippedBox`), never from the document the browser sent, and each
 * credit is keyed by the box and its number (`skipSeq`), so a replayed save
 * can't pay it twice, and a restore takes back exactly the credit it undoes.
 * Never throws: a credit that fails to reach Stripe is a bookkeeping problem
 * for the founders, reported as critical, and failing the member's skip over
 * it would be a worse one.
 */
async function settleSkippedBoxes(
  userId: string,
  next: MemberSubscription,
  moves: { credits: BoxCreditMove[]; debits: BoxCreditMove[] },
): Promise<void> {
  if (!next.stripeCustomerId || getPaymentSource() !== 'stripe') return
  if (moves.credits.length === 0 && moves.debits.length === 0) return
  const { creditCustomerBalance, debitCustomerBalance } = await import('@/lib/payments/stripe')
  const key = next.stripeSubscriptionId ?? userId

  for (const move of moves.credits) {
    try {
      await creditCustomerBalance({
        customerId: next.stripeCustomerId,
        amount: move.amount,
        description: `CHRGD — credit for the box you skipped (${move.id})`,
        idempotencyKey: `skip:${key}:${move.id}:${move.seq}`,
      })
    } catch (err) {
      console.error(`[hub] skip credit of £${move.amount} failed to reach Stripe for ${userId}:`, err)
      reportErrorAsync(err, { surface: 'myhub', severity: 'critical', path: '/api/hub/subscription', userId, context: { step: 'skip-credit', amount: move.amount } })
    }
  }
  for (const move of moves.debits) {
    try {
      await debitCustomerBalance({
        customerId: next.stripeCustomerId,
        amount: move.amount,
        description: `CHRGD — the box you restored (${move.id}) ships, so its skip credit comes back off`,
        idempotencyKey: `unskip:${key}:${move.id}:${move.seq}`,
      })
    } catch (err) {
      console.error(`[hub] taking back a skip credit of £${move.amount} failed in Stripe for ${userId}:`, err)
      reportErrorAsync(err, { surface: 'myhub', severity: 'critical', path: '/api/hub/subscription', userId, context: { step: 'unskip-debit', amount: move.amount } })
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
      reportErrorAsync(err, { surface: 'myhub', severity: 'critical', path: '/api/hub/subscription', userId, context: { step: 'line-credit', amount: delta } })
    }
  }
}

/**
 * The old one-off list (`addedProductIds`) as stored, whatever the browser sent:
 * on a plan Stripe bills it was never charged or packed, so it may not grow.
 * Extras go through `/api/hub/next-box` now.
 */
function pinLegacyOneOffs(
  previous: MemberSubscription,
  incoming: MemberSubscription['deliveryOverrides'],
): MemberSubscription['deliveryOverrides'] {
  const out = { ...(incoming ?? {}) }
  for (const id of new Set([...Object.keys(previous.deliveryOverrides ?? {}), ...Object.keys(out)])) {
    const stored = previous.deliveryOverrides?.[id]?.addedProductIds
    if (!out[id]) {
      if (stored?.length) out[id] = { addedProductIds: stored }
      continue
    }
    const { addedProductIds: _sent, ...rest } = out[id]
    void _sent
    out[id] = stored?.length ? { ...rest, addedProductIds: stored } : rest
  }
  return out
}

/**
 * A box the member has just skipped sends nothing, so the extras they had added
 * to it come off its payment (`extrasDroppedBySkip`). Never throws: the skip
 * stands either way, and an extra still on the payment is reported to be taken
 * off by hand.
 */
async function unchargeSkippedExtras(userId: string, previous: MemberSubscription, next: MemberSubscription): Promise<void> {
  const dropped = extrasDroppedBySkip(previous, next).filter((x) => x.invoiceItemId)
  if (!dropped.length || getPaymentSource() !== 'stripe') return
  const { removeInvoiceItem } = await import('@/lib/payments/stripe')
  for (const extra of dropped) {
    try {
      if (!(await removeInvoiceItem(extra.invoiceItemId!))) {
        console.warn(`[hub] skipped box's extra ${extra.id} was already invoiced for ${userId}`)
      }
    } catch (err) {
      reportErrorAsync(err, { surface: 'myhub', severity: 'critical', path: '/api/hub/subscription', userId, context: { step: 'uncharge-skipped-extra', invoiceItemId: extra.invoiceItemId } })
    }
  }
}

const round = (n: number) => Math.round(n * 100) / 100
