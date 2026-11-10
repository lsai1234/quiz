import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { rateLimiter } from '@/lib/consult/ai/guard'
import { getOfferSettings } from '@/lib/offer/store'
import { coachingOn, trainerLive } from '@/lib/offer/settings'
import { hubAccess, isOpen } from '@/lib/hub/access'
import { sendQuestionEmail } from '@/lib/trainer/emails'
import { firstNameOf, memberTrainerView, viewOf } from '@/lib/trainer/server'
import { askTrainer, getThread, markMemberRead, rateAnswer, setShareOk, TrainerError } from '@/lib/trainer/store'
import { shownLibrary, withdrawFeatured } from '@/lib/trainer/content'

/**
 * Ask your trainer, for the signed-in member.
 *
 *   GET   their thread with the trainer, and how many questions they have
 *         left today; marks the answers read (not with `?peek=1`)
 *   POST  { text, about?, context?, videoId? }  a question, while their hub is open
 *         (videoId: their own form check, while video is on)
 *         { action: 'rate', messageId, rating }  helpful, or not quite
 *         { action: 'share', messageId, ok }  yes or no to showing an answer, without their name
 *
 * Questions go to a person (the Founders Hub inbox), never to an AI.
 */
export const dynamic = 'force-dynamic'

// Across everyone: a flood stops here; each member's own limit is per day (Settings).
const busy = rateLimiter(60, 60_000)

export async function GET(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Sign in' }, { status: 401 })
  const view = await memberTrainerView(user)
  // `?peek=1` (the About page): reading who the trainer is doesn't read their answers.
  const peek = new URL(req.url).searchParams.get('peek') === '1'
  if (view.live && view.unread > 0 && !peek) await markMemberRead(user.id)
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
  let body: { text?: unknown; about?: unknown; context?: unknown; action?: unknown; messageId?: unknown; rating?: unknown; ok?: unknown; videoId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const coaching = coachingOn(settings, 'coaching')
  const video = coachingOn(settings, 'video')
  const viewFor = async (thread: Awaited<ReturnType<typeof getThread>>) =>
    viewOf(thread, settings.trainer, true, true, new Date(), { coaching, video, library: video ? await shownLibrary() : [] })
  // Rating an answer: helpful, or not quite (which opens a follow-up on their side).
  if (body.action === 'rate') {
    if (!coaching || typeof body.messageId !== 'string' || (body.rating !== 'helpful' && body.rating !== 'not-quite')) return NextResponse.json({ error: 'Which answer?' }, { status: 400 })
    const thread = await rateAnswer(user.id, body.messageId, body.rating)
    if (!thread) return NextResponse.json({ error: 'Which answer?' }, { status: 404 })
    return NextResponse.json(await viewFor(thread))
  }
  // Sharing an answer and its question, without their name (video on). A no takes it down.
  if (body.action === 'share') {
    if (!video || typeof body.messageId !== 'string' || typeof body.ok !== 'boolean') return NextResponse.json({ error: 'Which answer?' }, { status: 400 })
    const thread = await setShareOk(user.id, body.messageId, body.ok)
    if (!thread) return NextResponse.json({ error: 'Which answer?' }, { status: 404 })
    if (!body.ok) await withdrawFeatured(user.id, body.messageId)
    return NextResponse.json(await viewFor(thread))
  }
  const wasWaiting = Boolean((await getThread(user.id))?.waiting)
  try {
    const { thread, message } = await askTrainer(
      { id: user.id, email: user.email, firstName: firstNameOf(user.name) },
      { text: body.text, about: body.about, context: coaching ? body.context : null, videoId: video ? body.videoId : null },
      settings.trainer.dailyLimit,
    )
    await sendQuestionEmail(thread, message, settings.trainer, wasWaiting)
    return NextResponse.json(await viewFor(thread))
  } catch (err) {
    if (err instanceof TrainerError) return NextResponse.json({ error: err.code }, { status: err.code === 'limit' ? 429 : 400 })
    throw err
  }
}
