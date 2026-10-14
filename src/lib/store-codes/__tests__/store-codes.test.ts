/**
 * Store codes — a name and a percentage, riding the partner-code checkout path.
 */
import {
  createStoreCode, deleteStoreCode, listStoreCodes, validateStoreCode, setStoreCodeEnd, setCheckoutPromo, liveCheckoutPromo,
  dailyCodeStatus,
} from '@/lib/store-codes'
import { DAILY_CODES, setDailyCodesEnabled } from '@/lib/store-codes/daily'
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

describe('ending a code, and advertising one at checkout', () => {
  const now = new Date('2026-10-13T15:00:00Z') // 16:00 in London
  // These are about a code chosen in the hub; the daily codes would take the
  // card from 14 October, so they are switched off here and tested below.
  beforeAll(() => setDailyCodesEnabled(false))
  afterAll(() => setDailyCodesEnabled(true))

  it('ends a code at London midnight on the day chosen, and checkout refuses it after', async () => {
    await createStoreCode({ name: 'TONIGHT20', percent: 20 })
    const set = await setStoreCodeEnd('tonight20', '2026-10-13', now)
    expect(set).toMatchObject({ ok: true, code: { endsAt: '2026-10-13T23:00:00.000Z', ended: false } })

    const before = await redeemPartnerCode('TONIGHT20', { subtotal: 40, channel: 'quiz', now: new Date('2026-10-13T22:59:00Z') }, never)
    const after = await redeemPartnerCode('TONIGHT20', { subtotal: 40, channel: 'quiz', now: new Date('2026-10-13T23:00:01Z') }, never)
    expect(before.ok).toBe(true)
    expect(after).toEqual({ ok: false, reason: 'That code has expired.' })
  })

  it('will not end a code in the past, and can take an end away', async () => {
    await createStoreCode({ name: 'PASTEND', percent: 10 })
    expect(await setStoreCodeEnd('PASTEND', '2026-10-12', now)).toEqual({ ok: false, reason: 'Pick today or a later day.' })
    expect(await setStoreCodeEnd('PASTEND', 'soon', now)).toMatchObject({ ok: false })
    await setStoreCodeEnd('PASTEND', '2026-10-20', now)
    expect(await setStoreCodeEnd('PASTEND', null, now)).toMatchObject({ ok: true, code: { endsAt: null } })
  })

  it('advertises the chosen code with its real end, and nothing once it has ended', async () => {
    await createStoreCode({ name: 'LAUNCH25', percent: 25 })
    await setStoreCodeEnd('LAUNCH25', '2026-10-13', now)
    expect(await setCheckoutPromo('launch25', now)).toMatchObject({ ok: true })

    expect(await liveCheckoutPromo(now)).toEqual({ code: 'LAUNCH25', percent: 25, endsAt: '2026-10-13T23:00:00.000Z', kind: 'store' })
    expect((await listStoreCodes()).find((c) => c.code === 'LAUNCH25')).toMatchObject({ atCheckout: true })
    // The countdown and the code end together: after midnight there is no card.
    expect(await liveCheckoutPromo(new Date('2026-10-13T23:00:01Z'))).toBeNull()
    // And an ended code cannot be chosen until it has a new end.
    expect(await setCheckoutPromo('LAUNCH25', new Date('2026-10-14T09:00:00Z'))).toMatchObject({ ok: false })
  })

  it('advertises a code with no end without a deadline, and stops when told or when it is deleted', async () => {
    await createStoreCode({ name: 'OPEN15', percent: 15 })
    await setCheckoutPromo('OPEN15', now)
    expect(await liveCheckoutPromo(now)).toEqual({ code: 'OPEN15', percent: 15, endsAt: null, kind: 'store' })

    await setCheckoutPromo(null, now)
    expect(await liveCheckoutPromo(now)).toBeNull()

    await setCheckoutPromo('OPEN15', now)
    await deleteStoreCode('OPEN15')
    await createStoreCode({ name: 'OPEN15', percent: 15 })
    // A new code under an old name is not advertised just because the old one was.
    expect(await liveCheckoutPromo(now)).toBeNull()
  })

  it('only ever advertises one of ours', async () => {
    await createPartner({ email: 'promo-partner@example.com', name: 'Promo Partner', code: 'PARTNER30' })
    expect(await setCheckoutPromo('PARTNER30', now)).toEqual({ ok: false, reason: 'That is not one of the store codes.' })
  })
})

