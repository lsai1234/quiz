/**
 * Export and erasure (in-memory SQLite).
 *
 * The erasure tests assert on the database directly rather than through the
 * repositories. A repository that has learned to hide erased rows would make a
 * test that reads through it pass over data still sitting on disk, and "we
 * deleted it" is the one claim that has to be true at the storage layer.
 */
import { createUser, getUserById } from '../users'
import { createSession, getUserForSession } from '../sessions'
import { saveSubscription, saveQuiz, getSubscription, getQuiz, addFeedback } from '../hub-data'
import { getEngine } from '../engine'
import { deleteAccount, exportAccount, isErased } from '../erasure'
import { recordConsent, listConsents } from '@/lib/legal/consent'
import { createShareCard } from '../share-cards'
import type { MemberSubscription } from '@/lib/recharge/types'

const subscription = {
  id: 'sub-1',
  status: 'active',
  customerEmail: 'member@example.com',
  flatMonthly: 40,
  lines: [{ id: 'l1', productId: 'p1', productTitle: 'Whey' }],
} as unknown as MemberSubscription

const quiz = {
  answers: {
    name: 'Sam',
    goals: ['sleep-better'],
    safetyFlags: ['pregnancy'],
  },
}

async function seed(email: string) {
  const user = await createUser({ email, passwordHash: 'PASSWORD-HASH-SENTINEL' })
  await saveSubscription(user.id, subscription)
  await saveQuiz(user.id, quiz)
  // Unique per seed: `feedback.id` is the primary key, so a fixed one collides
  // the second time this helper runs.
  await addFeedback(user.id, { id: `f-${user.id}`, date: '2026-01-01', note: 'going well' } as never)
  await recordConsent({
    userId: user.id,
    context: 'checkout',
    documents: [{ id: 'terms', version: '2026-08-12', hash: 'abc' }],
    ip: '1.2.3.4',
    userAgent: 'jest',
  })
  const { token } = await createSession(user.id)
  return { user, token }
}

async function count(table: string, userId: string): Promise<number> {
  const db = await getEngine()
  const rows = await db.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, [userId],
  )
  return Number(rows[0]?.n ?? 0)
}

describe('exportAccount', () => {
  it('returns the member’s answers, plan, consents and feedback', async () => {
    const { user } = await seed('export@example.com')

    const data = await exportAccount(user.id)
    expect(data).not.toBeNull()
    expect(data!.account).toMatchObject({ email: 'export@example.com' })
    // Parsed, not an escaped string — Article 20 asks for machine-readable, and
    // a wall of backslashes is not that.
    expect(data!.quiz).toMatchObject({ answers: { name: 'Sam' } })
    expect(data!.subscription).toMatchObject({ id: 'sub-1' })
    expect(data!.feedback).toHaveLength(1)
    expect(data!.consents).toHaveLength(1)
  })

  it('never includes the password hash or session tokens', async () => {
    // The export is an explicit column list, not SELECT *, precisely so a
    // secret cannot arrive in it by being added to a table later.
    const { user, token } = await seed('secrets@example.com')
    const serialised = JSON.stringify(await exportAccount(user.id))
    expect(serialised).not.toContain('PASSWORD-HASH-SENTINEL')
    expect(serialised).not.toContain(token)
    expect(serialised).not.toMatch(/password/i)
    // …while the consent document hash, which the member is entitled to, stays.
    expect(serialised).toContain('"hash":"abc"')
  })

  it('is null for an account that does not exist', async () => {
    expect(await exportAccount('user_nope')).toBeNull()
  })
})

describe('deleteAccount', () => {
  it('removes the quiz answers, the plan, the check-ins and the sessions', async () => {
    const { user, token } = await seed('erase@example.com')
    expect(await getUserForSession(token)).not.toBeNull()

    await deleteAccount(user.id)

    expect(await getQuiz(user.id)).toBeNull()
    expect(await getSubscription(user.id)).toBeNull()
    expect(await count('feedback', user.id)).toBe(0)
    expect(await count('sessions', user.id)).toBe(0)
    // The live session stops working, not just the row.
    expect(await getUserForSession(token)).toBeNull()
  })

  it('leaves nothing identifying on the user row', async () => {
    const { user } = await seed('identity@example.com')
    await deleteAccount(user.id)

    const row = await getUserById(user.id)
    expect(row?.email).not.toContain('identity@example.com')
    expect(row?.email).toContain('placeholder.invalid')
    expect(row?.name).toBe('Deleted account')
    expect(row?.passwordHash ?? null).toBeNull()
    expect(await isErased(user.id)).toBe(true)
  })

  it('keeps the consent record, because it is the evidence of what they agreed to', async () => {
    // consents.user_id is ON DELETE CASCADE, so dropping the row would take the
    // evidence with it — which is exactly what anonymising instead avoids.
    const { user } = await seed('evidence@example.com')
    await deleteAccount(user.id)
    expect(await listConsents(user.id)).toHaveLength(1)
  })

  it('deletes share cards rather than revoking them', async () => {
    // A revoked card stops rendering but its payload — the stack, sometimes a
    // first name — stays on disk.
    const user = await createUser({ email: 'cards@example.com', passwordHash: 'h' })
    await createShareCard({ userId: user.id, payload: { v: 1 } as never })
    expect(await count('share_cards', user.id)).toBe(1)

    await deleteAccount(user.id)
    expect(await count('share_cards', user.id)).toBe(0)
  })

  it('keeps the email audit trail but drops the recipient and the body', async () => {
    const user = await createUser({ email: 'mail@example.com', passwordHash: 'h' })
    const db = await getEngine()
    await db.run(
      `INSERT INTO notifications (id, user_id, email, template, dedupe_key, status, attempts, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['n1', user.id, 'mail@example.com', 'order-confirmation', 'k1', 'sent', '1',
       JSON.stringify({ rendered: { html: 'Dear Sam, 12 High St' } }), '2026-01-01', '2026-01-01'],
    )

    await deleteAccount(user.id)

    const row = await db.get<{ email: string | null; data: string; template: string }>(
      'SELECT email, data, template FROM notifications WHERE id = ?', ['n1'],
    )
    expect(row?.template).toBe('order-confirmation')
    expect(row?.email).toBeNull()
    expect(row?.data).not.toContain('High St')
  })

  it('is idempotent — a second run changes nothing and does not throw', async () => {
    // The route retries on a timeout, and a member can press twice.
    const { user } = await seed('twice@example.com')
    await deleteAccount(user.id)
    await expect(deleteAccount(user.id)).resolves.toBeDefined()
    expect(await isErased(user.id)).toBe(true)
  })

  it('lets two accounts be erased without colliding on the tombstone email', async () => {
    // users.email is NOT NULL and UNIQUE, so a shared placeholder would make the
    // second erasure fail outright.
    const a = await createUser({ email: 'one@example.com', passwordHash: 'h' })
    const b = await createUser({ email: 'two@example.com', passwordHash: 'h' })
    await deleteAccount(a.id)
    await expect(deleteAccount(b.id)).resolves.toBeDefined()
    expect(await isErased(b.id)).toBe(true)
  })

  it('reports what it kept, and why', async () => {
    const { user } = await seed('reasons@example.com')
    const result = await deleteAccount(user.id)
    expect(result.retained.map((r) => r.what)).toEqual(
      expect.arrayContaining(['Orders and invoices', 'Consent records']),
    )
    expect(result.deleted).toEqual(expect.arrayContaining(['subscriptions', 'sessions']))
  })
})
