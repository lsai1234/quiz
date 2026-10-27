/**
 * The free bonus in Stripe (plan Phase 4): a £0.00 line on a one-off, a
 * one-time £0.00 line on a subscription's first invoice, and the session still
 * created (with the gift named under the button) if Stripe won't take £0.00
 * lines. What is charged never changes.
 */
import type Stripe from 'stripe'

const sessionsCreate = jest.fn()

jest.mock('stripe', () => {
  class FakeStripe {
    checkout = { sessions: { create: (...a: unknown[]) => sessionsCreate(...a) } }
    coupons = { retrieve: jest.fn().mockResolvedValue({ id: 'c' }), create: jest.fn() }
  }
  return { __esModule: true, default: FakeStripe }
})

const urls = { successUrl: 'https://x/ok', cancelUrl: 'https://x/no' }
const params = (n = 0) => sessionsCreate.mock.calls[n][0] as Stripe.Checkout.SessionCreateParams
const priceOf = (i: Stripe.Checkout.SessionCreateParams.LineItem) => i.price_data as Stripe.Checkout.SessionCreateParams.LineItem.PriceData
const total = (p: Stripe.Checkout.SessionCreateParams) => (p.line_items ?? []).reduce((s, i) => s + (priceOf(i).unit_amount ?? 0) * (i.quantity ?? 1), 0)

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_not_a_real_key'
  sessionsCreate.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' })
})
afterEach(() => jest.clearAllMocks())

const lines = [
  { name: 'CHRGD Whey', unitPrice: 30, quantity: 1 },
  { name: 'CHRGD Creatine', unitPrice: 20, quantity: 1 },
  { name: 'Free: CHRGD Vitamin C + Zinc', unitPrice: 0, quantity: 1, metadata: { line: 'bonus', productId: 'chrgd-vitamin-c-zinc' } },
]

it('puts the bonus on a one-off as a £0.00 line, tagged, and charges the same', async () => {
  const { createCheckoutSession } = await import('../stripe')
  await createCheckoutSession({ lines, clientReferenceId: 'ord_1', ...urls })
  const items = params().line_items ?? []
  expect(items).toHaveLength(3)
  expect(priceOf(items[2]).unit_amount).toBe(0)
  expect(priceOf(items[2]).product_data).toEqual({ name: 'Free: CHRGD Vitamin C + Zinc', metadata: { line: 'bonus', productId: 'chrgd-vitamin-c-zinc' } })
  expect(total(params())).toBe(5000)
})

it('falls back to naming the gift under the button when Stripe refuses £0.00 lines', async () => {
  sessionsCreate.mockRejectedValueOnce(Object.assign(new Error('unit_amount must be at least 1'), { type: 'StripeInvalidRequestError' }))
  const { createCheckoutSession } = await import('../stripe')
  const { url } = await createCheckoutSession({ lines, clientReferenceId: 'ord_1', ...urls })
  expect(url).toContain('checkout.stripe.com')
  const retry = params(1)
  expect(retry.line_items).toHaveLength(2)
  expect((retry.custom_text?.submit as { message?: string } | undefined)?.message).toBe('Includes Free: CHRGD Vitamin C + Zinc (£0.00).')
  expect(total(retry)).toBe(total(params(0)))
})

it('does not swallow other Stripe errors', async () => {
  sessionsCreate.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { type: 'StripeRateLimitError' }))
  const { createCheckoutSession } = await import('../stripe')
  await expect(createCheckoutSession({ lines, clientReferenceId: 'ord_1', ...urls })).rejects.toThrow('rate limited')
})

it('puts the bonus on a subscription as a one-time £0.00 line, so it is on the first invoice only', async () => {
  const { createSubscriptionSession } = await import('../stripe')
  await createSubscriptionSession({
    monthlyTotal: 52.18,
    clientReferenceId: 'user-1',
    ...urls,
    firstInvoiceLines: [lines[2]],
  })
  const items = params().line_items ?? []
  const gift = items.find((i) => priceOf(i).unit_amount === 0)!
  expect(priceOf(gift).recurring).toBeUndefined()
  expect(priceOf(items[0]).recurring).toEqual({ interval: 'month' })
  expect(priceOf(items[0]).unit_amount).toBe(5218)
})
