import { GOALS_DATA } from '@/lib/quiz-goals'
import type { Goal } from '@/lib/types'

/**
 * A goal the quiz opens with already ticked, from a link such as
 * `/quiz?goal=muscle`. The shop's quiz banner ends on the quiz's own first
 * question; tapping one of its goals is the first answer, so the quiz should
 * not ask it again from nothing.
 *
 * Only the training goals are accepted (they are the ones the banner offers,
 * and they belong to the performance track, which the quiz is then started
 * on). Anything else is ignored and the quiz starts as normal.
 *
 * The goal is read once on arrival (`ScrollExperience`) and the parameter is
 * taken off the address, so a refresh does not start the quiz over again.
 * Quiz v1 reads it from the store's answers; quiz v2 builds its interview on
 * first mount and reads it from here (`pendingStartGoal`), so the founder's
 * budget for the track still seeds that interview as usual.
 */
export const START_GOAL_PARAM = 'goal'

const TRAINING_GOALS = new Set<string>(GOALS_DATA.map((g) => g.id))

/** The goal a query string asks for, or null when it asks for none we know. */
export function startGoalFrom(search: string): Goal | null {
  const raw = new URLSearchParams(search).get(START_GOAL_PARAM)
  return raw && TRAINING_GOALS.has(raw) ? (raw as Goal) : null
}

/** The link that opens the quiz with `goal` ticked. */
export function startGoalHref(goal: Goal): string {
  return `/quiz?${START_GOAL_PARAM}=${encodeURIComponent(goal)}`
}

let pending: Goal | null = null

/** Held for quiz v2 until its interview exists. In memory only: one visit. */
export function setPendingStartGoal(goal: Goal | null): void {
  pending = goal
}

export function pendingStartGoal(): Goal | null {
  return pending
}
