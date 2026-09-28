/**
 * Store codes — a name and a percentage, riding the partner-code checkout path.
 */
import { createStoreCode, deleteStoreCode, listStoreCodes, validateStoreCode } from '@/lib/store-codes'
import { createPartner, listPartnerRecords } from '@/lib/partners'
import { recordCodeUse, redeemPartnerCode } from '@/lib/partners/redeem'
import { accrueForOrder } from '@/lib/partners/ledger'
import { listPartners } from '@/lib/partners/repo'
import { HOUSE_PARTNER_ID } from '@/lib/partners/house'
import { priceOneOffLines } from '@/lib/stack-blueprint/pricing'
import type { Order } from '@/lib/orders/types'

const always = async () => true
const never = async () => false

describe('store codes', () => {
  it('makes a code from a name and a percentage, and lists it', async () => {
    const result = await createStoreCode({ name: ' summer 15 ', percent: 15 })
    expect(result).toMatchObject({ ok: true, code: { code: 'SUMMER15', percent: 15, uses: 0 } })
    expect((await listStoreCodes()).map((c) => c.code)).toContain('SUMMER15')
  })

  it('refuses a bad name or percentage, and says why', () => {
    expect(validateStoreCode('ab', 10)).toMatch(/at least 3/)
    expect(validateStoreCode('FH-FREE-ABCDEFGH', 10)).toMatch(/reserved/)
    expect(validateStoreCode('FINE10', 0)).toMatch(/between 1 and 50/)
    expect(validateStoreCode('FINE10', 51)).toMatch(/between 1 and 50/)
    expect(validateStoreCode('FINE10', 12.5)).toMatch(/whole/)
    expect(validateStoreCode('FINE10', 10)).toBeNull()
  })

  it('will not take a string that already means something at checkout', async () => {
    await createPartner({ email: 'taken@example.com', name: 'Taken', code: 'TAKEN20' })
    expect(await createStoreCode({ name: 'taken20', percent: 10 })).toEqual({
      ok: false,
      reason: 'TAKEN20 is already in use.',
    })
    await createStoreCode({ name: 'TWICE', percent: 10 })
    expect((await createStoreCode({ name: 'TWICE', percent: 20 })).ok).toBe(false)
  })

  it('discounts a stack, a bundle and a subscription — for returning customers too', async () => {
    await createStoreCode({ name: 'ANYONE10', percent: 10 })
    for (const channel of ['quiz', 'subscription'] as const) {
      const result = await redeemPartnerCode('anyone10', { subtotal: 40, channel, email: 'back@example.com' }, always)
      expect(result.ok && result.discountPct).toBe(0.1)
    }
  })

  it('works on single shop products too — unlike a partner code', async () => {
    await createStoreCode({ name: 'SHELF10', percent: 10 })
    for (const source of ['typed', 'referral'] as const) {
      const result = await redeemPartnerCode('shelf10', { subtotal: 40, channel: 'shop', source }, never)
      expect(result.ok && result.discountPct).toBe(0.1)
      expect(result.ok && result.attributionOnly).toBeFalsy()
    }
  })

  it('still refuses a partner code in the shop, in the same words as a made-up one', async () => {
    await createPartner({ email: 'shopenum@example.com', name: 'Shop Enum', code: 'SHOPENUM20' })
    const real = await redeemPartnerCode('SHOPENUM20', { subtotal: 40, channel: 'shop' }, never)
    const fake = await redeemPartnerCode('MADEUP99', { subtotal: 40, channel: 'shop' }, never)
    expect(real.ok).toBe(false)
    expect(real).toEqual(fake)
  })

  it('replaces the bundle discount rather than adding to it', async () => {
    const line = { price: 30, cost: 8, quantity: 1 }
    const lines = [line, line, line, line]
    const tierOnly = priceOneOffLines(lines)
    const withCode = priceOneOffLines(lines, undefined, 0.1)
    // The deeper of the two, never the two added together.
    expect(withCode.combinedPct).toBeCloseTo(Math.max(tierOnly.tierPct, 0.1))
    expect(withCode.combinedPct).toBeLessThan(tierOnly.tierPct + 0.1)
  })

  it('counts uses as orders are raised', async () => {
    await createStoreCode({ name: 'COUNTED', percent: 5 })
    await recordCodeUse('COUNTED')
    await recordCodeUse('COUNTED')
    expect((await listStoreCodes()).find((c) => c.code === 'COUNTED')?.uses).toBe(2)
  })

  it('earns nobody a commission', async () => {
    await createStoreCode({ name: 'NOCOMMS', percent: 20 })
    const order = { id: 'ord_store', partnerCode: 'NOCOMMS', email: 'x@example.com', createdAt: new Date().toISOString() } as Order
    const result = await accrueForOrder(order)
    expect(result.commission).toBeNull()
  })

  it('keeps the house account off every partner screen', async () => {
    await createStoreCode({ name: 'HIDDEN', percent: 10 })
    expect((await listPartners()).some((p) => p.id === HOUSE_PARTNER_ID)).toBe(false)
    expect((await listPartnerRecords()).some((r) => r.partner.id === HOUSE_PARTNER_ID)).toBe(false)
  })

  it('stops working the moment it is deleted', async () => {
    await createStoreCode({ name: 'GONE10', percent: 10 })
    expect(await deleteStoreCode('gone10')).toBe(true)
    expect((await listStoreCodes()).map((c) => c.code)).not.toContain('GONE10')
    expect((await redeemPartnerCode('GONE10', { subtotal: 40, channel: 'quiz' }, never)).ok).toBe(false)
  })

  it('cannot be used to delete a partner’s code', async () => {
    await createPartner({ email: 'keep@example.com', name: 'Keeper', code: 'KEEPER20' })
    expect(await deleteStoreCode('KEEPER20')).toBe(false)
    expect((await redeemPartnerCode('KEEPER20', { subtotal: 40, channel: 'quiz' }, never)).ok).toBe(true)
  })
})
