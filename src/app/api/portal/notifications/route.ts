import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import {
  countNotifications,
  listNotifications,
  retryNotification,
  sendTestCopy,
  type NotificationFilter,
} from '@/lib/notify/outbox'
import {
  flushChangeNotifications,
  markNotificationSentManually,
  sendNotificationNow,
} from '@/lib/changes/service'
import {
  canSendFromHub,
  getAutoSendPolicy,
  getNotificationSource,
  hasGmailCredentials,
  isAutoSendEnabled,
  listStreams,
  sendsAutomatically,
} from '@/lib/notify'
import type { NotificationStatus, TemplateId } from '@/lib/notify/types'

export const dynamic = 'force-dynamic'

/**
 * The member-email outbox, and the log of everything ever sent.
 *
 * Receipts send themselves as soon as a provider is configured; everything that
 * reports a decision we made waits here for a founder to read it first. With no
 * provider at all, everything waits and is copied out by hand. This endpoint
 * serves that list, takes the tick, and — since every email ever queued is still
 * in the table — doubles as the audit log.
 *
 * GET  — recent notifications, plus whether this deployment can send at all,
 *        plus the sending address of each mail stream.
 *        `?status=queued|sent|failed`  narrows by status.
 *        `?template=order-confirmation` narrows by kind.
 *        `?email=@gmail.com`            substring match on the recipient.
 *        `?limit=&offset=`             pages the log. `total` counts the match.
 * POST — `{ send: id }`     delivers one through the provider and marks it sent.
 *        `{ sendAll: true }` does that for everything waiting.
 *        `{ markSent: id }` ticks one off that you sent yourself.
 *        `{ retry: id }`    requeues a failure.
 *        `{ test: id, to }` sends a copy elsewhere and changes nothing.
 *        `{}`               flushes automatically (no-op unless auto-send is on,
 *                           so it can never mark unsent email as delivered).
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const filter: NotificationFilter = {
    status: (params.get('status') as NotificationStatus | null) ?? undefined,
    template: (params.get('template') as TemplateId | null) ?? undefined,
    email: params.get('email')?.trim() || undefined,
    limit: Number(params.get('limit')) || 100,
    offset: Number(params.get('offset')) || 0,
  }

  const notifications = await listNotifications(filter)

  return NextResponse.json({
    provider: getNotificationSource(),
    // Drives the Send button: no provider, no button.
    canSend: canSendFromHub(),
    autoSend: isAutoSendEnabled(),
    // `none` · `confirmations` · `all`. The page explains which of the two
    // groups a founder is still on the hook for.
    autoSendPolicy: getAutoSendPolicy(),
    automaticTemplates: (['order-confirmation', 'subscription-confirmation'] as const).filter(sendsAutomatically),
    // Offer the Google Workspace route only when it could actually work: there
    // is a Google client to authorise against, and no mailbox connected yet.
    // Dangling a button that 400s is worse than not offering it.
    canConnectGmail:
      !hasGmailCredentials() && Boolean(process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID),
    // Which address each kind of email leaves from, so the page can show it and
    // a misconfigured domain is visible before anyone wonders why nothing lands.
    streams: listStreams(),
    count: notifications.length,
    // Counted across the whole match, not just this page — "showing 100 of 812"
    // is the difference between a log and a list.
    total: await countNotifications({ ...filter, limit: undefined, offset: undefined }),
    awaitingSend: notifications.filter((n) => n.status === 'queued').length,
    failed: notifications.filter((n) => n.status === 'failed').length,
    notifications,
  })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    send?: string
    sendAll?: boolean
    markSent?: string
    retry?: string
    test?: string
    to?: string
  } = {}
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

  // A copy to yourself, to see what a member sees — and, more usefully, to find
  // out whether a new `noreply` address actually reaches an inbox before the
  // first real receipt depends on it. Deliberately leaves the row alone.
  if (body.test) {
    const to = (body.to ?? '').trim()
    if (!to.includes('@')) return NextResponse.json({ ok: false, error: 'Enter an email address to send it to.' })
    const result = await sendTestCopy(body.test, to)
    return NextResponse.json(result)
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
