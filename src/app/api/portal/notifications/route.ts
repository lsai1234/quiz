import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { listNotifications, retryNotification } from '@/lib/notify/outbox'
import {
  flushChangeNotifications,
  markNotificationSentManually,
  sendNotificationNow,
} from '@/lib/changes/service'
import { canSendFromHub, getNotificationSource, isAutoSendEnabled } from '@/lib/notify'
import type { NotificationStatus } from '@/lib/notify/types'

export const dynamic = 'force-dynamic'

/**
 * The member-email outbox.
 *
 * By default nothing is sent automatically: emails are written here and wait for
 * a founder to copy them into their own mail client and tick them off. This
 * endpoint serves that list and takes the tick.
 *
 * GET  — recent notifications, plus whether this deployment can send at all.
 *        `?status=queued|sent|failed` narrows the list.
 * POST — `{ send: id }`     delivers one through the provider and marks it sent.
 *        `{ sendAll: true }` does that for everything waiting.
 *        `{ markSent: id }` ticks one off that you sent yourself.
 *        `{ retry: id }`    requeues a failure.
 *        `{}`               flushes automatically (no-op unless auto-send is on,
 *                           so it can never mark unsent email as delivered).
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = new URL(req.url).searchParams.get('status') as NotificationStatus | null
  const notifications = await listNotifications({ status: status ?? undefined, limit: 100 })

  return NextResponse.json({
    provider: getNotificationSource(),
    // Drives the Send button: no provider, no button.
    canSend: canSendFromHub(),
    autoSend: isAutoSendEnabled(),
    count: notifications.length,
    awaitingSend: notifications.filter((n) => n.status === 'queued').length,
    failed: notifications.filter((n) => n.status === 'failed').length,
    notifications,
  })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { send?: string; sendAll?: boolean; markSent?: string; retry?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* no body — just flush */
  }

  if (body.send) {
    const result = await sendNotificationNow(body.send)
    if (!result) return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    return NextResponse.json({
      ok: result.status === 'sent',
      notification: result,
      error: result.status === 'sent' ? undefined : result.error,
    })
  }

  if (body.sendAll) {
    const waiting = await listNotifications({ status: 'queued', limit: 100 })
    let sent = 0
    const failures: { email: string; error: string }[] = []
    for (const notification of waiting) {
      const result = await sendNotificationNow(notification.id)
      if (result?.status === 'sent') sent += 1
      else failures.push({ email: notification.email, error: result?.error ?? 'Unknown error' })
    }
    return NextResponse.json({ ok: failures.length === 0, sent, failures })
  }

  if (body.markSent) {
    const sent = await markNotificationSentManually(body.markSent)
    if (!sent) return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    return NextResponse.json({ ok: true, notification: sent })
  }

  if (body.retry) {
    const requeued = await retryNotification(body.retry)
    if (!requeued) return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
  }

  const { sent, failed, awaitingSend } = await flushChangeNotifications()
  return NextResponse.json({ ok: true, sent, failed, awaitingSend })
}
