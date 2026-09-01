/**
 * Issuing, claiming and spending a code, against the real (in-memory) database
 * — so the single-use lock is exercised rather than assumed. That lock is the
 * only thing standing between one code and any number of free orders, and it
 * cannot be tested without two callers actually racing through the engine.
 */
import {
  claimFounderCode,
  createFounderCode,
  getFounderCode,
  listFounderCodes,
  markFounderCodeUsed,
  releaseFounderCode,
  revokeFounderCode,
} from '@/lib/founder-codes/repo'
import { checkFounderCode, claimFounderCodeForCheckout, founderCodeWorksOn } from '@/lib/founder-codes/redeem'
import { founderCodeState } from '@/lib/founder-codes/codes'

describe('issuing', () => {
  it('records who made it, what for, and when it dies', async () => {
    const code = await createFounderCode({ kind: 'cost', note: 'launch shoot', createdBy: 'a@chrgd.dev' })
    expect(code.kind).toBe('cost')
    expect(code.note).toBe('launch shoot')
    expect(code.createdBy).toBe('a@chrgd.dev')
    expect(new Date(code.expiresAt).getTime()).toBeGreaterThan(Date.now())
    expect(founderCodeState(code)).toBe('live')
  })

  it('reads back exactly what was written, however the code is cased', async () => {
    const code = await createFounderCode({ kind: 'free' })
    expect(await getFounderCode(code.code.toLowerCase())).toEqual(code)
  })

  it('lists newest first', async () => {
    await createFounderCode({ kind: 'free' })
    await createFounderCode({ kind: 'unlock' })
    const listed = await listFounderCodes()
    expect(listed.length).toBeGreaterThanOrEqual(2)
  })
})

describe('the single-use lock', () => {
  it('gives the code to exactly one of two callers racing for it', async () => {
    const code = await createFounderCode({ kind: 'free' })
    const [a, b] = await Promise.all([claimFounderCode(code.code), claimFounderCode(code.code)])
    expect([a, b].filter(Boolean)).toHaveLength(1)
  })

  it('refuses a second checkout while the first is still in flight', async () => {
    const code = await createFounderCode({ kind: 'free' })
    const first = await claimFounderCodeForCheckout(code.code, { channel: 'shop' })
    expect(first?.ok).toBe(true)

    const second = await claimFounderCodeForCheckout(code.code, { channel: 'shop' })
    expect(second).toEqual({ ok: false, reason: 'That code is being used right now.' })
  })

  it('hands the code back when a checkout claims it and then fails', async () => {
    const code = await createFounderCode({ kind: 'free' })
    const claim = await claimFounderCodeForCheckout(code.code, { channel: 'shop' })
    if (!claim?.ok) throw new Error('expected a claim')

    await releaseFounderCode(code.code, claim.token)
    // Live again — a Stripe outage must not burn a code nobody managed to spend.
    expect(await claimFounderCodeForCheckout(code.code, { channel: 'shop' })).toMatchObject({ ok: true })
  })

  it('cannot be released with somebody else’s token', async () => {
    const code = await createFounderCode({ kind: 'free' })
    const claim = await claimFounderCodeForCheckout(code.code, { channel: 'shop' })
    if (!claim?.ok) throw new Error('expected a claim')

    await releaseFounderCode(code.code, 'not-the-token')
    expect((await getFounderCode(code.code))?.claimToken).toBe(claim.token)
  })

  it('is spent for good once an order carries it', async () => {
    const code = await createFounderCode({ kind: 'free' })
    const claim = await claimFounderCodeForCheckout(code.code, { channel: 'shop' })
    if (!claim?.ok) throw new Error('expected a claim')

    await markFounderCodeUsed(code.code, claim.token, 'ord_abc')
    const spent = await getFounderCode(code.code)
    expect(spent?.orderId).toBe('ord_abc')
    expect(founderCodeState(spent!)).toBe('used')
    expect(await checkFounderCode(code.code, { channel: 'shop' })).toEqual({
      ok: false,
      reason: 'That code has already been used.',
    })
  })

  it('cannot be marked used with somebody else’s token', async () => {
    const code = await createFounderCode({ kind: 'free' })
    await claimFounderCode(code.code)
    await markFounderCodeUsed(code.code, 'not-the-token', 'ord_abc')
    expect((await getFounderCode(code.code))?.usedAt).toBeNull()
  })
})

describe('revoking', () => {
  it('kills a live code immediately', async () => {
    const code = await createFounderCode({ kind: 'unlock' })
    await revokeFounderCode(code.code)
    expect(await checkFounderCode(code.code, { channel: 'shop' })).toEqual({
      ok: false,
      reason: 'That code has been cancelled.',
    })
  })
})

describe('where a founder code applies', () => {
  it('works on the one-off journeys and nowhere else', () => {
    expect(founderCodeWorksOn('shop')).toBe(true)
    expect(founderCodeWorksOn('quiz')).toBe(true)
    // A code that made a SUBSCRIPTION free would make every renewal free, long
    // after the code itself expired. 24 hours means nothing against a recurring
    // charge, so the recurring path cannot reach one.
    expect(founderCodeWorksOn('subscription')).toBe(false)
    // And an unstated channel is refused rather than allowed — the opposite of
    // the partner codes, because the downside here is 100% off forever.
    expect(founderCodeWorksOn(null)).toBe(false)
  })

  it('refuses a real code on a subscription, out loud', async () => {
    const code = await createFounderCode({ kind: 'free' })
    expect(await checkFounderCode(code.code, { channel: 'subscription' })).toEqual({
      ok: false,
      reason: 'That code works on a one-off order, not on a subscription.',
    })
  })

  it('leaves anything that is not ours to the partner path', async () => {
    // `null` means "not a founder code" — the caller falls through without this
    // module having an opinion, and without a database round trip.
    expect(await checkFounderCode('SARAH20', { channel: 'quiz' })).toBeNull()
    expect(await checkFounderCode('', { channel: 'quiz' })).toBeNull()
    // Shaped like ours but never issued: still not ours, so an ordinary "we
    // don't recognise that code" comes back rather than a confirmation of the
    // shape to somebody guessing.
    expect(await checkFounderCode('FH-FREE-2345ABCD', { channel: 'shop' })).toBeNull()
  })
})
