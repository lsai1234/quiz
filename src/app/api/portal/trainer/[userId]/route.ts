import { NextResponse } from 'next/server'
import { getFounder, isPortalAuthed } from '@/lib/portal/guard'
import { logMemberAccess } from '@/lib/portal/access-log'
import { getLiveOfferSettings } from '@/lib/offer/store'
import { hubAccess } from '@/lib/hub/access'
import { getUserById } from '@/lib/db/users'
import { getTraining } from '@/lib/training/store'
import { setupLine } from '@/lib/training/view'
import { rollWeek } from '@/lib/training/edit'
import { coachingOn } from '@/lib/offer/settings'
import { editablePlan } from '@/lib/trainer/plan-view'
import { sendReplyEmail } from '@/lib/trainer/emails'
import { answerMember, getThread, markTrainerRead, setWaiting, tagQuestion, TrainerError } from '@/lib/trainer/store'
import { TRIAGE_TAGS } from '@/lib/trainer/types'
import { clearDraft, getDraft } from '@/lib/trainer/drafts'

/**
 * Founders Hub → Trainer → one member's questions.
 *
 *   GET    the thread, the AI draft waiting for its newest question (if any),
 *          and what the answer needs: their training setup
 *          (focus, days, length, kit, experience, areas to work around)
 *          and whether their hub is open. Opening it is logged as an access
 *          to their record.
 *   POST   { text, videoUrl?, videoTitle?, videoId? }  an answer; emails them
 *          (videoId: a video note uploaded to /api/portal/media, which becomes theirs)
 *   PATCH  { waiting: boolean }  answered some other way, or back on the list
 *          { messageId, tag }    sort a question (form, plan, pain, kit, other, or null)
 */
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ userId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const founder = await getFounder()
  if (!founder || !(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId } = await params
  const thread = await getThread(userId)
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await logMemberAccess({ founderEmail: founder.email, userId, kind: 'member-trainer', path: `/founderhub/trainer?member=${userId}` })
  await markTrainerRead(userId)
  const [user, training, draft] = await Promise.all([getUserById(userId), getTraining(userId), getDraft(userId)])
  // A draft only for the question still waiting: the newest one from the member.
  const newest = [...thread.messages].reverse().find((m) => m.from === 'member')
  const liveDraft = thread.waiting && draft && newest && draft.messageId === newest.id ? draft : null
  const access = user ? await hubAccess(user) : null
  const plan = training.plan
  return NextResponse.json({
    thread,
    draft: liveDraft,
    member: {
      firstName: thread.firstName,
      email: thread.email,
      hub: access?.state ?? 'none',
      hubUntil: access?.until ?? null,
    },
    training: plan
      ? {
          setup: setupLine(plan.prefs),
          sessions: plan.sessions.length,
          done: plan.sessions.filter((s) => s.done).length,
          checked: plan.check?.state ?? null,
        }
      : null,
    // The plan editor's view of their week (coaching tools on).
    plan: plan && coachingOn(await getLiveOfferSettings(), 'coaching') ? editablePlan(rollWeek(plan, new Date())) : null,
  })
}

export async function POST(req: Request, { params }: Params) {
  const founder = await getFounder()
  if (!founder || !(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId } = await params
  let body: { text?: unknown; videoUrl?: unknown; videoTitle?: unknown; videoId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  try {
    const done = await answerMember(userId, { ...body, by: founder.name || founder.email })
    if (!done) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await clearDraft(userId)
    const settings = await getLiveOfferSettings()
    await sendReplyEmail(done.thread, done.message, settings.trainer)
    return NextResponse.json({ thread: done.thread })
  } catch (err) {
    if (err instanceof TrainerError) return NextResponse.json({ error: err.code }, { status: 400 })
    throw err
  }
}

export async function PATCH(req: Request, { params }: Params) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId } = await params
  let body: { waiting?: unknown; messageId?: unknown; tag?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (typeof body.messageId === 'string') {
    const tag = body.tag === null ? null : (TRIAGE_TAGS.find((t) => t === body.tag) ?? undefined)
    if (tag === undefined) return NextResponse.json({ error: 'Which tag?' }, { status: 400 })
    const tagged = await tagQuestion(userId, body.messageId, tag)
    if (!tagged) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ thread: tagged })
  }
  if (typeof body.waiting !== 'boolean') return NextResponse.json({ error: 'waiting: boolean' }, { status: 400 })
  const thread = await setWaiting(userId, body.waiting)
  // Answered some other way: the draft goes with it.
  if (!body.waiting) await clearDraft(userId)
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ thread })
}
