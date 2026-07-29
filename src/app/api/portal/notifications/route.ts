import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { listNotifications, retryNotification } from '@/lib/notify/outbox'
import { flushChangeNotifications, markNotificationSentManually } from '@/lib/changes/service'
import { getNotificationSource } from '@/lib/notify'
import type { NotificationStatus } from '@/lib/notify/types'

export const dynamic = 'force-dynamic'

/**
 * The member-email outbox.
 *
 * By default nothing is sent automatically: emails are written here and wait for
 * a founder to copy them into their own mail client and tick them off. This
 * endpoint serves that list and takes the tick.
 *
 * GET  — recent notifications; `?status=queued|sent|failed` narrows it.
 * POST — `{ markSent: id }` ticks one off as sent by hand.
 *        `{ retry: id }`    requeues a failure (provider mode).
 *        `{}`               flushes the queue (provider mode only; a no-op when
 *                           sending is manual, so it can't mark unsent email as
 *                           delivered).
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = new URL(req.url).searchParams.get('status') as NotificationStatus | null
  const notifications = await listNotifications({ status: status ?? undefined, limit: 100 })

  return NextResponse.json({
    provider: getNotificationSource(),
    count: notifications.length,
    awaitingSend: notifications.filter((n) => n.status === 'queued').length,
    failed: notifications.filter((n) => n.status === 'failed').length,
    notifications,
  })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { markSent?: string; retry?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* no body — just flush */
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
