import {
  STARTER_GOODS_CAP,
  STARTER_TIERS,
  checkStarter,
  looksLikeStarterCode,
  normaliseStarterCode,
  priceStarterOrder,
  starterDeliveryOptions,
  starterExpiry,
  starterFits,
  starterState,
  starterTierLabel,
  starterWorksOn,
} from '../rules'
import type { PartnerStarter } from '../types'

/**
 * The rules around a partner's free stack.
 *
 * What is being protected here is money going out of the door. Every one of
 * these assertions is a way somebody could end up with a free box they were not
 * given: a code that works before it was signed for, one that works twice, one
 * that works on a subscription and keeps working, or one pointed at a basket
 * far bigger than the offer.
 */

const base: PartnerStarter = {
  code: 'PS-7K4M2XQP',
  partnerId: 'p_1',
  tier: 'performance',
  goodsCap: 140,
  note: null,
  createdBy: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-09-22T00:00:00.000Z',
  agreementId: 'ag_1',
  claimToken: null,
  claimedAt: null,
  usedAt: null,
  orderId: null,
  revokedAt: null,
}

const at = (iso: string) => new Date(iso)
const gbp = (n: number) => `£${n.toFixed(2)}`

describe('starter codes', () => {
  it('reads one code however it was typed', () => {
    expect(normaliseStarterCode(' ps-7k4m 2xqp ')).toBe('PS-7K4M2XQP')
    expect(looksLikeStarterCode('ps-7k4m2xqp')).toBe(true)
  })

  it('does not mistake a founder code or a partner code for one', () => {
    expect(looksLikeStarterCode('FH-FREE-7K4M2XQP')).toBe(false)
    expect(looksLikeStarterCode('SARAH20')).toBe(false)
    expect(looksLikeStarterCode('PS-SHORT')).toBe(false)
  })

  it('lives for three weeks', () => {
    const from = at('2026-09-01T00:00:00.000Z')
    const days = (new Date(starterExpiry(from)).getTime() - from.getTime()) / 86_400_000
    expect(days).toBe(21)
  })
})

describe('what state a starter is in', () => {
  it('is unsigned until an agreement is attached — that is the whole gate', () => {
    expect(starterState({ ...base, agreementId: null }, at('2026-09-02T00:00:00.000Z'))).toBe('unsigned')
    expect(starterState(base, at('2026-09-02T00:00:00.000Z'))).toBe('ready')
  })

  it('ranks the terminal states above the gate', () => {
    // A used, expired or cancelled starter is not "unsigned" even when nobody
    // ever signed it — reporting the gate would tell a partner to go and sign
    // for something that is already gone.
    const dead = { ...base, agreementId: null }
    expect(starterState({ ...dead, revokedAt: '2026-09-03T00:00:00.000Z' })).toBe('revoked')
    expect(starterState({ ...dead, usedAt: '2026-09-03T00:00:00.000Z' })).toBe('used')
    expect(starterState(dead, at('2027-01-01T00:00:00.000Z'))).toBe('expired')
  })
})

describe('whether a starter may be spent', () => {
  const now = at('2026-09-02T00:00:00.000Z')

  it('lets a signed, live, unclaimed one through', () => {
    expect(checkStarter(base, now)).toEqual({ ok: true, starter: base })
  })

  it('refuses an unsigned one, and says where to go', () => {
    const out = checkStarter({ ...base, agreementId: null }, now)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toMatch(/sign your partner agreement/i)
  })

  it.each([
    ['revoked', { revokedAt: '2026-09-01T12:00:00.000Z' }, /cancelled/i],
    ['used', { usedAt: '2026-09-01T12:00:00.000Z' }, /already been used/i],
    ['being claimed elsewhere', { claimToken: 'abc' }, /being used right now/i],
  ])('refuses one that is %s', (_label, patch, message) => {
    const out = checkStarter({ ...base, ...patch }, now)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toMatch(message)
  })

  it('refuses an expired one', () => {
    const out = checkStarter(base, at('2026-10-01T00:00:00.000Z'))
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toMatch(/expired/i)
  })
})

describe('what a starter may be spent on', () => {
  /*
    The subscription case is the expensive one. A starter that made a PLAN free
    would not make one box free — it would make every renewal free, for as long
    as the plan ran, long after the code itself had expired.
  */
  it('buys a quiz stack and nothing else', () => {
    expect(starterWorksOn('quiz')).toBe(true)
    expect(starterWorksOn('subscription')).toBe(false)
    expect(starterWorksOn('shop')).toBe(false)
  })

  it('refuses a caller that did not say what it was selling', () => {
    expect(starterWorksOn(null)).toBe(false)
    expect(starterWorksOn(undefined)).toBe(false)
  })

  it('is capped, and says by how much and against what', () => {
    expect(starterFits(base, 139.99, gbp).ok).toBe(true)
    expect(starterFits(base, 140, gbp).ok).toBe(true)
    const over = starterFits(base, 180.4, gbp)
    expect(over.ok).toBe(false)
    if (!over.ok) {
      expect(over.reason).toContain('£140.00')
      expect(over.reason).toContain('£180.40')
      expect(over.reason).toMatch(/balanced/i)
    }
  })

  it('caps a smaller depth more tightly', () => {
    expect(STARTER_GOODS_CAP.essentials).toBeLessThan(STARTER_GOODS_CAP.performance)
    expect(starterFits({ ...base, tier: 'essentials', goodsCap: 90 }, 120, gbp).ok).toBe(false)
  })

  it('offers Essentials and Balanced, and not Complete', () => {
    expect(STARTER_TIERS).toEqual(['essentials', 'performance'])
    expect(starterTierLabel('essentials')).toBe('Essentials')
    expect(starterTierLabel('performance')).toBe('Balanced')
  })
})

describe('what a starter does to the money', () => {
  const lines = [
    { price: 42.5, cost: 20, quantity: 1 },
    { price: 28, cost: 13, quantity: 2 },
  ]

  it('takes every line to zero', () => {
    const priced = priceStarterOrder(lines)
    expect(priced.total).toBe(0)
    for (const line of priced.lines) expect(line.discountedUnitPrice).toBe(0)
  })

  /*
    The margin floor is what stops a PARTNER's 100% reaching zero, and it would
    stop this too if the starter were priced as a discount. It is not — it sets
    the price — and this is the assertion that says so, because the failure it
    guards against shows £0.00 on screen and charges the floor.
  */
  it('goes under the margin floor rather than being clamped by it', () => {
    const priced = priceStarterOrder([{ price: 42.5, cost: 40, quantity: 1 }])
    expect(priced.total).toBe(0)
  })

  it('still reports the list value, so the receipt can show what it was worth', () => {
    expect(priceStarterOrder(lines).subtotal).toBe(98.5)
  })

  it('reports no tier and no partner rate — a starter is neither', () => {
    const priced = priceStarterOrder(lines)
    expect(priced.tierPct).toBe(0)
    expect(priced.partnerPct).toBe(0)
    expect(priced.tierLabel).toBeNull()
  })

  it('charges nothing for delivery, on every option', () => {
    for (const option of starterDeliveryOptions(0)) expect(option.price).toBe(0)
  })
})
