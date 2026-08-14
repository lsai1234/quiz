/**
 * Confirmation emails, end to end against the in-memory database.
 *
 * The behaviours worth pinning down are the ones a customer notices: exactly one
 * receipt per purchase, the receipt's figures matching the ones the website
 * printed, and the subscription email landing somewhere they can actually
 * manage the plan from.
 */
import { queueOrderConfirmation, queueSubscriptionConfirmation } from '@/lib/notify/commerce'
import { listNotifications } from '@/lib/notify/outbox'
import { marketingSuppressed, suppressMarketing } from '@/lib/notify/marketing'
import type { Order } from '@/lib/orders/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import { createUser } from '@/lib/db/users'

function order(over: Partial<Order> = {}): Order {
  return {
    id: `ord_${Math.random().toString(36).slice(2, 10)}`,
    reference: 'CHRGD-7K4M2XQP',
    channel: 'shop',
    status: 'paid',
    userId: null,
    email: 'buyer@example.com',
    currency: 'GBP',
    subtotal: 72,
    shipping: 0,
    total: 72,
    lines: [
      { sku: 'WHEY-1', productId: 'p1', title: 'Gold Standard Whey', variantTitle: 'Vanilla', quantity: 1, unitPrice: 48, supplierCost: 30 },
      { sku: 'CREA-1', productId: 'p2', title: 'Creatine', variantTitle: null, quantity: 2, unitPrice: 12, supplierCost: 6 },
    ],
    shippingAddress: {
      name: 'Lewis Siara',
      line1: '12 Example Street',
      line2: null,
      city: 'Manchester',
      postcode: 'M1 1AA',
      country: 'GB',
      phone: null,
    },
    stripeSessionId: null,
    stripePaymentIntentId: null,
    review: { state: 'pending', at: new Date().toISOString() },
    supplierOrderId: null,
    supplierStatus: null,
    trackingNumber: null,
    partnerCode: null,
    partnerDiscountPct: null,
    billedAmount: null,
    events: [],
    createdAt: '2026-08-14T10:00:00.000Z',
    updatedAt: '2026-08-14T10:00:00.000Z',
    ...over,
  } as Order
}

function subscription(over: Partial<MemberSubscription> = {}): MemberSubscription {
  // A distinct Stripe id per fixture, because that id IS the dedupe key — two
  // fixtures sharing one would have the second silently swallowed as a repeat,
  // which is exactly the behaviour the deduping test below relies on.
  const stripeSubscriptionId = `sub_stripe_${(over.customerEmail ?? 'anon').split('@')[0]}`
  return {
    id: 'sub_test',
    status: 'active',
    customerEmail: 'member@example.com',
    startedAt: '2026-08-14T10:00:00.000Z',
    monthsActive: 0,
    minMonths: 3,
    flatMonthly: 54.94,
    firstMonth: 41.2,
    dispatchDayOfMonth: 14,
    stripeSubscriptionId,
    lines: [
      { id: 'l1', productId: 'p1', productTitle: 'Gold Standard Whey', variantTitle: 'Vanilla', quantity: 1, pricePerDelivery: 30, deliveryIntervalMonths: 1 },
      { id: 'l2', productId: 'p2', productTitle: 'Creatine', variantTitle: '', quantity: 1, pricePerDelivery: 24.94, deliveryIntervalMonths: 2 },
    ],
    shippingAddress: {
      name: 'Lewis Siara',
      line1: '12 Example Street',
      line2: null,
      city: 'Manchester',
      postcode: 'M1 1AA',
      country: 'GB',
      phone: null,
    },
    ...over,
  } as MemberSubscription
}

async function queuedFor(email: string) {
  return (await listNotifications({ limit: 500 })).filter((n) => n.email === email)
}

/**
 * A real account row.
 *
 * `notifications.user_id` is a foreign key into `users`, so a fixture that
 * invents an id has its email silently swallowed — which is worth knowing about
 * rather than working around with a null.
 */
async function member(email: string): Promise<string> {
  return (await createUser({ email })).id
}

