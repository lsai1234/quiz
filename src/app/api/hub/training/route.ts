import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { rateLimiter } from '@/lib/consult/ai/guard'
import type { UserRecord } from '@/lib/db/users'
import { trainingAccess, trainingStart } from '@/lib/training/access'
import { AI_BUILDS_PER_DAY, aiSessions } from '@/lib/training/ai'
import {
  addActivity,
  changePrefs,
  moveSession,
  newPlan,
  rebuildSession,
  rebuildWeek,
  removeSession,
  rollWeek,
  setDone,
  setSets,
  swapExercise,
  type PrefsPatch,
} from '@/lib/training/edit'
import { buildWeek, rebuildActivities, sortSessions } from '@/lib/training/generate'
import { normalisePrefs, prefillPrefs } from '@/lib/training/prefs'
import type { TrainingState } from '@/lib/training/state'
import { getTraining, saveTraining, type TrainingRecord } from '@/lib/training/store'
import { getTutorials } from '@/lib/training/tutorials'
import { ACTIVITY_KINDS, type ActivityKind, type StrengthSession, type TrainingPlan, type Weekday } from '@/lib/training/types'

/**
 * GET  /api/hub/training → TrainingState
 * POST /api/hub/training { action, … } → TrainingState
 *
 * The member's training plan (hub). Signed-in members only, and only while
 * their hub is open (`trainingAccess`). Every change is one of the edits in
 * `lib/training/edit`; "build" and "rebuild" try AI first (`lib/training/ai`)
 * and keep the rules' week when it can't help.
 */

export const dynamic = 'force-dynamic'

/** Across everyone, to keep a burst from becoming a bill. */
const aiBusy = rateLimiter(30, 60_000)

async function stateFor(user: UserRecord, record: TrainingRecord, now: Date): Promise<TrainingState> {
  const access = await trainingAccess(user, now)
  if (!access.allowed) return { access, readiness: null, plan: null, draft: null, tutorials: {} }
  const plan = record.plan ? rollWeek(record.plan, now) : null
  if (plan && plan !== record.plan) await saveTraining({ ...record, plan })
  const draft = plan ? null : prefillPrefs(await trainingStart(user))
  return { access, readiness: record.readiness, plan, draft, tutorials: await getTutorials() }
}

export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const now = new Date()
  return NextResponse.json(await stateFor(user, await getTraining(user.id), now))
}

/** One AI try if today's allowance and the shared limit allow; counts it either way. */
async function withAi<T>(record: TrainingRecord, now: Date, run: () => Promise<T | null>): Promise<{ result: T | null; record: TrainingRecord }> {
  const day = now.toISOString().slice(0, 10)
  const used = record.aiBuilds?.day === day ? record.aiBuilds.count : 0
  if (used >= AI_BUILDS_PER_DAY || !process.env.OPENAI_API_KEY || aiBusy()) return { result: null, record }
  const result = await run()
  return { result, record: { ...record, aiBuilds: { day, count: used + 1 } } }
}

const weekday = (v: unknown): Weekday | null => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 6 ? (v as Weekday) : null)
const text = (v: unknown, max = 60): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)

