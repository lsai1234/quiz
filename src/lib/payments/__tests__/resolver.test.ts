import {
  getPaymentSource,
  getPaymentMode,
  hasStripeCredentials,
  isStripeLive,
  setPaymentOverride,
} from '@/lib/payments'

const ENV_KEYS = ['PAYMENTS_SOURCE', 'STRIPE_SECRET_KEY'] as const

function setCredentials() {
  process.env.STRIPE_SECRET_KEY = 'sk_test_123'
}

describe('payments resolver', () => {
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key]
      delete process.env[key]
    }
    setPaymentOverride(null)
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
    setPaymentOverride(null)
  })

  describe('hasStripeCredentials', () => {
    it('is false without a secret key', () => {
      expect(hasStripeCredentials()).toBe(false)
    })

    it('is true when the secret key is set', () => {
      setCredentials()
      expect(hasStripeCredentials()).toBe(true)
    })
  })

  describe('default (mock-first)', () => {
    it('resolves to mock when no override and no credentials', () => {
      expect(getPaymentMode()).toBe('mock')
      expect(getPaymentSource()).toBe('mock')
      expect(isStripeLive()).toBe(false)
    })

    it('stays on mock even when credentials are present (no override)', () => {
      setCredentials()
      expect(getPaymentMode()).toBe('mock')
      expect(getPaymentSource()).toBe('mock')
    })
  })

  describe('auto mode (explicit)', () => {
    it('uses stripe when credentials are present', () => {
      setCredentials()
      process.env.PAYMENTS_SOURCE = 'auto'
      expect(getPaymentMode()).toBe('auto')
      expect(getPaymentSource()).toBe('stripe')
      expect(isStripeLive()).toBe(true)
    })

    it('falls back to mock without credentials', () => {
      process.env.PAYMENTS_SOURCE = 'auto'
      expect(getPaymentSource()).toBe('mock')
    })
  })

  describe('explicit override', () => {
    it('forces mock even when credentials are present', () => {
      setCredentials()
      process.env.PAYMENTS_SOURCE = 'mock'
      expect(getPaymentSource()).toBe('mock')
    })

    it('uses stripe when forced and credentials are present', () => {
      setCredentials()
      process.env.PAYMENTS_SOURCE = 'stripe'
      expect(getPaymentSource()).toBe('stripe')
    })

    it('falls back to mock when forced to stripe but credentials are missing', () => {
      process.env.PAYMENTS_SOURCE = 'stripe'
      expect(getPaymentMode()).toBe('stripe')
      expect(getPaymentSource()).toBe('mock')
    })

    it('ignores unrecognised values and treats them as mock', () => {
      setCredentials()
      process.env.PAYMENTS_SOURCE = 'nonsense'
      expect(getPaymentMode()).toBe('mock')
      expect(getPaymentSource()).toBe('mock')
    })

    it('is case-insensitive', () => {
      setCredentials()
      process.env.PAYMENTS_SOURCE = 'STRIPE'
      expect(getPaymentSource()).toBe('stripe')
    })
  })

  describe('portal runtime override', () => {
    it('wins over the environment', () => {
      setCredentials()
      process.env.PAYMENTS_SOURCE = 'stripe'
      setPaymentOverride('mock')
      expect(getPaymentMode()).toBe('mock')
      expect(getPaymentSource()).toBe('mock')
    })
  })
})
