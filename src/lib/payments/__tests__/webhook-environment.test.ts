/**
 * @jest-environment node
 *
 * Node, not jsdom: the Stripe SDK picks a WebCrypto provider under a browser-ish
 * global, and that provider cannot sign or verify synchronously — which is what
 * `constructWebhookEvent` and the route around it both are.
 */
import Stripe from 'stripe'
import { constructWebhookEvent } from '@/lib/payments/stripe'
import { setStripeEnvironmentOverride } from '@/lib/payments'

/**
 * A webhook signed by the other Stripe world must be REJECTED, not processed.
 *
 * Test and live endpoints have different signing secrets, and processing a
 * test-mode `checkout.session.completed` while live would mark a real order paid
 * for money that never moved. The rejection also has to say what happened: it is
 * the most likely thing to be wrong straight after flipping the switch, and a
 * bare "invalid signature" looks identical to a stale secret.
 */

const ENV_KEYS = [
  'STRIPE_ENVIRONMENT',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_TEST_SECRET_KEY',
  'STRIPE_TEST_WEBHOOK_SECRET',
  'STRIPE_LIVE_SECRET_KEY',
  'STRIPE_LIVE_WEBHOOK_SECRET',
] as const

const TEST_WEBHOOK_SECRET = 'whsec_test_secret'
const LIVE_WEBHOOK_SECRET = 'whsec_live_secret'

const PAYLOAD = JSON.stringify({
  id: 'evt_1',
  object: 'event',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_1', object: 'checkout.session' } },
})

function signWith(secret: string): string {
  return Stripe.webhooks.generateTestHeaderString({ payload: PAYLOAD, secret })
}

describe('webhook verification across Stripe environments', () => {
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key]
      delete process.env[key]
    }
    process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_aaa'
    process.env.STRIPE_TEST_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET
    process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live_bbb'
    process.env.STRIPE_LIVE_WEBHOOK_SECRET = LIVE_WEBHOOK_SECRET
    setStripeEnvironmentOverride(null)
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
    setStripeEnvironmentOverride(null)
  })

  it('accepts an event signed by the selected environment', () => {
    setStripeEnvironmentOverride('test')
    const event = constructWebhookEvent(PAYLOAD, signWith(TEST_WEBHOOK_SECRET))
    expect(event.type).toBe('checkout.session.completed')
  })

  it('accepts a live-signed event once switched to live', () => {
    setStripeEnvironmentOverride('live')
    const event = constructWebhookEvent(PAYLOAD, signWith(LIVE_WEBHOOK_SECRET))
    expect(event.id).toBe('evt_1')
  })

  it('rejects an event signed by the other environment, and names the mismatch', () => {
    setStripeEnvironmentOverride('live')
    expect(() => constructWebhookEvent(PAYLOAD, signWith(TEST_WEBHOOK_SECRET))).toThrow(
      /signed by the test-mode endpoint/,
    )
  })

  it('still rejects a signature that matches neither', () => {
    setStripeEnvironmentOverride('test')
    expect(() => constructWebhookEvent(PAYLOAD, signWith('whsec_nobody'))).toThrow()
  })

  it('refuses to verify anything when the selected environment has no signing secret', () => {
    delete process.env.STRIPE_LIVE_WEBHOOK_SECRET
    setStripeEnvironmentOverride('live')
    expect(() => constructWebhookEvent(PAYLOAD, signWith(TEST_WEBHOOK_SECRET))).toThrow(
      /STRIPE_LIVE_WEBHOOK_SECRET/,
    )
  })
})
