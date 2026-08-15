/**
 * Whether a hub sign-in with no stored plan is handed the demo one.
 *
 * The rule is one line and it is worth a test file of its own, because the bug
 * it prevents is silent: a customer who signed up and never bought anything
 * opening the hub to a stack, a monthly figure and delivery dates that were
 * invented for them and then saved to their account.
 */
import { seedsDemoSubscription } from '@/lib/recharge/demo-seed'
import { setPaymentOverride } from '@/lib/payments'

const ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ENV }
  setPaymentOverride(null)
})

describe('seeding the demo plan', () => {
  it('keeps npm run dev demoable with no credentials', () => {
    // The whole product works with nothing configured, and the sign-in screen
    // says so. That promise is this branch.
    setPaymentOverride('mock')
    expect(seedsDemoSubscription()).toBe(true)
  })

  it('never invents a plan where the cards are real', () => {
    setPaymentOverride('stripe')
    process.env.STRIPE_SECRET_KEY = 'sk_test_pretend'
    expect(seedsDemoSubscription()).toBe(false)
  })

  it('falls back to demo data when Stripe is asked for but not configured', () => {
    // `getPaymentSource` already resolves this: a forced `stripe` with no
    // credentials is mock, and nothing here should disagree with the resolver
    // that decides whether money can move.
    setPaymentOverride('stripe')
    delete process.env.STRIPE_SECRET_KEY
    expect(seedsDemoSubscription()).toBe(true)
  })

  it('can be turned off, so the empty hub is reachable without live keys', () => {
    setPaymentOverride('mock')
    process.env.HUB_DEMO_SUBSCRIPTION = 'off'
    expect(seedsDemoSubscription()).toBe(false)
  })

  it('cannot be turned back on where money is real', () => {
    // There is deliberately no `on`. Nothing should be able to switch
    // fabricated data on for a deployment taking payments.
    setPaymentOverride('stripe')
    process.env.STRIPE_SECRET_KEY = 'sk_test_pretend'
    process.env.HUB_DEMO_SUBSCRIPTION = 'on'
    expect(seedsDemoSubscription()).toBe(false)
  })

  it('ignores anything it does not recognise', () => {
    setPaymentOverride('mock')
    process.env.HUB_DEMO_SUBSCRIPTION = 'yes-please'
    expect(seedsDemoSubscription()).toBe(true)
  })
})
