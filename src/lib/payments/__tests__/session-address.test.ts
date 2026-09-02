/**
 * Where a delivery address is allowed to come from.
 *
 * One rule, and it is the whole test: the billing address on
 * `customer_details` is never a delivery address. It is where the CARD is
 * registered — the office for a company card, a parent's house for a borrowed
 * one — and using it produces an order that is complete, plausible and going to
 * the wrong building. No address at all is caught by the fulfilment queue and by
 * `submitOrderToSupplier`; a plausible wrong one is caught by nothing.
 */
import { handleStripeEvent } from '@/lib/payments/webhook'
import { createOrderFromCheckout, newOrderId } from '@/lib/orders/service'
import { getOrder } from '@/lib/orders/repo'

jest.mock('@/lib/monitoring/report', () => ({ reportError: jest.fn(async () => {}) }))

const BILLING = { line1: '1 Head Office Way', city: 'Leeds', postal_code: 'LS1 1AA', country: 'GB' }
const SHIPPING = { line1: '42 Customer Close', city: 'York', postal_code: 'YO1 7HH', country: 'GB' }

async function pendingOrder() {
  return createOrderFromCheckout({
    id: newOrderId(),
    status: 'pending_payment',
    channel: 'shop',
    userId: null,
    email: 'buyer@example.com',
    shipping: 0,
    lines: [{ sku: 'SKU1', productId: 'p1', title: 'Whey', quantity: 1, unitPrice: 20 }],
  })
}

function completedEvent(orderId: string, session: Record<string, unknown>) {
  return {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_1',
        object: 'checkout.session',
        mode: 'payment',
        client_reference_id: orderId,
        payment_intent: 'pi_1',
        amount_total: 2000,
        currency: 'gbp',
        customer_details: { email: 'buyer@example.com', name: 'Buyer', address: BILLING },
        ...session,
      },
    },
    // The handler only reads `type` and `data.object`.
  } as never
}

describe('the delivery address on a completed session', () => {
  it('takes the newer collected_information.shipping_details', async () => {
    const order = await pendingOrder()
    await handleStripeEvent(
      completedEvent(order.id, {
        collected_information: { shipping_details: { name: 'Ada', address: SHIPPING } },
      }),
    )
    expect((await getOrder(order.id))?.shippingAddress).toMatchObject({
      name: 'Ada',
      line1: '42 Customer Close',
      postcode: 'YO1 7HH',
    })
  })

  it('takes the older top-level shipping_details', async () => {
    const order = await pendingOrder()
    await handleStripeEvent(
      completedEvent(order.id, { shipping_details: { name: 'Ada', address: SHIPPING } }),
    )
    expect((await getOrder(order.id))?.shippingAddress?.line1).toBe('42 Customer Close')
  })

  it('NEVER falls back to the billing address when no shipping details arrive', async () => {
    const order = await pendingOrder()
    await handleStripeEvent(completedEvent(order.id, {}))

    const stored = await getOrder(order.id)
    // Paid, so the money is recorded — but with nothing to ship against.
    expect(stored?.status).toBe('paid')
    expect(stored?.shippingAddress).toBeNull()
  })

  it('reports the miss rather than letting it pass quietly', async () => {
    const { reportError } = jest.requireMock('@/lib/monitoring/report')
    ;(reportError as jest.Mock).mockClear()

    const order = await pendingOrder()
    await handleStripeEvent(completedEvent(order.id, {}))

    expect(reportError).toHaveBeenCalledTimes(1)
    const [, meta] = (reportError as jest.Mock).mock.calls[0]
    expect(meta.severity).toBe('critical')
    expect(meta.context.stage).toBe('address-extraction')
    // The diagnostic that tells "Stripe moved the field" apart from "nobody was asked".
    expect(meta.context.hasBillingAddress).toBe(true)
  })
})
