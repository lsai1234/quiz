/**
 * The marketing audience — leads, consent evidence, and permission.
 *
 * The assertions here are the compliance ones. Each maps to something a
 * regulator or a complaint would actually ask: can you show what they agreed
 * to, does an opt-out taken anywhere stop everything, and is the record a
 * history rather than a current value that overwrote its own evidence.
 */
import {
  audienceCounts,
  consentHistory,
  consentStateOf,
  hashStatement,
  isPlausibleEmail,
  listAudience,
  mayMarket,
  normaliseEmail,
  recordMarketingConsent,
  upsertLead,
} from '..'
import { suppressMarketing, resumeMarketing } from '@/lib/notify/marketing'
import { MARKETING_CONSENT_STATEMENT, MARKETING_CONSENT_VERSION } from '@/lib/legal/content'

const optIn = (email: string, over: Partial<Parameters<typeof recordMarketingConsent>[0]> = {}) =>
  recordMarketingConsent({ email, action: 'opt-in', basis: 'consent', source: 'quiz-reveal', ...over })

describe('normalising an address', () => {
  it('trims and lowercases, so one person is one row', () => {
    expect(normaliseEmail('  Sam@Example.COM ')).toBe('sam@example.com')
  })

  it('accepts the addresses people actually have', () => {
    for (const email of ['a@b.co', 'sam+quiz@example.com', 'first.last@sub.domain.co.uk']) {
      expect(isPlausibleEmail(email)).toBe(true)
    }
  })

  it('rejects what is obviously not one', () => {
    for (const email of ['', 'sam', 'sam@', '@example.com', 'sam@example', 'a b@example.com']) {
      expect(isPlausibleEmail(email)).toBe(false)
    }
  })
})

describe('the consent record', () => {
  it('stores the exact wording that was shown, by version and hash', async () => {
    const record = await optIn('evidence@example.com')
    expect(record.statementVersion).toBe(MARKETING_CONSENT_VERSION)
    // The hash reproduces from the constant — which is what makes it evidence
    // rather than a label: re-worded copy cannot reattach itself to this row.
    expect(record.statementHash).toBe(hashStatement(MARKETING_CONSENT_STATEMENT))
  })

  it('keeps the request metadata a complaint would ask for', async () => {
    const record = await optIn('meta@example.com', { ip: '203.0.113.7', userAgent: 'Safari' })
    expect(record.ip).toBe('203.0.113.7')
    expect(record.userAgent).toBe('Safari')
    expect(record.source).toBe('quiz-reveal')
  })

  it('is a history, not a current value', async () => {
    const email = 'history@example.com'
    await optIn(email)
    await recordMarketingConsent({ email, action: 'opt-out', basis: 'consent', source: 'email-footer' })
    await optIn(email, { source: 'checkout' })

    const history = await consentHistory(email)
    expect(history.map((r) => r.action)).toEqual(['opt-in', 'opt-out', 'opt-in'])
  })

  it('records no statement for an opt-out — there is no wording to agree to', async () => {
    const record = await recordMarketingConsent({
      email: 'out@example.com', action: 'opt-out', basis: 'consent', source: 'email-footer',
    })
    expect(record.statementVersion).toBeNull()
    expect(record.statementHash).toBeNull()
  })

  it('keeps the basis, because consent and soft opt-in are not the same permission', async () => {
    await recordMarketingConsent({
      email: 'buyer@example.com', action: 'opt-in', basis: 'soft-opt-in', source: 'checkout',
    })
    expect((await consentStateOf('buyer@example.com')).basis).toBe('soft-opt-in')
  })
})

