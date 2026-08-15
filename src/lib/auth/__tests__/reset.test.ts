/**
 * Forgotten passwords, customer realm.
 *
 * The email layer is mocked out — what is under test here is the token: who can
 * spend it, how often one can be asked for, and what it leaves behind. The
 * rendering and the deliberate non-storage of the link are covered separately
 * in `notify/__tests__/account.test.ts`.
 */
const mockSent: { email: string; resetUrl: string; realm?: string }[] = []
const mockChanged: { email: string }[] = []

jest.mock('@/lib/notify/account', () => ({
  sendPasswordReset: jest.fn(async (input: { email: string; resetUrl: string; realm?: string }) => {
    mockSent.push(input)
    return true
  }),
  sendPasswordChanged: jest.fn(async (input: { email: string }) => {
    mockChanged.push(input)
  }),
}))

import {
  accountForResetToken,
  requestPasswordReset,
  resetPasswordWithToken,
} from '@/lib/auth/reset'
import { verifyPassword } from '@/lib/auth/password'
import { createSession, getUserForSession } from '@/lib/db/sessions'
import { createUser, getUserByEmail } from '@/lib/db/users'

const ENV = { ...process.env }

beforeEach(() => {
  mockSent.length = 0
  mockChanged.length = 0
  // A provider exists, so resets are switched on. `mock` sends and forgets.
  process.env.NOTIFY_SOURCE = 'mock'
})

afterEach(() => {
  process.env = { ...ENV }
  jest.useRealTimers()
})

/** The token out of the link we would have emailed. */
function tokenFromLastEmail(): string {
  const url = new URL(mockSent[mockSent.length - 1].resetUrl)
  return url.searchParams.get('token') ?? ''
}

async function accountWithPassword(email: string, password = 'original-password') {
  const { hashPassword } = await import('@/lib/auth/password')
  return createUser({ email, passwordHash: hashPassword(password) })
}

describe('asking for a link', () => {
  it('emails a working link to an account that exists', async () => {
    const user = await accountWithPassword('reset-1@example.com')

    expect(await requestPasswordReset('reset-1@example.com')).toBe('sent')
    expect(mockSent).toHaveLength(1)
    expect(mockSent[0].email).toBe(user.email)

    const account = await accountForResetToken(tokenFromLastEmail())
    expect(account?.email).toBe('reset-1@example.com')
  })

  it('says nothing and sends nothing for an address with no account', async () => {
    // The whole point: a form that answers honestly is a way of asking this site
    // whether a given person is a customer.
    expect(await requestPasswordReset('nobody@example.com')).toBe('unknown')
    expect(mockSent).toHaveLength(0)
  })

  it('matches the address however it was typed', async () => {
    await accountWithPassword('reset-case@example.com')
    expect(await requestPasswordReset('  Reset-Case@Example.com  ')).toBe('sent')
  })

  it('will not send to the placeholder address of a provider that gave us none', async () => {
    // `x-12345@placeholder.invalid` is non-routable by design. Attempting it
    // bounces against our own sending reputation and helps nobody.
    await createUser({ email: 'x-90210@placeholder.invalid' })
    expect(await requestPasswordReset('x-90210@placeholder.invalid')).toBe('unknown')
    expect(mockSent).toHaveLength(0)
  })

  it('sends to an account that has only ever used Google', async () => {
    // Not a bug: the token proves control of the mailbox, which is the same
    // thing Google was vouching for. They end up with a password AND the
    // provider button, which beats being told on a screen designed to reveal
    // nothing that this address uses Google.
    await createUser({ email: 'google-only@example.com' })

    expect(await requestPasswordReset('google-only@example.com')).toBe('sent')
    const result = await resetPasswordWithToken(tokenFromLastEmail(), 'a-brand-new-password')
    expect(result.ok).toBe(true)

    const user = await getUserByEmail('google-only@example.com')
    expect(verifyPassword('a-brand-new-password', user!.passwordHash)).toBe(true)
  })

  it('refuses to pretend when there is no email provider configured', async () => {
    // Manual mode means a human copies emails out of the Founders Hub. That is
    // not a channel for a credential, and a member who was told "check your
    // inbox" would wait forever.
    process.env.NOTIFY_SOURCE = 'manual'
    await accountWithPassword('reset-manual@example.com')

    expect(await requestPasswordReset('reset-manual@example.com')).toBe('unavailable')
    expect(mockSent).toHaveLength(0)
  })

  it('stops at three an hour, and still says nothing', async () => {
    // The address belongs to a member who did not ask for any of it, and we
    // would be the ones sending it.
    await accountWithPassword('reset-throttle@example.com')

    for (let i = 0; i < 3; i++) {
      expect(await requestPasswordReset('reset-throttle@example.com')).toBe('sent')
    }
    expect(await requestPasswordReset('reset-throttle@example.com')).toBe('throttled')
    expect(mockSent).toHaveLength(3)
  })

  it('lets the newest link work and retires the ones before it', async () => {
    await accountWithPassword('reset-newest@example.com')

    await requestPasswordReset('reset-newest@example.com')
    const first = tokenFromLastEmail()
    await requestPasswordReset('reset-newest@example.com')
    const second = tokenFromLastEmail()

    expect(await accountForResetToken(first)).toBeNull()
    expect(await accountForResetToken(second)).not.toBeNull()
  })
})

