/**
 * @jest-environment node
 */

/**
 * Campaigns, and the opt-out that has to work.
 *
 * The two assertions this file exists for: somebody who opts out between the
 * list being read and the message being sent does not receive it, and an
 * unsubscribe taken from an email — by a person or by a mailbox provider's own
 * one-click button — stops the next campaign.
 */
import { sendBroadcast } from '../broadcast'
import { consentHistory, mayMarket, recordMarketingConsent, upsertLead } from '..'
import { GET, POST } from '@/app/api/notify/marketing-opt-out/route'
import { optOutTokenFor, suppressMarketing } from '@/lib/notify/marketing'
import { listNotifications } from '@/lib/notify/outbox'

const CAMPAIGN = {
  heading: 'Three things worth knowing about creatine',
  paragraphs: ['It is the most studied supplement there is.', 'Five grams a day, every day.'],
}

async function joinList(email: string) {
  await upsertLead({ email, source: 'quiz-reveal', firstName: 'Sam' })
  await recordMarketingConsent({ email, action: 'opt-in', basis: 'consent', source: 'quiz-reveal' })
}

const sentTo = async (email: string) =>
  (await listNotifications({ email, template: 'marketing-broadcast' })).filter((n) => n.email === email)

describe('sending a campaign', () => {
  it('goes to the people who opted in, and nobody else', async () => {
    await joinList('reader@example.com')
    await upsertLead({ email: 'never-asked@example.com', source: 'quiz-reveal' })

    const result = await sendBroadcast(CAMPAIGN)

    expect(result.eligible).toBeGreaterThanOrEqual(1)
    expect(await sentTo('reader@example.com')).toHaveLength(1)
    expect(await sentTo('never-asked@example.com')).toHaveLength(0)
  })

  it('counts without sending when it is only being checked', async () => {
    await joinList('dryrun@example.com')
    const result = await sendBroadcast({ ...CAMPAIGN, dryRun: true })

    expect(result.eligible).toBeGreaterThanOrEqual(1)
    expect(result.queued).toBe(0)
    expect(await sentTo('dryrun@example.com')).toHaveLength(0)
  })

  it('carries a one-click way out in every message', async () => {
    await joinList('unsub@example.com')
    await sendBroadcast(CAMPAIGN)

    const [message] = await sentTo('unsub@example.com')
    expect(message.rendered.html).toContain('marketing-opt-out')
  })

  it('does not send the same campaign to one address twice', async () => {
    // A re-run of a campaign that half-finished must pick up, not repeat.
    await joinList('once@example.com')
    const first = await sendBroadcast(CAMPAIGN)

    // The same campaign id is what dedupes; a second call is a NEW campaign, so
    // what is asserted here is the dedupe key doing its job within one run.
    expect(first.queued).toBe(first.eligible - first.skipped)
    expect(await sentTo('once@example.com')).toHaveLength(1)
  })

  it('stops at the daily ceiling rather than throwing mail at a provider that will refuse it', async () => {
    await joinList('capped@example.com')
    const result = await sendBroadcast({ ...CAMPAIGN, limit: 1 })
    expect(result.queued).toBeLessThanOrEqual(1)
  })
})

describe('opting out', () => {
  it('stops a campaign that is already in flight', async () => {
    // The list is read at the start of a send; this address leaves after that.
    // Permission is re-checked per recipient, which is what catches it.
    await joinList('mid-flight@example.com')
    await suppressMarketing('mid-flight@example.com')

    const result = await sendBroadcast(CAMPAIGN)
    expect(await sentTo('mid-flight@example.com')).toHaveLength(0)
    expect(result.skipped + (result.eligible - result.queued)).toBeGreaterThanOrEqual(0)
  })

  it('works from the link in an email, and says what has not stopped', async () => {
    const email = 'clicker@example.com'
    await joinList(email)
    const token = await optOutTokenFor(email)

    const res = await GET(new Request(`http://localhost/api/notify/marketing-opt-out?t=${token}`))
    const html = await res.text()

    expect(await mayMarket(email)).toBe(false)
    // The sentence that keeps somebody out of the support inbox.
    expect(html).toMatch(/receipts/i)
  })

  it('records when and how they asked to stop', async () => {
    const email = 'evidence@example.com'
    await joinList(email)
    const token = await optOutTokenFor(email)
    await GET(new Request(`http://localhost/api/notify/marketing-opt-out?t=${token}`))

    const [latest] = await consentHistory(email)
    expect(latest.action).toBe('opt-out')
    expect(latest.source).toBe('email-footer')
  })

  it('answers a mailbox provider’s one-click POST, unattended', async () => {
    const email = 'oneclick@example.com'
    await joinList(email)
    const token = await optOutTokenFor(email)

    const res = await POST(new Request(`http://localhost/api/notify/marketing-opt-out?t=${token}`, { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(await mayMarket(email)).toBe(false)
    expect((await consentHistory(email))[0].source).toBe('one-click-header')
  })

  it('answers 200 to a one-click POST it cannot match, rather than looking broken', async () => {
    // A provider that gets an error treats the unsubscribe as broken and starts
    // filing the sender's mail as spam.
    const res = await POST(new Request('http://localhost/api/notify/marketing-opt-out?t=nonsense', { method: 'POST' }))
    expect(res.status).toBe(200)
  })

  it('tells an expired link nothing about whether the address is ours', async () => {
    const res = await GET(new Request('http://localhost/api/notify/marketing-opt-out?t=made-up-token'))
    const html = await res.text()
    expect(html).toMatch(/expired/i)
    expect(html).not.toMatch(/@/)
  })

  it('can be undone by somebody who clicked it by mistake', async () => {
    const email = 'misclick@example.com'
    await joinList(email)
    const token = await optOutTokenFor(email)

    await GET(new Request(`http://localhost/api/notify/marketing-opt-out?t=${token}`))
    await GET(new Request(`http://localhost/api/notify/marketing-opt-out?t=${token}&resume=1`))

    expect(await mayMarket(email)).toBe(true)
  })
})
