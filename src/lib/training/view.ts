/**
 * How a plan reads on screen: names, lengths, the line under each exercise,
 * what's next. Words from `./copy` and the library only. Pure; safe in the
 * browser.
 */
import { ACTIVITIES, exerciseById } from './library'
import { sessionMinutes } from './generate'
import { ACTIVITY_LABEL, EQUIPMENT_COPY, EXPERIENCE_COPY, FOCUS_COPY, INTENSITY_COPY, TEMPLATE_COPY, TRAINING_COPY as C, WEEKDAY_LONG, WEEKDAY_SHORT, areasPhrase } from './copy'
import type { PlannedExercise, Session, TrainingPlan, TrainingPrefs, Weekday } from './types'

export function sessionTitle(s: Session): string {
  return s.type === 'strength' ? TEMPLATE_COPY[s.template] : ACTIVITIES[s.activity].name
}

export function sessionLength(s: Session): number {
  return s.type === 'strength' ? sessionMinutes(s) : s.minutes
}

/** "About 45 min · 6 exercises", or "30 min · Easy". */
export function sessionSummary(s: Session): string {
  if (s.type === 'strength') return `${C.aboutMinutes(sessionLength(s))} · ${C.exercisesCount(s.exercises.length)}`
  return `${s.minutes} min · ${INTENSITY_COPY[s.intensity]}`
}

/** "3 × 8–10", or "3 × 30–40 s". */
export function doseLine(p: PlannedExercise): string {
  const ex = exerciseById(p.id)
  return ex?.unit === 'seconds' ? C.setsSeconds(p.sets, p.low, p.high) : C.setsReps(p.sets, p.low, p.high)
}

export function progressOf(plan: TrainingPlan): { done: number; planned: number } {
  return { done: plan.sessions.filter((s) => s.done).length, planned: plan.sessions.length }
}

/** The next session not yet done, from today on (or the first left this week). */
export function nextSession(plan: TrainingPlan, today: Weekday): Session | null {
  const open = plan.sessions.filter((s) => !s.done)
  return open.find((s) => s.day >= today) ?? null
}

export function dayName(d: Weekday): string {
  return WEEKDAY_LONG[d]
}

export function activityLabel(kind: keyof typeof ACTIVITY_LABEL): string {
  return ACTIVITY_LABEL[kind]
}

/** "22 February", from an ISO date. */
export function longDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

/** Their setup in one line, for the trainer: "Build muscle · 3 days (Mon, Wed, Fri) · 45 min · A gym · Some experience · around the knees". */
export function setupLine(prefs: Pick<TrainingPrefs, 'focus' | 'days' | 'minutes' | 'equipment' | 'experience' | 'avoid'>): string {
  const days = [...prefs.days].sort((a, b) => a - b)
  return [
    FOCUS_COPY[prefs.focus]?.label ?? prefs.focus,
    `${days.length} day${days.length === 1 ? '' : 's'} (${days.map((d) => WEEKDAY_SHORT[d]).join(', ')})`,
    `${prefs.minutes} min`,
    EQUIPMENT_COPY[prefs.equipment]?.label ?? prefs.equipment,
    EXPERIENCE_COPY[prefs.experience]?.label ?? prefs.experience,
    prefs.avoid.length ? `working around ${areasPhrase(prefs.avoid)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
