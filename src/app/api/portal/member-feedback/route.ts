import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'

export const dynamic = 'force-dynamic'

/**
 * Settings → Member feedback (founders only): what members wrote on the hub's
 * feedback page (`lib/member-feedback`).
 *
 *   GET     → { entries, seenAt, limit } newest first; `seenAt` is when the
 *             inbox was last opened, so newer messages can be marked new
 *   POST    { seen: true } → the inbox has been read up to now
 *   DELETE  ?id=… → one message gone (spam, or something sent by mistake)
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { listMemberFeedback, feedbackSeenAt, FEEDBACK_INBOX_LIMIT } = await import('@/lib/member-feedback/store')
  const [entries, seenAt] = await Promise.all([listMemberFeedback(), feedbackSeenAt()])
  return NextResponse.json({ entries, seenAt, limit: FEEDBACK_INBOX_LIMIT })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { seen?: unknown }
  if (body.seen !== true) return NextResponse.json({ error: 'Nothing to do' }, { status: 400 })
  const { markFeedbackSeen } = await import('@/lib/member-feedback/store')
  await markFeedbackSeen()
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Which message?' }, { status: 400 })
  const { deleteMemberFeedback } = await import('@/lib/member-feedback/store')
  await deleteMemberFeedback(id)
  return NextResponse.json({ ok: true })
}