describe('order confirmations', () => {
  it('sends one receipt carrying the order’s own figures', async () => {
    const o = order({ email: 'oc-1@example.com' })
    await queueOrderConfirmation(o)

    const [email] = await queuedFor('oc-1@example.com')
    expect(email.template).toBe('order-confirmation')
    expect(email.rendered.subject).toContain('CHRGD-7K4M2XQP')
    expect(email.rendered.text).toContain('Gold Standard Whey')
    expect(email.rendered.text).toContain('£72.00')
    // The stamp is only printed from a payment that actually settled.
    expect(email.rendered.text).toContain('PAYMENT APPROVED')
  })

  it('cannot send two receipts for one order', async () => {
    // Both paths to a paid order — the Stripe webhook and mock mode — call this,
    // and a redelivered webhook calls it again.
    const o = order({ email: 'oc-2@example.com' })
    await queueOrderConfirmation(o)
    await queueOrderConfirmation(o)
    await queueOrderConfirmation(o)

    expect(await queuedFor('oc-2@example.com')).toHaveLength(1)
  })

  it('says nothing about an order that has not been paid for', async () => {
    await queueOrderConfirmation(order({ email: 'oc-3@example.com', status: 'pending_payment' }))
    expect(await queuedFor('oc-3@example.com')).toHaveLength(0)
  })

  it('leaves subscription deliveries alone — a renewal box was not re-ordered', async () => {
    // The member got a subscription confirmation when they signed up. A monthly
    // "your order is confirmed" for a box they did not place is noise.
    await queueOrderConfirmation(order({ email: 'oc-4@example.com', channel: 'subscription' }))
    expect(await queuedFor('oc-4@example.com')).toHaveLength(0)
  })

  it('prints the delivery window as an expectation, never as a promise', async () => {
    await queueOrderConfirmation(order({ email: 'oc-5@example.com' }))
    const [email] = await queuedFor('oc-5@example.com')
    expect(email.rendered.text).toMatch(/should be with you between/i)
    expect(email.rendered.text).not.toMatch(/guaranteed|will arrive on/i)
  })

  it('leaves from the orders address', async () => {
    process.env.NOTIFY_DOMAIN = 'getchrgd.co.uk'
    await queueOrderConfirmation(order({ email: 'oc-6@example.com' }))
    const [email] = await queuedFor('oc-6@example.com')
    expect(email.stream).toBe('orders')
    expect(email.from).toContain('orderconfirmation.noreply@getchrgd.co.uk')
    delete process.env.NOTIFY_DOMAIN
  })
})

describe('subscription confirmations', () => {
  it('leads with the hub, because every later email depends on the member knowing it exists', async () => {
    await queueSubscriptionConfirmation(await member('sc-1@example.com'), subscription({ customerEmail: 'sc-1@example.com' }))
    const [email] = await queuedFor('sc-1@example.com')

    expect(email.template).toBe('subscription-confirmation')
    for (const body of [email.rendered.text, email.rendered.html]) {
      expect(body).toContain('/myhub')
    }
  })

  it('states what recurs, when, and for how long they are committed', async () => {
    // A recurring payment nobody remembers agreeing to is the commonest cause of
    // a chargeback, and the fix is to put it in the confirmation.
    await queueSubscriptionConfirmation(await member('sc-2@example.com'), subscription({ customerEmail: 'sc-2@example.com' }))
    const [email] = await queuedFor('sc-2@example.com')

    expect(email.rendered.text).toContain('£54.94 a month')
    expect(email.rendered.text).toContain('3-month minimum term')
  })

  it('prints what was actually charged today, not the monthly', async () => {
    // Month one is rarely the monthly figure — an intro rate or a partner code
    // sits on it — and printing the monthly would show a charge that never happened.
    await queueSubscriptionConfirmation(await member('sc-3@example.com'), subscription({ customerEmail: 'sc-3@example.com' }), {
      firstPayment: 4120,
    })
    const [email] = await queuedFor('sc-3@example.com')
    expect(email.rendered.text).toContain('£41.20')
  })

  it('lists each delivery rhythm rather than averaging them', async () => {
    await queueSubscriptionConfirmation(await member('sc-4@example.com'), subscription({ customerEmail: 'sc-4@example.com' }))
    const [email] = await queuedFor('sc-4@example.com')
    expect(email.rendered.text).toContain('every 2 months')
  })

  it('cannot confirm the same plan twice', async () => {
    const sub = subscription({ customerEmail: 'sc-5@example.com' })
    const userId = await member('sc-5@example.com')
    await queueSubscriptionConfirmation(userId, sub)
    await queueSubscriptionConfirmation(userId, sub)
    expect(await queuedFor('sc-5@example.com')).toHaveLength(1)
  })

  it('says nothing when there is no address to send to', async () => {
    const before = (await listNotifications({ limit: 500 })).length
    await queueSubscriptionConfirmation(await member('sc-6@example.com'), subscription({ customerEmail: '' }))
    expect((await listNotifications({ limit: 500 })).length).toBe(before)
  })
})

