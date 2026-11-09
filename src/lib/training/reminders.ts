/**
 * The training emails' switch (`lib/training/emails` sends them): pure, safe
 * in the browser. Both off unless the member turns them on.
 */
import type { TrainingPlan } from './types'

/** The recap goes on the first daily run at least this long after the plan was built… */
export const RECAP_AFTER_DAYS = 7
/** …and not at all once this long has passed (a late switch-on, a job that didn't run). */
export const RECAP_UNTIL_DAYS = 14

const DAY = 86_400_000

export interface Reminders {
  days: boolean
  recap: boolean
}

export const REMINDERS_OFF: Reminders = { days: false, recap: false }

export function remindersOf(plan: Pick<TrainingPlan, 'reminders'>): Reminders {
  return { days: plan.reminders?.days === true, recap: plan.reminders?.recap === true }
}

/** Whether the recap can still go: the switch is only offered while it can. */
export function recapStillDue(plan: Pick<TrainingPlan, 'createdAt'>, now: Date): boolean {
  return now.getTime() - Date.parse(plan.createdAt) < RECAP_UNTIL_DAYS * DAY
}

/** Whether today's run sends the recap (once: the outbox dedupes it per plan). */
export function recapDueToday(plan: Pick<TrainingPlan, 'createdAt'>, now: Date): boolean {
  const age = now.getTime() - Date.parse(plan.createdAt)
  return age >= RECAP_AFTER_DAYS * DAY && age < RECAP_UNTIL_DAYS * DAY
}
