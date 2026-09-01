/**
 * The rules that decide whether an order costs nothing, and what it costs when
 * it does not. Pure — no database.
 */
import {
  checkFounderCode,
  founderCodeExpiry,
  founderCodeState,
  founderDeliveryOptions,
  looksLikeFounderCode,
  normaliseFounderCode,
  priceAtFounderTerms,
  FOUNDER_CODE_TTL_HOURS,
} from '@/lib/founder-codes/codes'
import { newFounderCode } from '@/lib/founder-codes/generate'
import type { FounderCode } from '@/lib/founder-codes/types'
import { PRICING_CONFIG, priceOneOffLines, setPricingOverrides } from '@/lib/stack-blueprint/pricing'
import { customerDeliveryCharge, quoteDelivery } from '@/lib/pricing/delivery'
import { costFromSupplierPrice } from '@/lib/pricing/vat'

const NOW = new Date('2026-09-01T12:00:00.000Z')

function code(over: Partial<FounderCode> = {}): FounderCode {
  return {
    code: 'FH-FREE-ABCD2345',
    kind: 'free',
    note: null,
    createdBy: 'founder@chrgd.dev',
    createdAt: NOW.toISOString(),
    expiresAt: founderCodeExpiry(NOW),
    claimToken: null,
    claimedAt: null,
    usedAt: null,
    orderId: null,
    revokedAt: null,
    ...over,
  }
}

afterEach(() => setPricingOverrides({}))

describe('the code string', () => {
  it('normalises the ways a code gets typed into one', () => {
    expect(normaliseFounderCode('  fh-free-abcd2345 ')).toBe('FH-FREE-ABCD2345')
    expect(normaliseFounderCode('FH FREE ABCD2345')).toBe('FHFREEABCD2345')
  })

  it('mints a code per kind that is recognisably ours', () => {
    for (const kind of ['free', 'cost', 'unlock'] as const) {
      const minted = newFounderCode(kind)
      expect(looksLikeFounderCode(minted)).toBe(true)
      expect(normaliseFounderCode(minted)).toBe(minted)
    }
  })

  it('never mints the same code twice in a run', () => {
    const seen = new Set(Array.from({ length: 500 }, () => newFounderCode('free')))
    expect(seen.size).toBe(500)
  })

  it('uses no character a reader could confuse for another', () => {
    // Crockford base32: no I, L, O or U in the random part.
    const body = newFounderCode('cost').split('-')[2]
    expect(body).not.toMatch(/[ILOU]/)
  })

  it('does not mistake a partner code for one of ours', () => {
    expect(looksLikeFounderCode('SARAH20')).toBe(false)
    expect(looksLikeFounderCode('FH-FREE-SHORT')).toBe(false)
  })
})

describe('whether a code may be used', () => {
  it('lives for 24 hours', () => {
    const expiry = new Date(founderCodeExpiry(NOW)).getTime() - NOW.getTime()
    expect(expiry).toBe(FOUNDER_CODE_TTL_HOURS * 60 * 60 * 1000)
  })

  it('works inside the window and not a minute past it', () => {
    const c = code()
    expect(checkFounderCode(c, new Date(NOW.getTime() + 23 * 3600_000)).ok).toBe(true)
    const after = checkFounderCode(c, new Date(NOW.getTime() + 25 * 3600_000))
    expect(after).toEqual({ ok: false, reason: 'That code has expired.' })
  })

  it('is used exactly once', () => {
    const spent = code({ usedAt: NOW.toISOString(), orderId: 'ord_1' })
    expect(founderCodeState(spent, NOW)).toBe('used')
    expect(checkFounderCode(spent, NOW)).toEqual({ ok: false, reason: 'That code has already been used.' })
  })

  it('refuses a code somebody else is checking out with right now', () => {
    const claimed = code({ claimToken: 'abc', claimedAt: NOW.toISOString() })
    expect(checkFounderCode(claimed, NOW)).toEqual({ ok: false, reason: 'That code is being used right now.' })
  })

  it('is dead the moment it is revoked, whatever else is true of it', () => {
    const killed = code({ revokedAt: NOW.toISOString() })
    expect(checkFounderCode(killed, NOW)).toEqual({ ok: false, reason: 'That code has been cancelled.' })
  })

  it('says which of the four states a code is in', () => {
    expect(founderCodeState(code(), NOW)).toBe('live')
    expect(founderCodeState(code(), new Date(NOW.getTime() + 48 * 3600_000))).toBe('expired')
  })
})

