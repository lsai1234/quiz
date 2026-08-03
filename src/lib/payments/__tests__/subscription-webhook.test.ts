import type Stripe from 'stripe'
import { handleStripeEvent } from '@/lib/payments/webhook'
import { createMockSubscription } from '@/lib/recharge/mock'
import { saveSubscription, getSubscription } from '@/lib/db/hub-data'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { listOrders, getOrder } from '@/lib/orders/repo'
import { createUser } from '@/lib/db/users'

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
