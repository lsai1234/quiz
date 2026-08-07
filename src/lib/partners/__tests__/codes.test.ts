import { checkCode, defaultCodeTerms, isExpired, normaliseCode, suggestCode } from '@/lib/partners/codes'
import type { PartnerCode } from '@/lib/partners/types'

function code(over: Partial<PartnerCode> = {}): PartnerCode {
  return {
    code: 'SARAH20',
    partnerId: 'ptnr_1',
    discountPct: 0.2,
    terms: defaultCodeTerms(),
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('normaliseCode', () => {
  it('treats what someone types as what someone read off a story', () => {
    // A partner whose commission depended on the difference would be right to
    // be annoyed.
    expect(normaliseCode(' sarah20 ')).toBe('SARAH20')
    expect(normaliseCode('Sarah 20')).toBe('SARAH20')
    expect(normaliseCode('sarah_20!')).toBe('SARAH20')
  })
})

describe('suggestCode', () => {
  it('builds one from a first name and the discount', () => {
    expect(suggestCode('Sarah Jones', 0.2)).toBe('SARAH20')
  })

  it('avoids collisions rather than handing two partners one code', () => {
    expect(suggestCode('Sarah Jones', 0.2, ['SARAH20'])).toBe('SARAH20-2')
    expect(suggestCode('Sarah Jones', 0.2, ['SARAH20', 'SARAH20-2'])).toBe('SARAH20-3')
  })
})

describe('defaultCodeTerms', () => {
  it('is first-order-only out of the box', () => {
    // A code without this is a permanent site-wide discount the moment it
    // reaches a deal site, and adding it later changes terms a partner has
    // already been told.
    expect(defaultCodeTerms().firstOrderOnly).toBe(true)
  })
})

describe('checkCode', () => {
  const base = { subtotal: 80, isFirstOrder: true, partnerStatus: 'active' as const }

  it('allows a live code and reports the discount', () => {
    expect(checkCode(code(), base)).toEqual({ ok: true, discountPct: 0.2 })
  })

  it('stops working the moment the partner is suspended', () => {
    const check = checkCode(code(), { ...base, partnerStatus: 'suspended' })
    expect(check.ok).toBe(false)
  })

  it('refuses a paused or expired code by name', () => {
    expect(checkCode(code({ status: 'paused' }), base)).toMatchObject({ ok: false, reason: /paused/ })
    expect(checkCode(code({ status: 'expired' }), base)).toMatchObject({ ok: false, reason: /expired/ })
  })

  it('honours the window at both ends', () => {
    const terms = { ...defaultCodeTerms(), startsAt: '2026-06-01T00:00:00.000Z', endsAt: '2026-06-30T00:00:00.000Z' }
    const early = checkCode(code({ terms }), { ...base, now: new Date('2026-05-01') })
    const during = checkCode(code({ terms }), { ...base, now: new Date('2026-06-15') })
    const late = checkCode(code({ terms }), { ...base, now: new Date('2026-07-01') })

    expect(early).toMatchObject({ ok: false, reason: /not active yet/ })
    expect(during.ok).toBe(true)
    expect(late).toMatchObject({ ok: false, reason: /expired/ })
  })

  it('enforces the usage cap', () => {
    const terms = { ...defaultCodeTerms(), maxUses: 100, uses: 100 }
    expect(checkCode(code({ terms }), base)).toMatchObject({ ok: false, reason: /fully redeemed/ })
  })

  it('enforces first-order-only, which is what stops a code becoming a sitewide sale', () => {
    expect(checkCode(code(), { ...base, isFirstOrder: false })).toMatchObject({
      ok: false,
      reason: /first order only/,
    })
  })

  it('enforces a minimum spend, and says what it is', () => {
    const terms = { ...defaultCodeTerms(), minSpend: 50 }
    expect(checkCode(code({ terms }), { ...base, subtotal: 30 })).toMatchObject({
      ok: false,
      reason: /£50\.00 or more/,
    })
  })

  it('never refuses silently — every no has a reason', () => {
    const refusals = [
      checkCode(code({ status: 'paused' }), base),
      checkCode(code(), { ...base, isFirstOrder: false }),
      checkCode(code({ terms: { ...defaultCodeTerms(), maxUses: 1, uses: 1 } }), base),
    ]
    // A code that quietly does nothing is the worst outcome: the customer thinks
    // they got a discount and the partner thinks they earned a commission.
    for (const r of refusals) {
      expect(r.ok).toBe(false)
      expect(r.ok === false && r.reason.length).toBeGreaterThan(0)
    }
  })
})

describe('isExpired', () => {
  it('is true past the end date or the cap', () => {
    expect(isExpired(code({ terms: { ...defaultCodeTerms(), endsAt: '2020-01-01T00:00:00.000Z' } }))).toBe(true)
    expect(isExpired(code({ terms: { ...defaultCodeTerms(), maxUses: 5, uses: 5 } }))).toBe(true)
    expect(isExpired(code())).toBe(false)
  })
})
