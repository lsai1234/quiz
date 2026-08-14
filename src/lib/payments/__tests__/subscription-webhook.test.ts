import type Stripe from 'stripe'
import { handleStripeEvent } from '@/lib/payments/webhook'
import { createMockSubscription } from '@/lib/recharge/mock'
import { saveSubscription, getSubscription } from '@/lib/db/hub-data'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { listOrders, getOrder } from '@/lib/orders/repo'
import { createUser } from '@/lib/db/users'
import { listNotifications } from '@/lib/notify/outbox'

async function makeUserWithSub(email: string) {
  const user = await createUser({ email })
  const sub = createMockSubscription(MOCK_CATALOGUE, email)
  await saveSubscription(user.id, sub)
  return user
}

function subCompletedEvent(userId: string, subId: string): Stripe.Event {
  return {
    id: 'evt_sub',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_sub_1',
        mode: 'subscription',
        client_reference_id: userId,
        subscription: subId,
        customer: 'cus_123',
      } as Stripe.Checkout.Session,
    },
  } as unknown as Stripe.Event
}

function invoicePaidEvent(subId: string, invoiceId: string, billingReason = 'subscription_cycle'): Stripe.Event {
  return {
    id: 'evt_inv',
    type: 'invoice.paid',
    data: {
      object: { id: invoiceId, subscription: subId, billing_reason: billingReason } as unknown as Stripe.Invoice,
    },
  } as unknown as Stripe.Event
}

