/**
 * The 20 Questions people, drawing their day (plan Phase 7.4 proposal).
 *
 * Each draws a curve from what's true for them, not from the pulls in
 * `drawn.ts`, so the report tests the reading of the curve as well as the
 * maths. A pattern shows in the curve three times in four; a shape that
 * isn't theirs turns up one time in ten; every point but the afternoon's
 * wobbles a level a third of the time. The afternoon matches the energy they
 * gave, as the widget makes it.
 */

import { CURVE_HOURS, CURVE_MAX, afternoonLevel } from '../../day-curve'
import type { ConsultAnswers } from '../../types'
import type { PatternId } from '../types'
import { rng } from './simulate'

const STEADY = [6, 7, 7, 7, 7, 7, 7, 6, 5, 4]
const at = (h: number) => CURVE_HOURS.indexOf(h as (typeof CURVE_HOURS)[number])

export const SHOWS = 0.75
export const STRAY = 0.1

export function curveFor(truth: PatternId[], energy: number, seed: number): number[] {
  const rand = rng(seed)
  const has = (...ids: PatternId[]) => ids.some((id) => truth.includes(id))
  const shows = (yes: boolean) => rand() < (yes ? SHOWS : STRAY)
  const pts = [...STEADY]
  if (shows(has('crash'))) {
    const depth = 2 + Math.floor(rand() * 3)
    pts[at(14)] -= depth - 1
    pts[at(16)] -= depth
  }
  if (shows(has('short-sleep', 'broken-nights'))) {
    pts[at(6)] -= 3
    pts[at(8)] -= 3
  }
  if (shows(has('wired'))) {
    pts[at(20)] += 3
    pts[at(22)] += 3
  }
  const shift = energy - afternoonLevel(pts)
  return pts.map((l, i) => {
    const wobble = i === at(14) || i === at(16) || rand() > 1 / 3 ? 0 : rand() < 0.5 ? -1 : 1
    return Math.min(CURVE_MAX, Math.max(0, l + shift + wobble))
  })
}

export function withCurve(person: ConsultAnswers, truth: PatternId[], seed: number): ConsultAnswers {
  const points = curveFor(truth, person.energy ?? 6, seed)
  return { ...person, energyCurve: { points, how: 'drawn', preset: null } }
}
