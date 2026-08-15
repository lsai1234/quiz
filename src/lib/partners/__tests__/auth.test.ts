/**
 * The partner auth realm.
 *
 * `next/headers` is mocked with a single in-memory jar, so the cookie the server
 * sets is the cookie the next call reads — the round trip is what these tests
 * are about, not the jar.
 */
const jar = new Map<string, string>()

jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => { jar.set(name, value) },
    delete: (name: string) => { jar.delete(name) },
  }),
}))

/** The email layer, captured rather than sent. */
const mockPartnerResets: { email: string; resetUrl: string; realm?: string }[] = []

jest.mock('@/lib/notify/account', () => ({
  sendPasswordReset: jest.fn(async (input: { email: string; resetUrl: string; realm?: string }) => {
    mockPartnerResets.push(input)
    return true
  }),
  sendPasswordChanged: jest.fn(async () => {}),
}))

import {
  createInviteToken,
  endPartnerSession,
  getSessionPartner,
  login,
  partnerForInvite,
  passwordProblem,
  requestPartnerPasswordReset,
  setPasswordWithToken,
  startPartnerSession,
} from '@/lib/partners/auth'
import { createPartner, setPartnerStatus } from '@/lib/partners'
import * as repo from '@/lib/partners/repo'

beforeEach(() => jar.clear())

const PASSWORD = 'a-long-enough-password'

/** A partner who has been through the invite flow and can sign in. */
async function onboarded(email: string, name: string) {
  const created = await createPartner({ email, name })
  const token = await createInviteToken(created.partner.id)
  const set = await setPasswordWithToken(token, PASSWORD)
  expect(set.ok).toBe(true)
  jar.clear()
  return created
}

describe('signing in', () => {
  it('works once a password is set', async () => {
    await onboarded('in@example.com', 'In Person')
    const result = await login('in@example.com', PASSWORD)
    expect(result.ok).toBe(true)
  })

  it('gives the same answer to a wrong password and an unknown email', async () => {
    // Distinguishing them would tell anyone who asks which of our partners
    // exist, and a partner's relationship with us being theirs is the whole
    // value of the programme to them.
    await onboarded('known@example.com', 'Known Person')
    const wrongPassword = await login('known@example.com', 'not-the-password')
    const noSuchPartner = await login('nobody@example.com', PASSWORD)

    expect(wrongPassword.ok).toBe(false)
    expect(noSuchPartner.ok).toBe(false)
    expect(wrongPassword.ok === false && wrongPassword.reason).toBe(
      noSuchPartner.ok === false ? noSuchPartner.reason : '',
    )
  })

  it('refuses an invited partner who has never set a password', async () => {
    await createPartner({ email: 'nopass@example.com', name: 'No Pass' })
    const result = await login('nopass@example.com', PASSWORD)
    expect(result.ok).toBe(false)
  })

  it('turns a suspended partner away, and says why', async () => {
    // They know they have an account, so a generic refusal here would just send
    // them to support to be told this anyway.
    const created = await onboarded('susp3@example.com', 'Susp Three')
    await setPartnerStatus(created.partner.id, 'suspended')

    const result = await login('susp3@example.com', PASSWORD)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toMatch(/suspended/i)
  })
})