describe('what a code does to the money', () => {
  const lines = [
    { price: 30, cost: 10, quantity: 2 },
    { price: 12.5, cost: 4, quantity: 1 },
  ]

  it('takes a free order to exactly nothing', () => {
    const priced = priceAtFounderTerms('free', lines)
    expect(priced.total).toBe(0)
    expect(priced.lines.every((l) => l.discountedUnitPrice === 0)).toBe(true)
    // The subtotal still reports the shelf value, so the receipt can show what
    // was given away rather than an order that appears to contain nothing.
    expect(priced.subtotal).toBe(72.5)
    expect(priced.discount).toBe(72.5)
  })

  it('charges cost price INCLUDING the VAT we cannot reclaim', () => {
    // Unregistered is the position the business is in, and PowerBody's VAT is
    // money that leaves the account for good — a "cost price" that ignored it
    // would still lose us a fifth of the goods.
    expect(PRICING_CONFIG.vat.registered).toBe(false)
    const priced = priceAtFounderTerms('cost', lines)
    expect(priced.lines[0].discountedUnitPrice).toBe(costFromSupplierPrice(10))
    expect(priced.lines[1].discountedUnitPrice).toBe(costFromSupplierPrice(4))
    expect(priced.total).toBe(costFromSupplierPrice(10) * 2 + costFromSupplierPrice(4))
  })

  it('drops the VAT gross-up the day we register', () => {
    setPricingOverrides({ vat: { ...PRICING_CONFIG.vat, registered: true } })
    expect(priceAtFounderTerms('cost', lines).lines[0].discountedUnitPrice).toBe(10)
  })

  it('ignores the margin floor entirely, in both directions', () => {
    // The ordinary path floors every line at cost × (1 + marginFloorPct), so
    // even a 100% partner rate cannot reach zero. A founder code SETS the price
    // rather than discounting it, and routing one through `priceOneOffLines`
    // would show £0.00 on screen and bill the floor to the card.
    const floored = priceOneOffLines(lines, undefined, 1).total
    expect(floored).toBeGreaterThan(0)
    expect(priceAtFounderTerms('free', lines).total).toBe(0)

    // And a floor set ABOVE cost price does not drag a cost-price order up to
    // it either. (With the shipped 15% floor and 20% irrecoverable VAT the two
    // happen to sit the other way round, which is exactly why this asserts the
    // rule rather than today's arithmetic.)
    setPricingOverrides({ marginFloorPct: 0.9 })
    expect(priceAtFounderTerms('cost', lines).lines[0].discountedUnitPrice).toBe(costFromSupplierPrice(10))
    expect(priceOneOffLines(lines, undefined, 1).lines[0].discountedUnitPrice).toBe(19)
  })

  it('leaves an unlock code pricing exactly like no code at all', () => {
    expect(priceAtFounderTerms('unlock', lines)).toEqual(priceOneOffLines(lines))
  })

  it('reports no tier and no partner rate, so nothing invents a discount line', () => {
    const priced = priceAtFounderTerms('cost', lines)
    expect(priced.tierPct).toBe(0)
    expect(priced.tierLabel).toBeNull()
    expect(priced.partnerPct).toBe(0)
  })
})

describe('what a code does to delivery', () => {
  const order = { supplierValue: 24, orderValue: 60 }

  it('ships a free order for nothing, in every zone', () => {
    expect(founderDeliveryOptions('free', order).every((o) => o.price === 0)).toBe(true)
  })

  it('raises a cost-price order to what the supplier actually charges us', () => {
    const options = founderDeliveryOptions('cost', order)
    for (const option of options) {
      expect(option.price).toBe(quoteDelivery({ supplierValue: 24, zone: option.zone }).supplierCost)
    }
    // The direction that matters: our own rate on a £60 basket is cheaper than
    // the parcel costs, and selling goods at cost on subsidised postage would
    // put the loss straight back.
    expect(options[0].price).toBeGreaterThan(customerDeliveryCharge(60, 'uk-1'))
  })

  it('leaves an unlock code on the ordinary customer ladder', () => {
    const options = founderDeliveryOptions('unlock', order)
    expect(options[0].price).toBe(customerDeliveryCharge(60, 'uk-1'))
  })

  it('still offers both zones, because Stripe fixes shipping before the postcode exists', () => {
    expect(founderDeliveryOptions('cost', order).map((o) => o.zone)).toEqual(['uk-1', 'uk-2'])
  })
})
