/**
 * Per-account hub state: the member's subscription and check-in feedback.
 *
 * The subscription is stored as the full `MemberSubscription` JSON document —
 * the hub's mutation helpers (`src/lib/recharge/`) are pure functions over that
 * shape, so the row is simply the latest result. When Recharge is connected the
 * contract lives in Recharge and this table becomes a cache/mirror; the
 * repository surface stays the same.
 */
import crypto from 'crypto'
import { currentStripeWorld } from '@/lib/payments'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { QuizAnswers } from '@/lib/types'
import type { FeedbackCheckIn } from '@/lib/feedback'
import { getEngine, now } from './engine'

export async function getSubscription(userId: string): Promise<MemberSubscription | null> {
  return (await getStoredPlan(userId))?.subscription ?? null
}

/**
 * A stored plan and its version: a short fingerprint of the document as stored,
 * which changes whenever anything in the plan does.
 *
 * The version is how the hub's save (`PUT /api/hub/subscription`) tells a change
 * made to the plan the member is looking at from one made to a plan that has
 * since moved on, in another tab, on another device, or by a renewal. Without
 * it the later save wins and quietly undoes the earlier one.
 *
 * A fingerprint of the content rather than the `updated_at` time, so two saves
 * in the same millisecond still differ, and no column is added for it.
 *
 * Only a document that is a plan counts. `saveQuiz` leaves `{}` in the row
 * before anybody has paid, and that used to read back as a plan with no status,
 * which the hub's access rule (`hubAccessFrom`: any plan not cancelled) took
 * for an active subscriber.
 */
export async function getStoredPlan(userId: string): Promise<{ subscription: MemberSubscription; version: string } | null> {
  // A sample member's plan is sample data, never a row here (`lib/samples`).
  const samples = await import('@/lib/samples/registry')
  if (await samples.isSampleUserId(userId)) {
    const sub = await samples.getSampleSubscription(userId)
    return sub ? { subscription: sub, version: planVersion(JSON.stringify(sub)) } : null
  }
  const db = await getEngine()
  const row = await db.get<{ data: string }>('SELECT data FROM subscriptions WHERE user_id = ?', [userId])
  if (!row) return null
  let doc: unknown
  try {
    doc = JSON.parse(row.data)
  } catch {
    return null
  }
  return isPlanDocument(doc) ? { subscription: doc, version: planVersion(row.data) } : null
}

/** A plan has an id and lines; the placeholder `saveQuiz` writes has neither. */
export function isPlanDocument(doc: unknown): doc is MemberSubscription {
  if (!doc || typeof doc !== 'object') return false
  const d = doc as { id?: unknown; lines?: unknown }
  return typeof d.id === 'string' && d.id.length > 0 && Array.isArray(d.lines)
}

/** The version of a stored plan document: see `getStoredPlan`. */
export function planVersion(stored: string): string {
  return crypto.createHash('sha256').update(stored).digest('base64url').slice(0, 16)
}

/**
 * `mode` marks which Stripe world this subscription belongs to, for the go-live
 * reset. It follows the same one-way rule as `orders`: once `live`, always
 * `live`. That matters more here than there, because a subscription row can be
 * created by `setQuiz` *before* anybody pays — at which point the world is
 * whatever the quiz was taken under — and only becomes real money later.
 */
export async function saveSubscription(userId: string, subscription: MemberSubscription): Promise<string> {
  const stored = JSON.stringify(subscription)
  const samples = await import('@/lib/samples/registry')
  if (await samples.isSampleUserId(userId)) {
    await samples.setSampleSubscription(userId, subscription)
    return planVersion(stored)
  }
  const db = await getEngine()
  await db.run(
    `INSERT INTO subscriptions (user_id, data, mode, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       data = excluded.data,
       mode = CASE WHEN subscriptions.mode = 'live' OR excluded.mode = 'live' THEN 'live'
                   ELSE COALESCE(subscriptions.mode, excluded.mode) END,
       updated_at = excluded.updated_at`,
    [userId, stored, currentStripeWorld(), now()],
  )
  // The new version, for a caller that hands it back to the hub.
  return planVersion(stored)
}

