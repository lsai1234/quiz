/**
 * A missed session finds a home (Phase 3). Pure; safe in the browser.
 *
 * A session whose day has passed this week, not done: it moves to the next
 * free day this week if there is one (for this week only; Monday puts it back
 * on its own day), or it's dropped for this week, said plainly, with nothing
 * to catch up.
 */
import { sortSessions } from './generate'
import type { Session, TrainingPlan, Weekday } from './types'

/** Sessions this week whose day has gone, not done, not already moved or dropped. */
export function missedSessions(plan: TrainingPlan, today: Weekday, monday: string): Session[] {
  if (plan.weekOf !== monday) return []
  return plan.sessions.filter((s) => s.day < today && !s.done && !s.skipped && s.movedFrom == null)
}

/** The next day from today to Sunday with nothing on it, or null. */
export function nextFreeDay(plan: TrainingPlan, today: Weekday): Weekday | null {
  const busy = new Set(plan.sessions.filter((s) => !s.skipped).map((s) => s.day))
  for (let d = today; d <= 6; d++) if (!busy.has(d as Weekday)) return d as Weekday
  return null
}

/** Move it to that day for this week, or drop it for this week. */
export function rehome(plan: TrainingPlan, sessionId: string, to: Weekday | null, now: Date): TrainingPlan {
  const s = plan.sessions.find((x) => x.id === sessionId)
  if (!s || s.done) return plan
  const sessions = plan.sessions.map((x) => (x.id !== sessionId ? x : to === null ? { ...x, skipped: true } : { ...x, movedFrom: x.movedFrom ?? x.day, day: to }))
  return { ...plan, sessions: sortSessions(sessions), updatedAt: now.toISOString() }
}
