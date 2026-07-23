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
