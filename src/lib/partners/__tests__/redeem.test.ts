/**
 * Redeeming a code — the only place a partner's code turns into money off.
 */
import { createPartner, updateCodeTerms, setPartnerStatus } from '@/lib/partners'
import { redeemPartnerCode, recordCodeUse, stackDiscount } from '@/lib/partners/redeem'
import { getPartnerRecord } from '@/lib/partners'

/** Nobody has ever ordered, unless a test says otherwise. */
const never = async () => false
const always = async () => true

describe('redeeming a code', () => {
  it('returns the discount for a live code', async () => {
    const created = await createPartner({ email: 'live@example.com', name: 'Live Person' })
    const result = await redeemPartnerCode(created.codes[0].code, { subtotal: 90 }, never)

    expect(result.ok).toBe(true)
    expect(result.ok && result.discountPct).toBe(created.codes[0].discountPct)
    expect(result.ok && result.partner.id).toBe(created.partner.id)
  })

  it('accepts however it was typed', async () => {
    const created = await createPartner({ email: 'case@example.com', name: 'Case Person', code: 'CASE20' })
    for (const typed of ['case20', '  CASE 20 ', 'Case-20'.replace('-', '')]) {
      const result = await redeemPartnerCode(typed, { subtotal: 90 }, never)
      expect(result.ok).toBe(true)
      expect(result.ok && result.code.code).toBe(created.codes[0].code)
    }
  })

  it('refuses an empty box without going near the database', async () => {
    expect(await redeemPartnerCode('', { subtotal: 90 }, never)).toEqual({ ok: false, reason: 'Enter a code.' })
    expect(await redeemPartnerCode(null, { subtotal: 90 }, never)).toEqual({ ok: false, reason: 'Enter a code.' })
  })

  it('does not tell a guesser whether a code ever existed', async () => {
    const result = await redeemPartnerCode('NOTACODE', { subtotal: 90 }, never)
    expect(result).toEqual({ ok: false, reason: 'We don’t recognise that code.' })
  })

  it('stops the moment the partner is suspended', async () => {
    const created = await createPartner({ email: 'susp2@example.com', name: 'Susp Two' })
    await setPartnerStatus(created.partner.id, 'suspended')

    const result = await redeemPartnerCode(created.codes[0].code, { subtotal: 90 }, never)
    expect(result.ok).toBe(false)
  })

  it('enforces first-order-only against the buyer’s history', async () => {
    const created = await createPartner({ email: 'first@example.com', name: 'First Person' })
    // Default terms are first-order-only, so a returning buyer is refused...
    const returning = await redeemPartnerCode(created.codes[0].code, { subtotal: 90, email: 'buyer@example.com' }, always)
    expect(returning).toMatchObject({ ok: false, reason: /first order only/ })

    // ...and a new one is not.
    const fresh = await redeemPartnerCode(created.codes[0].code, { subtotal: 90, email: 'new@example.com' }, never)
    expect(fresh.ok).toBe(true)
  })

  it('treats a guest with no email as a first order', async () => {
    // Refusing a genuine new customer is worse than honouring a code twice for
    // someone who checked out as a guest under two addresses.
    const created = await createPartner({ email: 'guest@example.com', name: 'Guest Person' })
    const result = await redeemPartnerCode(created.codes[0].code, { subtotal: 90, email: null }, always)
    expect(result.ok).toBe(true)
  })

  it('does not ask the orders table when the answer cannot matter', async () => {
    const created = await createPartner({ email: 'nolookup@example.com', name: 'No Lookup' })
    await updateCodeTerms(created.codes[0].code, {
      terms: { ...created.codes[0].terms, firstOrderOnly: false },
    })

    let asked = false
    const result = await redeemPartnerCode(
      created.codes[0].code,
      { subtotal: 90, email: 'someone@example.com' },
      async () => { asked = true; return true },
    )
    expect(result.ok).toBe(true)
    expect(asked).toBe(false)
  })

  it('enforces a minimum spend against the undiscounted basket', async () => {
    const created = await createPartner({ email: 'min@example.com', name: 'Min Person' })
    await updateCodeTerms(created.codes[0].code, {
      terms: { ...created.codes[0].terms, minSpend: 50 },
    })

    expect(await redeemPartnerCode(created.codes[0].code, { subtotal: 30 }, never)).toMatchObject({ ok: false })
    expect((await redeemPartnerCode(created.codes[0].code, { subtotal: 60 }, never)).ok).toBe(true)
  })
})

describe('banking a use', () => {
  it('counts an order, and the cap then bites', async () => {
    const created = await createPartner({ email: 'cap@example.com', name: 'Cap Person' })
    await updateCodeTerms(created.codes[0].code, {
      terms: { ...created.codes[0].terms, maxUses: 1 },
    })

    await recordCodeUse(created.codes[0].code)

    const record = await getPartnerRecord(created.partner.id)
    expect(record!.codes[0].terms.uses).toBe(1)
    expect(await redeemPartnerCode(created.codes[0].code, { subtotal: 90 }, never)).toMatchObject({
      ok: false,
      reason: /fully redeemed/,
    })
  })

  it('never throws over a code that has gone', async () => {
    // A usage counter is not worth failing a paid checkout for.
    await expect(recordCodeUse('VANISHED')).resolves.toBeUndefined()
  })
})

describe('stacking', () => {
  it('multiplies rather than adding', () => {
    // 20% then 20% is 36%, not 40%. Adding would overstate what comes off at
    // every rung and, at the deep end, ask for more than the price can carry.
    expect(stackDiscount(0.2, 0.2)).toBe(0.36)
    expect(stackDiscount(0.1, 0.25)).toBe(0.325)
  })

  it('is a no-op when either side is zero', () => {
    expect(stackDiscount(0, 0.2)).toBe(0.2)
    expect(stackDiscount(0.2, 0)).toBe(0.2)
  })

  it('never exceeds 100% or goes negative on nonsense input', () => {
    expect(stackDiscount(2, 2)).toBe(1)
    expect(stackDiscount(-1, 0.2)).toBe(0.2)
    expect(stackDiscount(Number.NaN, 0.2)).toBe(0.2)
  })
})
