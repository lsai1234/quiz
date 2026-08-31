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

/** Suspected but not settled — the state a follow-up exists to RESOLVE. */
export const suspected = (s: InterviewState, ...ds: DriverId[]): boolean =>
  ds.some((d) => !s.cleared.includes(d) && weight(s, d) > 0 && weight(s, d) < CONFIRMED)

/**
 * On the table at all: suspected OR already confirmed, just not ruled out.
 *
 * The distinction matters more than it looks. `suspected` deliberately stops
 * being true once a driver is settled, which is right for a question that only
 * confirms — but wrong for a follow-up that asks something NEW about a driver
 * we are already sure of.
 *
 * Gating those on `suspected` produced a silent hole: answer "constantly — I
 * catch everything" and illness-frequency lands at 0.8, past `CONFIRMED`, so
 * the follow-up asking WHY never fired. The person most obviously in need of
 * the question was the only one who never saw it.
 */
export const live = (s: InterviewState, ...ds: DriverId[]): boolean =>
  ds.some((d) => !s.cleared.includes(d) && weight(s, d) > 0)

/** Ruled out, explicitly. */
export const cleared = (s: InterviewState, d: DriverId): boolean => s.cleared.includes(d)

/** They train — the performance track, or a training-shaped goal. */
export const trains = (s: InterviewState): boolean =>
  s.track === 'performance' ||
  hasGoal(s, 'muscle', 'performance', 'bulking', 'recovery', 'hydration')

/** 45 or over. Age gates a couple of questions that would otherwise be odd. */
export const olderThan45 = (s: InterviewState): boolean => s.form.ageBracket === '45+'

/** A flag ticked on the safety screen. Only ever readable with consent given. */
export const hasSafetyFlag = (s: InterviewState, flag: string): boolean =>
  (s.picked['safety'] ?? []).includes(flag)

/**
 * Whether the protein check may run at all.
 *
 * Three states, not two, and the third is the one that would have been missed.
 * The Article 9 gate on the safety screen means declining consent does not
 * produce an empty answer — it produces no answer, because the options never
 * render. So a guard written as "pregnancy is not ticked" is true for everyone
 * who declined, including the person the guard exists for, and an absence reads
 * exactly like a negative.
 *
 * Same shape of hole as the `suspected`/`live` one above: silent, and only for
 * the people it most matters for.
 */
export const proteinModuleAllowed = (s: InterviewState): boolean =>
  !!s.healthDataConsent?.accepted && !hasSafetyFlag(s, 'pregnancy')
