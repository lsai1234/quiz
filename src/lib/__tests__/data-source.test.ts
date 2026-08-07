import {
  getDataSource,
  getDataSourceMode,
  isLiveCatalogue,
  setDataSourceOverride,
} from '@/lib/data-source'

const ENV_KEYS = ['DATA_SOURCE', 'NEXT_PUBLIC_DATA_SOURCE'] as const

describe('data-source resolver', () => {
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key]
      delete process.env[key]
    }
    setDataSourceOverride(null)
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
    setDataSourceOverride(null)
  })

  describe('default (mock-first)', () => {
    it('resolves to mock when nothing is set', () => {
      expect(getDataSourceMode()).toBe('mock')
      expect(getDataSource()).toBe('mock')
      expect(isLiveCatalogue()).toBe(false)
    })
  })

  describe('explicit env', () => {
    it('serves the real catalogue on "real"', () => {
      process.env.DATA_SOURCE = 'real'
      expect(getDataSourceMode()).toBe('real')
      expect(getDataSource()).toBe('real')
      expect(isLiveCatalogue()).toBe(true)
    })

    it('is case- and whitespace-insensitive', () => {
      process.env.DATA_SOURCE = '  REAL '
      expect(getDataSource()).toBe('real')
    })

    it('treats unrecognised values as mock', () => {
      for (const value of ['nonsense', 'true', '1', '']) {
        process.env.DATA_SOURCE = value
        expect(getDataSource()).toBe('mock')
      }
    })

    it('treats the retired shopify and auto settings as mock', () => {
      // An old deploy still carrying DATA_SOURCE=shopify must land on the
      // sample catalogue, not on an empty shop or a crash.
      for (const value of ['shopify', 'auto']) {
        process.env.DATA_SOURCE = value
        expect(getDataSourceMode()).toBe('mock')
        expect(getDataSource()).toBe('mock')
      }
    })
  })

  describe('NEXT_PUBLIC_DATA_SOURCE precedence', () => {
    it('wins over DATA_SOURCE, so client and server agree', () => {
      process.env.DATA_SOURCE = 'real'
      process.env.NEXT_PUBLIC_DATA_SOURCE = 'mock'
      expect(getDataSource()).toBe('mock')
    })
  })

  describe('runtime override', () => {
    it('wins over env in both directions', () => {
      process.env.DATA_SOURCE = 'mock'
      setDataSourceOverride('real')
      expect(getDataSource()).toBe('real')

      process.env.DATA_SOURCE = 'real'
      setDataSourceOverride('mock')
      expect(getDataSource()).toBe('mock')
    })

    it('falls back to env once cleared', () => {
      process.env.DATA_SOURCE = 'real'
      setDataSourceOverride('mock')
      setDataSourceOverride(null)
      expect(getDataSource()).toBe('real')
    })
  })
})