describe('may we email this person', () => {
  it('is no until they have opted in', async () => {
    await upsertLead({ email: 'quiet@example.com', source: 'quiz-reveal' })
    expect(await mayMarket('quiet@example.com')).toBe(false)
  })

  it('is yes once they have', async () => {
    await optIn('yes@example.com')
    expect(await mayMarket('yes@example.com')).toBe(true)
  })

  it('is no once they have opted out, however they did it', async () => {
    // The opt-out here is the one written by an email footer — a different store
    // from the consent table. If these two ever disagree, the list is unlawful.
    await optIn('gone@example.com')
    await suppressMarketing('gone@example.com')
    expect(await mayMarket('gone@example.com')).toBe(false)
  })

  it('stays no when a later opt-in arrives after an opt-out', async () => {
    // Two conflicting signals; the safe reading is the one that sends less email.
    await suppressMarketing('conflict@example.com')
    await optIn('conflict@example.com', { source: 'checkout' })
    expect(await mayMarket('conflict@example.com')).toBe(false)
  })

  it('comes back on if they change their mind', async () => {
    await optIn('back@example.com')
    await suppressMarketing('back@example.com')
    await resumeMarketing('back@example.com')
    expect(await mayMarket('back@example.com')).toBe(true)
  })

  it('is no for anything that is not an address', async () => {
    expect(await mayMarket(null)).toBe(false)
    expect(await mayMarket('not-an-address')).toBe(false)
  })

  it('treats the address case-insensitively throughout', async () => {
    await optIn('Mixed.Case@Example.com')
    expect(await mayMarket('mixed.case@example.com')).toBe(true)
  })
})

describe('the leads themselves', () => {
  it('is one row per person however many times they take the quiz', async () => {
    await upsertLead({ email: 'twice@example.com', source: 'quiz-reveal', firstName: 'Sam' })
    await upsertLead({ email: 'TWICE@example.com', source: 'quiz-build' })

    const found = (await listAudience()).filter((m) => m.email === 'twice@example.com')
    expect(found).toHaveLength(1)
    // The later visit knew less; it must not blank what we already had.
    expect(found[0].firstName).toBe('Sam')
    // And it cannot rewrite where the address originally came from.
    expect(found[0].source).toBe('quiz-reveal')
  })

  it('refreshes what a newer quiz tells us', async () => {
    await upsertLead({ email: 'goals@example.com', source: 'quiz-reveal', primaryGoal: 'muscle' })
    await upsertLead({ email: 'goals@example.com', source: 'quiz-reveal', primaryGoal: 'sleep-better' })

    const [lead] = (await listAudience()).filter((m) => m.email === 'goals@example.com')
    expect(lead.primaryGoal).toBe('sleep-better')
  })

  it('can list only the addresses we may actually email', async () => {
    await upsertLead({ email: 'in@example.com', source: 'quiz-reveal' })
    await optIn('in@example.com')
    await upsertLead({ email: 'out@example.com', source: 'quiz-reveal' })

    const marketable = (await listAudience({ marketableOnly: true })).map((m) => m.email)
    expect(marketable).toContain('in@example.com')
    expect(marketable).not.toContain('out@example.com')
  })

  it('filters by where the address came from', async () => {
    await upsertLead({ email: 'reveal@example.com', source: 'quiz-reveal' })
    await upsertLead({ email: 'gate@example.com', source: 'checkout' })

    const fromCheckout = (await listAudience({ source: 'checkout' })).map((m) => m.email)
    expect(fromCheckout).toEqual(['gate@example.com'])
  })

  it('counts the list the way the hub reports it', async () => {
    // Deltas, not absolutes: every test in this file shares one in-memory
    // database, so what this pins down is the arithmetic, not the fixture.
    const before = await audienceCounts()

    await upsertLead({ email: 'c1@example.com', source: 'quiz-reveal' })
    await optIn('c1@example.com')
    await upsertLead({ email: 'c2@example.com', source: 'quiz-reveal' })
    await optIn('c2@example.com')
    await suppressMarketing('c2@example.com')

    const after = await audienceCounts()
    expect(after.total - before.total).toBe(2)
    expect(after.marketable - before.marketable).toBe(1)
    expect(after.suppressed - before.suppressed).toBe(1)
  })
})
