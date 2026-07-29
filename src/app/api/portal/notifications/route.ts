import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { listNotifications, retryNotification } from '@/lib/notify/outbox'
import { flushChangeNotifications } from '@/lib/changes/service'
import { getNotificationSource } from '@/lib/notify'
import type { NotificationStatus } from '@/lib/notify/types'

export const dynamic = 'force-dynamic'

/**
 * The member-email outbox.
 *
 * In mock mode nothing leaves the building, but the rows are real and carry the
 * actual subject and body — so this is how a founder checks what members are
 * being told, with or without a mail provider configured.
 *
 * GET  — recent notifications; `?status=queued|sent|failed` narrows it.
 * POST — `{ retry: id }` requeues a failure, otherwise flushes the queue.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = new URL(req.url).searchParams.get('status') as NotificationStatus | null
  const notifications = await listNotifications({ status: status ?? undefined, limit: 100 })

  return NextResponse.json({
    provider: getNotificationSource(),
    count: notifications.length,
    failed: notifications.filter((n) => n.status === 'failed').length,
    notifications,
  })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { retry?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* no body — just flush */
  }

  if (body.retry) {
    const requeued = await retryNotification(body.retry)
    if (!requeued) return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
  }

  const { sent, failed } = await flushChangeNotifications()
  return NextResponse.json({ ok: true, sent, failed })
}
