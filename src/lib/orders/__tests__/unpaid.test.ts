import {
  createOrderFromCheckout,
  submitOrderToSupplier,
  approveOrderForSupplier,
  awaitingReview,
  failOrder,
  markOrderPaid,
} from '@/lib/orders/service'
import { getOrder, listAwaitingFulfilment, updateOrder } from '@/lib/orders/repo'
import { buildFulfilmentQueue } from '@/lib/orders/queue'
import { displayStatus, neverPaid } from '@/lib/orders/unpaid'
import type { OrderLine } from '@/lib/orders/types'

/**
 * An abandoned checkout is stored as `failed`, the same status as a paid order
 * PowerBody refused. These pin down that the two are never confused: the
 * abandoned one is not queue work, cannot be sent, and still becomes a real
 * order if Stripe reports the payment late.
 */

const LINES: OrderLine[] = [
  { sku: 'ON-CREA-634', productId: 'creatine', title: 'Creatine', quantity: 1, unitPrice: 27.99, supplierCost: 16 },
]
const ADDRESS = { name: 'A B', line1: '1 Test St', city: 'London', postcode: 'E1 1AA', country: 'GB', email: 'a@b.com' }

/** A checkout somebody started and walked away from. */
async function abandoned() {
  const order = await createOrderFromCheckout({ channel: 'quiz', lines: LINES, status: 'pending_payment' })
  await failOrder(order.id, 'Checkout session expired without payment')
  return (await getOrder(order.id))!
}

describe('an abandoned checkout', () => {
  it('reads as never paid, and is shown as not paid rather than failed', async () => {
    const order = await abandoned()
    expect(order.status).toBe('failed')
    expect(neverPaid(order)).toBe(true)
    expect(displayStatus(order)).toBe('not_paid')
  })

  it('is not waiting on a founder', async () => {
    const order = await abandoned()
    expect(awaitingReview(order)).toBe(false)
  })

  it('stays out of the review queue', async () => {
    const order = await abandoned()
    const queued = buildFulfilmentQueue(await listAwaitingFulfilment())
    const ids = queued.days.flatMap((d) => d.orders.map((o) => o.id))
    expect(ids).not.toContain(order.id)
  })

  it('cannot be approved', async () => {
    const order = await abandoned()
    await expect(approveOrderForSupplier(order.id, 'Founder')).rejects.toThrow(/never paid/)
  })

  /*
    The dangerous path was: add an address, press "Retry send to PowerBody",
    and goods ship for an order nobody paid for. An approval written by hand
    (or left over from before this existed) must not be enough either.
  */
  it('cannot be sent to the supplier, even with an address and an approval on it', async () => {
    const order = await abandoned()
    await updateOrder(order.id, (o) => {
      o.shippingAddress = ADDRESS
      o.review = { state: 'approved', at: new Date().toISOString() }
    })
    await expect(submitOrderToSupplier(order.id)).rejects.toThrow(/never paid/)
    const after = await getOrder(order.id)
    expect(after?.supplierOrderId).toBeNull()
  })

  /*
    Our sweep closes a checkout because it has not HEARD of a payment. If Stripe
    then reports one, the money was taken and the order is real.
  */
  it('becomes a paid order if Stripe reports the payment late', async () => {
    const order = await abandoned()
    await markOrderPaid(order.id, {
      stripeSessionId: 'cs_late',
      stripePaymentIntentId: 'pi_late',
      email: 'late@b.com',
      shippingAddress: ADDRESS,
    })
    const paid = (await getOrder(order.id))!
    expect(paid.status).toBe('paid')
    expect(paid.shippingAddress?.line1).toBe('1 Test St')
    expect(neverPaid(paid)).toBe(false)
    expect(awaitingReview(paid)).toBe(true)
  })
})

describe('a paid order the supplier refused', () => {
  it('is still a failure to act on, not an abandoned basket', async () => {
    const order = await createOrderFromCheckout({ channel: 'shop', lines: LINES, shippingAddress: ADDRESS })
    await updateOrder(order.id, (o) => {
      o.status = 'failed'
      o.events.push({ at: new Date().toISOString(), type: 'submit_failed', detail: 'PowerBody said no' })
    })
    const failed = (await getOrder(order.id))!
    expect(neverPaid(failed)).toBe(false)
    expect(displayStatus(failed)).toBe('failed')
    expect(awaitingReview(failed)).toBe(true)
  })

  it('counts as paid when it was closed as unpaid first and paid late', () => {
    const order = {
      status: 'failed',
      events: [
        { type: 'created' },
        { type: 'payment_not_completed' },
        { type: 'paid' },
        { type: 'submit_failed' },
      ],
    }
    expect(neverPaid(order)).toBe(false)
  })
})
