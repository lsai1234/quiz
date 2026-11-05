/**
 * The rule-based builder: a full week from their setup, instantly and the same
 * every time for the same setup and seed. It is the plan when AI is off, slow
 * or rejected, and the frame AI fills in when it is on (`./ai`): the days, each
 * session's template and its candidates all come from here.
 *
 * Pure.
 */
import { doseFor, exerciseSeconds, roundMinutes, WARMUP_MINUTES } from './dose'
import { ACTIVITIES, EXERCISES, exerciseById } from './library'
import type {
  ActivityKind,
  ActivitySession,
  Area,
  Equipment,
  Exercise,
  Experience,
  Focus,
  Pattern,
  PlannedExercise,
  Session,
  StrengthSession,
  Template,
  TrainingPrefs,
  Weekday,
} from './types'

/* ── Templates ──────────────────────────────────────────────────────────── */

/** Each template's movements, most important first: a shorter session keeps the front of the list. */
export const SLOTS: Record<Template, Pattern[]> = {
  'full-a': ['squat', 'push-h', 'pull-h', 'hinge', 'core', 'lunge', 'push-v', 'pull-v', 'core'],
  'full-b': ['hinge', 'push-v', 'pull-v', 'lunge', 'core', 'squat', 'push-h', 'pull-h', 'glute'],
  'full-c': ['lunge', 'push-h', 'pull-v', 'glute', 'core', 'hinge', 'rear', 'calf', 'core'],
  upper: ['push-h', 'pull-h', 'push-v', 'pull-v', 'raise', 'triceps', 'biceps', 'rear', 'core'],
  lower: ['squat', 'hinge', 'lunge', 'glute', 'calf', 'core', 'core'],
  push: ['push-h', 'push-v', 'push-h', 'raise', 'triceps', 'triceps', 'core'],
  pull: ['pull-v', 'pull-h', 'pull-h', 'rear', 'biceps', 'biceps', 'core'],
  legs: ['squat', 'hinge', 'lunge', 'glute', 'calf', 'core'],
  'chest-tris': ['push-h', 'push-h', 'push-h', 'triceps', 'triceps', 'core'],
  'back-bis': ['pull-v', 'pull-h', 'pull-h', 'rear', 'biceps', 'biceps', 'core'],
  'shoulders-arms': ['push-v', 'raise', 'rear', 'biceps', 'triceps', 'push-v', 'core'],
  conditioning: ['conditioning', 'squat', 'push-h', 'conditioning', 'pull-h', 'lunge', 'conditioning', 'core', 'conditioning'],
  mobility: Array.from({ length: 12 }, () => 'mobility' as const),
}

const WARMUPS: Record<'upper' | 'lower' | 'full', string[]> = {
  upper: ['arm-circles', 'thread-the-needle', 'cat-cow'],
  lower: ['cat-cow', 'worlds-greatest-stretch', 'leg-swings'],
  full: ['cat-cow', 'worlds-greatest-stretch', 'arm-circles'],
}
const WARMUP_OF: Record<Template, keyof typeof WARMUPS | null> = {
  'full-a': 'full',
  'full-b': 'full',
  'full-c': 'full',
  upper: 'upper',
  lower: 'lower',
  push: 'upper',
  pull: 'upper',
  legs: 'lower',
  'chest-tris': 'upper',
  'back-bis': 'upper',
  'shoulders-arms': 'upper',
  conditioning: 'full',
  mobility: null,
}

const cycle = <T,>(list: T[], n: number): T[] => Array.from({ length: n }, (_, i) => list[i % list.length])

/** Each training day's template, in day order. */
export function templatesFor(prefs: Pick<TrainingPrefs, 'split' | 'focus' | 'experience'>, n: number): Template[] {
  if (n <= 0) return []
  if (prefs.focus === 'mobility') return cycle<Template>(['mobility'], n)
  let base: Template[]
  switch (prefs.split) {
    case 'full':
      base = cycle(['full-a', 'full-b', 'full-c'], n)
      break
    case 'upper-lower':
      base = n === 1 ? ['full-a'] : cycle(['upper', 'lower'], n)
      break
    case 'ppl':
      base = n === 1 ? ['full-a'] : n === 2 ? ['upper', 'lower'] : cycle(['push', 'pull', 'legs'], n)
      break
    case 'body-part':
      base = n === 1 ? ['full-a'] : n === 2 ? ['upper', 'lower'] : cycle(['chest-tris', 'back-bis', 'legs', 'shoulders-arms'], n)
      break
    case 'auto':
    default:
      base =
        n <= 3
          ? cycle(['full-a', 'full-b', 'full-c'], n)
          : n === 4
            ? ['upper', 'lower', 'upper', 'lower']
            : n === 5
              ? ['upper', 'lower', 'push', 'pull', 'legs']
              : n === 6
                ? ['push', 'pull', 'legs', 'push', 'pull', 'legs']
                : ['push', 'pull', 'legs', 'push', 'pull', 'legs', 'mobility']
  }
  // Fitness: every other session a circuit.
  if (prefs.focus === 'fitness' && n >= 2) return base.map((t, i) => (i % 2 === 1 ? 'conditioning' : t))
  // Endurance: one circuit a week once there are three sessions.
  if (prefs.focus === 'endurance' && n >= 3) return base.map((t, i) => (i === n - 1 ? 'conditioning' : t))
  return base
}

