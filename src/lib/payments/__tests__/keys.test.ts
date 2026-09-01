import {
  activeStripeKeys,
  currentStripeWorld,
  getPaymentSource,
  getStripeEnvironment,
  hasStripeCredentials,
  isStripeEnvironmentConfigured,
  setPaymentOverride,
  setStripeEnvironmentOverride,
  stripeKeyProblems,
  stripeKeysFor,
} from '@/lib/payments'

/**
 * The test/live switch.
 *
 * The cases that matter most here are the refusals — a key whose prefix
 * disagrees with the variable holding it, and a switch to a world with no key.
 * Both are silent in production if they go wrong, and both are the difference
 * between "taking test payments" and "charging real cards".
 */

const ENV_KEYS = [
  'PAYMENTS_SOURCE',
  'STRIPE_ENVIRONMENT',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_TEST_SECRET_KEY',
  'STRIPE_TEST_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY',
  'STRIPE_LIVE_SECRET_KEY',
  'STRIPE_LIVE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY',
] as const

describe('stripe key sets', () => {
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key]
      delete process.env[key]
    }
    setPaymentOverride(null)
    setStripeEnvironmentOverride(null)
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
    setPaymentOverride(null)
    setStripeEnvironmentOverride(null)
  })

  describe('resolving one world at a time', () => {
    it('reads each world from its own variables', () => {
      process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_aaa'
      process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test'
      process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY = 'pk_test_aaa'
      process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live_bbb'
      process.env.STRIPE_LIVE_WEBHOOK_SECRET = 'whsec_live'
      process.env.NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY = 'pk_live_bbb'

      expect(stripeKeysFor('test')).toEqual({
        environment: 'test',
        secretKey: 'sk_test_aaa',
        webhookSecret: 'whsec_test',
        publishableKey: 'pk_test_aaa',
      })
      expect(stripeKeysFor('live')).toEqual({
        environment: 'live',
        secretKey: 'sk_live_bbb',
        webhookSecret: 'whsec_live',
        publishableKey: 'pk_live_bbb',
      })
    })

    it('never lends one world the other world’s webhook secret', () => {
      process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_aaa'
      process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live_bbb'
      process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test'

      expect(stripeKeysFor('live').webhookSecret).toBeNull()
    })

    it('does not treat an empty or placeholder value as configured', () => {
      process.env.STRIPE_LIVE_SECRET_KEY = '   '
      process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_xxx'

      expect(isStripeEnvironmentConfigured('live')).toBe(false)
      expect(isStripeEnvironmentConfigured('test')).toBe(false)
    })
  })

  describe('the prefix decides, not the variable name', () => {
    it('refuses a test key sitting in the live variable', () => {
      process.env.STRIPE_LIVE_SECRET_KEY = 'sk_test_wrong'

      expect(stripeKeysFor('live').secretKey).toBeNull()
      expect(isStripeEnvironmentConfigured('live')).toBe(false)
    })

    it('refuses a live key sitting in the test variable', () => {
      process.env.STRIPE_TEST_SECRET_KEY = 'sk_live_wrong'

      expect(stripeKeysFor('test').secretKey).toBeNull()
    })

    it('says which variable is wrong and why', () => {
      process.env.STRIPE_LIVE_SECRET_KEY = 'sk_test_wrong'

      const problems = stripeKeyProblems()
      expect(problems).toHaveLength(1)
      expect(problems[0].variable).toBe('STRIPE_LIVE_SECRET_KEY')
      expect(problems[0].environment).toBe('live')
      expect(problems[0].detail).toContain('test-mode key')
    })

    it('has nothing to report when both worlds are configured correctly', () => {
      process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_aaa'
      process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live_bbb'

      expect(stripeKeyProblems()).toEqual([])
    })

    it('accepts restricted keys, which carry the same marker', () => {
      process.env.STRIPE_LIVE_SECRET_KEY = 'rk_live_restricted'

      expect(stripeKeysFor('live').secretKey).toBe('rk_live_restricted')
    })

    it('refuses a publishable key from the wrong world', () => {
      process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_aaa'
      process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY = 'pk_live_wrong'

      expect(stripeKeysFor('test').publishableKey).toBeNull()
      expect(stripeKeysFor('test').secretKey).toBe('sk_test_aaa')
    })
  })

  describe('the legacy single key set', () => {
    it('fills in for whichever world its prefix belongs to', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_live_legacy'
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_legacy'
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_live_legacy'

      expect(stripeKeysFor('live')).toEqual({
        environment: 'live',
        secretKey: 'sk_live_legacy',
        webhookSecret: 'whsec_legacy',
        publishableKey: 'pk_live_legacy',
      })
      expect(stripeKeysFor('test').secretKey).toBeNull()
      // The legacy webhook secret belongs to the legacy key's world only.
      expect(stripeKeysFor('test').webhookSecret).toBeNull()
    })

    it('is superseded by the explicit variable for that world', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_legacy'
      process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_explicit'

      expect(stripeKeysFor('test').secretKey).toBe('sk_test_explicit')
    })

    it('keeps a live-only legacy deployment on live, rather than defaulting it to test', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_live_legacy'

      expect(getStripeEnvironment()).toBe('live')
    })
  })

  describe('which world is selected', () => {
    it('defaults to test', () => {
      expect(getStripeEnvironment()).toBe('test')
    })

    it('prefers test when both worlds have keys', () => {
      process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_aaa'
      process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live_bbb'

      expect(getStripeEnvironment()).toBe('test')
    })

    it('reads STRIPE_ENVIRONMENT, case-insensitively', () => {
      process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_aaa'
      process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live_bbb'
      process.env.STRIPE_ENVIRONMENT = 'LIVE'

      expect(getStripeEnvironment()).toBe('live')
    })

    it('lets the portal override win over the environment', () => {
      process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_aaa'
      process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live_bbb'
      process.env.STRIPE_ENVIRONMENT = 'live'
      setStripeEnvironmentOverride('test')

      expect(getStripeEnvironment()).toBe('test')
      expect(activeStripeKeys().secretKey).toBe('sk_test_aaa')
    })
  })

  describe('credentials are per environment', () => {
    it('reports none when the selected world has no key, even with the other world configured', () => {
      process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live_bbb'
      setStripeEnvironmentOverride('test')

      expect(hasStripeCredentials()).toBe(false)
    })

    it('falls back to mock rather than charging in the world that does have keys', () => {
      process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live_bbb'
      process.env.PAYMENTS_SOURCE = 'stripe'
      setStripeEnvironmentOverride('test')

      expect(getPaymentSource()).toBe('mock')
      expect(currentStripeWorld()).toBe('mock')
    })

    it('charges once the selected world is configured', () => {
      process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_aaa'
      process.env.PAYMENTS_SOURCE = 'stripe'
      setStripeEnvironmentOverride('test')

      expect(getPaymentSource()).toBe('stripe')
    })
  })

  describe('the world stamped on a row', () => {
    it('follows the resolved key, not the setting', () => {
      process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_aaa'
      process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live_bbb'
      process.env.PAYMENTS_SOURCE = 'stripe'

      setStripeEnvironmentOverride('live')
      expect(currentStripeWorld()).toBe('live')

      setStripeEnvironmentOverride('test')
      expect(currentStripeWorld()).toBe('sandbox')
    })

    it('is mock whenever payments are not on Stripe, whatever the keys say', () => {
      process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live_bbb'
      setStripeEnvironmentOverride('live')
      setPaymentOverride('mock')

      expect(currentStripeWorld()).toBe('mock')
    })
  })
})
