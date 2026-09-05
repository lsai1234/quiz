/**
 * Redeeming a code — the only place a partner's code turns into money off.
 */
import { createPartner, updateCodeTerms, setPartnerStatus } from '@/lib/partners'
import { redeemPartnerCode, recordCodeUse, replaceDiscount, worksOn } from '@/lib/partners/redeem'
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

  it('refuses a live code on a general shop sale, and says why', async () => {
    const created = await createPartner({ email: 'shopper@example.com', name: 'Shop Person' })
    const result = await redeemPartnerCode(created.codes[0].code, { subtotal: 90, channel: 'shop' }, never)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toMatch(/bundles and subscriptions/)

    // The same code on a stack still works — it is the basket that is
    // ineligible, not the partner.
    expect((await redeemPartnerCode(created.codes[0].code, { subtotal: 90, channel: 'quiz' }, never)).ok).toBe(true)
  })

  it('answers the shop the same way whether or not the code is real', async () => {
    // Refused before the lookup, so the response cannot be used to enumerate
    // which codes exist by trying them somewhere they were never going to work.
    const real = await createPartner({ email: 'enum@example.com', name: 'Enum Person' })
    const a = await redeemPartnerCode(real.codes[0].code, { subtotal: 90, channel: 'shop' }, never)
    const b = await redeemPartnerCode('NOTACODE', { subtotal: 90, channel: 'shop' }, never)
    expect(a).toEqual(b)
  })

  /**
   * A referred customer who buys off the shop shelf.
   *
   * They followed a partner's link, did the quiz, and then bought the products
   * one at a time instead of taking the stack — which is a journey the shop now
   * offers deliberately. A code cannot discount that basket, and should not.
   * But until this existed the partner earned NOTHING for the introduction,
   * because a refused redemption stored no code on the order at all.
   *
   * Losing the discount is the customer's own choice, made in front of a
   * sentence that says so. Losing the commission was neither.
   */
  describe('a referral code on a basket it cannot discount', () => {
    it('credits the partner and discounts nothing', async () => {
      const created = await createPartner({ email: 'attrib@example.com', name: 'Attrib Person' })
      const result = await redeemPartnerCode(
        created.codes[0].code,
        { subtotal: 90, channel: 'shop', source: 'referral' },
        never,
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.discountPct).toBe(0)
      expect(result.attributionOnly).toBe(true)
      // The code itself comes back, which is what puts it on the order and so
      // into the commission ledger.
      expect(result.code.code).toBe(created.codes[0].code)
    })

    it('still discounts normally on a basket it CAN discount', async () => {
      const created = await createPartner({ email: 'attrib2@example.com', name: 'Attrib Two' })
      const result = await redeemPartnerCode(
        created.codes[0].code,
        { subtotal: 90, channel: 'quiz', source: 'referral' },
        never,
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.discountPct).toBeGreaterThan(0)
      expect(result.attributionOnly).toBeUndefined()
    })

    /* Attribution is not a way round the rules that stop a code paying out. */
    it('does not attribute for a partner who is suspended', async () => {
      const created = await createPartner({ email: 'attrib3@example.com', name: 'Attrib Three' })
      await setPartnerStatus(created.partner.id, 'suspended')

      const result = await redeemPartnerCode(
        created.codes[0].code,
        { subtotal: 90, channel: 'shop', source: 'referral' },
        never,
      )
      expect(result.ok).toBe(false)
    })

    it('does not attribute for a code that does not exist', async () => {
      const result = await redeemPartnerCode(
        'NOTACODE',
        { subtotal: 90, channel: 'shop', source: 'referral' },
        never,
      )
      expect(result.ok).toBe(false)
    })

    /*
      The enumeration guarantee is unchanged, because it only ever covered
      TYPED codes — and a typed code on the shop is still refused before the
      lookup, identically, whether or not it is real.
    */
    it('leaves the typed path exactly as it was', async () => {
      const real = await createPartner({ email: 'enum2@example.com', name: 'Enum Two' })
      const a = await redeemPartnerCode(real.codes[0].code, { subtotal: 90, channel: 'shop', source: 'typed' }, never)
      const b = await redeemPartnerCode('NOTACODE', { subtotal: 90, channel: 'shop', source: 'typed' }, never)
      expect(a).toEqual(b)
      expect(a.ok).toBe(false)
    })

    /* A caller that forgets to say gets the refusal, never a silent credit. */
    it('defaults to typed when no source is given', async () => {
      const created = await createPartner({ email: 'attrib4@example.com', name: 'Attrib Four' })
      const result = await redeemPartnerCode(created.codes[0].code, { subtotal: 90, channel: 'shop' }, never)
      expect(result.ok).toBe(false)
    })
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

describe('combining with a discount already being given', () => {
  it('takes the deeper of the two rather than compounding them', () => {
    // It used to compound — 20% then 20% came to 36% off AND a commission, the
    // single most expensive thing in the programme. A code now states one
    // number, and that number is what the follower gets.
    expect(replaceDiscount(0.08, 0.25)).toBe(0.25)
    expect(replaceDiscount(0.2, 0.2)).toBe(0.2)
  })

  it('never lets a shallow code cost someone the discount they had earned', () => {
    // A founder is free to set a code below the bundle tier. That must read as
    // "no better than what you already had", never as a penalty for using it.
    expect(replaceDiscount(0.2, 0.05)).toBe(0.2)
  })

  it('is a no-op when either side is zero', () => {
    expect(replaceDiscount(0, 0.2)).toBe(0.2)
    expect(replaceDiscount(0.2, 0)).toBe(0.2)
  })

  it('never exceeds 100% or goes negative on nonsense input', () => {
    expect(replaceDiscount(2, 2)).toBe(1)
    expect(replaceDiscount(-1, 0.2)).toBe(0.2)
    expect(replaceDiscount(Number.NaN, 0.2)).toBe(0.2)
  })
})

describe('where a code works', () => {
  it('works on stacks, bundles and subscriptions', () => {
    expect(worksOn('quiz')).toBe(true)
    expect(worksOn('subscription')).toBe(true)
  })

  it('does not work on general shop sales', () => {
    // A single tub off the shelf has no renewal behind it and not enough
    // basket to carry the discount and a commission on top.
    expect(worksOn('shop')).toBe(false)
  })

  it('treats an unstated channel as eligible', () => {
    // Every caller that CAN be in the shop says so. Defaulting the other way
    // would silently kill codes on any journey that forgot to pass one, which
    // is the failure that is hard to notice.
    expect(worksOn(null)).toBe(true)
    expect(worksOn(undefined)).toBe(true)
  })
})