/* ── Choosing exercises ─────────────────────────────────────────────────── */

const LEVEL_PREF: Record<Experience, number[]> = { new: [1, 2], some: [2, 1], experienced: [2, 3, 1] }
const MAX_LEVEL: Record<Experience, number> = { new: 1, some: 2, experienced: 3 }

/** How much of their kit an exercise uses: a gym member gets gym exercises first. */
function kitRank(ex: Exercise, eq: Equipment): number {
  if (eq === 'gym') return ex.equipment.length === 1 ? 0 : ex.equipment.length === 2 ? 1 : 2
  if (eq === 'home') return ex.equipment.includes('bodyweight') ? 1 : 0
  return 0
}

export function fits(ex: Exercise, prefs: Pick<TrainingPrefs, 'equipment' | 'avoid' | 'experience'>): boolean {
  if (!ex.equipment.includes(prefs.equipment)) return false
  if (ex.loads.some((a) => prefs.avoid.includes(a))) return false
  // New: level 1 first, with level 2 kept for a movement that has nothing simpler.
  return ex.level <= Math.max(MAX_LEVEL[prefs.experience], 2)
}

/** Everything that could fill a slot, best first. */
function levelRank(e: Exercise, experience: Experience): number {
  const i = LEVEL_PREF[experience].indexOf(e.level)
  return i === -1 ? 9 : i
}

export function candidatesFor(pattern: Pattern, prefs: Pick<TrainingPrefs, 'equipment' | 'avoid' | 'experience'>): Exercise[] {
  return EXERCISES.filter((e) => e.pattern === pattern && fits(e, prefs)).sort(
    (a, b) => levelRank(a, prefs.experience) - levelRank(b, prefs.experience) || kitRank(a, prefs.equipment) - kitRank(b, prefs.equipment),
  )
}

/**
 * The few a session rotates between: the same level as the best, using about
 * as much of their kit, at most three.
 */
export function shortlist(cands: Exercise[], prefs: Pick<TrainingPrefs, 'equipment' | 'experience'>): Exercise[] {
  if (!cands.length) return []
  const level = levelRank(cands[0], prefs.experience)
  const kit = kitRank(cands[0], prefs.equipment)
  return cands.filter((e) => levelRank(e, prefs.experience) === level && kitRank(e, prefs.equipment) <= kit + 1).slice(0, 3)
}

/**
 * Other exercises for the same movement that suit them: what "Swap" offers.
 * Best first, the current one left out.
 */
export function alternativesFor(id: string, prefs: Pick<TrainingPrefs, 'equipment' | 'avoid' | 'experience'>, exclude: readonly string[] = []): Exercise[] {
  const ex = exerciseById(id)
  if (!ex) return []
  return candidatesFor(ex.pattern, prefs).filter((e) => e.id !== id && !exclude.includes(e.id))
}

function planned(ex: Exercise, prefs: Pick<TrainingPrefs, 'focus' | 'experience'>): PlannedExercise {
  return { id: ex.id, ...doseFor(ex, prefs.focus, prefs.experience), doneSets: 0 }
}

/** Minutes a strength session takes, warm-up included. */
export function sessionMinutes(s: Pick<StrengthSession, 'exercises' | 'warmup'>): number {
  const seconds = s.exercises.reduce((sum, p) => {
    const ex = exerciseById(p.id)
    return ex ? sum + exerciseSeconds(ex, p) : sum
  }, 0)
  return roundMinutes(seconds + (s.warmup.length ? WARMUP_MINUTES * 60 : 0))
}

/** The warm-up for a template, from moves that suit them. */
export function warmupFor(template: Template, prefs: Pick<TrainingPrefs, 'equipment' | 'avoid' | 'experience'>): string[] {
  const kind = WARMUP_OF[template]
  if (!kind) return []
  return WARMUPS[kind].filter((id) => {
    const ex = exerciseById(id)
    return ex ? fits(ex, prefs) : false
  })
}

/** Counts how often each movement has been used this week, so sessions vary. */
export type Rotation = Map<Pattern, number>

/**
 * Fill a template up to their length: slots in order, the best candidate each
 * time (moved along by the rotation), until the next exercise would run over.
 */
