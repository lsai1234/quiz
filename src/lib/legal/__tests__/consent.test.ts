import {
  consentErrorMessage,
  hashDocument,
  latestConsent,
  listConsents,
  needsReconsent,
  recordConsent,
  requestMetadata,
  validateConsent,
} from '@/lib/legal/consent'
import {
  DISCLAIMER_VERSION,
  TERMS_VERSION,
  getTermsDocument,
} from '@/lib/legal/content'
import { getPricingConfig, resetPricingOverrides, setPricingOverrides } from '@/lib/stack-blueprint/pricing'
import { createUser } from '@/lib/db/users'

afterEach(() => resetPricingOverrides())

const good = { accepted: true, termsVersion: TERMS_VERSION, disclaimerVersion: DISCLAIMER_VERSION }

describe('validating a submission', () => {
  it('accepts a tick against the current versions and returns hashed documents', () => {
    const result = validateConsent(good)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.documents.map((d) => d.id)).toEqual(['terms', 'disclaimer'])
    expect(result.documents[0]).toMatchObject({ version: TERMS_VERSION })
    expect(result.documents[0].hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects an unticked box, a missing field and a missing object alike', () => {
    for (const submission of [{ ...good, accepted: false }, undefined, null]) {
      const result = validateConsent(submission)
      expect(result).toEqual({ ok: false, error: 'not-accepted' })
    }
  })

  it('rejects consent to a version we no longer serve', () => {
    // Only reachable across a deploy mid-session. Recording consent to text we
    // can't reproduce would make the evidence worthless, so the member re-reads.
    expect(validateConsent({ ...good, termsVersion: '2020-01-01' }))
      .toEqual({ ok: false, error: 'stale-version' })
    expect(validateConsent({ ...good, disclaimerVersion: '2020-01-01' }))
      .toEqual({ ok: false, error: 'stale-version' })
  })

  it('has a member-facing message for each rejection', () => {
    expect(consentErrorMessage('not-accepted')).toMatch(/confirm/i)
    expect(consentErrorMessage('stale-version')).toMatch(/updated/i)
  })
})

describe('hashing ties consent to the exact wording', () => {
  it('changes when the served text changes, even at the same version', () => {
    setPricingOverrides({ priceChangeNoticeDays: 30 })
    const at30 = hashDocument(getTermsDocument(getPricingConfig()))
    setPricingOverrides({ priceChangeNoticeDays: 60 })
    const at60 = hashDocument(getTermsDocument(getPricingConfig()))

    expect(at30).not.toBe(at60)
  })

  it('is stable for identical text', () => {
    expect(hashDocument(getTermsDocument())).toBe(hashDocument(getTermsDocument()))
  })
})

describe('recording consent', () => {
  it('stores what was agreed, when, and from where', async () => {
    const user = await createUser({ email: 'consent-1@example.com' })
    const result = validateConsent(good)
    if (!result.ok) throw new Error('expected valid consent')

    const record = await recordConsent({
      userId: user.id,
      context: 'checkout',
      documents: result.documents,
      ip: '203.0.113.7',
      userAgent: 'jest',
    })

    expect(record).toMatchObject({ userId: user.id, context: 'checkout', ip: '203.0.113.7', userAgent: 'jest' })
    expect(record.documents).toHaveLength(2)
    expect(await latestConsent(user.id)).toMatchObject({ id: record.id })
  })

  it('is append-only — a second consent never replaces the first', async () => {
    const user = await createUser({ email: 'consent-2@example.com' })
    const result = validateConsent(good)
    if (!result.ok) throw new Error('expected valid consent')

    await recordConsent({ userId: user.id, context: 'checkout', documents: result.documents })
    await recordConsent({ userId: user.id, context: 're-consent', documents: result.documents })

    const all = await listConsents(user.id)
    expect(all).toHaveLength(2)
    expect(all.map((c) => c.context).sort()).toEqual(['checkout', 're-consent'])
  })

  it('tolerates unknown request metadata', async () => {
    const user = await createUser({ email: 'consent-3@example.com' })
    const result = validateConsent(good)
    if (!result.ok) throw new Error('expected valid consent')

    const record = await recordConsent({ userId: user.id, context: 'checkout', documents: result.documents })
    expect(record.ip).toBeNull()
    expect(record.userAgent).toBeNull()
  })
})

describe('re-consent', () => {
  it('is needed by someone who has never consented', async () => {
    const user = await createUser({ email: 'consent-4@example.com' })
    expect(await needsReconsent(user.id)).toBe(true)
  })

  it('is not needed once they have accepted the current terms', async () => {
    const user = await createUser({ email: 'consent-5@example.com' })
    const result = validateConsent(good)
    if (!result.ok) throw new Error('expected valid consent')
    await recordConsent({ userId: user.id, context: 'checkout', documents: result.documents })

    expect(await needsReconsent(user.id)).toBe(false)
  })

  it('is needed again after a material version bump', async () => {
    const user = await createUser({ email: 'consent-6@example.com' })
    const result = validateConsent(good)
    if (!result.ok) throw new Error('expected valid consent')
    await recordConsent({ userId: user.id, context: 'checkout', documents: result.documents })

    expect(await needsReconsent(user.id, '2027-01-01')).toBe(true)
  })

  it('is NOT triggered by config-driven wording changes', async () => {
    // The hash moves when the notice period changes; interrupting every member
    // with a consent wall over that would be noise. A material change is a
    // version bump — that is what the version is for.
    const user = await createUser({ email: 'consent-7@example.com' })
    setPricingOverrides({ priceChangeNoticeDays: 30 })
    const result = validateConsent(good, getPricingConfig())
    if (!result.ok) throw new Error('expected valid consent')
    await recordConsent({ userId: user.id, context: 'checkout', documents: result.documents })

    setPricingOverrides({ priceChangeNoticeDays: 60 })
    expect(await needsReconsent(user.id)).toBe(false)
  })
})

describe('requestMetadata', () => {
  const reqWith = (headers: Record<string, string>) => ({
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  })

  it('takes the client from the left of x-forwarded-for', () => {
    expect(
      requestMetadata(reqWith({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18', 'user-agent': 'Mozilla/5.0' })),
    ).toEqual({ ip: '203.0.113.7', userAgent: 'Mozilla/5.0' })
  })

  it('falls back to x-real-ip, then to null', () => {
    expect(requestMetadata(reqWith({ 'x-real-ip': '198.51.100.4' })).ip).toBe('198.51.100.4')
    expect(requestMetadata(reqWith({})).ip).toBeNull()
  })
})
