import { setSupplierOverride } from '@/lib/supplier'
import {
  getOrderingMode,
  getOrderingSource,
  isLiveOrdering,
  liveOrderingBlockedReason,
  setOrderingOverride,
} from '@/lib/supplier/ordering'

const ENV_KEYS = [
  'SUPPLIER_SOURCE',
  'SUPPLIER_ORDERING',
  'POWERBODY_API_URL',
  'POWERBODY_API_USER',
  'POWERBODY_API_KEY',
] as const

/** Put the catalogue on the live supplier — the precondition for live ordering. */
function useLiveSupplier() {
  process.env.POWERBODY_API_URL = 'https://www.powerbody.co.uk/api/soap/'
  process.env.POWERBODY_API_USER = 'test-user'
  process.env.POWERBODY_API_KEY = 'test-key'
  setSupplierOverride('powerbody')
}

describe('ordering mode', () => {
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key]
      delete process.env[key]
    }
    setOrderingOverride(null)
    setSupplierOverride(null)
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
    setOrderingOverride(null)
    setSupplierOverride(null)
  })

  describe('default', () => {
    it('simulates when nothing is configured', () => {
      expect(getOrderingMode()).toBe('simulate')
      expect(getOrderingSource()).toBe('simulate')
      expect(isLiveOrdering()).toBe(false)
    })

    it('still simulates when the supplier is live but ordering was never armed', () => {
      // The whole point of the split: a live catalogue does not imply live orders.
      useLiveSupplier()
      expect(getOrderingSource()).toBe('simulate')
    })
  })

  describe('env', () => {
    it('goes live on an exact "live"', () => {
      useLiveSupplier()
      process.env.SUPPLIER_ORDERING = 'live'
      expect(getOrderingMode()).toBe('live')
      expect(getOrderingSource()).toBe('live')
      expect(isLiveOrdering()).toBe(true)
    })

    it('is case- and whitespace-insensitive', () => {
      useLiveSupplier()
      process.env.SUPPLIER_ORDERING = '  LIVE '
      expect(getOrderingSource()).toBe('live')
    })

    it('simulates on anything else, so a typo cannot arm real ordering', () => {
      useLiveSupplier()
      for (const value of ['LIVE!', 'true', 'yes', 'on', 'liv', '1', '']) {
        process.env.SUPPLIER_ORDERING = value
        expect(getOrderingMode()).toBe('simulate')
        expect(getOrderingSource()).toBe('simulate')
      }
    })
  })

  describe('portal override', () => {
    it('wins over env in both directions', () => {
      useLiveSupplier()
      process.env.SUPPLIER_ORDERING = 'simulate'
      setOrderingOverride('live')
      expect(getOrderingSource()).toBe('live')

      process.env.SUPPLIER_ORDERING = 'live'
      setOrderingOverride('simulate')
      expect(getOrderingSource()).toBe('simulate')
    })
  })

  describe('the mock-supplier guard', () => {
    it('refuses to send real orders while the catalogue is mock', () => {
      // Mock SKUs are fixtures; ordering them for real would buy products that
      // do not exist. Asking for live is honoured only once the feed is live.
      setOrderingOverride('live')
      expect(getOrderingMode()).toBe('live')
      expect(getOrderingSource()).toBe('simulate')
      expect(isLiveOrdering()).toBe(false)
      expect(liveOrderingBlockedReason()).toMatch(/mock supplier/i)
    })

    it('reports no blocker once the supplier is live', () => {
      useLiveSupplier()
      expect(liveOrderingBlockedReason()).toBeNull()
    })

    it('falls back to simulate when live is forced without credentials', () => {
      // getSupplierSource() degrades to mock without credentials, and ordering
      // must follow it down rather than trying to reach an API it cannot reach.
      setSupplierOverride('powerbody')
      setOrderingOverride('live')
      expect(getOrderingSource()).toBe('simulate')
    })
  })
})
