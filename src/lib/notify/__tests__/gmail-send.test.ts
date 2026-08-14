/**
 * The Gmail send path, against a stubbed Google.
 *
 * Proves the two round trips a real send makes — refresh token for an access
 * token, then the message itself — and the caching between them.
 */
import type { NotificationProvider, RenderedEmail } from '@/lib/notify/types'

const email: RenderedEmail = { subject: 'Your order', text: 'Body', html: '<p>Body</p>' }
const ENV = { ...process.env }
const realFetch = global.fetch

beforeEach(() => {
  process.env.GMAIL_CLIENT_ID = 'client-id'
  process.env.GMAIL_CLIENT_SECRET = 'client-secret'
  process.env.GMAIL_REFRESH_TOKEN = 'refresh-token'
  // The provider caches its access token in module scope — which is the point
  // of the caching test below, and would otherwise leak a warm token from one
  // test into the next.
  jest.resetModules()
})

/** A provider with a cold token cache. */
async function gmail(): Promise<NotificationProvider> {
  const { createGmailProvider } = await import('@/lib/notify/providers/gmail')
  return createGmailProvider()
}

afterEach(() => {
  process.env = { ...ENV }
  global.fetch = realFetch
  jest.restoreAllMocks()
})

/** A Google that hands out a token and accepts one message. */
function stubGoogle(over: { sendOk?: boolean; status?: number; detail?: string } = {}) {
  const calls: { url: string; body: unknown }[] = []
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url)
    calls.push({ url: href, body: init?.body })
    if (href.includes('oauth2.googleapis.com')) {
      return { ok: true, json: async () => ({ access_token: 'ya29.token', expires_in: 3600 }) }
    }
    if (over.sendOk === false) {
      return { ok: false, status: over.status ?? 403, text: async () => over.detail ?? 'Delegation denied' }
    }
    return { ok: true, json: async () => ({ id: '18f2c0a1b2c3d4e5' }) }
  }) as unknown as typeof fetch
  return calls
}

describe('sending', () => {
  it('trades the refresh token for an access token, then posts the message', async () => {
    const calls = stubGoogle()
    const result = await (await gmail()).send('buyer@example.com', email, {
      from: 'getCHRGD Orders <orderconfirmation.noreply@getchrgd.co.uk>',
      replyTo: 'contact@getchrgd.co.uk',
    })

    expect(result.providerId).toBe('18f2c0a1b2c3d4e5')
    expect(calls[0].url).toContain('oauth2.googleapis.com')
    expect(calls[1].url).toContain('gmail.googleapis.com')

    // The message goes as base64url — no +, / or = — or Gmail rejects it.
    const { raw } = JSON.parse(String(calls[1].body)) as { raw: string }
    expect(raw).not.toMatch(/[+/=]/)
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    expect(decoded).toContain('To: buyer@example.com')
    expect(decoded).toContain('orderconfirmation.noreply@getchrgd.co.uk')
  })

  it('reuses the access token rather than minting one per email', async () => {
    // Google's tokens last an hour. A round trip per receipt would double the
    // latency of every payment webhook for nothing.
    const calls = stubGoogle()
    const provider = await gmail()
    await provider.send('one@example.com', email, { from: 'a@b.uk' })
    await provider.send('two@example.com', email, { from: 'a@b.uk' })

    expect(calls.filter((c) => c.url.includes('oauth2'))).toHaveLength(1)
    expect(calls.filter((c) => c.url.includes('gmail.googleapis'))).toHaveLength(2)
  })

  it('throws with Google’s own reason, so the hub can show it', async () => {
    // The outbox catches this, records it on the row and leaves it retryable —
    // and Google's errors are genuinely informative, so they are passed through.
    stubGoogle({ sendOk: false, status: 403, detail: 'Delegation denied for user' })
    await expect((await gmail()).send('buyer@example.com', email, { from: 'a@b.uk' })).rejects.toThrow(
      /403.*Delegation denied/,
    )
  })

  it('says plainly when there is no refresh token to send with', async () => {
    delete process.env.GMAIL_REFRESH_TOKEN
    stubGoogle()
    await expect((await gmail()).send('buyer@example.com', email, { from: 'a@b.uk' })).rejects.toThrow(
      /GMAIL_REFRESH_TOKEN is missing/,
    )
  })
})
