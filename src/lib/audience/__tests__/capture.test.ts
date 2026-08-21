/**
 * @jest-environment node
 */

/**
 * The capture endpoint.
 *
 * Runs in the node environment rather than jsdom: this is a route handler, and
 * `Request`/`Response` are web-standard globals jsdom does not implement.
 *
 * The first test in this file is the one that matters most: an address submitted
 * with the marketing box unticked still gets the stack, and leaves no marketing
 * permission behind. That is not a nicety — if the email only worked when the
 * box was ticked, the tick would be the price of the thing they came for, and
 * consent obtained that way is not consent (UK GDPR Art. 4(11)). The whole list
 * would be unusable.
 */
import { POST } from '@/app/api/audience/subscribe/route'
import { consentHistory, getLead, mayMarket } from '..'
import { listNotifications } from '@/lib/notify/outbox'

/**
 * One submission. Each gets its own client address by default, because the
 * route rate-limits per IP and a shared one would make every test after the
 * eighth a 429 — the flood test below pins an address precisely so it can.
 */
let client = 0
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/audience/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': `203.0.113.${(client += 1) % 250}`,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  )

const STACK = {
  stackName: 'The Strength Foundation',
  items: [{ title: 'Whey Protein', reason: 'Builds and repairs muscle' }],
  monthly: 48.14,
  oneOff: 64.37,
}

/**
 * Templates queued for exactly this address. `listNotifications` filters with
 * LIKE, so "ticked@…" would otherwise also match "unticked@…" — a substring
 * match is fine for a founder searching the log and useless as an assertion.
 */
const emailsTo = async (address: string) =>
  (await listNotifications({ email: address }))
    .filter((n) => n.email === address)
    .map((n) => n.template)

describe('submitting an address', () => {
  it('emails the stack and records nothing when the box is unticked', async () => {
    const email = 'unticked@example.com'
    const res = await post({ email, marketingOptIn: false, source: 'quiz-reveal', stack: STACK })
    expect(res.status).toBe(200)

    // They got what they asked for …
    expect(await emailsTo(email)).toContain('stack-email')
    // … and we took no permission we were not given.
    expect(await consentHistory(email)).toHaveLength(0)
    expect(await mayMarket(email)).toBe(false)
  })

  it('records the consent when it is ticked, and welcomes them once', async () => {
    const email = 'ticked@example.com'
    await post({ email, marketingOptIn: true, source: 'quiz-reveal', stack: STACK }, {
      'x-forwarded-for': '203.0.113.9',
    })

    expect(await mayMarket(email)).toBe(true)
    const [record] = await consentHistory(email)
    expect(record.action).toBe('opt-in')
    expect(record.basis).toBe('consent')
    expect(record.statementHash).toEqual(expect.any(String))
    expect(record.ip).toBe('203.0.113.9')

    const templates = await emailsTo(email)
    expect(templates).toContain('stack-email')
    expect(templates).toContain('marketing-welcome')
  })

  it('does not welcome somebody twice', async () => {
    const email = 'twice@example.com'
    await post({ email, marketingOptIn: true, source: 'quiz-reveal', stack: STACK })
    await post({ email, marketingOptIn: true, source: 'quiz-reveal', stack: STACK })

    const welcomes = (await emailsTo(email)).filter((t) => t === 'marketing-welcome')
    expect(welcomes).toHaveLength(1)
    // The stack, though, is sent every time it is asked for — deleting the first
    // one by accident must not mean never getting another.
    expect((await emailsTo(email)).filter((t) => t === 'stack-email')).toHaveLength(2)
  })

  it('keeps what the quiz knows, for segmenting later', async () => {
    await post({
      email: 'segment@example.com',
      firstName: 'Sam',
      marketingOptIn: true,
      source: 'quiz-reveal',
      track: 'wellbeing',
      primaryGoal: 'sleep-better',
      stack: STACK,
    })

    const lead = await getLead('segment@example.com')
    expect(lead).toMatchObject({ firstName: 'Sam', track: 'wellbeing', primaryGoal: 'sleep-better' })
  })

  it('refuses something that is not an address, and says so plainly', async () => {
    const res = await post({ email: 'not-an-address', marketingOptIn: false })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/email address/i)
  })

  it('swallows a bot that fills the hidden field, and tells it nothing', async () => {
    const email = 'bot@example.com'
    const res = await post({ email, marketingOptIn: true, website: 'https://spam.example', stack: STACK })

    // Same answer a person gets — there is nothing here to learn from.
    expect(res.status).toBe(200)
    expect(await getLead(email)).toBeNull()
    expect(await consentHistory(email)).toHaveLength(0)
  })

  it('takes an address with no stack to send, and simply keeps it', async () => {
    const res = await post({ email: 'lead-only@example.com', marketingOptIn: true })
    expect(res.status).toBe(200)
    expect(await getLead('lead-only@example.com')).not.toBeNull()
    expect(await emailsTo('lead-only@example.com')).not.toContain('stack-email')
  })

  it('rejects a malformed body rather than guessing', async () => {
    const res = await POST(
      new Request('http://localhost/api/audience/subscribe', { method: 'POST', body: 'not json' }),
    )
    expect(res.status).toBe(400)
  })

  it('stops a hot loop from stuffing the list', async () => {
    const results: number[] = []
    for (let i = 0; i < 12; i++) {
      const res = await post({ email: `flood${i}@example.com`, marketingOptIn: false }, { 'x-forwarded-for': '198.51.100.4' })
      results.push(res.status)
    }
    expect(results).toContain(429)
  })
})

describe('what the stack email carries', () => {
  it('shows the products and both prices, so it is useful without the site', async () => {
    const email = 'content@example.com'
    await post({ email, marketingOptIn: false, source: 'quiz-reveal', stack: STACK })

    const [sent] = (await listNotifications({ email, template: 'stack-email' })).filter((n) => n.email === email)
    expect(sent.rendered.subject).toContain('The Strength Foundation')
    expect(sent.rendered.text).toContain('Whey Protein')
    expect(sent.rendered.text).toContain('£48.14')
    expect(sent.rendered.text).toContain('£64.37')
  })

  it('leaves the promotional strip out for somebody who did not tick', async () => {
    const email = 'nostrip@example.com'
    await post({ email, marketingOptIn: false, source: 'quiz-reveal', stack: STACK })

    const [sent] = (await listNotifications({ email, template: 'stack-email' })).filter((n) => n.email === email)
    // The strip is what the tick buys. Its absence is the tick meaning something.
    expect(sent.rendered.text).not.toContain('While you are here')
    expect(sent.rendered.html).not.toContain('marketing-opt-out')
  })

  it('carries the strip AND a working way out for somebody who did', async () => {
    const email = 'strip@example.com'
    await post({ email, marketingOptIn: true, source: 'quiz-reveal', stack: STACK })

    const [sent] = (await listNotifications({ email, template: 'stack-email' })).filter((n) => n.email === email)
    expect(sent.rendered.html).toContain('marketing-opt-out')
  })
})
