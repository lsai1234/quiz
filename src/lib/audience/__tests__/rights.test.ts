/**
 * Data rights and retention.
 *
 * The assertion that matters most is the counter-intuitive one: erasing
 * somebody KEEPS the fact that they opted out. Without it the same address can
 * be collected again tomorrow and start receiving exactly what they asked us to
 * stop — which is the opposite of honouring the request.
 */
import { eraseAddress, purgeStaleLeads, retentionCutoff, subjectAccessRecord } from '../rights'
import { consentHistory, getLead, mayMarket, recordMarketingConsent, upsertLead } from '..'
import { LEAD_RETENTION_MONTHS } from '@/lib/legal/content'
import { getEngine } from '@/lib/db/engine'

const optIn = (email: string) =>
  recordMarketingConsent({ email, action: 'opt-in', basis: 'consent', source: 'quiz-reveal' })

/** Backdate a lead's last contact, so the retention window can be tested. */
async function lastSeen(email: string, iso: string) {
  const db = await getEngine()
  await db.run('UPDATE email_leads SET last_seen_at = ? WHERE email = ?', [iso, email])
}

describe('a subject access request', () => {
  it('gathers everything we hold against one address', async () => {
    await upsertLead({ email: 'asker@example.com', firstName: 'Sam', source: 'quiz-reveal' })
    await optIn('asker@example.com')

    const record = await subjectAccessRecord('asker@example.com')
    expect(record.lead?.firstName).toBe('Sam')
    expect(record.consents).toHaveLength(1)
    expect(record.emails).toEqual(expect.any(Array))
  })

  it('answers for an address we have never seen, rather than failing', async () => {
    const record = await subjectAccessRecord('stranger@example.com')
    expect(record.lead).toBeNull()
    expect(record.consents).toHaveLength(0)
  })
})

describe('erasure', () => {
  it('removes the person', async () => {
    await upsertLead({ email: 'forget@example.com', firstName: 'Sam', source: 'quiz-reveal' })
    await optIn('forget@example.com')

    const result = await eraseAddress('forget@example.com')
    expect(result.leadDeleted).toBe(true)
    expect(result.consentsDeleted).toBe(1)
    expect(await getLead('forget@example.com')).toBeNull()
  })

  it('keeps them un-emailable afterwards', async () => {
    // The whole point. Deleting the opt-out along with everything else would let
    // this address be collected again tomorrow and emailed.
    await upsertLead({ email: 'stay-gone@example.com', source: 'quiz-reveal' })
    await optIn('stay-gone@example.com')
    await eraseAddress('stay-gone@example.com')

    expect(await mayMarket('stay-gone@example.com')).toBe(false)

    // Even after they turn up again through a later capture.
    await upsertLead({ email: 'stay-gone@example.com', source: 'quiz-reveal' })
    await optIn('stay-gone@example.com')
    expect(await mayMarket('stay-gone@example.com')).toBe(false)
  })

  it('leaves exactly one record behind, and it is the opt-out', async () => {
    await upsertLead({ email: 'trace@example.com', source: 'quiz-reveal' })
    await optIn('trace@example.com')
    await eraseAddress('trace@example.com')

    const remaining = await consentHistory('trace@example.com')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].action).toBe('opt-out')
    expect(remaining[0].source).toBe('erasure-request')
  })
})

describe('retention', () => {
  it('counts back the number of months the privacy notice states', () => {
    const cutoff = new Date(retentionCutoff(new Date('2026-08-21T00:00:00Z')))
    const expected = new Date('2026-08-21T00:00:00Z')
    expected.setMonth(expected.getMonth() - LEAD_RETENTION_MONTHS)
    expect(cutoff.toISOString()).toBe(expected.toISOString())
  })

  it('deletes an address nobody has heard from since', async () => {
    await upsertLead({ email: 'stale@example.com', source: 'quiz-reveal' })
    await lastSeen('stale@example.com', '2020-01-01T00:00:00.000Z')

    const result = await purgeStaleLeads()
    expect(result.purged).toBeGreaterThanOrEqual(1)
    expect(await getLead('stale@example.com')).toBeNull()
  })

  it('leaves an address that came back recently', async () => {
    await upsertLead({ email: 'recent@example.com', source: 'quiz-reveal' })
    await purgeStaleLeads()
    expect(await getLead('recent@example.com')).not.toBeNull()
  })

  it('never purges a customer — their address is part of an order record', async () => {
    await upsertLead({ email: 'customer@example.com', source: 'checkout', userId: 'usr_1' })
    await lastSeen('customer@example.com', '2019-01-01T00:00:00.000Z')

    await purgeStaleLeads()
    expect(await getLead('customer@example.com')).not.toBeNull()
  })

  it('can count without deleting, so the number can be looked at first', async () => {
    await upsertLead({ email: 'dry@example.com', source: 'quiz-reveal' })
    await lastSeen('dry@example.com', '2019-06-01T00:00:00.000Z')

    const result = await purgeStaleLeads({ dryRun: true })
    expect(result.purged).toBeGreaterThanOrEqual(1)
    expect(await getLead('dry@example.com')).not.toBeNull()
  })
})