export function fillSession(
  template: Template,
  prefs: TrainingPrefs,
  seed: number,
  rotation: Rotation = new Map(),
  keep: PlannedExercise[] = [],
): PlannedExercise[] {
  const out: PlannedExercise[] = [...keep]
  const used = new Set(out.map((p) => p.id))
  const warmup = warmupFor(template, prefs)
  const target = prefs.minutes * 60
  const minCount = prefs.minutes <= 20 ? 2 : 3
  const slots = SLOTS[template]
  // Slots already filled by what's kept count as done.
  const kept = new Map<Pattern, number>()
  for (const p of keep) {
    const ex = exerciseById(p.id)
    if (ex) kept.set(ex.pattern, (kept.get(ex.pattern) ?? 0) + 1)
  }
  for (const pattern of slots) {
    const k = kept.get(pattern) ?? 0
    if (k > 0) {
      kept.set(pattern, k - 1)
      continue
    }
    const cands = shortlist(candidatesFor(pattern, prefs).filter((e) => !used.has(e.id)), prefs)
    if (!cands.length) continue
    const turn = rotation.get(pattern) ?? 0
    const pick = cands[(seed + turn) % cands.length]
    const next = planned(pick, prefs)
    const seconds = (list: PlannedExercise[]) => sessionMinutes({ exercises: list, warmup }) * 60
    if (out.length >= minCount && seconds([...out, next]) > target + 4 * 60) break
    rotation.set(pattern, turn + 1)
    out.push(next)
    used.add(pick.id)
  }
  return out
}

/* ── Activities ─────────────────────────────────────────────────────────── */

/** How many activities a focus suggests in a week, and which kind. */
const SUGGEST: Record<Focus, number> = { strength: 1, muscle: 1, allround: 1, fitness: 1, endurance: 2, mobility: 0 }
const CARDIO: ActivityKind[] = ['walk', 'jog', 'run', 'ride', 'swim', 'spin']
/** Days to put a suggestion on, in order: the weekend first. */
const FREE_DAY_ORDER: Weekday[] = [5, 6, 2, 4, 1, 3, 0]

export function suggestedKind(prefs: Pick<TrainingPrefs, 'focus' | 'experience' | 'avoid'>): ActivityKind {
  if (prefs.focus !== 'endurance' && prefs.focus !== 'fitness') return 'walk'
  const impact = prefs.avoid.includes('knees') || prefs.avoid.includes('ankles')
  if (impact) return 'ride'
  return prefs.experience === 'new' ? 'walk' : prefs.experience === 'some' ? 'jog' : 'run'
}

/** Areas they're working around that this activity loads. */
export function activityConflicts(kind: ActivityKind, avoid: readonly Area[]): Area[] {
  return ACTIVITIES[kind].loads.filter((a) => avoid.includes(a))
}

/** Stable ids: one of each kind a day, as the setup allows. */
export function activityId(suggested: boolean, day: Weekday, kind: ActivityKind): string {
  return `${suggested ? 's' : 'a'}-${day}-${kind}`
}

function activitySessions(prefs: TrainingPrefs): ActivitySession[] {
  const chosen: ActivitySession[] = prefs.activities.map((a) => ({
    id: activityId(false, a.day, a.kind),
    type: 'activity',
    day: a.day,
    activity: a.kind,
    minutes: a.minutes,
    intensity: ACTIVITIES[a.kind].intensity,
    suggested: false,
    done: false,
  }))
  const want = SUGGEST[prefs.focus] - chosen.filter((a) => CARDIO.includes(a.activity)).length
  if (want <= 0) return chosen
  const busy = new Set<number>([...prefs.days, ...prefs.activities.map((a) => a.day)])
  const free = FREE_DAY_ORDER.filter((d) => !busy.has(d))
  const kind = suggestedKind(prefs)
  const suggested: ActivitySession[] = free.slice(0, want).map((day) => ({
    id: activityId(true, day, kind),
    type: 'activity',
    day,
    activity: kind,
    minutes: ACTIVITIES[kind].minutes,
    intensity: ACTIVITIES[kind].intensity,
    suggested: true,
    done: false,
  }))
  return [...chosen, ...suggested]
}

/* ── The week ───────────────────────────────────────────────────────────── */

export function strengthSession(day: Weekday, template: Template, prefs: TrainingPrefs, seed: number, rotation?: Rotation): StrengthSession {
  return {
    id: `t-${day}-${template}`,
    type: 'strength',
    day,
    template,
    warmup: warmupFor(template, prefs),
    exercises: fillSession(template, prefs, seed, rotation),
    done: false,
  }
}

/** The training sessions only, one per training day. */
export function strengthWeek(prefs: TrainingPrefs, seed: number): StrengthSession[] {
  const days = [...prefs.days].sort((a, b) => a - b)
  const templates = templatesFor(prefs, days.length)
  const rotation: Rotation = new Map()
  return days.map((day, i) => strengthSession(day, templates[i], prefs, seed, rotation))
}

/** Everything in the week, by day, training before activities on the same day. */
export function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => a.day - b.day || (a.type === b.type ? 0 : a.type === 'strength' ? -1 : 1))
}

export function buildWeek(prefs: TrainingPrefs, seed: number): Session[] {
  return sortSessions([...strengthWeek(prefs, seed), ...activitySessions(prefs)])
}

/** Just the activities, rebuilt from the setup (after days, focus or areas change). */
export function rebuildActivities(prefs: TrainingPrefs): ActivitySession[] {
  return activitySessions(prefs)
}

/** Monday of the week a date is in, YYYY-MM-DD (UTC). */
export function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

/** Today as a weekday, Monday = 0. */
export function weekdayOf(date: Date): Weekday {
  return ((date.getUTCDay() + 6) % 7) as Weekday
}
