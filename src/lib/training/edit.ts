/**
 * Changing a plan: each change re-plans only what it touches. Pure: every
 * function takes a plan and returns a new one.
 */
import { doseFor } from './dose'
import {
  activityId,
  alternativesFor,
  buildWeek,
  fillSession,
  fits,
  mondayOf,
  rebuildActivities,
  sortSessions,
  strengthSession,
  strengthWeek,
  templatesFor,
  warmupFor,
  type Rotation,
} from './generate'
import { exerciseById } from './library'
import type { ActivityChoice, Felt, PlannedExercise, Session, StrengthSession, TrainerChange, TrainingPlan, TrainingPrefs, WeekMode, Weekday } from './types'

const strength = (s: Session[]) => s.filter((x): x is StrengthSession => x.type === 'strength')
const stamp = (plan: TrainingPlan, now: Date): TrainingPlan => ({ ...plan, updatedAt: now.toISOString() })

/** A brand-new plan from a setup. */
export function newPlan(userId: string, prefs: TrainingPrefs, now: Date, seed = 0, sessions?: Session[], source: TrainingPlan['source'] = 'rules'): TrainingPlan {
  const at = now.toISOString()
  return {
    version: 1,
    userId,
    createdAt: at,
    updatedAt: at,
    weekOf: mondayOf(now),
    prefs,
    sessions: sessions ?? buildWeek(prefs, seed),
    source,
    seed,
    history: [],
  }
}

/** Re-dose every exercise for the current focus and experience, keeping the ticks that still fit. */
function redose(s: StrengthSession, prefs: TrainingPrefs): StrengthSession {
  return {
    ...s,
    exercises: s.exercises.map((p) => {
      const ex = exerciseById(p.id)
      if (!ex) return p
      const d = doseFor(ex, prefs.focus, prefs.experience)
      return { ...p, ...d, doneSets: Math.min(p.doneSets, d.sets) }
    }),
  }
}

/** Swap anything that no longer suits them for the best alternative, or drop it. */
function refit(s: StrengthSession, prefs: TrainingPrefs): StrengthSession {
  const kept: PlannedExercise[] = []
  for (const p of s.exercises) {
    const ex = exerciseById(p.id)
    if (ex && fits(ex, prefs)) {
      kept.push(p)
      continue
    }
    const alt = alternativesFor(p.id, prefs, kept.map((k) => k.id).concat(s.exercises.map((e) => e.id)))[0]
    if (alt) kept.push({ id: alt.id, ...doseFor(alt, prefs.focus, prefs.experience), doneSets: 0 })
  }
  return { ...s, warmup: warmupFor(s.template, prefs), exercises: kept }
}

/** Fit a session to their length: take from the end, or fill from the template. */
function resize(s: StrengthSession, prefs: TrainingPrefs, seed: number): StrengthSession {
  const full = fillSession(s.template, prefs, seed, new Map(), [])
  if (full.length <= s.exercises.length) return { ...s, exercises: s.exercises.slice(0, full.length) }
  return { ...s, exercises: fillSession(s.template, prefs, seed, new Map(), s.exercises) }
}

/** New training sessions for the setup, keeping the activities they chose. */
function rebuildStrength(plan: TrainingPlan, prefs: TrainingPrefs, seed: number): Session[] {
  return sortSessions([...strengthWeek(prefs, seed), ...rebuildActivities(prefs)].map((s) => keepDone(plan, s)))
}

/** A session that was done stays done if the same thing is still on the same day. */
function keepDone(plan: TrainingPlan, s: Session): Session {
  const was = plan.sessions.find((o) => o.id === s.id && o.day === s.day)
  return was?.done ? { ...s, done: true } : s
}

export type PrefsPatch = Partial<Omit<TrainingPrefs, 'activities'>>

