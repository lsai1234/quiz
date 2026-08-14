/**
 * What we actually send Stripe for a subscription.
 *
 * These exist because of a live outage nobody could see from a unit test: the
 * subscription Session was built with `shipping_options`, which is a
 * payment-mode parameter, and Stripe rejects the whole request for carrying
 * one. Every subscription checkout failed at the last step — the member signed
 * in, the plan saved, and then "we couldn't start your payment just then" —
 * while one-off baskets, being payment mode, went through fine. The finalize
 * tests never caught it because they stub `createSubscriptionSession` itself,
 * so nothing had ever looked at the parameters.
 */
import type Stripe from 'stripe'

const sessionsCreate = jest.fn()
const couponsRetrieve = jest.fn()
const subscriptionsRetrieve = jest.fn()
const subscriptionsUpdate = jest.fn()

jest.mock('stripe', () => {
  class FakeStripe {
    checkout = { sessions: { create: (...a: unknown[]) => sessionsCreate(...a) } }
    coupons = {
      retrieve: (...a: unknown[]) => couponsRetrieve(...a),
      create: jest.fn(),
    }
    subscriptions = {
      retrieve: (...a: unknown[]) => subscriptionsRetrieve(...a),
      update: (...a: unknown[]) => subscriptionsUpdate(...a),
    }
  }
  return { __esModule: true, default: FakeStripe }
})

const base = {
  monthlyTotal: 52.18,
  clientReferenceId: 'user-1',
  customerEmail: 'member@example.com',
  successUrl: 'https://getchrgd.co.uk/order/confirmation?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://getchrgd.co.uk/myhub',
}

const mainland = { id: 'uk-mainland' as const, zone: 'uk-1' as const, label: 'UK mainland', price: 2.95 }

/** The params of the one session we asked for. */
function params(): Stripe.Checkout.SessionCreateParams {
  return sessionsCreate.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams
}

/** A line item's inline price data, which is how every line here is priced. */
function priceDataOf(item: Stripe.Checkout.SessionCreateParams.LineItem) {
  return item.price_data as Stripe.Checkout.SessionCreateParams.LineItem.PriceData
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_not_a_real_key'
  sessionsCreate.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' })
  couponsRetrieve.mockResolvedValue({ id: 'chrgd-first-month-20' })
})
afterEach(() => {
  jest.clearAllMocks()
})

describe('createSubscriptionSession', () => {
  it('never sends shipping_options — Stripe refuses them in subscription mode', async () => {
    const { createSubscriptionSession } = await import('../stripe')
    await createSubscriptionSession({ ...base, delivery: mainland })

    expect(params().mode).toBe('subscription')
    expect(params().shipping_options).toBeUndefined()
  })

  it('still collects a delivery address — a box has to go somewhere', async () => {
    // Address COLLECTION is supported in subscription mode; only the RATES are
    // not. Dropping this with the shipping options would have left every
    // subscription box undeliverable in the fulfilment queue.
    const { createSubscriptionSession } = await import('../stripe')
    await createSubscriptionSession({ ...base, delivery: mainland })

    expect(params().shipping_address_collection).toEqual({ allowed_countries: ['GB'] })
  })

  it('bills postage as its own recurring line, at the rate quoted', async () => {
    const { createSubscriptionSession } = await import('../stripe')
    await createSubscriptionSession({ ...base, delivery: mainland })

    const lines = params().line_items ?? []
    expect(lines).toHaveLength(2)
    expect(priceDataOf(lines[0]).unit_amount).toBe(5218)
    const postage = priceDataOf(lines[1])
    expect(postage.unit_amount).toBe(295)
    // Recurring, not one-off: a box ships every cycle, so postage is owed every
    // cycle. A one-time price here would post it once and ship free forever after.
    expect(postage.recurring).toEqual({ interval: 'month' })
    expect(postage.product_data?.name).toContain('UK mainland')
  })

  it('adds no postage line when the plan ships free', async () => {
    const { createSubscriptionSession } = await import('../stripe')
    await createSubscriptionSession({ ...base, delivery: null })

    expect(params().line_items).toHaveLength(1)
  })

  it('tags the plan line so a later price change can find it', async () => {
    const { createSubscriptionSession } = await import('../stripe')
    await createSubscriptionSession({ ...base, delivery: mainland })

    const lines = params().line_items ?? []
    expect(priceDataOf(lines[0]).product_data?.metadata).toMatchObject({ chrgdLine: 'stack' })
    expect(priceDataOf(lines[1]).product_data?.metadata).toMatchObject({ chrgdLine: 'delivery' })
  })
})

describe('updateSubscriptionAmount', () => {
  const item = (id: string, tag: string | null, productId: string) => ({
    id,
    price: {
      currency: 'gbp',
      product: tag ? { id: productId, metadata: { chrgdLine: tag } } : { id: productId, metadata: {} },
    },
  })

  it('writes the new monthly onto the plan line, never onto postage', async () => {
    // The failure this guards against is not subtle: the member is billed the
    // plan's price as postage and a couple of pounds for their supplements.
    subscriptionsRetrieve.mockResolvedValue({
      items: { data: [item('si_post', 'delivery', 'prod_post'), item('si_stack', 'stack', 'prod_stack')] },
    })
    const { updateSubscriptionAmount } = await import('../stripe')
    await updateSubscriptionAmount('sub_1', 61.5)

    const [, update] = subscriptionsUpdate.mock.calls[0]
    expect(update.items).toHaveLength(1)
    expect(update.items[0].id).toBe('si_stack')
    expect(update.items[0].price_data.product).toBe('prod_stack')
    expect(update.items[0].price_data.unit_amount).toBe(6150)
  })

  it('still works for a plan that predates the tags', async () => {
    // Subscriptions sold before postage had its own line have one untagged item,
    // and it is the plan by definition.
    subscriptionsRetrieve.mockResolvedValue({ items: { data: [item('si_only', null, 'prod_old')] } })
    const { updateSubscriptionAmount } = await import('../stripe')
    await updateSubscriptionAmount('sub_2', 40)

    expect(subscriptionsUpdate.mock.calls[0][1].items[0].id).toBe('si_only')
  })
})