describe('subscription webhook flow', () => {
  it('links + activates on subscription checkout, then invoice.paid raises a fulfilment order', async () => {
    const user = await makeUserWithSub('sub1@example.com')
    const subId = 'sub_stripe_1'

    const linked = await handleStripeEvent(subCompletedEvent(user.id, subId))
    expect(linked).toMatchObject({ handled: true, userId: user.id })
    const stored = await getSubscription(user.id)
    expect(stored?.status).toBe('active')
    expect(stored?.stripeSubscriptionId).toBe(subId)
    expect(stored?.stripeCustomerId).toBe('cus_123')

    const paid = await handleStripeEvent(invoicePaidEvent(subId, 'in_1'))
    expect(paid.handled).toBe(true)
    const order = await getOrder(`ord_inv_in_1`)
    expect(order?.channel).toBe('subscription')
    expect(order?.status).toBe('paid')
    expect(order?.lines.length).toBeGreaterThan(0)
  })

  it('confirms the plan by email as soon as it is linked and active', async () => {
    // This handler is the first moment the plan has a Stripe id, an `active`
    // status and an address all at once — which is why the confirmation is sent
    // from here rather than from wherever the checkout was started.
    const user = await makeUserWithSub('confirm1@example.com')
    await handleStripeEvent(subCompletedEvent(user.id, 'sub_confirm_1'))

    const queued = (await listNotifications({ userId: user.id })).filter(
      (n) => n.template === 'subscription-confirmation',
    )
    expect(queued).toHaveLength(1)
    // The hub link is the whole point of this email: every later notification
    // leans on "you can change this yourself", and this is where they learn where.
    expect(queued[0].rendered.text).toContain('/myhub')
    expect(queued[0].rendered.text).toContain('SUBSCRIPTION RECEIPT')
  })

  it('cannot confirm the same plan twice when Stripe redelivers the event', async () => {
    const user = await makeUserWithSub('confirm2@example.com')
    await handleStripeEvent(subCompletedEvent(user.id, 'sub_confirm_2'))
    await handleStripeEvent(subCompletedEvent(user.id, 'sub_confirm_2'))

    const queued = (await listNotifications({ userId: user.id })).filter(
      (n) => n.template === 'subscription-confirmation',
    )
    expect(queued).toHaveLength(1)
  })

  it('does not also send an order confirmation for the signup box', async () => {
    // The signup box raises a subscription-channel order, and a "your order is
    // confirmed" alongside the plan confirmation would be two receipts for one
    // purchase. Every renewal would be another.
    const user = await makeUserWithSub('confirm3@example.com')
    const subId = 'sub_confirm_3'
    await handleStripeEvent(subCompletedEvent(user.id, subId))
    await handleStripeEvent(invoicePaidEvent(subId, 'in_confirm_3', 'subscription_create'))
    await handleStripeEvent(invoicePaidEvent(subId, 'in_confirm_3b'))

    const queued = await listNotifications({ userId: user.id })
    expect(queued.filter((n) => n.template === 'order-confirmation')).toHaveLength(0)
    expect(queued.filter((n) => n.template === 'subscription-confirmation')).toHaveLength(1)
  })

  it('raises each renewal against the NEXT cycle, not a repeat of the signup box', async () => {
    /**
     * The clock is advanced further down the handler, so `sub.monthsActive` is
     * one behind when the order is raised. Reading it without the +1 makes every
     * renewal compute cycle 0 — i.e. the signup box — which is the shape of the
     * over-shipping bug this replaced: every multi-month item, every month.
     *
     * Asserted through the webhook rather than the pure function because the
     * off-by-one lives here, in the ordering of two statements.
     */
    const user = await makeUserWithSub('cycles@example.com')
    const subId = 'sub_stripe_cycles'
    await handleStripeEvent(subCompletedEvent(user.id, subId))

    // Start at zero, which is what a REAL checkout produces. The demo seed uses
    // `monthsActive: 2`, so its first renewal lands on cycle 3 — where a
    // three-month tub is genuinely due again, and the test would pass whether or
    // not the cadence filter existed. That same seed is what hid the cancel bug
    // in S-1 of the Stripe plan; it hides this one too.
    const seeded = (await getSubscription(user.id))!
    await saveSubscription(user.id, { ...seeded, monthsActive: 0 })

    const stored = await getSubscription(user.id)
    const multiMonth = stored!.lines.filter((l) => l.deliveryIntervalMonths > 1)
    // The fixture needs at least one spread line or this proves nothing.
    expect(multiMonth.length).toBeGreaterThan(0)

    await handleStripeEvent(invoicePaidEvent(subId, 'in_c1', 'subscription_create'))
    const first = await getOrder('ord_inv_in_c1')
    // Signup box: everything.
    expect(first!.lines).toHaveLength(stored!.lines.length)

    // First renewal — the spread lines are not due again yet.
    await handleStripeEvent(invoicePaidEvent(subId, 'in_c2'))
    const renewal = await getOrder('ord_inv_in_c2')
    expect(renewal!.lines.length).toBeLessThan(first!.lines.length)
    for (const line of multiMonth) {
      expect(renewal!.lines.some((l) => l.productId === line.productId)).toBe(false)
    }
  })

  it('ends a scheduled free exit by itself once the clock reaches it', async () => {
    /**
     * Option B. Nothing was charged and nothing was stopped — the plan ran on as
     * it was, which is what pays the balance off — and it ends on the month the
     * member picked, with nothing to pay.
     */
    const user = await makeUserWithSub('scheduled@example.com')
    const subId = 'sub_stripe_sched'
    await handleStripeEvent(subCompletedEvent(user.id, subId))

    const seeded = (await getSubscription(user.id))!
    await saveSubscription(user.id, { ...seeded, monthsActive: 0, scheduledExitMonth: 2 })

    // Not yet — the plan is still running, and still shipping.
    await handleStripeEvent(invoicePaidEvent(subId, 'in_s1'))
    const midway = (await getSubscription(user.id))!
    expect(midway.status).toBe('active')
    expect(midway.monthsActive).toBe(1)

    // The month they chose. It ends itself, free.
    await handleStripeEvent(invoicePaidEvent(subId, 'in_s2'))
    const ended = (await getSubscription(user.id))!
    expect(ended.status).toBe('cancelled')
    expect(ended.scheduledExitMonth).toBeNull()
    expect(ended.exit?.settlement).toBe(0)
    expect(ended.exit?.waiver).toBe('nothing-owed')
  })

  // ── Event ordering ──────────────────────────────────────────────────────────
  // Stripe does not promise the ORDER of events, only their delivery. The first
  // invoice of a subscription and the checkout session that links it are emitted
  // together, so the invoice can arrive first — before anything knows whose
  // subscription it is.

  it('asks for a retry when the first invoice beats the checkout session', async () => {
    const user = await makeUserWithSub('race@example.com')
    const subId = 'sub_stripe_race'

    // Invoice first. Nothing can resolve it yet — and answering "handled" would
    // retire the event for good, losing the member's first box silently.
    const early = await handleStripeEvent(invoicePaidEvent(subId, 'in_race', 'subscription_create'))
    expect(early).toMatchObject({ handled: false, retryable: true })
    expect(await getOrder('ord_inv_in_race')).toBeNull()

    // Stripe redelivers after the session has linked it, and the box is raised.
    await handleStripeEvent(subCompletedEvent(user.id, subId))
    const retried = await handleStripeEvent(invoicePaidEvent(subId, 'in_race', 'subscription_create'))
    expect(retried.handled).toBe(true)
    expect((await getOrder('ord_inv_in_race'))?.channel).toBe('subscription')
  })

  it('does not ask for retries on a renewal for a subscription that is not ours', async () => {
    // A first invoice we cannot place is a race worth waiting out. A RENEWAL for
    // an unknown subscription is somebody else's, and retrying it for three days
    // would be noise rather than recovery.
    const outcome = await handleStripeEvent(invoicePaidEvent('sub_not_ours', 'in_foreign'))
    expect(outcome).toMatchObject({ handled: false })
    expect(outcome.retryable).toBeFalsy()
  })

  it('is idempotent: a redelivered invoice.paid does not double-create the order', async () => {
    const user = await makeUserWithSub('sub2@example.com')
    const subId = 'sub_stripe_2'
    await handleStripeEvent(subCompletedEvent(user.id, subId))
    await handleStripeEvent(invoicePaidEvent(subId, 'in_2'))
    await handleStripeEvent(invoicePaidEvent(subId, 'in_2'))
    const subOrders = (await listOrders({ channel: 'subscription' })).filter((o) => o.id === 'ord_inv_in_2')
    expect(subOrders).toHaveLength(1)
  })

  // ── The subscription clock ──────────────────────────────────────────────────
  // Stripe's invoice stream is what tells us how many cycles a member has
  // actually paid for, and the cancel settlement is measured against exactly
  // that. Every assertion below is really about someone's bill.

  it('advances the clock on a renewal invoice', async () => {
    const user = await makeUserWithSub('clock1@example.com')
    const subId = 'sub_clock_1'
    await handleStripeEvent(subCompletedEvent(user.id, subId))
    const before = (await getSubscription(user.id))!.monthsActive

    await handleStripeEvent(invoicePaidEvent(subId, 'in_clock_1', 'subscription_cycle'))

    const after = (await getSubscription(user.id))!
    expect(after.monthsActive).toBe(before + 1)
    // Lines are re-derived, not left behind.
    const monthly = after.lines.find((l) => l.deliveryIntervalMonths === 1)
    if (monthly) expect(monthly.deliveriesMade).toBeGreaterThan(0)
  })

  it('does NOT advance the clock on the first invoice', async () => {
    // `subscription_create` is the month already accounted for by monthsActive: 0
    // plus the box that ships at signup. Counting it here would credit the member
    // with paying for their first month twice, and undercharge the settlement.
    const user = await makeUserWithSub('clock2@example.com')
    const subId = 'sub_clock_2'
    await handleStripeEvent(subCompletedEvent(user.id, subId))
    const before = (await getSubscription(user.id))!.monthsActive

    await handleStripeEvent(invoicePaidEvent(subId, 'in_clock_2', 'subscription_create'))

    expect((await getSubscription(user.id))!.monthsActive).toBe(before)
  })

  it('does not advance the clock twice for a redelivered invoice', async () => {
    // Stripe redelivers. A second advance would silently shrink what the member
    // owes on cancellation, so this is a money assertion, not a tidiness one.
    const user = await makeUserWithSub('clock3@example.com')
    const subId = 'sub_clock_3'
    await handleStripeEvent(subCompletedEvent(user.id, subId))
    const before = (await getSubscription(user.id))!.monthsActive

    await handleStripeEvent(invoicePaidEvent(subId, 'in_clock_3'))
    await handleStripeEvent(invoicePaidEvent(subId, 'in_clock_3'))
    await handleStripeEvent(invoicePaidEvent(subId, 'in_clock_3'))

    expect((await getSubscription(user.id))!.monthsActive).toBe(before + 1)
  })

  it('advances once per distinct invoice', async () => {
    const user = await makeUserWithSub('clock4@example.com')
    const subId = 'sub_clock_4'
    await handleStripeEvent(subCompletedEvent(user.id, subId))
    const before = (await getSubscription(user.id))!.monthsActive

    await handleStripeEvent(invoicePaidEvent(subId, 'in_clock_4a'))
    await handleStripeEvent(invoicePaidEvent(subId, 'in_clock_4b'))
    await handleStripeEvent(invoicePaidEvent(subId, 'in_clock_4c'))

    expect((await getSubscription(user.id))!.monthsActive).toBe(before + 3)
  })

  // ── Dunning ─────────────────────────────────────────────────────────────────
  // Before these, a failed card meant Stripe retried silently and we learned
  // nothing until the subscription was deleted weeks later — while the hub
  // showed a perfectly healthy plan and the member was never told.

  it('flags past_due on a failed payment without stopping the plan', async () => {
    const user = await makeUserWithSub('dun1@example.com')
    const subId = 'sub_dun_1'
    await handleStripeEvent(subCompletedEvent(user.id, subId))

    const evt = {
      id: 'evt_fail',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_fail_1', subscription: subId } as unknown as Stripe.Invoice },
    } as unknown as Stripe.Event
    expect((await handleStripeEvent(evt)).handled).toBe(true)

    const stored = (await getSubscription(user.id))!
    expect(stored.billingStatus).toBe('past_due')
    // Still active: it is still their plan and still shipping while Stripe retries.
    expect(stored.status).toBe('active')
  })

  it('queues exactly one email across a run of retries', async () => {
    // Stripe raises payment_failed on EVERY retry. Four identical emails about
    // one expired card is how a solvable problem becomes a cancellation.
    const user = await makeUserWithSub('dun2@example.com')
    const subId = 'sub_dun_2'
    await handleStripeEvent(subCompletedEvent(user.id, subId))

    const evt = (invoiceId: string) => ({
      id: `evt_${invoiceId}`,
      type: 'invoice.payment_failed',
      data: { object: { id: invoiceId, subscription: subId } as unknown as Stripe.Invoice },
    }) as unknown as Stripe.Event

    await handleStripeEvent(evt('in_r1'))
    await handleStripeEvent(evt('in_r1'))
    await handleStripeEvent(evt('in_r2'))

    const queued = (await listNotifications({ userId: user.id })).filter((n) => n.template === 'payment-failed')
    expect(queued).toHaveLength(1)
  })

  it('clears past_due when a payment finally succeeds', async () => {
    const user = await makeUserWithSub('dun3@example.com')
    const subId = 'sub_dun_3'
    await handleStripeEvent(subCompletedEvent(user.id, subId))
    await handleStripeEvent({
      id: 'evt_f',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_f', subscription: subId } as unknown as Stripe.Invoice },
    } as unknown as Stripe.Event)
    expect((await getSubscription(user.id))!.billingStatus).toBe('past_due')

    await handleStripeEvent(invoicePaidEvent(subId, 'in_recovered'))
    expect((await getSubscription(user.id))!.billingStatus).toBe('ok')
  })

  // ── State changed outside our hub ───────────────────────────────────────────

  it('mirrors a cancellation made in the Stripe dashboard', async () => {
    const user = await makeUserWithSub('mirror1@example.com')
    const subId = 'sub_mirror_1'
    await handleStripeEvent(subCompletedEvent(user.id, subId))

    await handleStripeEvent({
      id: 'evt_upd',
      type: 'customer.subscription.updated',
      data: { object: { id: subId, status: 'canceled' } as unknown as Stripe.Subscription },
    } as unknown as Stripe.Event)

    expect((await getSubscription(user.id))!.status).toBe('cancelled')
  })

  it('mirrors a pause applied in Stripe', async () => {
    const user = await makeUserWithSub('mirror2@example.com')
    const subId = 'sub_mirror_2'
    await handleStripeEvent(subCompletedEvent(user.id, subId))

    await handleStripeEvent({
      id: 'evt_pause',
      type: 'customer.subscription.updated',
      data: {
        object: { id: subId, status: 'active', pause_collection: { behavior: 'void' } } as unknown as Stripe.Subscription,
      },
    } as unknown as Stripe.Event)

    expect((await getSubscription(user.id))!.status).toBe('paused')
  })

  it('cancels the member subscription on customer.subscription.deleted', async () => {
    const user = await makeUserWithSub('sub3@example.com')
    const subId = 'sub_stripe_3'
    await handleStripeEvent(subCompletedEvent(user.id, subId))
    const evt = { id: 'evt_del', type: 'customer.subscription.deleted', data: { object: { id: subId } as Stripe.Subscription } } as unknown as Stripe.Event
    const out = await handleStripeEvent(evt)
    expect(out.handled).toBe(true)
    expect((await getSubscription(user.id))?.status).toBe('cancelled')
  })
})