export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const now = new Date()
  const access = await trainingAccess(user, now)
  if (!access.allowed) return NextResponse.json({ error: 'Not open' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  let record = await getTraining(user.id)
  const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

  if (body.action === 'ready') {
    // Only that it was done, and when: never the answers (they never leave the page).
    record = { ...record, readiness: { cleared: true, at: now.toISOString() } }
    await saveTraining(record)
    return NextResponse.json(await stateFor(user, record, now))
  }

  if (body.action === 'reset') {
    record = { ...record, plan: null }
    await saveTraining(record)
    return NextResponse.json(await stateFor(user, record, now))
  }

  if (body.action === 'build') {
    if (!record.readiness) return bad('Readiness check first', 409)
    const prefs = normalisePrefs(body.prefs)
    if (!prefs) return bad('That setup can’t make a plan')
    const seed = record.plan ? record.plan.seed + 1 : 0
    const ai = await withAi(record, now, () => aiSessions(prefs, seed))
    record = ai.record
    const sessions = ai.result
      ? sortSessions([...ai.result.sessions, ...rebuildActivities(prefs)])
      : buildWeek(prefs, seed)
    record = { ...record, plan: newPlan(user.id, prefs, now, seed, sessions, ai.result ? 'ai' : 'rules') }
    await saveTraining(record)
    return NextResponse.json(await stateFor(user, record, now))
  }

  const current = record.plan ? rollWeek(record.plan, now) : null
  if (!current) return bad('No plan yet', 409)
  let plan: TrainingPlan | null = current

  switch (body.action) {
    case 'prefs': {
      const patchRaw = body.patch && typeof body.patch === 'object' ? (body.patch as Record<string, unknown>) : null
      if (!patchRaw) return bad('Nothing to change')
      // Check the whole setup as it would be after the change.
      const merged = normalisePrefs({ ...current.prefs, ...patchRaw, activities: current.prefs.activities })
      if (!merged) return bad('That setup can’t make a plan')
      const patch: PrefsPatch = {}
      for (const k of ['days', 'minutes', 'focus', 'split', 'equipment', 'experience', 'avoid', 'trainAt'] as const) {
        if (k in patchRaw) Object.assign(patch, { [k]: merged[k] })
      }
      plan = changePrefs(current, patch, now)
      break
    }
    case 'add-activity': {
      const day = weekday(body.day)
      const kind = ACTIVITY_KINDS.includes(body.kind as ActivityKind) ? (body.kind as ActivityKind) : null
      if (day === null || !kind) return bad('Pick a day and an activity')
      const checked = normalisePrefs({ ...current.prefs, activities: [...current.prefs.activities, { day, kind, minutes: body.minutes }] })
      const added = checked?.activities.find((a) => a.day === day && a.kind === kind)
      if (!added) return bad('That activity can’t be added')
      plan = addActivity(current, added, now)
      break
    }
    case 'remove': {
      const id = text(body.sessionId)
      if (!id) return bad('Which session?')
      plan = removeSession(current, id, now)
      break
    }
    case 'move': {
      const id = text(body.sessionId)
      const day = weekday(body.day)
      if (!id || day === null) return bad('Which session, and to which day?')
      plan = moveSession(current, id, day, now)
      break
    }
    case 'swap': {
      const id = text(body.sessionId)
      const from = text(body.from)
      const to = text(body.to)
      if (!id || !from || !to) return bad('Which exercise?')
      plan = swapExercise(current, id, from, to, now)
      if (!plan) return bad('That swap doesn’t suit your setup')
      break
    }
    case 'rebuild-day': {
      const id = text(body.sessionId)
      const s = current.sessions.find((x): x is StrengthSession => x.id === id && x.type === 'strength')
      if (!s) return bad('Which session?')
      const ai = await withAi(record, now, () => aiSessions(current.prefs, current.seed + 1, s.day))
      record = ai.record
      plan = rebuildSession(current, s.id, now, ai.result?.sessions[0])
      break
    }
    case 'rebuild-week': {
      const ai = await withAi(record, now, () => aiSessions(current.prefs, current.seed + 1))
      record = ai.record
      plan = rebuildWeek(current, now, ai.result ? { sessions: ai.result.sessions, source: 'ai' } : undefined)
      break
    }
    case 'done': {
      const id = text(body.sessionId)
      if (!id || typeof body.done !== 'boolean') return bad('Which session?')
      plan = setDone(current, id, body.done, now)
      break
    }
    case 'sets': {
      const id = text(body.sessionId)
      const ex = text(body.exerciseId)
      if (!id || !ex || typeof body.doneSets !== 'number' || !Number.isFinite(body.doneSets)) return bad('Which exercise?')
      plan = setSets(current, id, ex, body.doneSets, now)
      break
    }
    default:
      return bad('Unknown action')
  }

  record = { ...record, plan }
  await saveTraining(record)
  return NextResponse.json(await stateFor(user, record, now))
}
