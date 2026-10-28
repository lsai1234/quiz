/**
 * Shape your day (Amp Consult and offer plan, Phase 7.4): their energy from
 * 06:00 to midnight as a curve, drawn with a finger and fine-tuned by dragging
 * its points, or picked from five shapes (comfort mode, the keyboard).
 *
 * Ten points, every two hours from 06:00 to 24:00, each 0–10. What's read off
 * it:
 *   afternoon  the level at 14:00–16:00: the existing 1–10 energy answer,
 *              kept, so everything that reads `energy` reads it as before
 *   dip        the afternoon's lowest point well under the hours either side,
 *              when there is one: its time and depth
 *   slow morning, evening rise
 *
 * Pure. The widget is `scenes/DayCurve.tsx`; how the shape might feed
 * Pinpoint is a proposal, off (`pinpoint/drawn.ts`).
 */

import type { ConsultAnswers } from './types'

/** Hours of the ten points. */
export const CURVE_HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24] as const
export const CURVE_MAX = 10

export type CurvePreset = 'steady' | 'slow-starter' | 'dip-3pm' | 'second-wind' | 'unsure'

export interface EnergyCurve {
  /** Ten levels, 06:00 to 24:00. Null for "Not sure". */
  points: number[] | null
  how: 'drawn' | 'preset'
  preset: CurvePreset | null
}

export const PRESET_POINTS: Record<Exclude<CurvePreset, 'unsure'>, number[]> = {
  steady: [6, 7, 7, 7, 7, 7, 7, 6, 5, 4],
  'slow-starter': [2, 3, 5, 7, 7, 7, 7, 6, 5, 4],
  'dip-3pm': [6, 7, 8, 7, 4, 3, 5, 6, 5, 4],
  'second-wind': [5, 6, 6, 5, 4, 4, 5, 7, 8, 7],
}

export const PRESET_LABEL: Record<CurvePreset, string> = {
  steady: 'Steady all day',
  'slow-starter': 'Slow starter',
  'dip-3pm': '3pm dip',
  'second-wind': 'Second wind at night',
  unsure: 'Not sure',
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * A stroke, as the finger drew it (x 0–1 across 06:00–24:00, y 0–1 down from
 * full), into the ten points: each point the stroke's height there, the gaps
 * between samples filled in a straight line; points the stroke never reached
 * keep what they had (or 5).
 */
export function pointsFromStroke(samples: readonly { x: number; y: number }[], before: readonly number[] | null = null): number[] {
  const out = before ? [...before] : CURVE_HOURS.map(() => 5)
  const level = (y: number) => Math.round(clamp((1 - y) * CURVE_MAX, 0, CURVE_MAX))
  const at = (x: number) => clamp(x, 0, 1) * (CURVE_HOURS.length - 1)
  // Each sample sets the point nearest it, so a tap or a short stroke counts…
  for (const s of samples) out[Math.round(at(s.x))] = level(s.y)
  // …and the points between two samples take the straight line between them.
  for (let i = 0; i < samples.length - 1; i++) {
    const [a, b] = at(samples[i].x) <= at(samples[i + 1].x) ? [samples[i], samples[i + 1]] : [samples[i + 1], samples[i]]
    const [from, to] = [at(a.x), at(b.x)]
    for (let k = Math.ceil(from); k <= Math.floor(to); k++) out[k] = level(to === from ? b.y : a.y + ((b.y - a.y) * (k - from)) / (to - from))
  }
  return out
}

/** The afternoon level, 1–10: the existing energy answer. */
export function afternoonLevel(points: readonly number[]): number {
  const i = CURVE_HOURS.indexOf(14)
  return clamp(Math.round((points[i] + points[i + 1]) / 2), 1, CURVE_MAX)
}

export interface CurveShape {
  afternoon: number
  /** The dip, when there is one: minutes past midnight, and how far it falls (levels). */
  dip: { at: number; depth: number } | null
  slowMorning: boolean
  eveningRise: boolean
}

/** A fall this many levels under the hours either side is a dip. */
export const DIP_DEPTH = 2

export function readCurve(points: readonly number[]): CurveShape {
  const lvl = (h: number) => points[CURVE_HOURS.indexOf(h as (typeof CURVE_HOURS)[number])]
  let dip: CurveShape['dip'] = null
  for (const h of [12, 14, 16, 18]) {
    const before = Math.max(...CURVE_HOURS.filter((x) => x >= 8 && x < h).map(lvl))
    const after = Math.max(...CURVE_HOURS.filter((x) => x > h && x <= 22).map(lvl))
    const depth = Math.min(before, after) - lvl(h)
    if (depth >= DIP_DEPTH && (!dip || depth > dip.depth)) dip = { at: h * 60, depth }
  }
  return {
    afternoon: afternoonLevel(points),
    dip,
    slowMorning: (lvl(6) + lvl(8)) / 2 <= Math.max(lvl(10), lvl(12)) - DIP_DEPTH,
    // Higher in the evening than at any point from noon: not just back up after a dip.
    eveningRise: Math.max(lvl(20), lvl(22)) >= Math.max(lvl(12), lvl(14), lvl(16), lvl(18)) + DIP_DEPTH,
  }
}

/** What a curve writes: itself, and the afternoon level as `energy` (null for "Not sure"). */
export function curvePatch(curve: EnergyCurve): Pick<ConsultAnswers, 'energyCurve' | 'energy'> {
  return { energyCurve: curve, energy: curve.points ? afternoonLevel(curve.points) : null }
}

/** The curve as words: the widget's text alternative and the ring's line. */
export function curveWords(points: readonly number[]): string {
  const s = readCurve(points)
  const parts: string[] = []
  if (s.slowMorning) parts.push('slow to get going')
  if (s.dip) parts.push(`dips around ${String(s.dip.at / 60).padStart(2, '0')}:00`)
  if (s.eveningRise) parts.push('a second wind in the evening')
  if (!parts.length) parts.push(`steady, ${s.afternoon} out of 10 in the afternoon`)
  return `Energy ${parts.join(', ')}`
}
