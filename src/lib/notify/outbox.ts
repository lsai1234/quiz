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
import { appBaseUrl, canSendFromHub, getNotifier, isAutoSendEnabled, sendsAutomatically } from './index'
import { optOutUrl } from './marketing'
import { fromAddressFor, replyToAddress, streamFor } from './streams'
import type { Notification, NotificationStatus, QueueInput, SendEnvelope, TemplateId } from './types'

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

/**
 * The delivery headers for a queued email.
 *
 * Prefers what was stored when it was queued and falls back to the template's
 * stream, so a notification written before streams existed still leaves from a
 * sensible address rather than from nothing.
 */
async function envelopeFor(notification: Notification): Promise<SendEnvelope> {
  const stream = notification.stream ?? streamFor(notification.template)
  return {
    from: notification.from ?? fromAddressFor(stream),
    replyTo: notification.replyTo ?? replyToAddress(),
    listUnsubscribeUrl: await listUnsubscribeFor(notification),
  }
}

/**
 * The one-click unsubscribe link for an email, or null when it must not have one.
 *
 * Two rules decide it, and the second is the one worth stating:
 *
 *  1. Only email a reader may lawfully refuse gets the header — anything on the
 *     `marketing` stream, and anything whose rendered body already carries the
 *     promotional strip's opt-out.
 *  2. A receipt never gets it. A mailbox provider's unsubscribe button is a
 *     promise, and offering it on the only record somebody has of what they paid
 *     is a promise we cannot keep: pressing it would stop nothing, and a member
 *     who believes their receipts are off is a support ticket at best.
 *
 * Failure is silent and answers null — a missing header costs deliverability;
 * an exception here would cost the email.
 */