describe('sending without anyone pressing anything', () => {
  // `mock` stands in for a configured provider: it exercises the whole delivery
  // path — attempt, mark sent, record a provider id — without a network call.
  beforeEach(() => { process.env.NOTIFY_SOURCE = 'mock' })
  afterEach(() => { delete process.env.NOTIFY_SOURCE })

  it('delivers an order receipt on the spot, not on the next daily run', async () => {
    // A confirmation that arrives the next morning reads as a shop that lost
    // the order, and generates the support email it was meant to prevent.
    await queueOrderConfirmation(order({ email: 'auto-1@example.com' }))

    const [email] = await queuedFor('auto-1@example.com')
    expect(email.status).toBe('sent')
    expect(email.sentAt).not.toBeNull()
    expect(email.providerId).toMatch(/^mock_/)
    // Not "somebody says they sent it" — the provider took it.
    expect(email.sentManually).toBe(false)
  })

  it('delivers a subscription confirmation on the spot too', async () => {
    await queueSubscriptionConfirmation(await member('auto-2@example.com'), subscription({ customerEmail: 'auto-2@example.com' }))

    const [email] = await queuedFor('auto-2@example.com')
    expect(email.status).toBe('sent')
  })

  it('still leaves anything we decided for a person to read first', async () => {
    process.env.NOTIFY_SOURCE = 'resend'
    process.env.RESEND_API_KEY = 'test-key'
    const { queueNotification } = await import('@/lib/notify/outbox')

    await queueNotification({
      userId: null,
      email: 'auto-3@example.com',
      template: 'price-change-notice',
      dedupeKey: 'price:auto-3',
      rendered: { subject: 'Your monthly is changing', text: 'x', html: '<p>x</p>' },
    })

    const [email] = await queuedFor('auto-3@example.com')
    expect(email.status).toBe('queued')
    delete process.env.RESEND_API_KEY
  })

  it('records a receipt that could not be delivered rather than losing it', async () => {
    // The webhook that took the money must not fail over a mail server, but the
    // customer is still owed the receipt — so it stays visible and retryable.
    process.env.NOTIFY_SOURCE = 'resend'
    process.env.RESEND_API_KEY = 'test-key'
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'upstream on fire' })
    const realFetch = global.fetch
    global.fetch = fetchMock as unknown as typeof fetch

    await queueOrderConfirmation(order({ email: 'auto-4@example.com' }))

    const [email] = await queuedFor('auto-4@example.com')
    expect(email.status).toBe('failed')
    expect(email.error).toContain('500')
    expect(email.attempts).toBe(1)

    global.fetch = realFetch
    delete process.env.RESEND_API_KEY
  })

  it('retries the failed receipt on the next run, and leaves the rest alone', async () => {
    /**
     * The daily job has always been described as the thing that retries
     * yesterday's failed email, and until now it only looked at `queued` rows —
     * so a receipt that failed once stayed failed until somebody noticed. A
     * provider having one bad minute must not be how a customer ends up with no
     * record of what they paid.
     */
    process.env.NOTIFY_SOURCE = 'resend'
    process.env.RESEND_API_KEY = 'test-key'
    const realFetch = global.fetch
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: 'resend_retry_1' }) }) as unknown as typeof fetch

    const { flushOutbox, listNotifications } = await import('@/lib/notify/outbox')
    expect((await queuedFor('auto-4@example.com'))[0].status).toBe('failed')

    await flushOutbox()

    const [receipt] = await queuedFor('auto-4@example.com')
    expect(receipt.status).toBe('sent')
    expect(receipt.attempts).toBe(2)

    // The same sweep must not have quietly posted the price-change notice that
    // is sitting there waiting for a human to read it.
    const decided = (await listNotifications({ limit: 500 })).filter((n) => n.email === 'auto-3@example.com')
    expect(decided[0]?.status).toBe('queued')

    global.fetch = realFetch
    delete process.env.RESEND_API_KEY
  })
})

describe('the promotional strip', () => {
  it('always ships with a way to refuse it', async () => {
    // PECR's soft opt-in only covers marketing to a customer if every message
    // offers a simple means of refusing. No link, no strip.
    await queueOrderConfirmation(order({ email: 'mk-1@example.com' }))
    const [email] = await queuedFor('mk-1@example.com')
    expect(email.rendered.html).toContain('marketing-opt-out')
    expect(email.rendered.text).toContain('marketing-opt-out')
  })

  it('disappears once someone has opted out', async () => {
    await suppressMarketing('mk-2@example.com')
    expect(await marketingSuppressed('mk-2@example.com')).toBe(true)

    await queueOrderConfirmation(order({ email: 'mk-2@example.com' }))
    const [email] = await queuedFor('mk-2@example.com')
    expect(email.rendered.html).not.toContain('marketing-opt-out')
    expect(email.rendered.html).not.toContain('Take the quiz')
  })

  it('does not take the receipt with it', async () => {
    // Opting out of marketing must never stop the emails that are the record of
    // what someone bought.
    await suppressMarketing('mk-3@example.com')
    await queueOrderConfirmation(order({ email: 'mk-3@example.com' }))

    const [email] = await queuedFor('mk-3@example.com')
    expect(email.rendered.text).toContain('£72.00')
    expect(email.rendered.text).toContain('CHRGD-7K4M2XQP')
  })
})