describe('the session', () => {
  it('round-trips through the cookie', async () => {
    const created = await onboarded('sess@example.com', 'Sess Person')
    await startPartnerSession(created.partner.id)

    const partner = await getSessionPartner()
    expect(partner?.id).toBe(created.partner.id)
  })

  it('stores a HASH, never the token itself', async () => {
    // A leaked database must not be replayable as live logins.
    const created = await onboarded('hash@example.com', 'Hash Person')
    await startPartnerSession(created.partner.id)

    const cookie = jar.get('partner_session')!
    expect(cookie).toBeTruthy()
    // The raw token resolves nothing when treated as a stored hash.
    expect(await repo.partnerIdForSession(cookie)).toBeNull()
    // But it does resolve through the auth layer, which hashes it first.
    expect((await getSessionPartner())?.id).toBe(created.partner.id)
  })

  it('is nothing without a cookie', async () => {
    expect(await getSessionPartner()).toBeNull()
  })

  it('ends on sign-out', async () => {
    const created = await onboarded('out@example.com', 'Out Person')
    await startPartnerSession(created.partner.id)
    await endPartnerSession()
    expect(await getSessionPartner()).toBeNull()
  })

  it('ends the moment a partner is suspended', async () => {
    // Not just refused at the door — the rows go, so a live-looking dashboard
    // cannot survive on a screen that forgot to check.
    const created = await onboarded('kill@example.com', 'Kill Person')
    await startPartnerSession(created.partner.id)
    expect(await getSessionPartner()).not.toBeNull()

    await setPartnerStatus(created.partner.id, 'suspended')
    expect(await getSessionPartner()).toBeNull()
  })
})

describe('invite links', () => {
  it('names whose link it is WITHOUT spending it', async () => {
    // A page load must not burn an invite, or a preview fetch in an email
    // client would lock a partner out before they ever clicked.
    const created = await createPartner({ email: 'peek@example.com', name: 'Peek Person' })
    const token = await createInviteToken(created.partner.id)

    expect((await partnerForInvite(token))?.name).toBe('Peek Person')
    expect((await partnerForInvite(token))?.name).toBe('Peek Person')

    expect((await setPasswordWithToken(token, PASSWORD)).ok).toBe(true)
  })

  it('works exactly once', async () => {
    const created = await createPartner({ email: 'once@example.com', name: 'Once Person' })
    const token = await createInviteToken(created.partner.id)

    expect((await setPasswordWithToken(token, PASSWORD)).ok).toBe(true)

    const replay = await setPasswordWithToken(token, 'a-different-password')
    expect(replay.ok).toBe(false)
    expect(replay.ok === false && replay.reason).toMatch(/expired or has already been used/)
    // And the first password still works, so a replay cannot lock them out.
    expect((await login('once@example.com', PASSWORD)).ok).toBe(true)
  })

  it('moves an invited partner to active', async () => {
    const created = await createPartner({ email: 'active@example.com', name: 'Active Person' })
    expect(created.partner.status).toBe('invited')

    const token = await createInviteToken(created.partner.id)
    const result = await setPasswordWithToken(token, PASSWORD)
    expect(result.ok && result.partner.status).toBe('active')
  })

  it('drops every existing session when the password changes', async () => {
    // The entire reason to change a password is to end sessions somebody else
    // might be holding.
    const created = await onboarded('rotate@example.com', 'Rotate Person')
    await startPartnerSession(created.partner.id)
    expect(await getSessionPartner()).not.toBeNull()

    const reset = await createInviteToken(created.partner.id, 'reset')
    await setPasswordWithToken(reset, 'another-long-password')

    expect(await getSessionPartner()).toBeNull()
  })

  it('refuses a token nobody issued', async () => {
    expect(await partnerForInvite('made-up')).toBeNull()
    expect((await setPasswordWithToken('made-up', PASSWORD)).ok).toBe(false)
  })

  it('refuses a weak password before spending the link', async () => {
    const created = await createPartner({ email: 'weak@example.com', name: 'Weak Person' })
    const token = await createInviteToken(created.partner.id)

    expect((await setPasswordWithToken(token, 'short')).ok).toBe(false)
    // The link survives, so a typo does not cost them their invite.
    expect((await setPasswordWithToken(token, PASSWORD)).ok).toBe(true)
  })
})

describe('password rules', () => {
  it('asks for ten characters', () => {
    expect(passwordProblem('short')).toMatch(/10 characters/)
    expect(passwordProblem('')).toMatch(/10 characters/)
    expect(passwordProblem(PASSWORD)).toBeNull()
  })

  it('refuses something absurd rather than hashing it', () => {
    expect(passwordProblem('x'.repeat(5000))).toMatch(/too long/)
  })
})

