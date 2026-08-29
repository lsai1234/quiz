import type { Goal } from '@/lib/types'
import type { InterviewState } from '../types'
import type { DriverId } from '../drivers'
import { CONFIRMED } from '../drivers'

/**
 * The preconditions bank questions are written against.
 *
 * Small named helpers rather than inline arrow bodies, because a `requires` is
 * the thing most likely to be wrong in a way nobody notices — a question that
 * silently never fires looks exactly like a question that was never written.
 * Named and shared, they can be unit-tested once instead of eyeballed forty
 * times.
 */

/** Any of these goals selected. */
export const hasGoal = (s: InterviewState, ...goals: Goal[]): boolean =>
  goals.some((g) => s.goals.includes(g))

/** This exact option was chosen on this question. */
export const chose = (s: InterviewState, questionId: string, optionId: string): boolean =>
  (s.picked[questionId] ?? []).includes(optionId)

/** Any of these options was chosen on this question. */
export const choseAny = (s: InterviewState, questionId: string, ...optionIds: string[]): boolean =>
  optionIds.some((o) => chose(s, questionId, o))

/** The question has been put, whatever the answer. */
export const asked = (s: InterviewState, questionId: string): boolean =>
  s.asked.includes(questionId)

/** Evidence for a driver, 0 when never suggested. */
export const weight = (s: InterviewState, d: DriverId): number => s.drivers[d] ?? 0

/** Suspected but not settled — the state a follow-up exists to resolve. */
export const suspected = (s: InterviewState, ...ds: DriverId[]): boolean =>
  ds.some((d) => !s.cleared.includes(d) && weight(s, d) > 0 && weight(s, d) < CONFIRMED)

/** Ruled out, explicitly. */
export const cleared = (s: InterviewState, d: DriverId): boolean => s.cleared.includes(d)

/** They train — the performance track, or a training-shaped goal. */
export const trains = (s: InterviewState): boolean =>
  s.track === 'performance' ||
  hasGoal(s, 'muscle', 'performance', 'bulking', 'recovery', 'hydration')

/** 45 or over. Age gates a couple of questions that would otherwise be odd. */
export const olderThan45 = (s: InterviewState): boolean => s.form.ageBracket === '45+'
