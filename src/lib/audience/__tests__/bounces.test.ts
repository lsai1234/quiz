/**
 * @jest-environment node
 */

/**
 * Bounces and complaints.
 *
 * An endpoint that can silence an address has to prove who is calling it before
 * it does anything — an unauthenticated one is a way to unsubscribe somebody
 * else's customers. Most of this file is that check.
 */
import { createHmac } from 'crypto'
import { POST } from '@/app/api/webhooks/resend/route'
import { consentHistory, mayMarket, recordMarketingConsent } from '..'

const SECRET = 'whsec_dGVzdC1zZWNyZXQtZm9yLXRoZS1zaWduaW5n'

function signed(body: unknown, over: { secret?: string; timestamp?: number } = {}): Request {
  const raw = JSON.stringify(body)
  const id = 'msg_test'
  const timestamp = String(over.timestamp ?? Math.floor(Date.now() / 1000))
  const key = Buffer.from((over.secret ?? SECRET).replace(/^whsec_/, ''), 'base64')
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64')

  return new Request('http://localhost/api/webhooks/resend', {
    method: 'POST',
    headers: {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    },
    body: raw,
  })
}

const onList = (email: string) =>
  recordMarketingConsent({ email, action: 'opt-in', basis: 'consent', source: 'quiz-reveal' })

beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET
})

describe('proving who is calling', () => {
  it('refuses an unsigned request', async () => {
    const res = await POST(
      new Request('http://localhost/api/webhooks/resend', {
        method: 'POST',
        body: JSON.stringify({ type: 'email.complained', data: { to: ['x@example.com'] } }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('refuses a signature made with the wrong secret', async () => {
    const res = await POST(signed({ type: 'email.complained', data: { to: ['x@example.com'] } }, { secret: 'whsec_d3Jvbmc=' }))
    expect(res.status).toBe(401)
  })

  it('refuses a replayed request', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600
    const res = await POST(signed({ type: 'email.complained', data: { to: ['x@example.com'] } }, { timestamp: old }))
    expect(res.status).toBe(401)
  })

  it('refuses everything when no secret is configured', async () => {
    // An open endpoint that can suppress addresses is a way to silence somebody
    // else's customers, so "not set up" fails closed.
    delete process.env.RESEND_WEBHOOK_SECRET
    const res = await POST(signed({ type: 'email.complained', data: { to: ['x@example.com'] } }))
    expect(res.status).toBe(401)
  })
})

describe('what it does with a valid event', () => {
  it('stops emailing somebody who pressed "this is spam"', async () => {
    await onList('complained@example.com')
    const res = await POST(signed({ type: 'email.complained', data: { to: ['complained@example.com'] } }))

    expect(res.status).toBe(200)
    expect(await mayMarket('complained@example.com')).toBe(false)
    expect((await consentHistory('complained@example.com'))[0].source).toBe('spam-complaint')
  })

  it('stops emailing a mailbox that does not exist', async () => {
    await onList('gone@example.com')
    await POST(signed({ type: 'email.bounced', data: { to: ['gone@example.com'], bounce: { type: 'Permanent' } } }))

    expect(await mayMarket('gone@example.com')).toBe(false)
    expect((await consentHistory('gone@example.com'))[0].source).toBe('hard-bounce')
  })

  it('leaves a full mailbox alone — that is temporary, and a customer is not', async () => {
    await onList('full@example.com')
    await POST(signed({ type: 'email.bounced', data: { to: ['full@example.com'], bounce: { type: 'Transient' } } }))

    expect(await mayMarket('full@example.com')).toBe(true)
  })

  it('ignores the events it has no opinion about', async () => {
    await onList('opened@example.com')
    const res = await POST(signed({ type: 'email.opened', data: { to: ['opened@example.com'] } }))

    expect(res.status).toBe(200)
    expect(await mayMarket('opened@example.com')).toBe(true)
  })
})
