import {
  getDataSource,
  getDataSourceMode,
  hasShopifyCredentials,
  isShopifyLive,
} from '@/lib/data-source'

const ENV_KEYS = [
  'DATA_SOURCE',
  'NEXT_PUBLIC_DATA_SOURCE',
  'NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN',
  'NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN',
] as const

function setCredentials() {
  process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN = 'example.myshopify.com'
  process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN = 'test-token'
}

describe('data-source resolver', () => {
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  })

  describe('hasShopifyCredentials', () => {
    it('is false without both domain and token', () => {
      expect(hasShopifyCredentials()).toBe(false)
      process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN = 'example.myshopify.com'
      expect(hasShopifyCredentials()).toBe(false)
    })

    it('is true when both are set', () => {
      setCredentials()
      expect(hasShopifyCredentials()).toBe(true)
    })
  })

  describe('default (mock-first)', () => {
    it('resolves to mock when no override and no credentials', () => {
      expect(getDataSourceMode()).toBe('mock')
      expect(getDataSource()).toBe('mock')
      expect(isShopifyLive()).toBe(false)
    })

    it('stays on mock even when credentials are present (no override)', () => {
      setCredentials()
      expect(getDataSourceMode()).toBe('mock')
      expect(getDataSource()).toBe('mock')
      expect(isShopifyLive()).toBe(false)
    })
  })

  describe('auto mode (explicit)', () => {
    it('uses shopify when credentials are present', () => {
      setCredentials()
      process.env.DATA_SOURCE = 'auto'
      expect(getDataSourceMode()).toBe('auto')
      expect(getDataSource()).toBe('shopify')
      expect(isShopifyLive()).toBe(true)
    })

    it('falls back to mock without credentials', () => {
      process.env.DATA_SOURCE = 'auto'
      expect(getDataSource()).toBe('mock')
    })
  })

  describe('explicit override', () => {
    it('forces mock even when credentials are present', () => {
      setCredentials()
      process.env.DATA_SOURCE = 'mock'
      expect(getDataSourceMode()).toBe('mock')
      expect(getDataSource()).toBe('mock')
    })

    it('uses shopify when forced and credentials are present', () => {
      setCredentials()
      process.env.DATA_SOURCE = 'shopify'
      expect(getDataSource()).toBe('shopify')
    })

    it('falls back to mock when forced to shopify but credentials are missing', () => {
      process.env.DATA_SOURCE = 'shopify'
      expect(getDataSourceMode()).toBe('shopify')
      expect(getDataSource()).toBe('mock')
    })

    it('ignores unrecognised values and treats them as mock', () => {
      setCredentials()
      process.env.DATA_SOURCE = 'nonsense'
      expect(getDataSourceMode()).toBe('mock')
      expect(getDataSource()).toBe('mock')
    })

    it('is case-insensitive', () => {
      setCredentials()
      process.env.DATA_SOURCE = 'MOCK'
      expect(getDataSource()).toBe('mock')
    })
  })

  describe('NEXT_PUBLIC_DATA_SOURCE precedence', () => {
    it('wins over DATA_SOURCE', () => {
      setCredentials()
      process.env.DATA_SOURCE = 'shopify'
      process.env.NEXT_PUBLIC_DATA_SOURCE = 'mock'
      expect(getDataSource()).toBe('mock')
    })
  })
})
