import { createPartner, getPartnerRecord, listPartnerRecords, changeTerms, setPartnerStatus, resolveCode, updateCodeTerms } from '@/lib/partners'
import { checkCode } from '@/lib/partners/codes'
import { PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'

/** Against the real (in-memory) database, so the schema is exercised too. */
describe('creating a partner', () => {
  it('creates the account, a code and an opening deal in one go', async () => {
    const record = await createPartner({ email: 'sarah@example.com', name: 'Sarah Jones' })

    expect(record.partner.email).toBe('sarah@example.com')
    // Invited, not active: they have never signed in and hold no password.
    expect(record.partner.status).toBe('invited')

    expect(record.codes).toHaveLength(1)
    expect(record.codes[0].code).toBe('SARAH20')
    expect(record.codes[0].discountPct).toBe(PRICING_CONFIG.partners.introFloorPct)
    expect(record.codes[0].terms.firstOrderOnly).toBe(true)

    // A partner with no terms row has no answer to "what am I on", which is the
    // question the programme has to be able to answer at any moment.
    expect(record.terms.firstOrderPct).toBe(PRICING_CONFIG.partners.firstOrderPct)
    expect(record.termsHistory).toHaveLength(1)
  })

  it('refuses a second partner on the same email', async () => {
    await createPartner({ email: 'dup@example.com', name: 'First' })
    await expect(createPartner({ email: 'dup@example.com', name: 'Second' })).rejects.toThrow(/already exists/)
  })

  it('does not hand two partners the same code', async () => {
    const a = await createPartner({ email: 'a@example.com', name: 'Jamie Smith' })
    const b = await createPartner({ email: 'b@example.com', name: 'Jamie Brown' })
    expect(a.codes[0].code).not.toBe(b.codes[0].code)
  })

  it('takes a chosen discount and a chosen code', async () => {
    const record = await createPartner({
      email: 'vip@example.com',
      name: 'Vip Person',
      discountPct: 0.3,
      code: 'vip30',
    })
    expect(record.codes[0].code).toBe('VIP30')
    expect(record.codes[0].discountPct).toBe(0.3)
  })
})

describe('reading a partner back', () => {
  it('returns the deal in force and the full history, newest first', async () => {
    const created = await createPartner({ email: 'hist@example.com', name: 'Hist Person' })
    // After the opening row, or it would be the one superseded rather than the
    // one superseding — which is exactly what effective dating is for.
    const from = new Date(Date.now() + 1000).toISOString()

    await changeTerms(created.partner.id, {
      firstOrderPct: 0.2,
      renewalPct: 0.05,
      renewalMonths: 6,
      payout: created.terms.payout,
      effectiveFrom: from,
      note: 'Negotiated up for a launch campaign.',
      createdBy: 'founder1@chrgd.dev',
    })

    const record = await getPartnerRecord(created.partner.id, new Date(Date.now() + 5000))
    expect(record!.terms.firstOrderPct).toBe(0.2)
    expect(record!.termsHistory).toHaveLength(2)
    // The reason is the thing the partner reads.
    expect(record!.termsHistory[0].note).toBe('Negotiated up for a launch campaign.')
    expect(record!.termsHistory[0].createdBy).toBe('founder1@chrgd.dev')
  })

  it('lists every partner for the hub', async () => {
    await createPartner({ email: 'list1@example.com', name: 'List One' })
    const all = await listPartnerRecords()
    expect(all.length).toBeGreaterThan(0)
    expect(all.every((r) => r.terms !== null)).toBe(true)
  })
})

describe('changing terms', () => {
  it('insists on a reason, because the partner reads it', async () => {
    const created = await createPartner({ email: 'why@example.com', name: 'Why Person' })
    await expect(
      changeTerms(created.partner.id, {
        firstOrderPct: 0.25,
        renewalPct: 0.05,
        renewalMonths: 6,
        payout: created.terms.payout,
        effectiveFrom: new Date().toISOString(),
        note: '   ',
      }),
    ).rejects.toThrow(/reason/)
  })

  it('cannot be backdated over commission already earned', async () => {
    const created = await createPartner({ email: 'back@example.com', name: 'Back Person' })
    await expect(
      changeTerms(
        created.partner.id,
        {
          firstOrderPct: 0.05,
          renewalPct: 0.01,
          renewalMonths: 6,
          payout: created.terms.payout,
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          note: 'Trying to restate the past.',
        },
        '2026-03-01T00:00:00.000Z',
      ),
    ).rejects.toThrow(/already been earned/)
  })

  it('refuses a row that would be superseded on arrival', async () => {
    // The bug this pins: a change meant to take effect "now", dated a few
    // seconds before the opening row (a date picker resolves to midnight, a
    // datetime picker drops the seconds), was accepted, appended to the
    // history, and changed absolutely nothing — no error, no new rate.
    const created = await createPartner({ email: 'doa@example.com', name: 'Doa Person' })
    const justBefore = new Date(new Date(created.terms.effectiveFrom).getTime() - 5000).toISOString()

    await expect(
      changeTerms(created.partner.id, {
        firstOrderPct: 0.25,
        renewalPct: 0.05,
        renewalMonths: 6,
        payout: created.terms.payout,
        effectiveFrom: justBefore,
        note: 'Meant to apply now.',
      }),
    ).rejects.toThrow(/superseded the moment they were saved/)

    const record = await getPartnerRecord(created.partner.id)
    expect(record!.termsHistory).toHaveLength(1)
    expect(record!.terms.firstOrderPct).toBe(PRICING_CONFIG.partners.firstOrderPct)
  })

  it('supersedes rather than overwriting — the old row survives', async () => {
    const created = await createPartner({ email: 'sup@example.com', name: 'Sup Person' })
    await changeTerms(created.partner.id, {
      firstOrderPct: 0.1,
      renewalPct: 0.05,
      renewalMonths: 6,
      payout: created.terms.payout,
      effectiveFrom: new Date(Date.now() + 1000).toISOString(),
      note: 'Rate review.',
    })

    const record = await getPartnerRecord(created.partner.id)
    expect(record!.termsHistory).toHaveLength(2)
    // The original deal is still readable — an update would have destroyed it.
    expect(record!.termsHistory.some((t) => t.firstOrderPct === PRICING_CONFIG.partners.firstOrderPct)).toBe(true)
  })
})

describe('suspending a partner', () => {
  it('stops their code working', async () => {
    const created = await createPartner({ email: 'susp@example.com', name: 'Susp Person' })
    await setPartnerStatus(created.partner.id, 'suspended')

    const resolved = await resolveCode(created.codes[0].code)
    const check = checkCode(resolved!.code, {
      subtotal: 100,
      isFirstOrder: true,
      partnerStatus: resolved!.partner.status,
    })
    expect(check.ok).toBe(false)
  })
})

describe('resolving a typed code', () => {
  it('finds the partner however it was typed', async () => {
    const created = await createPartner({ email: 'typed@example.com', name: 'Typed Person', code: 'TYPED20' })
    const resolved = await resolveCode('  typed20 ')
    expect(resolved!.partner.id).toBe(created.partner.id)
  })

  it('is null for a code nobody owns', async () => {
    expect(await resolveCode('NOPE')).toBeNull()
  })
})

describe('editing a code', () => {
  it('can pause it and cap it', async () => {
    const created = await createPartner({ email: 'edit@example.com', name: 'Edit Person' })
    await updateCodeTerms(created.codes[0].code, {
      status: 'paused',
      terms: { ...created.codes[0].terms, maxUses: 50 },
    })

    const record = await getPartnerRecord(created.partner.id)
    expect(record!.codes[0].status).toBe('paused')
    expect(record!.codes[0].terms.maxUses).toBe(50)
  })
})
