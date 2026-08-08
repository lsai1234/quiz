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

import {
  createInviteToken,
  endPartnerSession,
  getSessionPartner,
  login,
  partnerForInvite,
  passwordProblem,
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