describe('spending a link', () => {
  it('sets the password and signs every other device out', async () => {
    // The reason to reset a password is that somebody else may know the old
    // one — and may already be signed in with it.
    const user = await accountWithPassword('reset-sessions@example.com')
    const elsewhere = await createSession(user.id)
    expect(await getUserForSession(elsewhere.token)).not.toBeNull()

    await requestPasswordReset('reset-sessions@example.com')
    const result = await resetPasswordWithToken(tokenFromLastEmail(), 'my-new-password')

    expect(result.ok).toBe(true)
    expect(await getUserForSession(elsewhere.token)).toBeNull()

    const updated = await getUserByEmail('reset-sessions@example.com')
    expect(verifyPassword('my-new-password', updated!.passwordHash)).toBe(true)
    expect(verifyPassword('original-password', updated!.passwordHash)).toBe(false)
  })

  it('tells them afterwards that it happened', async () => {
    // The notice that catches a takeover: whoever reset the password is reading
    // the reset email, but the person who owns the mailbox reads this one.
    await accountWithPassword('reset-notice@example.com')
    await requestPasswordReset('reset-notice@example.com')
    await resetPasswordWithToken(tokenFromLastEmail(), 'my-new-password')

    expect(mockChanged).toHaveLength(1)
    expect(mockChanged[0].email).toBe('reset-notice@example.com')
  })

  it('works exactly once', async () => {
    await accountWithPassword('reset-once@example.com')
    await requestPasswordReset('reset-once@example.com')
    const token = tokenFromLastEmail()

    expect((await resetPasswordWithToken(token, 'first-new-password')).ok).toBe(true)

    const second = await resetPasswordWithToken(token, 'second-new-password')
    expect(second.ok).toBe(false)
    const updated = await getUserByEmail('reset-once@example.com')
    expect(verifyPassword('first-new-password', updated!.passwordHash)).toBe(true)
  })

  it('leaves nothing usable behind for a link issued before it', async () => {
    // A second email still sitting in the inbox must not be able to change the
    // password that was just set.
    await accountWithPassword('reset-stale@example.com')
    await requestPasswordReset('reset-stale@example.com')
    const older = tokenFromLastEmail()
    await requestPasswordReset('reset-stale@example.com')
    const newer = tokenFromLastEmail()

    expect((await resetPasswordWithToken(newer, 'chosen-password')).ok).toBe(true)
    expect((await resetPasswordWithToken(older, 'attacker-password')).ok).toBe(false)
  })

  it('expires after an hour', async () => {
    jest.useFakeTimers({ now: new Date('2026-03-01T09:00:00Z') })
    await accountWithPassword('reset-expiry@example.com')
    await requestPasswordReset('reset-expiry@example.com')
    const token = tokenFromLastEmail()

    jest.setSystemTime(new Date('2026-03-01T09:59:00Z'))
    expect(await accountForResetToken(token)).not.toBeNull()

    jest.setSystemTime(new Date('2026-03-01T10:01:00Z'))
    expect(await accountForResetToken(token)).toBeNull()
    expect((await resetPasswordWithToken(token, 'too-late-password')).ok).toBe(false)
  })

  it('refuses a password sign-up itself would have refused', async () => {
    // One rule in one place. A reset that accepts something weaker than the
    // sign-up form is a hole with a nice front door.
    await accountWithPassword('reset-weak@example.com')
    await requestPasswordReset('reset-weak@example.com')

    const result = await resetPasswordWithToken(tokenFromLastEmail(), 'short')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/at least 8/i)
  })

  it('does not spend the link just because somebody looked at it', async () => {
    // An email client that prefetches URLs would otherwise burn the link before
    // its owner ever clicked.
    await accountWithPassword('reset-peek@example.com')
    await requestPasswordReset('reset-peek@example.com')
    const token = tokenFromLastEmail()

    await accountForResetToken(token)
    await accountForResetToken(token)

    expect((await resetPasswordWithToken(token, 'still-works-password')).ok).toBe(true)
  })

  it('turns away a token nobody issued', async () => {
    const result = await resetPasswordWithToken('not-a-real-token', 'some-new-password')
    expect(result.ok).toBe(false)
  })
})