/** Apply a change to the setup, re-planning what it touches. */
export function changePrefs(plan: TrainingPlan, change: PrefsPatch, now: Date): TrainingPlan {
  // Only what actually differs counts as a change.
  const patch: PrefsPatch = {}
  for (const k of Object.keys(change) as (keyof PrefsPatch)[]) {
    if (JSON.stringify(change[k]) !== JSON.stringify(plan.prefs[k])) Object.assign(patch, { [k]: change[k] })
  }
  if (Object.keys(patch).length === 0) return plan
  const prefs: TrainingPrefs = { ...plan.prefs, ...patch }
  const seed = plan.seed
  let sessions = plan.sessions

  const daysChanged = patch.days && patch.days.join() !== plan.prefs.days.join()
  const splitChanged = patch.split && patch.split !== plan.prefs.split
  const templatesChanged =
    patch.focus && templatesFor(prefs, prefs.days.length).join() !== templatesFor(plan.prefs, plan.prefs.days.length).join()

  if (splitChanged || templatesChanged || (daysChanged && patch.days!.length !== plan.prefs.days.length)) {
    sessions = rebuildStrength(plan, prefs, seed)
  } else {
    if (daysChanged) {
      // Same number of days: the sessions keep their order and move.
      const to = [...prefs.days].sort((a, b) => a - b)
      const moved = strength(sessions)
        .sort((a, b) => a.day - b.day)
        .map((s, i) => ({ ...s, day: to[i], id: `t-${to[i]}-${s.template}` }))
      sessions = [...moved, ...rebuildActivities(prefs)]
    }
    if (patch.equipment || patch.avoid || patch.experience) {
      sessions = sessions.map((s) => (s.type === 'strength' ? refit(s, prefs) : s))
      if (patch.avoid) sessions = [...strength(sessions), ...rebuildActivities(prefs)]
    }
    if (patch.focus || patch.experience) sessions = sessions.map((s) => (s.type === 'strength' ? redose(s, prefs) : s))
    if (patch.minutes || patch.focus || patch.equipment || patch.avoid) {
      sessions = sessions.map((s) => (s.type === 'strength' ? resize(s, prefs, seed) : s))
    }
    if (patch.focus) sessions = [...strength(sessions), ...rebuildActivities(prefs)]
    sessions = sortSessions(sessions)
  }
  return stamp({ ...plan, prefs, sessions, source: sessions === plan.sessions ? plan.source : 'rules' }, now)
}

/** Add something they do: a class, a walk, a run, a match. */
export function addActivity(plan: TrainingPlan, a: ActivityChoice, now: Date): TrainingPlan {
  if (plan.prefs.activities.some((x) => x.day === a.day && x.kind === a.kind)) return plan
  const prefs = { ...plan.prefs, activities: [...plan.prefs.activities, a].sort((x, y) => x.day - y.day) }
  return stamp({ ...plan, prefs, sessions: sortSessions([...strength(plan.sessions), ...rebuildActivities(prefs)].map((s) => keepDone(plan, s))) }, now)
}

/** Take a session out: an activity goes; a training session gives its day back. */
export function removeSession(plan: TrainingPlan, id: string, now: Date): TrainingPlan {
  const s = plan.sessions.find((x) => x.id === id)
  if (!s) return plan
  if (s.type === 'strength') {
    const days = plan.prefs.days.filter((d) => d !== s.day)
    if (days.length === 0 && plan.prefs.activities.length === 0) return plan
    return changePrefs(plan, { days }, now)
  }
  if (s.suggested) return stamp({ ...plan, sessions: plan.sessions.filter((x) => x.id !== id) }, now)
  const prefs = { ...plan.prefs, activities: plan.prefs.activities.filter((a) => !(a.day === s.day && a.kind === s.activity)) }
  if (prefs.days.length === 0 && prefs.activities.length === 0) return plan
  return stamp({ ...plan, prefs, sessions: plan.sessions.filter((x) => x.id !== id) }, now)
}

/** Move a session to another day. Two training sessions swap days. */
export function moveSession(plan: TrainingPlan, id: string, day: Weekday, now: Date): TrainingPlan {
  const s = plan.sessions.find((x) => x.id === id)
  if (!s || s.day === day) return plan
  if (s.type === 'strength') {
    const other = strength(plan.sessions).find((x) => x.day === day)
    const sessions = plan.sessions.map((x) => {
      if (x.id === s.id) return { ...x, day, id: `t-${day}-${s.template}` }
      if (other && x.id === other.id) return { ...x, day: s.day, id: `t-${s.day}-${other.template}` }
      return x
    })
    const days = [...new Set(plan.prefs.days.map((d) => (d === s.day ? day : other && d === day ? s.day : d)))].sort((a, b) => a - b) as Weekday[]
    return stamp({ ...plan, prefs: { ...plan.prefs, days }, sessions: sortSessions(sessions) }, now)
  }
  const act = s
  if (plan.sessions.some((x) => x.type === 'activity' && x.day === day && x.activity === act.activity)) return plan
  const sessions = plan.sessions.map((x) => (x.id === id && x.type === 'activity' ? { ...x, day, id: activityId(x.suggested, day, x.activity) } : x))
  const activities = act.suggested
    ? plan.prefs.activities
    : plan.prefs.activities.map((a) => (a.day === act.day && a.kind === act.activity ? { ...a, day } : a)).sort((a, b) => a.day - b.day)
  return stamp({ ...plan, prefs: { ...plan.prefs, activities }, sessions: sortSessions(sessions) }, now)
}