/**
 * A partner asking for their own reset link.
 *
 * The realm could always MINT one of these — a founder pressing "reissue" in the
 * hub — but a partner locked out on a Saturday could not see their own
 * commission until somebody read their email on Monday.
 */
describe('forgotten partner passwords', () => {
  const ENV = { ...process.env }

  beforeEach(() => {
    mockPartnerResets.length = 0
    process.env.NOTIFY_SOURCE = 'mock'
  })

  afterEach(() => {
    process.env = { ...ENV }
  })

  const lastToken = () =>
    new URL(mockPartnerResets[mockPartnerResets.length - 1].resetUrl).searchParams.get('token') ?? ''

  it('emails a link that sets a password', async () => {
    const { partner } = await onboarded('reset-partner@example.com', 'Reset Partner')

    expect(await requestPartnerPasswordReset('reset-partner@example.com')).toBe('sent')
    expect(mockPartnerResets[0].realm).toBe('partner')
    // Lands on the page invites already used — a reset and an invite are the
    // same act with different wording.
    expect(mockPartnerResets[0].resetUrl).toContain('/partner/set-password?token=')

    const set = await setPasswordWithToken(lastToken(), 'a-fresh-partner-password')
    expect(set.ok).toBe(true)

    const check = await login('reset-partner@example.com', 'a-fresh-partner-password')
    expect(check.ok).toBe(true)
    expect(partner.id).toBe(set.ok ? set.partner.id : '')
  })

  it('says nothing and sends nothing for an address that is not a partner', async () => {
    // Which addresses are partners of ours is commercially interesting, and
    // this form must not be a way to ask.
    expect(await requestPartnerPasswordReset('stranger@example.com')).toBe('unknown')
    expect(mockPartnerResets).toHaveLength(0)
  })

  it('treats a suspended partner as unknown rather than explaining', async () => {
    const { partner } = await onboarded('suspended-reset@example.com', 'Suspended One')
    await setPartnerStatus(partner.id, 'suspended')

    expect(await requestPartnerPasswordReset('suspended-reset@example.com')).toBe('unknown')
    expect(mockPartnerResets).toHaveLength(0)
  })

  it('stops at three an hour', async () => {
    await onboarded('throttled-partner@example.com', 'Throttled')

    for (let i = 0; i < 3; i++) {
      expect(await requestPartnerPasswordReset('throttled-partner@example.com')).toBe('sent')
    }
    expect(await requestPartnerPasswordReset('throttled-partner@example.com')).toBe('throttled')
  })

  it('retires the previous link when a new one is asked for', async () => {
    await onboarded('newest-partner@example.com', 'Newest')

    await requestPartnerPasswordReset('newest-partner@example.com')
    const first = lastToken()
    await requestPartnerPasswordReset('newest-partner@example.com')
    const second = lastToken()

    expect(await partnerForInvite(first)).toBeNull()
    expect(await partnerForInvite(second)).not.toBeNull()
  })

  it('leaves a founder’s onboarding invite alone', async () => {
    // A self-serve reset must not quietly void the link somebody was sent to
    // join in the first place.
    const created = await createPartner({ email: 'invited-too@example.com', name: 'Invited Too' })
    const invite = await createInviteToken(created.partner.id, 'invite')

    await requestPartnerPasswordReset('invited-too@example.com')

    expect(await partnerForInvite(invite)).not.toBeNull()
  })

  it('refuses to pretend when no email provider is configured', async () => {
    process.env.NOTIFY_SOURCE = 'manual'
    await onboarded('no-provider@example.com', 'No Provider')

    expect(await requestPartnerPasswordReset('no-provider@example.com')).toBe('unavailable')
    expect(mockPartnerResets).toHaveLength(0)
  })
})
