/**
 * The day ring (Amp Consult and offer plan, Phase 7.3): Amp's ring as a
 * 24-hour dial of their day, filling in as they answer. This file is what it
 * plots and how it says it in words; `DayRing.tsx` draws it.
 *
 * Only what they've told us:
 *   sleep      the arc from bedtime to waking
 *   caffeine   the last cup at its time, when Pinpoint asked; otherwise the count
 *   training   at their training time, when Pinpoint asked; otherwise days a week
 *   daylight   a glow over the middle of the day, as bright as their answer
 *   energy     their day's curve, with the dip marked (Shape your day, item 4);
 *              without one, the afternoon level
 *
 * Midnight at the top, clockwise, like a watch. Pure.
 */

import { countsByType, sessionsPerWeek } from './training'
import type { ConsultAnswers, Daylight } from './types'
import type { RingSlot } from './flight'
import { CURVE_HOURS, CURVE_MAX, curveWords, readCurve } from './day-curve'
import type { RingChange } from './habits'

/** The day's curve round the ring: 06:00 to midnight, its level as distance from the middle. */
export function curveOnRing(points: readonly number[], inner = 24, outer = 38): string {
  return points
    .map((level, i) => {
      const p = pointAt(CURVE_HOURS[i] * 60, inner + ((outer - inner) * level) / CURVE_MAX)
      return `${i ? 'L' : 'M'}${p.x} ${p.y}`
    })
    .join('')
}

const DAY = 24 * 60

