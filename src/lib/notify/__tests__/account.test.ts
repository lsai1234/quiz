/**
 * Account emails, and the one rule that makes them different: **the link is
 * never written down**.
 *
 * The outbox is a durable store rendered on a page inside the Founders Hub. A
 * reset link kept there is an account takeover sitting in an admin screen and in
 * every database backup, so the row is an audit record and the live email exists
 * only in the send call. These tests are what stop that quietly regressing —
 * routing this email through `queueNotification` + `sendNotificationNow` like
 * every other one would still work, and would put the credential back.
 */
const mockSends: { to: string; subject: string; html: string; text: string; from?: string }[] = []
let mockFailWith: Error | null = null

jest.mock('@/lib/notify/providers/mock', () => ({
  createMockProvider: () => ({
    name: 'mock',
    async send(
      to: string,
      email: { subject: string; html: string; text: string },
      envelope?: { from?: string },
    ) {
      if (mockFailWith) throw mockFailWith
      mockSends.push({ to, ...email, from: envelope?.from })
      return { providerId: 'mock_1' }
    },
  }),
}))

import { sendPasswordChanged, sendPasswordReset } from '@/lib/notify/account'
import { listNotifications } from '@/lib/notify/outbox'
import { bareAddress } from '@/lib/notify/streams'

const ENV = { ...process.env }
const TOKEN = 'a-secret-token-value-9f2b'
const RESET_URL = `https://getchrgd.co.uk/myhub/reset-password?token=${TOKEN}`

beforeEach(() => {
  mockSends.length = 0
  mockFailWith = null
  process.env.NOTIFY_SOURCE = 'mock'
})

afterEach(() => {
  process.env = { ...ENV }
})

async function resetRowsFor(email: string) {
  return (await listNotifications({ template: 'password-reset' })).filter((n) => n.email === email)
}

describe('the reset link', () => {
  it('goes out with the link in it', async () => {
    const ok = await sendPasswordReset({
      userId: null,
      email: 'live@example.com',
      resetUrl: RESET_URL,
      expiresIn: '60 minutes',
    })

    expect(ok).toBe(true)
    expect(mockSends).toHaveLength(1)
    expect(mockSends[0].to).toBe('live@example.com')
    expect(mockSends[0].html).toContain(TOKEN)
    expect(mockSends[0].text).toContain(TOKEN)
  })

  it('is not what gets stored', async () => {
    await sendPasswordReset({
      userId: null,
      email: 'stored@example.com',
      resetUrl: RESET_URL,
      expiresIn: '60 minutes',
    })

    const rows = await resetRowsFor('stored@example.com')
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows[0].rendered)).not.toContain(TOKEN)
    // And it says so, rather than looking like a faithful copy that happens to
    // have a different button on it.
    expect(rows[0].rendered.text).toMatch(/not kept on file/i)
    expect(rows[0].rendered.html).toMatch(/not kept on file/i)
  })

  it('leaves an audit row that records it went', async () => {
    await sendPasswordReset({
      userId: null,
      email: 'audit@example.com',
      resetUrl: RESET_URL,
      expiresIn: '60 minutes',
    })

    const [row] = await resetRowsFor('audit@example.com')
    expect(row.status).toBe('sent')
    expect(row.providerId).toBe('mock_1')
    expect(row.sentAt).toBeTruthy()
    // Not a person ticking something off — a provider actually delivered it.
    expect(row.sentManually).toBeFalsy()
  })

  it('points its stored copy at a page that issues a new one', async () => {
    // If a founder ever re-sends the audit copy by hand, the member must get
    // something that works rather than a dead button.
    await sendPasswordReset({
      userId: null,
      email: 'recoverable@example.com',
      resetUrl: RESET_URL,
      expiresIn: '60 minutes',
    })

    const [row] = await resetRowsFor('recoverable@example.com')
    expect(row.rendered.html).toContain('/myhub?forgot=1')
  })

  it('records a failure on the row and reports it to the caller', async () => {
    mockFailWith = new Error('provider is having an afternoon')

    const ok = await sendPasswordReset({
      userId: null,
      email: 'failed@example.com',
      resetUrl: RESET_URL,
      expiresIn: '60 minutes',
    })

    expect(ok).toBe(false)
    const [row] = await resetRowsFor('failed@example.com')
    expect(row.status).toBe('failed')
    expect(row.error).toMatch(/having an afternoon/)
    // Still no token, even on the path where somebody will go looking at the row.
    expect(JSON.stringify(row.rendered)).not.toContain(TOKEN)
  })

  it('sends nothing at all when there is no provider', async () => {
    process.env.NOTIFY_SOURCE = 'manual'

    const ok = await sendPasswordReset({
      userId: null,
      email: 'nothing@example.com',
      resetUrl: RESET_URL,
      expiresIn: '60 minutes',
    })

    expect(ok).toBe(false)
    expect(mockSends).toHaveLength(0)
    // Not even queued: an email waiting in the hub for a human to copy out is
    // the normal workflow for everything else and the wrong answer for this.
    expect(await resetRowsFor('nothing@example.com')).toHaveLength(0)
  })

  it('leaves from the account address, not the one receipts use', async () => {
    process.env.NOTIFY_DOMAIN = 'getchrgd.co.uk'
    await sendPasswordReset({
      userId: null,
      email: 'stream@example.com',
      resetUrl: RESET_URL,
      expiresIn: '60 minutes',
    })

    expect(bareAddress(mockSends[0].from ?? '')).toBe('account.noreply@getchrgd.co.uk')
  })

  it('never carries a promotion', async () => {
    // Somebody locked out of their account is mid-problem, and this email has
    // exactly one thing to say.
    await sendPasswordReset({
      userId: null,
      email: 'nopitch@example.com',
      resetUrl: RESET_URL,
      expiresIn: '60 minutes',
      firstName: 'Sam',
    })

    expect(mockSends[0].text).not.toMatch(/shop|bundle|subscribe/i)
  })

  it('says the same thing twice when asked twice', async () => {
    // Deliberately not deduped: someone who deleted the first email must be
    // able to get a second one.
    for (let i = 0; i < 2; i++) {
      await sendPasswordReset({
        userId: null,
        email: 'twice@example.com',
        resetUrl: RESET_URL,
        expiresIn: '60 minutes',
      })
    }

    expect(mockSends).toHaveLength(2)
    expect(await resetRowsFor('twice@example.com')).toHaveLength(2)
  })
})

describe('the password-changed notice', () => {
  it('goes out and is stored in full', async () => {
    // No credential in it, so nothing to withhold — and the body is the thing
    // support needs when somebody says they never got it.
    await sendPasswordChanged({ userId: null, email: 'changed@example.com', firstName: 'Alex' })

    expect(mockSends).toHaveLength(1)
    expect(mockSends[0].subject).toMatch(/password was changed/i)

    const rows = (await listNotifications({ template: 'password-changed' })).filter(
      (n) => n.email === 'changed@example.com',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('sent')
    expect(rows[0].rendered.text).toMatch(/signed out/i)
  })

  it('never fails the reset that caused it', async () => {
    // The password has already been changed by the time this is reached.
    mockFailWith = new Error('nope')
    await expect(
      sendPasswordChanged({ userId: null, email: 'quiet@example.com' }),
    ).resolves.toBeUndefined()
  })
})
