/**
 * Keeping our order ledger in step with Stripe's.
 *
 * Money can move without anyone touching the Founders Hub — a refund issued from
 * the Stripe dashboard, a checkout the customer abandoned. Without these
 * handlers the two ledgers drift apart silently, and the orders list slowly
 * fills with rows that will never resolve.
 */
import type Stripe from 'stripe'
import { handleStripeEvent } from '@/lib/payments/webhook'
import { createOrderFromCheckout, sweepStalePendingOrders } from '@/lib/orders/service'
import { getOrder } from '@/lib/orders/repo'

const line = { sku: 'X', productId: 'x', title: 'X', quantity: 1, unitPrice: 10 }

function expiredEvent(orderId: string): Stripe.Event {
  return {
    id: 'evt_exp',
    type: 'checkout.session.expired',
    data: { object: { id: 'cs_exp', client_reference_id: orderId } as Stripe.Checkout.Session },
  } as unknown as Stripe.Event
}

function refundedEvent(paymentIntentId: string): Stripe.Event {
  return {
    id: 'evt_ref',
    type: 'charge.refunded',
    data: { object: { id: 'ch_1', payment_intent: paymentIntentId } as Stripe.Charge },
  } as unknown as Stripe.Event
}

describe('abandoned checkouts', () => {
  it('closes the pending order when the session expires', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', lines: [line], status: 'pending_payment' })
    expect((await handleStripeEvent(expiredEvent(order.id))).handled).toBe(true)
    expect((await getOrder(order.id))?.status).toBe('failed')
  })

  it('never undoes a payment that landed first', async () => {
    // Stripe does not promise event order. A late `expired` arriving after the
    // payment succeeded must not un-pay a real order.
    const order = await createOrderFromCheckout({ channel: 'shop', lines: [line], status: 'paid' })
    expect((await handleStripeEvent(expiredEvent(order.id))).handled).toBe(false)
    expect((await getOrder(order.id))?.status).toBe('paid')
  })

  it('sweeps stale pending orders whose webhook never arrived', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', lines: [line], status: 'pending_payment' })
    // Run the sweep from two days hence rather than backdating the row —
    // `saveOrder` deliberately never rewrites `created_at` on update.
    const inTwoDays = new Date(Date.now() + 48 * 3600_000)

    expect(await sweepStalePendingOrders(24, inTwoDays)).toBeGreaterThan(0)
    expect((await getOrder(order.id))?.status).toBe('failed')
  })

  it('leaves a recent pending order alone', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', lines: [line], status: 'pending_payment' })
    await sweepStalePendingOrders(24)
    expect((await getOrder(order.id))?.status).toBe('pending_payment')
  })
})

describe('refunds issued in Stripe', () => {
  it('reconciles back onto the order', async () => {
    const order = await createOrderFromCheckout({
      channel: 'shop',
      lines: [line],
      status: 'paid',
      stripePaymentIntentId: 'pi_refund_me',
    })
    expect((await handleStripeEvent(refundedEvent('pi_refund_me'))).handled).toBe(true)
    expect((await getOrder(order.id))?.status).toBe('refunded')
  })

  it('is idempotent on redelivery', async () => {
    const order = await createOrderFromCheckout({
      channel: 'shop',
      lines: [line],
      status: 'paid',
      stripePaymentIntentId: 'pi_twice',
    })
    await handleStripeEvent(refundedEvent('pi_twice'))
    expect((await handleStripeEvent(refundedEvent('pi_twice'))).handled).toBe(false)
    const refunded = await getOrder(order.id)
    expect(refunded?.events.filter((e) => e.type === 'refunded')).toHaveLength(1)
  })

  it('ignores a charge we have no order for', async () => {
    expect((await handleStripeEvent(refundedEvent('pi_unknown'))).handled).toBe(false)
  })
})
