import type Stripe from 'stripe'
import { handleStripeEvent } from '@/lib/payments/webhook'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { getOrder } from '@/lib/orders/repo'

function completedEvent(orderId: string, over: Partial<Stripe.Checkout.Session> = {}): Stripe.Event {
  return {
    id: 'evt_test',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        client_reference_id: orderId,
        payment_intent: 'pi_test_123',
        customer_details: { email: 'guest@example.com' },
        ...over,
      } as Stripe.Checkout.Session,
    },
  } as unknown as Stripe.Event
}

describe('stripe webhook handler', () => {
  it('marks the pending order paid on checkout.session.completed', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', lines: [{ sku: 'X', productId: 'x', title: 'X', quantity: 1, unitPrice: 10 }], status: 'pending_payment' })
    const outcome = await handleStripeEvent(
      completedEvent(order.id, {
        shipping_details: { name: 'Sam Guest', address: { line1: '1 High St', city: 'London', postal_code: 'E1 6AN', country: 'GB' } },
      } as unknown as Partial<Stripe.Checkout.Session>),
    )
    expect(outcome).toEqual({ handled: true, type: 'checkout.session.completed', orderId: order.id })

    const paid = await getOrder(order.id)
    expect(paid?.status).toBe('paid')
    expect(paid?.stripeSessionId).toBe('cs_test_123')
    expect(paid?.stripePaymentIntentId).toBe('pi_test_123')
    expect(paid?.email).toBe('guest@example.com')
    expect(paid?.shippingAddress?.postcode).toBe('E1 6AN')
    expect(paid?.shippingAddress?.line1).toBe('1 High St')
  })

  it('sends the receipt to the address Stripe collected, not before', async () => {
    /**
     * The order is raised BEFORE the redirect, when we have neither an email
     * address nor a delivery address — Stripe collects both. So the confirmation
     * can only be queued on the transition to paid, and it has to carry what the
     * session brought back with it.
     */
    const { listNotifications } = await import('@/lib/notify/outbox')
    const order = await createOrderFromCheckout({
      channel: 'shop',
      lines: [{ sku: 'X', productId: 'x', title: 'Creatine', quantity: 1, unitPrice: 10 }],
      status: 'pending_payment',
    })
    expect((await listNotifications({ limit: 500 })).filter((n) => n.email === 'receipt@example.com')).toHaveLength(0)

    await handleStripeEvent(
      completedEvent(order.id, {
        customer_details: { email: 'receipt@example.com' },
        shipping_details: { name: 'Sam Guest', address: { line1: '1 High St', city: 'London', postal_code: 'E1 6AN', country: 'GB' } },
      } as unknown as Partial<Stripe.Checkout.Session>),
    )

    const queued = (await listNotifications({ limit: 500 })).filter((n) => n.email === 'receipt@example.com')
    expect(queued).toHaveLength(1)
    expect(queued[0].template).toBe('order-confirmation')
    expect(queued[0].rendered.text).toContain('Creatine')
    // The address is on the receipt because that is where somebody checks it.
    expect(queued[0].rendered.text).toContain('E1 6AN')
  })

  it('does not send a second receipt when Stripe redelivers the event', async () => {
    const { listNotifications } = await import('@/lib/notify/outbox')
    const order = await createOrderFromCheckout({
      channel: 'shop',
      lines: [{ sku: 'X', productId: 'x', title: 'X', quantity: 1, unitPrice: 10 }],
      status: 'pending_payment',
    })
    const event = completedEvent(order.id, {
      customer_details: { email: 'once@example.com' },
    } as unknown as Partial<Stripe.Checkout.Session>)

    await handleStripeEvent(event)
    await handleStripeEvent(event)

    expect((await listNotifications({ limit: 500 })).filter((n) => n.email === 'once@example.com')).toHaveLength(1)
  })

  it('is idempotent on redelivery', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', lines: [{ sku: 'X', productId: 'x', title: 'X', quantity: 1, unitPrice: 10 }], status: 'pending_payment' })
    await handleStripeEvent(completedEvent(order.id))
    await handleStripeEvent(completedEvent(order.id, { id: 'cs_second' }))
    const paid = await getOrder(order.id)
    expect(paid?.stripeSessionId).toBe('cs_test_123') // first one stuck
    expect(paid?.events.filter((e) => e.type === 'paid')).toHaveLength(1)
  })

  it('ignores a session with no client_reference_id', async () => {
    const outcome = await handleStripeEvent(completedEvent('', { client_reference_id: null }))
    expect(outcome.handled).toBe(false)
  })

  it('ignores unrelated event types', async () => {
    const outcome = await handleStripeEvent({ id: 'evt', type: 'payment_intent.created', data: { object: {} } } as unknown as Stripe.Event)
    expect(outcome.handled).toBe(false)
  })
})