/** Swap one exercise for an alternative that suits them. Null when it isn't one. */
export function swapExercise(plan: TrainingPlan, sessionId: string, fromId: string, toId: string, now: Date): TrainingPlan | null {
  const s = plan.sessions.find((x): x is StrengthSession => x.id === sessionId && x.type === 'strength')
  if (!s || !s.exercises.some((p) => p.id === fromId)) return null
  const others = s.exercises.filter((p) => p.id !== fromId).map((p) => p.id)
  const to = alternativesFor(fromId, plan.prefs, others).find((e) => e.id === toId)
  if (!to) return null
  const exercises = s.exercises.map((p) => (p.id === fromId ? { id: to.id, ...doseFor(to, plan.prefs.focus, plan.prefs.experience), doneSets: 0 } : p))
  return stamp({ ...plan, sessions: plan.sessions.map((x) => (x.id === sessionId ? { ...s, exercises } : x)) }, now)
}

/** Fresh exercises for one session (the rules' next turn), or for the whole week. */
export function rebuildSession(plan: TrainingPlan, sessionId: string, now: Date, replacement?: StrengthSession): TrainingPlan {
  const s = plan.sessions.find((x): x is StrengthSession => x.id === sessionId && x.type === 'strength')
  if (!s) return plan
  const seed = plan.seed + 1
  const rotation: Rotation = new Map()
  const fresh = replacement ?? strengthSession(s.day, s.template, plan.prefs, seed, rotation)
  return stamp({ ...plan, seed, sessions: plan.sessions.map((x) => (x.id === sessionId ? { ...fresh, id: s.id, done: false } : x)) }, now)
}

export function rebuildWeek(plan: TrainingPlan, now: Date, replacement?: { sessions: StrengthSession[]; source: TrainingPlan['source'] }): TrainingPlan {
  const seed = plan.seed + 1
  const sessions = replacement
    ? sortSessions([...replacement.sessions, ...rebuildActivities(plan.prefs)])
    : buildWeek(plan.prefs, seed)
  return stamp({ ...plan, seed, sessions, source: replacement?.source ?? 'rules' }, now)
}

/** Tick a session done, or not. */
export function setDone(plan: TrainingPlan, sessionId: string, done: boolean, now: Date): TrainingPlan {
  return stamp(
    {
      ...plan,
      sessions: plan.sessions.map((x) => {
        if (x.id !== sessionId) return x
        if (x.type === 'strength') return { ...x, done, exercises: x.exercises.map((p) => ({ ...p, doneSets: done ? p.sets : p.doneSets })) }
        return { ...x, done }
      }),
    },
    now,
  )
}

/** Tick sets off one exercise; the session is done when every set is. */
export function setSets(plan: TrainingPlan, sessionId: string, exerciseId: string, doneSets: number, now: Date): TrainingPlan {
  return stamp(
    {
      ...plan,
      sessions: plan.sessions.map((x) => {
        if (x.id !== sessionId || x.type !== 'strength') return x
        const exercises = x.exercises.map((p) => (p.id === exerciseId ? { ...p, doneSets: Math.max(0, Math.min(p.sets, Math.round(doneSets))) } : p))
        return { ...x, exercises, done: exercises.length > 0 && exercises.every((p) => p.doneSets >= p.sets) }
      }),
    },
    now,
  )
}

/**
 * A new week: last week's ticks go into the history and the week starts clean.
 * A busy or away week ends with it, and any lighter session goes back to
 * normal: both were for that week only.
 */
export function rollWeek(plan: TrainingPlan, now: Date): TrainingPlan {
  const monday = mondayOf(now)
  if (plan.weekOf >= monday) return plan
  const history = [{ weekOf: plan.weekOf, done: plan.sessions.filter((s) => s.done).length, planned: plan.sessions.length }, ...plan.history].slice(0, 12)
  const base = plan.weekMode ? plan.weekMode.saved : plan.sessions
  const sessions = base.map((s) =>
    s.type === 'strength'
      ? { ...s, done: false, lighter: null, exercises: (s.lighter?.exercises ?? s.exercises).map((p) => ({ ...p, doneSets: 0 })) }
      : { ...s, done: false },
  )
  return { ...plan, weekOf: monday, history, sessions, weekMode: null }
}

/* ── How it felt ─────────────────────────────────────────────────────────── */

export const FELT_KEEP = 6

/** One tap after an exercise's last set: kept newest first, one a day. */
export function setFelt(plan: TrainingPlan, exerciseId: string, felt: Felt, now: Date): TrainingPlan {
  const on = now.toISOString().slice(0, 10)
  const had = (plan.felt?.[exerciseId] ?? []).filter((f) => f.on !== on)
  return stamp({ ...plan, felt: { ...(plan.felt ?? {}), [exerciseId]: [{ on, felt }, ...had].slice(0, FELT_KEEP) } }, now)
}

