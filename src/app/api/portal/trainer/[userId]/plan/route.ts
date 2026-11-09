import { NextResponse } from 'next/server'
import { getFounder, isPortalAuthed } from '@/lib/portal/guard'
import { logMemberAccess } from '@/lib/portal/access-log'
import { getLiveOfferSettings } from '@/lib/offer/store'
import { getUserById } from '@/lib/db/users'
import { getTraining, saveTraining } from '@/lib/training/store'
import { rollWeek, trainerEdit } from '@/lib/training/edit'
import { exerciseById } from '@/lib/training/library'
import { TRAINER_COPY } from '@/lib/trainer/copy'
import { noteFromTrainer } from '@/lib/trainer/store'
import { editablePlan } from '@/lib/trainer/plan-view'

/**
 * Founders Hub → Trainer → a member → their plan (founders only).
 *
 *   POST { sessionId, exerciseId, swapTo?, sets?, low?, high?, reason }
 *
 * The trainer changes the plan directly, with the same rules as the
 * member's own edits. The member sees "Changed by [Name]" and the reason,
 * and a note in their chat says what changed and why. Logged as an access
 * to their record.
 */
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ userId: string }> }

export async function POST(req: Request, { params }: Params) {
  const founder = await getFounder()
  if (!founder || !(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId } = await params
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const reason = typeof body?.reason === 'string' ? body.reason.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
  if (!body || typeof body.sessionId !== 'string' || typeof body.exerciseId !== 'string') return NextResponse.json({ error: 'Which exercise?' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'Say why, in a few words: the member sees it.' }, { status: 400 })

  const [user, record, settings] = await Promise.all([getUserById(userId), getTraining(userId), getLiveOfferSettings()])
  if (!user || !record.plan) return NextResponse.json({ error: 'No plan' }, { status: 404 })
  const name = settings.trainer.name || 'Your trainer'
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const plan = trainerEdit(
    rollWeek(record.plan, new Date()),
    { sessionId: body.sessionId, exerciseId: body.exerciseId, swapTo: typeof body.swapTo === 'string' ? body.swapTo : null, sets: num(body.sets), low: num(body.low), high: num(body.high) },
    { name, reason, at: new Date().toISOString() },
    new Date(),
  )
  if (!plan) return NextResponse.json({ error: 'That change doesn’t suit their setup' }, { status: 400 })
  await saveTraining({ ...record, plan })
  await logMemberAccess({ founderEmail: founder.email, userId, kind: 'member-trainer', path: `/founderhub/trainer?member=${userId}` })

  const exercise = exerciseById(typeof body.swapTo === 'string' && body.swapTo ? body.swapTo : body.exerciseId)?.name ?? 'an exercise'
  const firstName = user.name ? user.name.trim().split(/\s+/)[0] : null
  const { thread, message } = await noteFromTrainer({ userId, email: user.email, firstName }, { text: TRAINER_COPY.changeNote(exercise, reason), about: exercise, by: founder.email, kind: 'change' })
  try {
    const { sendPlanNoteEmail } = await import('@/lib/trainer/emails')
    await sendPlanNoteEmail(thread, message, settings.trainer)
  } catch {
    /* The change is saved either way. */
  }
  return NextResponse.json({ ok: true, plan: editablePlan(plan), thread })
}
