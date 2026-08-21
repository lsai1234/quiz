/**
 * Buyers joining the audience.
 *
 * The soft opt-in (PECR reg. 22(3)) is a narrower permission than a tick, and
 * these tests exist to keep the two from being confused: a buyer gets it, a
 * ticked box is never downgraded to it, and somebody who has opted out does not
 * get quietly re-added by placing an order.
 */
import { recordSoftOptIn, linkAccountAddress } from '../buyers'
import { consentHistory, consentStateOf, getLead, mayMarket, recordMarketingConsent } from '..'
import { suppressMarketing } from '@/lib/notify/marketing'

const buy = (email: string, userId = 'usr_1') =>
  recordSoftOptIn({ email, userId, firstName: 'Sam', track: 'performance', primaryGoal: 'muscle' })

describe('a customer joining the audience', () => {
  it('is recorded under the soft opt-in, tied to their account', async () => {
    await buy('buyer@example.com', 'usr_buyer')

    const state = await consentStateOf('buyer@example.com')
    expect(state.marketable).toBe(true)
    expect(state.basis).toBe('soft-opt-in')

    const lead = await getLead('buyer@example.com')
    expect(lead).toMatchObject({ userId: 'usr_buyer', source: 'checkout', firstName: 'Sam' })
  })

  it('records no statement, because they ticked nothing', async () => {
    // The evidence for a soft opt-in is the order. Inventing a sentence they
    // never saw would be evidence of something that did not happen.
    await buy('nostatement@example.com')
    const [record] = await consentHistory('nostatement@example.com')
    expect(record.statementVersion).toBeNull()
    expect(record.statementHash).toBeNull()
  })

  it('leaves a real consent alone rather than downgrading it', async () => {
    const email = 'ticked-then-bought@example.com'
    await recordMarketingConsent({ email, action: 'opt-in', basis: 'consent', source: 'quiz-reveal' })
    await buy(email)

    // Still the stronger basis, and still exactly one permission on file.
    expect((await consentStateOf(email)).basis).toBe('consent')
    expect((await consentHistory(email)).filter((r) => r.action === 'opt-in')).toHaveLength(1)
  })

  it('does not re-add somebody who has opted out', async () => {
    const email = 'gone@example.com'
    await suppressMarketing(email)
    await buy(email)

    expect(await mayMarket(email)).toBe(false)
    // Their address is still recorded — we have to be able to email their
    // receipt — but no permission was taken from the fact that they bought.
    expect(await getLead(email)).not.toBeNull()
    expect(await consentHistory(email)).toHaveLength(0)
  })

  it('ignores a checkout with no address rather than throwing', async () => {
    await expect(recordSoftOptIn({ email: null, userId: 'usr_2' })).resolves.toBeUndefined()
  })
})

describe('one identity per address', () => {
  it('ties a quiz lead to the account that later signs in with it', async () => {
    await recordMarketingConsent({
      email: 'later@example.com', action: 'opt-in', basis: 'consent', source: 'quiz-reveal',
    })
    const { upsertLead } = await import('../leads')
    await upsertLead({ email: 'later@example.com', source: 'quiz-reveal' })

    await linkAccountAddress('later@example.com', 'usr_later')
    expect((await getLead('later@example.com'))?.userId).toBe('usr_later')
  })

  it('shrugs at an address it has never seen', async () => {
    await expect(linkAccountAddress('stranger@example.com', 'usr_x')).resolves.toBeUndefined()
  })
})
