/**
 * Backend database — accounts, sessions, hub data, kv (in-memory SQLite).
 */
import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByGoogleSub,
  linkGoogle,
  toPublicUser,
} from '../users'
import { createSession, getUserForSession, deleteSession } from '../sessions'
import { getSubscription, saveSubscription, listFeedback, addFeedback } from '../hub-data'
import { kvGet, kvSet, kvHas } from '../kv'
import type { MemberSubscription } from '@/lib/recharge/types'

describe('users', () => {
  it('creates and finds a user by email (normalised)', async () => {
    const user = await createUser({ email: '  Jo@Example.COM ', passwordHash: 'hash' })
    expect(user.email).toBe('jo@example.com')
    expect(user.name).toBe('jo') // defaults to the email local part
    expect(await getUserByEmail('JO@example.com')).toMatchObject({ id: user.id })
    expect(await getUserById(user.id)).toMatchObject({ email: 'jo@example.com' })
  })

  it('rejects duplicate emails', async () => {
    await createUser({ email: 'dupe@example.com' })
    // Not `.rejects.toThrow()`: SqliteError comes from the native module's
    // realm, so `instanceof Error` is unreliable under jsdom.
    const rejection = await createUser({ email: 'dupe@example.com' }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(rejection).not.toBeNull()
    // SQLite / Postgres unique-violation codes respectively.
    expect(['SQLITE_CONSTRAINT_UNIQUE', '23505']).toContain((rejection as { code?: string }).code)
  })

  it('links a Google identity to an existing account', async () => {
    const user = await createUser({ email: 'link@example.com', passwordHash: 'hash' })
    await linkGoogle(user.id, 'google-sub-1', 'https://pic')
    const found = await getUserByGoogleSub('google-sub-1')
    expect(found?.id).toBe(user.id)
    expect(found?.picture).toBe('https://pic')
  })

  it('never exposes the password hash in the public shape', async () => {
    const user = await createUser({ email: 'pub@example.com', passwordHash: 'secret' })
    expect(toPublicUser(user)).not.toHaveProperty('passwordHash')
  })
})

describe('sessions', () => {
  it('round-trips a session token to its user', async () => {
    const user = await createUser({ email: 'sess@example.com' })
    const { token } = await createSession(user.id)
    expect((await getUserForSession(token))?.id).toBe(user.id)
  })

  it('returns null for a missing or revoked token', async () => {
    const user = await createUser({ email: 'revoke@example.com' })
    const { token } = await createSession(user.id)
    await deleteSession(token)
    expect(await getUserForSession(token)).toBeNull()
    expect(await getUserForSession('not-a-token')).toBeNull()
    expect(await getUserForSession(null)).toBeNull()
  })
})

describe('hub data', () => {
  const sub = { id: 'sub-1', status: 'active', lines: [] } as unknown as MemberSubscription

  it('saves and reloads a subscription per user', async () => {
    const user = await createUser({ email: 'hub@example.com' })
    expect(await getSubscription(user.id)).toBeNull()
    await saveSubscription(user.id, sub)
    expect(await getSubscription(user.id)).toMatchObject({ id: 'sub-1' })
    // Upsert replaces
    await saveSubscription(user.id, { ...sub, status: 'paused' } as MemberSubscription)
    expect((await getSubscription(user.id))?.status).toBe('paused')
  })

  it('appends and lists feedback oldest-first', async () => {
    const user = await createUser({ email: 'fb@example.com' })
    await addFeedback(user.id, {
      id: 'fb-1',
      date: '2026-01-01T00:00:00Z',
      ratings: { energy: 4 },
      noticedImprovements: true,
    })
    await addFeedback(user.id, {
      id: 'fb-2',
      date: '2026-02-01T00:00:00Z',
      ratings: { sleep: 2 },
      noticedImprovements: false,
    })
    const list = await listFeedback(user.id)
    expect(list.map((f) => f.id)).toEqual(['fb-1', 'fb-2'])
  })
})

describe('kv', () => {
  it('stores and retrieves JSON values', async () => {
    expect(await kvHas('missing')).toBe(false)
    expect(await kvGet('missing')).toBeUndefined()
    await kvSet('settings', { a: 1, nested: { b: [1, 2] } })
    expect(await kvHas('settings')).toBe(true)
    expect(await kvGet('settings')).toEqual({ a: 1, nested: { b: [1, 2] } })
    await kvSet('settings', { a: 2 })
    expect(await kvGet('settings')).toEqual({ a: 2 })
  })
})
