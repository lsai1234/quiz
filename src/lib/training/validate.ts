/**
 * The frame AI fills in, and the checker its answer has to pass.
 *
 * The frame comes from the rules (`./generate`): which days, which template
 * each day, about how many exercises, and the only exercises each session may
 * use (already filtered for their kit, their experience and anything they're
 * working around, so none of that is ever sent). The checker rejects anything
 * off the frame or outside the limits (`./dose`); a rejected answer means the
 * rules' own week is used instead. Pure.
 */
import { ROLE_ORDER, withinLimits } from './dose'
import { candidatesFor, SLOTS, sessionMinutes, strengthWeek, warmupFor } from './generate'
import { exerciseById } from './library'
import type { Exercise, PlannedExercise, StrengthSession, Template, TrainingPrefs, Weekday } from './types'

export interface FrameSession {
  day: Weekday
  template: Template
  /** How many exercises the rules put in for their length. */
  count: number
  /** Every exercise this session may use, by id. */
  candidates: Exercise[]
}

/** One session per training day, or just the one day being rebuilt. */
export function aiFrame(prefs: TrainingPrefs, seed: number, onlyDay?: Weekday): FrameSession[] {
  return strengthWeek(prefs, seed)
    .filter((s) => onlyDay === undefined || s.day === onlyDay)
    .map((s) => {
      const patterns = [...new Set(SLOTS[s.template])]
      return {
        day: s.day,
        template: s.template,
        count: s.exercises.length,
        candidates: patterns.flatMap((p) => candidatesFor(p, prefs)),
      }
    })
}

export interface AiExercise {
  id: string
  sets: number
  low: number
  high: number
  rest_seconds: number
}

export interface AiAnswer {
  sessions: { day: number; exercises: AiExercise[] }[]
}

export type Verdict = { ok: true; sessions: StrengthSession[] } | { ok: false; reason: string }

/** Hold an answer to the frame and the limits. */
export function checkAiAnswer(answer: unknown, frame: FrameSession[], prefs: TrainingPrefs): Verdict {
  const a = answer as AiAnswer | null
  if (!a || !Array.isArray(a.sessions)) return { ok: false, reason: 'shape' }
  if (a.sessions.length !== frame.length) return { ok: false, reason: 'session-count' }
  const out: StrengthSession[] = []
  const seen = new Set<number>()
  for (const s of a.sessions) {
    const f = frame.find((x) => x.day === s.day)
    if (!f || seen.has(s.day)) return { ok: false, reason: 'day' }
    seen.add(s.day)
    if (!Array.isArray(s.exercises)) return { ok: false, reason: 'shape' }
    if (s.exercises.length < Math.max(2, f.count - 1) || s.exercises.length > f.count + 1) return { ok: false, reason: 'exercise-count' }
    const allowed = new Map(f.candidates.map((e) => [e.id, e]))
    const ids = new Set<string>()
    const exercises: PlannedExercise[] = []
    for (const e of s.exercises) {
      const ex = allowed.get(e?.id)
      if (!ex) return { ok: false, reason: 'off-library' }
      if (ids.has(ex.id)) return { ok: false, reason: 'duplicate' }
      ids.add(ex.id)
      const dose = { sets: e.sets, low: e.low, high: e.high, restSec: e.rest_seconds }
      if (!withinLimits(ex, dose, prefs.focus)) return { ok: false, reason: 'limits' }
      exercises.push({ id: ex.id, ...dose, doneSets: 0 })
    }
    // Every lifting session starts from a big movement.
    const needsCompound = f.template !== 'mobility' && f.template !== 'conditioning' && f.candidates.some((c) => c.role === 'compound')
    if (needsCompound && !exercises.some((p) => exerciseById(p.id)?.role === 'compound')) return { ok: false, reason: 'no-compound' }
    // Big movements first, the rest in the order given.
    const ordered = exercises
      .map((p, i) => ({ p, i, r: ROLE_ORDER.indexOf(exerciseById(p.id)!.role) }))
      .sort((x, y) => x.r - y.r || x.i - y.i)
      .map((x) => x.p)
    const session: StrengthSession = {
      id: `t-${f.day}-${f.template}`,
      type: 'strength',
      day: f.day,
      template: f.template,
      warmup: warmupFor(f.template, prefs),
      exercises: ordered,
      done: false,
    }
    if (sessionMinutes(session) > prefs.minutes + 10) return { ok: false, reason: 'too-long' }
    out.push(session)
  }
  return { ok: true, sessions: out.sort((x, y) => x.day - y.day) }
}