async function listUnsubscribeFor(notification: Notification): Promise<string | null> {
  const stream = notification.stream ?? streamFor(notification.template)
  const carriesStrip = notification.rendered.html.includes('marketing-opt-out')
  if (stream !== 'marketing' && !carriesStrip) return null

  try {
    return await optOutUrl(appBaseUrl(), notification.email)
  } catch (err) {
    console.error('[notify] could not mint a List-Unsubscribe link:', err)
    return null
  }
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
  // Resolved now, not at send time: which address an email went out from is part
  // of the record of what happened, and re-deriving it later would rewrite the
  // history of every email already sent the moment the configuration changes.
  const stream = streamFor(input.template)
  const notification: Notification = {
    id: `ntf_${randomUUID()}`,
    userId: input.userId,
    email: input.email,
    template: input.template,
    stream,
    from: fromAddressFor(stream),
    replyTo: replyToAddress(),
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

export interface NotificationFilter {
  status?: NotificationStatus
  userId?: string
  template?: TemplateId
  /** Matches the recipient address, case-insensitively. */
  email?: string
  limit?: number
  offset?: number
}

export async function listNotifications(filter: NotificationFilter = {}): Promise<Notification[]> {
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
  if (filter.template) {
    clauses.push('template = ?')
    params.push(filter.template)
  }
  if (filter.email) {
    // `LIKE` rather than equality so "@gmail.com" or a partial address finds the
    // rows someone is actually looking for. Both engines fold case on LIKE for
    // ASCII, which is all an email local part can be here.
    clauses.push('email LIKE ?')
    params.push(`%${filter.email}%`)
  }
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : ''
  const limit = Math.min(500, Math.max(1, filter.limit ?? 100))
  const offset = Math.max(0, filter.offset ?? 0)
  const rows = await db.all<Row>(
    `SELECT data FROM notifications${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  )
  return parseAll(rows)
}

/** How many emails match a filter — the log's "showing 50 of 812". */
export async function countNotifications(filter: NotificationFilter = {}): Promise<number> {
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
  if (filter.template) {
    clauses.push('template = ?')
    params.push(filter.template)
  }
  if (filter.email) {
    clauses.push('email LIKE ?')
    params.push(`%${filter.email}%`)
  }
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : ''
  const row = await db.get<{ n: number | string }>(`SELECT COUNT(*) AS n FROM notifications${where}`, params)
  return Number(row?.n ?? 0)
}

/**
 * Deliver this one now, if it is the kind that does not wait for a person.
 *
 * Called immediately after queueing, by the callers that raise receipts. The
 * alternative — leaving it for the daily job — would mean a confirmation
 * arriving up to a day after the payment, which is the one thing a confirmation
 * cannot do.
 *
 * NEVER throws, and never leaves the caller worse off than not calling it. A
 * failure is recorded on the row exactly as it would be for a hand-sent email:
 * the notification stays visible in the hub with its reason, and the daily job
 * retries it. The webhook that took the money must not fail over a mail server.
 */
export async function deliverIfAutomatic(notification: Notification): Promise<Notification> {
  if (notification.status === 'sent') return notification
  if (!sendsAutomatically(notification.template)) return notification
  // No provider: it stays queued for a human, which is the whole manual-mode
  // workflow and not a failure of anything.
  if (!canSendFromHub()) return notification

  try {
    return (await sendNotificationNow(notification.id)) ?? notification
  } catch (err) {
    console.error('[notify] automatic send failed:', err)
    return notification
  }
}

/**
 * How many times an email will be retried unattended before it needs a person.
 *
 * A card that declines is retried by Stripe for a fortnight because the money
 * is worth it. An email is not: past a handful of goes, the address is wrong or
 * the domain is misconfigured, and continuing is just noise in the log covering
 * up a thing somebody needs to look at.
 */
const MAX_AUTOMATIC_ATTEMPTS = 5

export interface FlushResult {
  sent: Notification[]
  failed: Notification[]
}

/**
 * Send what is due to send by itself, unattended.
 *
 * **Only touches emails the auto-send policy covers.** With no provider the
 * queue IS the workflow. With a provider, the default policy sends receipts and
 * leaves everything else for a founder to read first — flushing those behind
 * their back would deliver email they hadn't looked at, or worse, mark unsent
 * messages as delivered. See `getAutoSendPolicy`.
 *
 * It also picks up **failures worth another go**. The daily job has always been
 * documented as the thing that retries yesterday's failed email, but it only
 * ever looked at `queued` rows, so a receipt that failed once stayed failed
 * until somebody noticed. A transient provider blip must not be how a customer
 * ends up with no record of what they paid.
 *
 * A failure marks the row `failed` with the reason and stops there — it does NOT
 * roll anything back. The member's plan has already changed; an email that
 * didn't go out is a delivery problem to retry, not a reason to undo a billing
 * decision. `onSent` lets the caller record that the member has actually been
 * told (the change domain sets `notifiedAt`).
 */
export async function flushOutbox(
  opts: { limit?: number; onSent?: (notification: Notification) => Promise<void> } = {},
): Promise<FlushResult> {
  if (!isAutoSendEnabled()) return { sent: [], failed: [] }

  const limit = opts.limit ?? 100
  const queued = [
    ...(await listNotifications({ status: 'queued', limit })),
    // Retried, but only up to the point where the problem is clearly not going
    // to fix itself — past that it needs a person, not another attempt.
    ...(await listNotifications({ status: 'failed', limit })).filter(
      (n) => n.attempts < MAX_AUTOMATIC_ATTEMPTS,
    ),
  ].filter((n) => sendsAutomatically(n.template))

  if (queued.length === 0) return { sent: [], failed: [] }

  const notifier = await getNotifier()
  const result: FlushResult = { sent: [], failed: [] }

  for (const notification of queued) {
    const attempt = { ...notification, attempts: notification.attempts + 1, updatedAt: now() }
    try {
      const { providerId } = await notifier.send(notification.email, notification.rendered, await envelopeFor(notification))
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

/**
 * Send one email now, through the configured provider.
 *
 * The Send button behind the Founders Hub. Distinct from the unattended flush:
 * this is a person choosing to send this message, so it works whenever a
 * provider exists rather than only when auto-send is on.
 *
 * A failure is recorded on the row and returned rather than thrown, so the page
 * can show the member and the reason side by side and offer another go.
 */
export async function sendNotificationNow(id: string): Promise<Notification | null> {
  const notification = await getNotification(id)
  if (!notification) return null
  if (notification.status === 'sent') return notification

  if (!canSendFromHub()) {
    const blocked: Notification = {
      ...notification,
      status: 'failed',
      error: 'No email provider is configured — copy this one out and mark it sent.',
      updatedAt: now(),
    }
    await write(blocked)
    return blocked
  }

  const attempt = { ...notification, attempts: notification.attempts + 1, updatedAt: now() }
  try {
    const notifier = await getNotifier()
    const { providerId } = await notifier.send(notification.email, notification.rendered, await envelopeFor(notification))
    const sent: Notification = {
      ...attempt,
      status: 'sent',
      sentManually: false,
      providerId: providerId ?? null,
      error: null,
      sentAt: now(),
    }
    await write(sent)
    return sent
  } catch (err) {
    const failed: Notification = {
      ...attempt,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }
    await write(failed)
    return failed
  }
}

/**
 * Tick an email off as sent by hand.
 *
 * The founder has copied it into their own mail client and sent it; this records
 * that so it leaves the to-send list and the member's change shows as notified.
 * `sentManually` keeps it honest — nobody can later mistake "a person said they
 * sent this" for "a provider confirmed delivery".
 *
 * Already-sent notifications are returned unchanged rather than re-stamped, so
 * a double-click can't rewrite when someone was told.
 */
export async function markSentManually(id: string): Promise<Notification | null> {
  const notification = await getNotification(id)
  if (!notification) return null
  if (notification.status === 'sent') return notification

  const sent: Notification = {
    ...notification,
    status: 'sent',
    sentManually: true,
    providerId: null,
    error: null,
    sentAt: now(),
    updatedAt: now(),
  }
  await write(sent)
  return sent
}

/**
 * Record the outcome of a send this process performed itself.
 *
 * There is exactly one caller, and it should stay that way: `./account` sends
 * password reset links **without putting them in the outbox first**, because
 * the link is a live credential and the outbox is a durable store rendered on a
 * page inside the Founders Hub. A queued reset email would be an account
 * takeover sitting in an admin screen and in every database backup.
 *
 * So the row is written with the link stripped out (an audit record: who asked,
 * when, did it leave) and this stamps what actually happened to the real one.
 * `sentManually` stays false — a provider did deliver it — and the body on the
 * row is deliberately not what was sent, which the redacted copy says on its
 * face.
 *
 * Everything else must go through `sendNotificationNow`, where the thing that
 * was stored is the thing that was sent.
 */
export async function recordDirectSend(
  id: string,
  result: { providerId?: string | null; error?: string | null },
): Promise<Notification | null> {
  const notification = await getNotification(id)
  if (!notification) return null

  const stamped: Notification = {
    ...notification,
    attempts: notification.attempts + 1,
    status: result.error ? 'failed' : 'sent',
    providerId: result.providerId ?? null,
    error: result.error ?? null,
    sentAt: result.error ? null : now(),
    updatedAt: now(),
  }
  await write(stamped)
  return stamped
}

/**
 * Send a copy of a queued email somewhere else, changing nothing.
 *
 * The point of it is the sending address: a `noreply` sender on a new domain
 * either lands in the inbox or it does not, and finding that out by sending a
 * real receipt to a real customer is the wrong way round. This delivers the
 * exact bytes a member would get, to whoever asks for it, and deliberately does
 * NOT mark the notification sent — the customer still has not been told.
 */
export async function sendTestCopy(id: string, to: string): Promise<{ ok: boolean; error?: string }> {
  const notification = await getNotification(id)
  if (!notification) return { ok: false, error: 'Notification not found' }
  if (!canSendFromHub()) {
    return { ok: false, error: 'No email provider is configured, so there is nothing to test yet.' }
  }
  try {
    const notifier = await getNotifier()
    await notifier.send(to, notification.rendered, await envelopeFor(notification))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Put a failed notification back in the queue (the hub's resend button). */
export async function retryNotification(id: string): Promise<Notification | null> {
  const notification = await getNotification(id)
  if (!notification || notification.status === 'sent') return notification
  const requeued: Notification = { ...notification, status: 'queued', error: null, updatedAt: now() }
  await write(requeued)
  return requeued
}