/** The quiz answers + stack context the member subscribed with (for the hub). */
export async function getQuiz<T = unknown>(userId: string): Promise<T | null> {
  const db = await getEngine()
  const row = await db.get<{ quiz: string | null }>('SELECT quiz FROM subscriptions WHERE user_id = ?', [userId])
  if (!row?.quiz) return null
  try {
    return JSON.parse(row.quiz) as T
  } catch {
    return null
  }
}

/** Persist quiz answers alongside the subscription (upsert; keeps existing data). */
export async function saveQuiz(userId: string, quiz: unknown): Promise<void> {
  const db = await getEngine()
  await db.run(
    `INSERT INTO subscriptions (user_id, data, quiz, mode, updated_at) VALUES (?, '{}', ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       quiz = excluded.quiz,
       mode = CASE WHEN subscriptions.mode = 'live' OR excluded.mode = 'live' THEN 'live'
                   ELSE COALESCE(subscriptions.mode, excluded.mode) END,
       updated_at = excluded.updated_at`,
    [userId, JSON.stringify(quiz), currentStripeWorld(), now()],
  )
}

export async function listFeedback(userId: string): Promise<FeedbackCheckIn[]> {
  const db = await getEngine()
  const rows = await db.all<{ payload: string }>(
    'SELECT payload FROM feedback WHERE user_id = ? ORDER BY created_at ASC',
    [userId],
  )
  const checkIns: FeedbackCheckIn[] = []
  for (const row of rows) {
    try {
      checkIns.push(JSON.parse(row.payload) as FeedbackCheckIn)
    } catch {
      /* skip an unreadable row rather than failing the whole history */
    }
  }
  return checkIns
}

/** Every active subscription across all accounts — for the daily stock check. */
export async function listActiveSubscriptions(): Promise<ActiveSubscriptionRow[]> {
  const db = await getEngine()
  const rows = await db.all<{ user_id: string; data: string; quiz: string | null }>(
    'SELECT user_id, data, quiz FROM subscriptions',
  )
  const out: ActiveSubscriptionRow[] = []
  for (const row of rows) {
    try {
      const sub = JSON.parse(row.data) as MemberSubscription
      if (sub.status !== 'active') continue
      out.push({ userId: row.user_id, subscription: sub, quizAnswers: parseQuizAnswers(row.quiz) })
    } catch {
      /* skip an unreadable row */
    }
  }
  return out
}

export interface ActiveSubscriptionRow {
  userId: string
  subscription: MemberSubscription
  /**
   * The member's saved quiz answers, read from the same row.
   *
   * Carried so the daily change job can top up a `safetyConstraints` snapshot
   * written before it recorded safety flags (see `changes/safety.ts`). Without
   * this the legacy rows fall back to the blunt check, which refuses every
   * contraindicated product rather than only the ones that actually conflict.
   * Null when the member has no saved answers.
   */
  quizAnswers: QuizAnswers | null
}

/** The `quiz` column holds `{ answers, level }`; anything else reads as absent. */
function parseQuizAnswers(raw: string | null): QuizAnswers | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { answers?: QuizAnswers } | null
    return parsed?.answers ?? null
  } catch {
    return null
  }
}

/**
 * Every subscription, whatever its status — for anything that has to look at
 * plans which have ENDED.
 *
 * `listActiveSubscriptions` deliberately filters to active, which is right for
 * the daily stock check and wrong for the exit queue: a cancelled plan with an
 * unpaid balance is precisely the row a founder needs to see.
 */
export async function listSubscriptions(): Promise<{ userId: string; subscription: MemberSubscription }[]> {
  const db = await getEngine()
  const rows = await db.all<{ user_id: string; data: string }>('SELECT user_id, data FROM subscriptions')
  const out: { userId: string; subscription: MemberSubscription }[] = []
  for (const row of rows) {
    try {
      out.push({ userId: row.user_id, subscription: JSON.parse(row.data) as MemberSubscription })
    } catch {
      /* skip an unreadable row */
    }
  }
  return out
}

export async function addFeedback(userId: string, checkIn: FeedbackCheckIn): Promise<void> {
  const db = await getEngine()
  await db.run('INSERT INTO feedback (id, user_id, created_at, payload) VALUES (?, ?, ?, ?)', [
    checkIn.id || crypto.randomUUID(),
    userId,
    checkIn.date || now(),
    JSON.stringify(checkIn),
  ])
}
