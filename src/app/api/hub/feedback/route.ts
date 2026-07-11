import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { addFeedback, listFeedback } from '@/lib/db/hub-data'
import type { FeedbackCheckIn } from '@/lib/feedback'

export const dynamic = 'force-dynamic'

/** GET /api/hub/feedback → { feedback: FeedbackCheckIn[] } (oldest first). */
export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  return NextResponse.json({ feedback: await listFeedback(user.id) })
}

/**
 * POST /api/hub/feedback
 * Body: { checkIn: FeedbackCheckIn } → { ok }
 * Appends one check-in (full form or inline single-dimension tap).
 */
export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: { checkIn?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const checkIn = body.checkIn as FeedbackCheckIn | undefined
  if (!checkIn || typeof checkIn !== 'object' || typeof checkIn.ratings !== 'object') {
    return NextResponse.json({ error: 'checkIn must be a FeedbackCheckIn' }, { status: 400 })
  }

  await addFeedback(user.id, checkIn)
  return NextResponse.json({ ok: true })
}