/** Clock time as a watch says it: "23:30". */
export function clock(minutes: number): string {
  const m = ((Math.round(minutes) % DAY) + DAY) % DAY
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** A time of day as an angle in degrees, midnight at the top, clockwise. */
export const angleOf = (minutes: number) => (((minutes % DAY) + DAY) % DAY) / DAY * 360

/** A point on a circle round (50, 50), at a time of day. */
export function pointAt(minutes: number, r: number): { x: number; y: number } {
  const a = ((angleOf(minutes) - 90) * Math.PI) / 180
  return { x: Math.round((50 + r * Math.cos(a)) * 100) / 100, y: Math.round((50 + r * Math.sin(a)) * 100) / 100 }
}

/** An SVG arc along the circle, clockwise from one time to another. */
export function arcPath(from: number, to: number, r: number): string {
  const span = (((to - from) % DAY) + DAY) % DAY || DAY
  const a = pointAt(from, r)
  const b = pointAt(from + Math.min(span, DAY - 1), r)
  return `M${a.x} ${a.y}A${r} ${r} 0 ${span > DAY / 2 ? 1 : 0} 1 ${b.x} ${b.y}`
}

/** The time they told Pinpoint about for a day-line probe, if they did. */
function probeTime(a: ConsultAnswers, probe: string): number | null {
  for (const step of [...(a.pinpoint?.steps ?? [])].reverse()) {
    if (step.kind === 'probe' && step.probe === probe && typeof step.minutes === 'number') return step.minutes
  }
  return null
}

/** How bright the daylight glow is for each answer. */
export const DAYLIGHT_GLOW: Record<Daylight, number> = { hardly: 0.15, some: 0.35, most: 0.6, daily: 0.8 }
/** The glow sits over the middle of the day. */
export const DAYLIGHT_SPAN = { from: 10 * 60, to: 16 * 60 }
/** "Afternoon energy": the level they set, plotted across the afternoon. */
export const ENERGY_SPAN = { from: 13 * 60, to: 17 * 60 }

export interface DayRingData {
  sleep: { bed: number; wake: number } | null
  caffeine: { at: number } | { count: number } | null
  training: { at: number } | { days: number } | null
  daylight: { level: number; answer: Daylight } | null
  energy: { level: number } | { points: number[]; dip: number | null } | null
}

export function dayRingData(a: ConsultAnswers): DayRingData {
  const lastCup = probeTime(a, 'last-caffeine')
  const cups = a.caffeine ? a.caffeine.coffee + a.caffeine.tea + a.caffeine.energy : null
  const trains = probeTime(a, 'train-when')
  const by = countsByType(a.training)
  const days = a.training ? Math.round(sessionsPerWeek(a.training)) : null
  return {
    sleep: a.sleep ? { bed: a.sleep.bed, wake: a.sleep.wake } : null,
    caffeine: lastCup !== null && (cups ?? 1) > 0 ? { at: lastCup } : cups !== null ? { count: cups } : null,
    training: trains !== null && by.gym + by.cardio + by.sport > 0 ? { at: trains } : days !== null ? { days } : null,
    daylight: a.daylight ? { level: DAYLIGHT_GLOW[a.daylight], answer: a.daylight } : null,
    energy: a.energyCurve?.points
      ? { points: a.energyCurve.points, dip: readCurve(a.energyCurve.points).dip?.at ?? null }
      : a.energy !== null
        ? { level: a.energy }
        : null,
  }
}

const DAYLIGHT_WORDS: Record<Daylight, string> = { hardly: 'hardly any daylight', some: 'daylight some days', most: 'daylight most days', daily: 'daylight every day' }

/** The ring in words: its text alternative, and the large ring's legend. */
export function dayRingLines(d: DayRingData): { slot: RingSlot; text: string }[] {
  const lines: { slot: RingSlot; text: string }[] = []
  if (d.sleep) lines.push({ slot: 'sleep', text: `Sleep ${clock(d.sleep.bed)} to ${clock(d.sleep.wake)}` })
  if (d.caffeine) {
    lines.push({
      slot: 'caffeine',
      text: 'at' in d.caffeine ? `last coffee about ${clock(d.caffeine.at)}` : d.caffeine.count === 0 ? 'no caffeine' : `${d.caffeine.count} caffeinated drink${d.caffeine.count === 1 ? '' : 's'} a day`,
    })
  }
  if (d.training) lines.push({ slot: 'training', text: 'at' in d.training ? `trains around ${clock(d.training.at)}` : d.training.days === 0 ? 'no training' : `trains ${d.training.days} day${d.training.days === 1 ? '' : 's'} a week` })
  if (d.daylight) lines.push({ slot: 'daylight', text: DAYLIGHT_WORDS[d.daylight.answer] })
  if (d.energy) {
    const text = 'points' in d.energy ? curveWords(d.energy.points) : `afternoon energy ${d.energy.level} out of 10`
    lines.push({ slot: 'energy', text: text.charAt(0).toLowerCase() + text.slice(1) })
  }
  return lines
}

/**
 * A "Try this week" fix on the ring (plan Phase 8, the read's story): their
 * day as it would be. Lights out earlier stretches the sleep arc; the last cup
 * slides earlier; time outside or a walk is a new dashed arc where it would
 * go. A fix with nothing to plot (a protein breakfast, fluids round training)
 * leaves the ring as it is.
 */
export interface RingTry {
  data: DayRingData
  /** The mark it moves, or the slot of the arc it adds. */
  slot: RingSlot | null
  /** An arc it adds: from and to, minutes past midnight. */
  arc: { from: number; to: number } | null
  /** It, in words, for the ring's legend. */
  text: string | null
}

export function withChange(d: DayRingData, change: RingChange | null): RingTry {
  const none: RingTry = { data: d, slot: null, arc: null, text: null }
  if (!change) return none
  switch (change.kind) {
    case 'lights-out':
      return d.sleep ? { data: { ...d, sleep: { ...d.sleep, bed: change.at } }, slot: 'sleep', arc: null, text: `Try: lights out by ${clock(change.at)}` } : none
    case 'last-caffeine':
      return { data: { ...d, caffeine: { at: change.at } }, slot: 'caffeine', arc: null, text: `Try: last coffee by ${clock(change.at)}` }
    case 'daylight':
      return { data: d, slot: 'daylight', arc: { from: change.at, to: change.at + change.minutes }, text: `Try: outside at ${clock(change.at)}, ${change.minutes} minutes` }
    case 'move':
      return { data: d, slot: 'training', arc: { from: change.at, to: change.at + change.minutes }, text: `Try: moving at ${clock(change.at)}, ${change.minutes} minutes` }
    default:
      return none
  }
}

export function dayRingText(d: DayRingData): string {
  const lines = dayRingLines(d)
  if (!lines.length) return 'Your day, filling in as you answer'
  const text = lines.map((l) => l.text).join(', ')
  return `Your day: ${text.charAt(0).toLowerCase()}${text.slice(1)}`
}
