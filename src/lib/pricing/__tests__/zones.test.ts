import { zoneForPostcode, deliverability, outwardCode } from '../zones'
import { quoteDelivery } from '../delivery'
import { PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'

describe('outward codes', () => {
  it('pulls the outward code out of any UK format', () => {
    expect(outwardCode('M1 1AA')).toBe('M1')
    expect(outwardCode('EC1A 1BB')).toBe('EC1A')
    expect(outwardCode('iv30 1ab')).toBe('IV30')
    expect(outwardCode('PA49')).toBe('PA49') // outward only, no inward given
    expect(outwardCode('')).toBeNull()
  })
})

describe('delivery zones', () => {
  it('puts the mainland in Zone 1', () => {
    for (const pc of ['M1 1AA', 'SW1A 1AA', 'LS1 4AP', 'EH1 1YZ', 'CF10 1EP']) {
      expect(zoneForPostcode(pc).zone).toBe('uk-1')
    }
  })

  it('puts the Highlands, Islands and offshore in Zone 2', () => {
    for (const pc of ['AB10 1AA', 'IV30 1AA', 'HS1 2AA', 'KW1 4AA', 'ZE1 0AA', 'IM1 1AA']) {
      expect(zoneForPostcode(pc).zone).toBe('uk-2')
    }
  })

  it('respects the numbered ranges rather than matching the whole prefix', () => {
    // PA20–49 and PA60–78 are Zone 2; PA1 (Paisley) is mainland Zone 1.
    expect(zoneForPostcode('PA1 1AA').zone).toBe('uk-1')
    expect(zoneForPostcode('PA20 0AA').zone).toBe('uk-2')
    expect(zoneForPostcode('PA49 0AA').zone).toBe('uk-2')
    expect(zoneForPostcode('PA50 0AA').zone).toBe('uk-1') // the gap between the two ranges
    expect(zoneForPostcode('PA60 0AA').zone).toBe('uk-2')

    // KA27–28 only.
    expect(zoneForPostcode('KA1 1AA').zone).toBe('uk-1')
    expect(zoneForPostcode('KA27 8AA').zone).toBe('uk-2')

    // TR21–25 (Isles of Scilly); the rest of Cornwall is mainland.
    expect(zoneForPostcode('TR1 1AA').zone).toBe('uk-1')
    expect(zoneForPostcode('TR21 0AA').zone).toBe('uk-2')

    // PH has three separate bands with gaps between them.
    expect(zoneForPostcode('PH1 1AA').zone).toBe('uk-1')
    expect(zoneForPostcode('PH17 2AA').zone).toBe('uk-2')
    expect(zoneForPostcode('PH27 0AA').zone).toBe('uk-1')
    expect(zoneForPostcode('PH30 4AA').zone).toBe('uk-2')
  })

  it('assumes Zone 1 for a missing or unreadable postcode rather than refusing', () => {
    // Most UK addresses are Zone 1; treating a typo as undeliverable would block
    // real orders for no good reason.
    expect(zoneForPostcode(null).zone).toBe('uk-1')
    expect(zoneForPostcode('   ').zone).toBe('uk-1')
    expect(zoneForPostcode('???').zone).toBe('uk-1')
  })
})

describe('what PowerBody will not ship', () => {
  it('blocks Northern Ireland, Guernsey and Jersey', () => {
    for (const [pc, place] of [['BT1 5GS', 'Northern Ireland'], ['GY1 1AA', 'Guernsey'], ['JE2 3AA', 'Jersey']]) {
      const r = zoneForPostcode(pc)
      expect(r.excluded).toBe(true)
      expect(r.zone).toBeNull()
      expect(r.reason).toContain(place)
    }
  })

  it('still allows the Isle of Man, which is Zone 2 but not excluded', () => {
    const r = zoneForPostcode('IM1 1AA')
    expect(r.excluded).toBe(false)
    expect(r.zone).toBe('uk-2')
  })

  it('blocks anywhere outside the UK on a UK account', () => {
    const r = deliverability({ postcode: '75001', country: 'FR' })
    expect(r.excluded).toBe(true)
    expect(r.reason).toMatch(/UK only/i)
  })

  it('accepts the various ways an address says United Kingdom', () => {
    for (const country of ['GB', 'gb', 'United Kingdom', 'Scotland']) {
      expect(deliverability({ postcode: 'M1 1AA', country }).excluded).toBe(false)
    }
  })

  it('treats a missing address as something to decide on, not something to send', () => {
    expect(deliverability(null).excluded).toBe(true)
    expect(deliverability(null).reason).toMatch(/No delivery address/)
  })
})

describe('a postcode beats an assumed zone', () => {
  const c = PRICING_CONFIG

  it('prices a Highlands postcode at the Highlands rate', () => {
    const mainland = quoteDelivery({ supplierValue: 30, postcode: 'M1 1AA' }, c)
    const highlands = quoteDelivery({ supplierValue: 30, postcode: 'IV30 1AA' }, c)
    // Rate-card prices, as PowerBody quote them (ex VAT).
    expect(mainland.supplierPriceExVat).toBe(6.5)
    expect(highlands.supplierPriceExVat).toBe(7.99)
    expect(highlands.zone).toBe('uk-2')
  })

  it('costs their VAT in while we are not registered', () => {
    // Default config is unregistered, so their £6.50 really costs us £7.80.
    expect(quoteDelivery({ supplierValue: 30, postcode: 'M1 1AA' }, c).supplierCost).toBeCloseTo(7.8, 2)
    const registered = { ...c, vat: { ...c.vat, registered: true } }
    expect(quoteDelivery({ supplierValue: 30, postcode: 'M1 1AA' }, registered).supplierCost).toBe(6.5)
  })

  it('overrides an explicitly-passed zone when a postcode is given', () => {
    const q = quoteDelivery({ supplierValue: 30, zone: 'uk-1', postcode: 'IV30 1AA' }, c)
    expect(q.zone).toBe('uk-2')
  })

  it('refuses to price an excluded address instead of quoting a cost', () => {
    const q = quoteDelivery({ supplierValue: 30, postcode: 'BT1 5GS' }, c)
    expect(q.service).toBeNull()
    expect(q.supplierCost).toBe(0)
    expect(q.unavailableReason).toContain('Northern Ireland')
  })
})
