import {
  getSupplierSource,
  getSupplierMode,
  hasPowerBodyCredentials,
  isPowerBodyLive,
  setSupplierOverride,
} from '@/lib/supplier'

const ENV_KEYS = [
  'SUPPLIER_SOURCE',
  'POWERBODY_API_URL',
  'POWERBODY_API_USER',
  'POWERBODY_API_KEY',
] as const

function setCredentials() {
  process.env.POWERBODY_API_URL = 'https://www.powerbody.co.uk/api/soap/'
  process.env.POWERBODY_API_USER = 'test-user'
  process.env.POWERBODY_API_KEY = 'test-key'
}

describe('supplier resolver', () => {
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key]
      delete process.env[key]
    }
    setSupplierOverride(null)
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
    setSupplierOverride(null)
  })

  describe('hasPowerBodyCredentials', () => {
    it('is false until url, user and key are all set', () => {
      expect(hasPowerBodyCredentials()).toBe(false)
      process.env.POWERBODY_API_URL = 'https://www.powerbody.co.uk/api/soap/'
      expect(hasPowerBodyCredentials()).toBe(false)
      // The key without a username cannot open a SOAP session — login() takes both.
      process.env.POWERBODY_API_KEY = 'test-key'
      expect(hasPowerBodyCredentials()).toBe(false)
    })

    it('is true when all three are set', () => {
      setCredentials()
      expect(hasPowerBodyCredentials()).toBe(true)
    })
  })

  describe('default (mock-first)', () => {
    it('resolves to mock when no override and no credentials', () => {
      expect(getSupplierMode()).toBe('mock')
      expect(getSupplierSource()).toBe('mock')
      expect(isPowerBodyLive()).toBe(false)
    })

    it('stays on mock even when credentials are present (no override)', () => {
      setCredentials()
      expect(getSupplierMode()).toBe('mock')
      expect(getSupplierSource()).toBe('mock')
    })
  })

  describe('auto mode (explicit)', () => {
    it('uses powerbody when credentials are present', () => {
      setCredentials()
      process.env.SUPPLIER_SOURCE = 'auto'
      expect(getSupplierMode()).toBe('auto')
      expect(getSupplierSource()).toBe('powerbody')
      expect(isPowerBodyLive()).toBe(true)
    })

    it('falls back to mock without credentials', () => {
      process.env.SUPPLIER_SOURCE = 'auto'
      expect(getSupplierSource()).toBe('mock')
    })
  })

  describe('explicit override', () => {
    it('forces mock even when credentials are present', () => {
      setCredentials()
      process.env.SUPPLIER_SOURCE = 'mock'
      expect(getSupplierSource()).toBe('mock')
    })

    it('uses powerbody when forced and credentials are present', () => {
      setCredentials()
      process.env.SUPPLIER_SOURCE = 'powerbody'
      expect(getSupplierSource()).toBe('powerbody')
    })

    it('falls back to mock when forced to powerbody but credentials are missing', () => {
      process.env.SUPPLIER_SOURCE = 'powerbody'
      expect(getSupplierMode()).toBe('powerbody')
      expect(getSupplierSource()).toBe('mock')
    })

    it('ignores unrecognised values and treats them as mock', () => {
      setCredentials()
      process.env.SUPPLIER_SOURCE = 'nonsense'
      expect(getSupplierMode()).toBe('mock')
      expect(getSupplierSource()).toBe('mock')
    })

    it('is case-insensitive', () => {
      setCredentials()
      process.env.SUPPLIER_SOURCE = 'POWERBODY'
      expect(getSupplierSource()).toBe('powerbody')
    })
  })

  describe('portal runtime override', () => {
    it('wins over the environment', () => {
      setCredentials()
      process.env.SUPPLIER_SOURCE = 'powerbody'
      setSupplierOverride('mock')
      expect(getSupplierMode()).toBe('mock')
      expect(getSupplierSource()).toBe('mock')
    })
  })
})
