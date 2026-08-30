/**
 * Retention sweeps (in-memory SQLite).
 *
 * Half of these assert on what the sweeps must NOT touch. A deletion job is
 * only as good as its boundaries: one that clears an active member's health
 * answers, or empties an email still sitting in the outbox, is worse than no
 * job at all.
 */
import { getEngine } from '@/lib/db/engine'
import { createUser, getUserById } from '@/lib/db/users'
import { saveSubscription, saveQuiz, getQuiz } from '@/lib/db/hub-data'
import { recordConsent, listConsents } from '@/lib/legal/consent'
import { runRetentionSweeps, __sweeps } from '@/lib/legal/retention'
import { RETENTION } from '@/lib/legal/content'
import type { MemberSubscription } from '@/lib/recharge/types'

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

const plan = (status: string) => ({ id: 'sub', status, lines: [] }) as unknown as MemberSubscription

/** Backdate a subscription row, which `saveSubscription` always stamps as now. */
async function backdateSubscription(userId: string, at: string) {
  const db = await getEngine()
  await db.run('UPDATE subscriptions SET updated_at = ? WHERE user_id = ?', [at, userId])
}

describe('quiz answers', () => {
  const stale = RETENTION.quizAfterEndDays + 10

  it('clears the answers of a plan that ended past the window', async () => {
    const user = await createUser({ email: 'gone@example.com' })
    await saveSubscription(user.id, plan('cancelled'))
    await saveQuiz(user.id, { answers: { safetyFlags: ['pregnancy'] } })
    await backdateSubscription(user.id, daysAgo(stale))

    expect(await __sweeps.sweepQuizAnswers()).toBe(1)
    expect(await getQuiz(user.id)).toBeNull()
  })

  it('keeps the plan itself — only the answers go', async () => {
    const user = await createUser({ email: 'planstays@example.com' })
    await saveSubscription(user.id, plan('cancelled'))
    await saveQuiz(user.id, { answers: { safetyFlags: ['pregnancy'] } })
    await backdateSubscription(user.id, daysAgo(stale))

    await __sweeps.sweepQuizAnswers()
    const db = await getEngine()
    const row = await db.get<{ data: string }>('SELECT data FROM subscriptions WHERE user_id = ?', [user.id])
    expect(row?.data).toContain('"status":"cancelled"')
  })

  it('never touches an active member, however old the row', async () => {
    const user = await createUser({ email: 'active@example.com' })
    await saveSubscription(user.id, plan('active'))
    await saveQuiz(user.id, { answers: { safetyFlags: ['pregnancy'] } })
    await backdateSubscription(user.id, daysAgo(stale * 3))

    expect(await __sweeps.sweepQuizAnswers()).toBe(0)
    expect(await getQuiz(user.id)).not.toBeNull()
  })

  it('never touches a paused member — a pause is not an ending', async () => {
    const user = await createUser({ email: 'paused@example.com' })
    await saveSubscription(user.id, plan('paused'))
    await saveQuiz(user.id, { answers: { safetyFlags: ['pregnancy'] } })
    await backdateSubscription(user.id, daysAgo(stale * 3))

    expect(await __sweeps.sweepQuizAnswers()).toBe(0)
    expect(await getQuiz(user.id)).not.toBeNull()
  })

  it('leaves a recently cancelled plan alone until the window passes', async () => {
    const user = await createUser({ email: 'recent@example.com' })
    await saveSubscription(user.id, plan('cancelled'))
    await saveQuiz(user.id, { answers: { safetyFlags: ['pregnancy'] } })
    await backdateSubscription(user.id, daysAgo(RETENTION.quizAfterEndDays - 10))

    expect(await __sweeps.sweepQuizAnswers()).toBe(0)
    expect(await getQuiz(user.id)).not.toBeNull()
  })
})