describe('a different 25% code every day to the end of November', () => {
  const at = (iso: string) => new Date(iso)

  it('is one code a day, a word then 25, from 14 October to 30 November', () => {
    expect(DAILY_CODES).toHaveLength(48)
    expect(new Set(DAILY_CODES.map((d) => d.code)).size).toBe(48)
    for (const d of DAILY_CODES) expect(d.code).toMatch(/^[A-Z]+25$/)
    expect(DAILY_CODES[0]).toMatchObject({ date: '2026-10-14', code: 'SPARK25' })
    expect(DAILY_CODES.at(-1)).toMatchObject({ date: '2026-11-30', code: 'FINALE25' })
    expect(DAILY_CODES.find((d) => d.date === '2026-11-05')?.code).toBe('FIREWORK25')
    expect(DAILY_CODES.find((d) => d.date === '2026-11-27')?.code).toBe('BLACKFRIDAY25')
    // Back to back: each day's code ends the instant the next one starts.
    for (let i = 1; i < DAILY_CODES.length; i++) expect(DAILY_CODES[i].startsAt).toBe(DAILY_CODES[i - 1].endsAt)
  })

  it('advertises today’s code with a countdown to London midnight', async () => {
    expect(await liveCheckoutPromo(at('2026-10-14T10:00:00Z'))).toEqual({
      code: 'SPARK25', percent: 25, endsAt: '2026-10-14T23:00:00.000Z', kind: 'daily',
    })
    // The night the clocks go back, midnight is an hour later in UTC.
    expect(await liveCheckoutPromo(at('2026-10-25T12:00:00Z'))).toMatchObject({ code: 'POWER25', endsAt: '2026-10-26T00:00:00.000Z' })
  })

  it('works only on its own day — not before, not after midnight', async () => {
    const ctx = (iso: string) => ({ subtotal: 60, channel: 'quiz' as const, now: at(iso) })
    expect(await redeemPartnerCode('spark25', ctx('2026-10-14T22:59:00Z'), never)).toMatchObject({ ok: true, discountPct: 0.25 })
    expect(await redeemPartnerCode('SPARK25', ctx('2026-10-14T23:00:01Z'), never)).toEqual({ ok: false, reason: 'That code has expired.' })
    expect(await redeemPartnerCode('SURGE25', ctx('2026-10-14T22:59:00Z'), never)).toEqual({ ok: false, reason: 'That code is not active yet.' })
    expect(await redeemPartnerCode('SURGE25', ctx('2026-10-15T09:00:00Z'), never)).toMatchObject({ ok: true, discountPct: 0.25 })
  })

  it('stays off the founders’ own list, and can be switched off', async () => {
    const now = at('2026-10-14T10:00:00Z')
    await liveCheckoutPromo(now)
    expect((await listStoreCodes()).some((c) => c.code.endsWith('25') && DAILY_CODES.some((d) => d.code === c.code))).toBe(false)
    expect(await dailyCodeStatus(now)).toMatchObject({ enabled: true, today: { code: 'SPARK25' }, lastDay: '2026-11-30' })

    await setDailyCodesEnabled(false)
    expect(await liveCheckoutPromo(now)).toBeNull()
    // A code already handed out still works until its midnight.
    expect(await redeemPartnerCode('SPARK25', { subtotal: 60, channel: 'quiz', now }, never)).toMatchObject({ ok: true })
    await setDailyCodesEnabled(true)
  })

  it('shows nothing once the schedule has run out', async () => {
    expect(await liveCheckoutPromo(at('2026-12-01T12:00:00Z'))).toBeNull()
  })
})
