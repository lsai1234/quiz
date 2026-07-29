/**
 * The outbox — queue, send, audit, retry.
 *
 * Everything goes through here. Queueing renders the email immediately and
 * stores it, so what a member receives is decided at the moment the change
 * happened, not at whatever time a worker got round to sending it — a product
 * title that changes in between can't rewrite an email about an event that has
 * already occurred.
 *
 * Idempotency is a UNIQUE constraint on `dedupe_key`, not a check-then-insert.
 * Two workers racing on the same event both attempt the insert and exactly one
 * wins; the loser sees a constraint violation and treats it as "already
 * queued", which is the truth. A check-then-insert would race.
 *
 * Server-only.
 */
import { randomUUID } from 'crypto'
import { getEngine, now } from '@/lib/db/engine'
import { getNotifier } from './index'
import type { Notification, NotificationStatus, QueueInput, TemplateId } from './types'

interface Row {
  data: string
}

function parse(row: Row | undefined): Notification | null {
  if (!row) return null
  try {
    return JSON.parse(row.data) as Notification
  } catch {
    return null
  }
}

function parseAll(rows: Row[]): Notification[] {
  return rows.map((r) => parse(r)).filter((n): n is Notification => n !== null)
}

export function dedupeKeyFor(changeEventId: string, template: TemplateId): string {
  return `${changeEventId}:${template}`
}

async function write(notification: Notification): Promise<void> {
  const db = await getEngine()
  await db.run(
    `INSERT INTO notifications
       (id, user_id, email, template, dedupe_key, status, attempts, data, created_at, updated_at, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status     = excluded.status,
       attempts   = excluded.attempts,
       data       = excluded.data,
       updated_at = excluded.updated_at,
       sent_at    = excluded.sent_at`,
    [
      notification.id,
      notification.userId,
      notification.email,
      notification.template,
      notification.dedupeKey,
      notification.status,
      String(notification.attempts),
      JSON.stringify(notification),
      notification.createdAt,
      notification.updatedAt,
      notification.sentAt ?? null,
    ],
  )
}

/**
 * Queue an email. Returns the existing notification when this exact message has
 * already been queued for this member — the caller doesn't need to care whether
 * it won the race.
 */
export async function queueNotification(input: QueueInput): Promise<Notification> {
  const dedupeKey =
    input.dedupeKey ??
    (input.changeEventId ? dedupeKeyFor(input.changeEventId, input.template) : `${input.template}:${randomUUID()}`)

  const at = now()
  const notification: Notification = {
    id: `ntf_${randomUUID()}`,
    userId: input.userId,
    email: input.email,
    template: input.template,
    dedupeKey,
    status: 'queued',
    attempts: 0,
    rendered: input.rendered,
    changeEventId: input.changeEventId ?? null,
    createdAt: at,
    updatedAt: at,
    sentAt: null,
  }

  try {
    await write(notification)
    return notification
  } catch (err) {
    // Almost certainly the UNIQUE constraint doing its job. Return whatever is
    // already queued rather than failing the caller — the member is going to be
    // told either way, which is the only thing that matters here.
    const existing = await getByDedupeKey(dedupeKey)
    if (existing) return existing
    throw err
  }
}

export async function getByDedupeKey(dedupeKey: string): Promise<Notification | null> {
  const db = await getEngine()
  return parse(await db.get<Row>('SELECT data FROM notifications WHERE dedupe_key = ?', [dedupeKey]))
}

export async function getNotification(id: string): Promise<Notification | null> {
  const db = await getEngine()
  return parse(await db.get<Row>('SELECT data FROM notifications WHERE id = ?', [id]))
}

export async function listNotifications(
  filter: { status?: NotificationStatus; userId?: string; limit?: number } = {},
): Promise<Notification[]> {
  const db = await getEngine()
  const clauses: string[] = []
  const params: unknown[] = []
  if (filter.status) {
    clauses.push('status = ?')
    params.push(filter.status)
  }
  if (filter.userId) {
    clauses.push('user_id = ?')
    params.push(filter.userId)
  }
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : ''
  const rows = await db.all<Row>(
    `SELECT data FROM notifications${where} ORDER BY created_at DESC LIMIT ${Math.max(1, filter.limit ?? 100)}`,
    params,
  )
  return parseAll(rows)
}

export interface FlushResult {
  sent: Notification[]
  failed: Notification[]
}

/**
 * Send everything queued.
 *
 * A failure marks the row `failed` with the reason and stops there — it does
 * NOT roll anything back. The member's plan has already changed; an email that
 * didn't go out is a delivery problem to retry, not a reason to undo a billing
 * decision. `onSent` lets the caller record that the member has actually been
 * told (the change domain sets `notifiedAt` from it).
 */
export async function flushOutbox(
  opts: { limit?: number; onSent?: (notification: Notification) => Promise<void> } = {},
): Promise<FlushResult> {
  const queued = await listNotifications({ status: 'queued', limit: opts.limit ?? 100 })
  if (queued.length === 0) return { sent: [], failed: [] }

  const notifier = await getNotifier()
  const result: FlushResult = { sent: [], failed: [] }

  for (const notification of queued) {
    const attempt = { ...notification, attempts: notification.attempts + 1, updatedAt: now() }
    try {
      const { providerId } = await notifier.send(notification.email, notification.rendered)
      const sent: Notification = { ...attempt, status: 'sent', providerId: providerId ?? null, error: null, sentAt: now() }
      await write(sent)
      result.sent.push(sent)
      // After the row is durable: a callback that throws must not lose the send.
      if (opts.onSent) {
        try {
          await opts.onSent(sent)
        } catch (err) {
          console.error('[notify] post-send callback failed:', err)
        }
      }
    } catch (err) {
      const failed: Notification = {
        ...attempt,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }
      await write(failed)
      result.failed.push(failed)
    }
  }

  return result
}

/** Put a failed notification back in the queue (the hub's resend button). */
export async function retryNotification(id: string): Promise<Notification | null> {
  const notification = await getNotification(id)
  if (!notification || notification.status === 'sent') return notification
  const requeued: Notification = { ...notification, status: 'queued', error: null, updatedAt: now() }
  await write(requeued)
  return requeued
}
