/**
 * The one way an order reaches the confirmation screen without a Stripe
 * session: a founder "everything free" code, where the total was £0.00 and
 * there was nothing for Stripe to take.
 *
 * The assertions that matter are the refusals. `?order=` is not a way to read
 * an order by id, and the gate is on the ORDER's own evidence — carries a
 * founder code, is paid, never touched Stripe — rather than on the URL.
 */
jest.mock('@/lib/payments', () => ({
  ...jest.requireActual('@/lib/payments'),
  // The whole point of this file: the branch under test only exists in Stripe
  // mode, where the mock-mode escape hatch above it does not run.
  getPaymentSource: () => 'stripe',
}))

import { RECOVERY, resolveConfirmation } from '@/lib/orders/confirmation'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { updateOrder } from '@/lib/orders/repo'

const origin = 'https://example.com'
const line = { sku: 'X', productId: 'x', title: 'Whey', variantTitle: 'Vanilla', quantity: 1, unitPrice: 0 }

async function freeOrder() {
  return createOrderFromCheckout({
    channel: 'shop',
    lines: [line],
    status: 'paid',
    shipping: 0,
    email: 'founder@chrgd.dev',
    founderCode: 'FH-FREE-ABCD2345',
    founderCodeKind: 'free',
  })
}

describe('a free founder order, in Stripe mode', () => {
  it('confirms on the order rather than on the URL', async () => {
    const order = await freeOrder()
    const result = await resolveConfirmation({ mockOrderId: order.id, origin })
    expect(result.state).toBe('confirmed')
    expect(result.order?.reference).toBe(order.reference)
  })

  it('refuses an ordinary order asked for the same way', async () => {
    // Without this, `?order=` would be a way to read any order by id — and the
    // free path is the only reason the parameter is honoured in Stripe mode.
    const ordinary = await createOrderFromCheckout({
      channel: 'shop',
      lines: [{ ...line, unitPrice: 24 }],
      status: 'paid',
    })
    expect(await resolveConfirmation({ mockOrderId: ordinary.id, origin })).toEqual(RECOVERY)
  })

  it('refuses one that has not been paid', async () => {
    const order = await createOrderFromCheckout({
      channel: 'shop',
      lines: [line],
      status: 'pending_payment',
      founderCode: 'FH-COST-ABCD2345',
      founderCodeKind: 'cost',
    })
    expect(await resolveConfirmation({ mockOrderId: order.id, origin })).toEqual(RECOVERY)
  })

  it('refuses one that went through Stripe, which has a session to verify instead', async () => {
    const order = await freeOrder()
    await updateOrder(order.id, (o) => { o.stripeSessionId = 'cs_test_123' })
    expect(await resolveConfirmation({ mockOrderId: order.id, origin })).toEqual(RECOVERY)
  })

  it('refuses an order id that does not exist', async () => {
    expect(await resolveConfirmation({ mockOrderId: 'ord_nope', origin })).toEqual(RECOVERY)
  })

  it('refuses a request carrying neither a session nor an order', async () => {
    expect(await resolveConfirmation({ origin })).toEqual(RECOVERY)
  })
})

describe('the order records why it was free', () => {
  it('carries the code, its kind, and an audit event', async () => {
    const order = await freeOrder()
    expect(order.founderCode).toBe('FH-FREE-ABCD2345')
    expect(order.founderCodeKind).toBe('free')
    expect(order.events.some((e) => e.type === 'founder-code')).toBe(true)
    // Never a partner code, so no commission can accrue against it.
    expect(order.partnerCode).toBeNull()
  })
})
