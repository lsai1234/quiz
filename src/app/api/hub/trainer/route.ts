import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { rateLimiter } from '@/lib/consult/ai/guard'
import { getOfferSettings } from '@/lib/offer/store'
import { coachingOn, trainerLive } from '@/lib/offer/settings'
import { hubAccess, isOpen } from '@/lib/hub/access'
import { sendQuestionEmail } from '@/lib/trainer/emails'
import { firstNameOf, memberTrainerView, viewOf } from '@/lib/trainer/server'
import { askTrainer, getThread, markMemberRead, rateAnswer, TrainerError } from '@/lib/trainer/store'

/**
 * Ask your trainer, for the signed-in member.
 *
 *   GET   their thread with the trainer, and how many questions they have
 *         left today; marks the answers read
 *   POST  { text, about?, context? }  a question, while their hub is open
 *         { action: 'rate', messageId, rating }  helpful, or not quite
 *
 * Questions go to a person (the Founders Hub inbox), never to an AI.
 */
export const dynamic = 'force-dynamic'

// Across everyone: a flood stops here; each member's own limit is per day (Settings).
const busy = rateLimiter(60, 60_000)

export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Sign in' }, { status: 401 })
  const view = await memberTrainerView(user)
  if (view.live && view.unread > 0) await markMemberRead(user.id)
  return NextResponse.json(view)
}

export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Sign in' }, { status: 401 })
  if (busy()) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  const settings = await getOfferSettings()
  if (!trainerLive(settings)) return NextResponse.json({ error: 'Not available' }, { status: 404 })
  const access = await hubAccess(user)
  if (!isOpen(access)) return NextResponse.json({ error: 'closed' }, { status: 403 })
  let body: { text?: unknown; about?: unknown; context?: unknown; action?: unknown; messageId?: unknown; rating?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const coaching = coachingOn(settings, 'coaching')
  // Rating an answer: helpful, or not quite (which opens a follow-up on their side).
  if (body.action === 'rate') {
    if (!coaching || typeof body.messageId !== 'string' || (body.rating !== 'helpful' && body.rating !== 'not-quite')) return NextResponse.json({ error: 'Which answer?' }, { status: 400 })
    const thread = await rateAnswer(user.id, body.messageId, body.rating)
    if (!thread) return NextResponse.json({ error: 'Which answer?' }, { status: 404 })
    return NextResponse.json(viewOf(thread, settings.trainer, true, true, new Date(), { coaching }))
  }
  const wasWaiting = Boolean((await getThread(user.id))?.waiting)
  try {
    const { thread, message } = await askTrainer(
      { id: user.id, email: user.email, firstName: firstNameOf(user.name) },
      { text: body.text, about: body.about, context: coaching ? body.context : null },
      settings.trainer.dailyLimit,
    )
    await sendQuestionEmail(thread, message, settings.trainer, wasWaiting)
    return NextResponse.json(viewOf(thread, settings.trainer, true, true, new Date(), { coaching }))
  } catch (err) {
    if (err instanceof TrainerError) return NextResponse.json({ error: err.code }, { status: err.code === 'limit' ? 429 : 400 })
    throw err
  }
}