/** The last time it was rated, before today. */
export function lastFelt(plan: TrainingPlan, exerciseId: string, today: string): Felt | null {
  return (plan.felt?.[exerciseId] ?? []).find((f) => f.on < today)?.felt ?? null
}

/* ── A busy week, or away ────────────────────────────────────────────────── */

/** The setup a mode builds this week's sessions from. */
export function prefsForMode(prefs: TrainingPrefs, kind: WeekMode): TrainingPrefs {
  return kind === 'busy' ? { ...prefs, minutes: Math.min(prefs.minutes, 30) as TrainingPrefs['minutes'] } : { ...prefs, equipment: 'bodyweight' }
}

/**
 * Shorter sessions this week, or bodyweight only while they're away: the
 * sessions not yet done are rebuilt for it, done ones are left alone, and the
 * week as it was is kept to go back to (switched off, or on Monday).
 */
export function setWeekMode(plan: TrainingPlan, kind: WeekMode | null, now: Date): TrainingPlan {
  const saved = plan.weekMode?.saved ?? plan.sessions
  if (!kind) {
    if (!plan.weekMode) return plan
    // Back to the week as it was, keeping what they've done since.
    const sessions = saved.map((s) => (plan.sessions.find((x) => x.id === s.id)?.done ? { ...s, done: true } : s))
    return stamp({ ...plan, sessions, weekMode: null }, now)
  }
  const prefs = prefsForMode(plan.prefs, kind)
  const sessions = saved.map((s) => {
    const current = plan.sessions.find((x) => x.id === s.id) ?? s
    if (current.done || s.type !== 'strength') return current
    const fresh = strengthSession(s.day, s.template, prefs, plan.seed, new Map())
    return { ...fresh, id: s.id, done: false }
  })
  return stamp({ ...plan, sessions, weekMode: { kind, weekOf: plan.weekOf, saved } }, now)
}

/* ── Not feeling it today ────────────────────────────────────────────────── */

/**
 * A lighter version of one session: a set fewer on each exercise (never
 * below one) and the lower end of the range. Their choice, for today; it
 * can be switched back, and it's gone next week.
 */
export function setLighter(plan: TrainingPlan, sessionId: string, on: boolean, now: Date): TrainingPlan {
  return stamp(
    {
      ...plan,
      sessions: plan.sessions.map((x) => {
        if (x.id !== sessionId || x.type !== 'strength') return x
        if (!on) return x.lighter ? { ...x, exercises: x.lighter.exercises.map((p) => ({ ...p, doneSets: Math.min(p.sets, x.exercises.find((e) => e.id === p.id)?.doneSets ?? 0) })), lighter: null } : x
        if (x.lighter) return x
        const exercises = x.exercises.map((p) => {
          const sets = Math.max(1, p.sets - 1)
          return { ...p, sets, high: p.low, doneSets: Math.min(p.doneSets, sets) }
        })
        return { ...x, exercises, lighter: { exercises: x.exercises } }
      }),
    },
    now,
  )
}

/* ── The trainer's changes ───────────────────────────────────────────────── */

export interface TrainerEdit {
  sessionId: string
  exerciseId: string
  /** Swap it for this exercise (from the library, and suited to their setup). */
  swapTo?: string | null
  sets?: number | null
  low?: number | null
  high?: number | null
}

/**
 * A change the trainer makes from the Founders Hub, with the same rules as
 * the member's own: a swap must suit their setup, and sets and reps stay in
 * sensible bounds. The member sees "Changed by [Name]" and the reason.
 */
export function trainerEdit(plan: TrainingPlan, edit: TrainerEdit, by: TrainerChange, now: Date): TrainingPlan | null {
  const s = plan.sessions.find((x): x is StrengthSession => x.id === edit.sessionId && x.type === 'strength')
  if (!s) return null
  let next: TrainingPlan = plan
  let id = edit.exerciseId
  if (edit.swapTo && edit.swapTo !== edit.exerciseId) {
    const swapped = swapExercise(plan, s.id, edit.exerciseId, edit.swapTo, now)
    if (!swapped) return null
    next = swapped
    id = edit.swapTo
  }
  const clamp = (v: number | null | undefined, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : null)
  return stamp(
    {
      ...next,
      sessions: next.sessions.map((x) => {
        if (x.id !== s.id || x.type !== 'strength') return x
        return {
          ...x,
          changedBy: by,
          exercises: x.exercises.map((p) => {
            if (p.id !== id) return p
            const sets = clamp(edit.sets, 1, 8) ?? p.sets
            const low = clamp(edit.low, 1, 120) ?? p.low
            const high = Math.max(low, clamp(edit.high, 1, 120) ?? p.high)
            return { ...p, sets, low, high, doneSets: Math.min(p.doneSets, sets), changedBy: by }
          }),
        }
      }),
    },
    now,
  )
}
