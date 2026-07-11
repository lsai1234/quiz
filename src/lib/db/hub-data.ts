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
import type { MemberSubscription } from '@/lib/recharge/types'
import type { FeedbackCheckIn } from '@/lib/feedback'
import { getEngine, now } from './engine'

export async function getSubscription(userId: string): Promise<MemberSubscription | null> {
  const db = await getEngine()
  const row = await db.get<{ data: string }>('SELECT data FROM subscriptions WHERE user_id = ?', [userId])
  if (!row) return null
  try {
    return JSON.parse(row.data) as MemberSubscription
  } catch {
    return null
  }
}

export async function saveSubscription(userId: string, subscription: MemberSubscription): Promise<void> {
  const db = await getEngine()
  await db.run(
    `INSERT INTO subscriptions (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    [userId, JSON.stringify(subscription), now()],
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

export async function addFeedback(userId: string, checkIn: FeedbackCheckIn): Promise<void> {
  const db = await getEngine()
  await db.run('INSERT INTO feedback (id, user_id, created_at, payload) VALUES (?, ?, ?, ?)', [
    checkIn.id || crypto.randomUUID(),
    userId,
    checkIn.date || now(),
    JSON.stringify(checkIn),
  ])
}