describe('email bodies', () => {
  async function queueEmail(id: string, sentAt: string | null, body = 'Dear Sam, 12 High St') {
    const db = await getEngine()
    await db.run(
      `INSERT INTO notifications (id, user_id, email, template, dedupe_key, status, attempts, data, created_at, updated_at, sent_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, 'a@b.com', 'order-confirmation', `k-${id}`, sentAt ? 'sent' : 'queued', '1',
       JSON.stringify({ rendered: { html: body } }), daysAgo(400), daysAgo(400), sentAt],
    )
  }
  async function bodyOf(id: string) {
    const db = await getEngine()
    return (await db.get<{ data: string }>('SELECT data FROM notifications WHERE id = ?', [id]))?.data
  }

  it('empties the body of an email sent past the window', async () => {
    await queueEmail('old', daysAgo(RETENTION.emailBodyDays + 5))
    expect(await __sweeps.sweepEmailBodies()).toBe(1)
    expect(await bodyOf('old')).not.toContain('High St')
  })

  it('keeps the row, so the audit trail survives', async () => {
    await queueEmail('audit', daysAgo(RETENTION.emailBodyDays + 5))
    await __sweeps.sweepEmailBodies()
    const db = await getEngine()
    const row = await db.get<{ template: string; sent_at: string }>(
      'SELECT template, sent_at FROM notifications WHERE id = ?', ['audit'],
    )
    expect(row?.template).toBe('order-confirmation')
    expect(row?.sent_at).toBeTruthy()
  })

  it('never empties one that has not been sent yet', async () => {
    // Pruning a queued email would send a blank message.
    await queueEmail('queued', null)
    await __sweeps.sweepEmailBodies()
    expect(await bodyOf('queued')).toContain('High St')
  })

  it('does not re-sweep one it already emptied', async () => {
    await queueEmail('once', daysAgo(RETENTION.emailBodyDays + 5))
    expect(await __sweeps.sweepEmailBodies()).toBe(1)
    expect(await __sweeps.sweepEmailBodies()).toBe(0)
  })
})

describe('consent metadata', () => {
  async function consentAt(userId: string, at: string) {
    await recordConsent({
      userId,
      context: 'checkout',
      documents: [{ id: 'terms', version: '2026-08-12', hash: 'h' }],
      acceptedAt: at,
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
    })
  }

  it('strips the IP and user agent past the window', async () => {
    const user = await createUser({ email: 'meta@example.com' })
    await consentAt(user.id, daysAgo(RETENTION.consentMetadataDays + 10))

    expect(await __sweeps.sweepConsentMetadata()).toBe(1)
    const [record] = await listConsents(user.id)
    expect(record.ip).toBeNull()
    expect(record.userAgent).toBeNull()
  })

  it('keeps the consent itself — the documents and the hash stay', async () => {
    const user = await createUser({ email: 'keep@example.com' })
    await consentAt(user.id, daysAgo(RETENTION.consentMetadataDays + 10))

    await __sweeps.sweepConsentMetadata()
    const [record] = await listConsents(user.id)
    expect(record.documents).toEqual([{ id: 'terms', version: '2026-08-12', hash: 'h' }])
    expect(record.context).toBe('checkout')
  })

  it('leaves a recent consent’s metadata alone', async () => {
    const user = await createUser({ email: 'fresh@example.com' })
    await consentAt(user.id, daysAgo(10))
    expect(await __sweeps.sweepConsentMetadata()).toBe(0)
    expect((await listConsents(user.id))[0].ip).toBe('1.2.3.4')
  })

  it('does not re-sweep one already stripped', async () => {
    const user = await createUser({ email: 'idem@example.com' })
    await consentAt(user.id, daysAgo(RETENTION.consentMetadataDays + 10))
    expect(await __sweeps.sweepConsentMetadata()).toBe(1)
    expect(await __sweeps.sweepConsentMetadata()).toBe(0)
  })
})

describe('abandoned accounts', () => {
  const stale = RETENTION.abandonedAccountDays + 10

  async function backdateUser(id: string, at: string) {
    const db = await getEngine()
    await db.run('UPDATE users SET created_at = ? WHERE id = ?', [at, id])
  }

  it('erases an account that never bought and has gone quiet', async () => {
    const user = await createUser({ email: 'abandoned@example.com', passwordHash: 'h' })
    await saveQuiz(user.id, { answers: { safetyFlags: ['pregnancy'] } })
    await backdateUser(user.id, daysAgo(stale))

    expect(await __sweeps.sweepAbandonedAccounts()).toBe(1)
    expect(await getQuiz(user.id)).toBeNull()
    expect((await getUserById(user.id))?.email).toContain('placeholder.invalid')
  })

  it('never touches an account with an order behind it', async () => {
    const user = await createUser({ email: 'customer@example.com', passwordHash: 'h' })
    const db = await getEngine()
    await db.run(
      `INSERT INTO orders (id, user_id, email, channel, status, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['o1', user.id, 'customer@example.com', 'shop', 'paid', '{}', daysAgo(stale), daysAgo(stale)],
    )
    await backdateUser(user.id, daysAgo(stale))

    expect(await __sweeps.sweepAbandonedAccounts()).toBe(0)
    expect((await getUserById(user.id))?.email).toBe('customer@example.com')
  })

  it('never touches an account with an active plan', async () => {
    const user = await createUser({ email: 'subscriber@example.com', passwordHash: 'h' })
    await saveSubscription(user.id, plan('active'))
    await backdateUser(user.id, daysAgo(stale))

    expect(await __sweeps.sweepAbandonedAccounts()).toBe(0)
    expect((await getUserById(user.id))?.email).toBe('subscriber@example.com')
  })

  it('leaves a recent sign-up alone', async () => {
    await createUser({ email: 'yesterday@example.com', passwordHash: 'h' })
    expect(await __sweeps.sweepAbandonedAccounts()).toBe(0)
  })

  it('does not re-erase an account already erased', async () => {
    const user = await createUser({ email: 'twice@example.com', passwordHash: 'h' })
    await backdateUser(user.id, daysAgo(stale))
    expect(await __sweeps.sweepAbandonedAccounts()).toBe(1)
    expect(await __sweeps.sweepAbandonedAccounts()).toBe(0)
  })
})

describe('runRetentionSweeps', () => {
  it('runs them all and reports counts', async () => {
    const result = await runRetentionSweeps()
    expect(result.failed).toEqual([])
    expect(result).toHaveProperty('quizAnswers')
    expect(result).toHaveProperty('abandonedAccounts')
  })

  it('names a failing sweep instead of throwing', async () => {
    // Falling behind on retention for a night is a small problem; a cron that
    // dies takes the order and stock sweeps down with it, which is a big one.
    const db = await getEngine()
    const original = db.all.bind(db)
    jest.spyOn(db, 'all').mockImplementationOnce(async () => {
      throw new Error('database is being difficult')
    })

    const result = await runRetentionSweeps()
    expect(result.failed.length).toBeGreaterThan(0)
    db.all = original
  })
})
