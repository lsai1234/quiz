/**
 * Writing probes in words.
 *
 * The library says "That's me points strongly towards Wired and tired"; these
 * helpers turn that into the pulls `model.ts` works with, one shape per
 * format, so every scenario card behaves the same way and a reviewer only
 * ever reads the words.
 */

import { PULL } from './model'
import type { Answers, DayLineSpec, PatternId, PinpointArea, Probe, ProbeOption, Strength } from './types'

export type Points = Partial<Record<PatternId, Strength>>

/** A strength word as a signed pull. */
export function pull(s: Strength): number {
  const away = s.startsWith('away ')
  const size = PULL[(away ? s.slice(5) : s) as keyof typeof PULL]
  return away ? -size : size
}

/** Scale every pattern's pull by `k`: how strongly this option carries the probe's points. */
function scaled(points: Points, k: number): ProbeOption['pulls'] {
  const out: ProbeOption['pulls'] = {}
  for (const [id, s] of Object.entries(points) as [PatternId, Strength][]) out[id] = pull(s) * k
  return out
}

function merge(...parts: ProbeOption['pulls'][]): ProbeOption['pulls'] {
  const out: ProbeOption['pulls'] = {}
  for (const part of parts) for (const [id, v] of Object.entries(part) as [PatternId, number][]) out[id] = (out[id] ?? 0) + v
  return out
}

interface Base {
  id: string
  area: PinpointArea
  askIf?: (a: Answers) => boolean
}

/** "Sound like you?": one everyday moment. That's me · Sometimes · Not me. */
export function scenario(p: Base & { scene: string; text: string | ((a: Answers) => string); said: string; points: Points; question?: string }): Probe {
  return {
    id: p.id,
    area: p.area,
    askIf: p.askIf,
    format: 'scenario',
    question: p.question ?? 'Sound like you?',
    scene: p.scene,
    text: p.text,
    items: [
      {
        key: 'main',
        base: [0.3, 0.3, 0.4],
        options: [
          { key: 'me', label: 'That’s me', pulls: scaled(p.points, 1), said: p.said },
          { key: 'some', label: 'Sometimes', pulls: scaled(p.points, 0.35), said: `${p.said}, sometimes` },
          { key: 'not', label: 'Not me', pulls: scaled(p.points, -0.6) },
        ],
      },
    ],
  }
}

/** "How often?": the same moment, on four steps. */
export function howOften(p: Base & { scene: string; text: string; said: string; points: Points }): Probe {
  return {
    id: p.id,
    area: p.area,
    askIf: p.askIf,
    format: 'how-often',
    question: 'How often?',
    scene: p.scene,
    text: p.text,
    items: [
      {
        key: 'main',
        base: [0.3, 0.3, 0.22, 0.18],
        options: [
          { key: 'never', label: 'Never', pulls: scaled(p.points, -0.7) },
          { key: 'now', label: 'Now and then', pulls: scaled(p.points, -0.2) },
          { key: 'weeks', label: 'Most weeks', pulls: scaled(p.points, 0.5), said: `${p.said}, most weeks` },
          { key: 'days', label: 'Most days', pulls: scaled(p.points, 1), said: `${p.said}, most days` },
        ],
      },
    ],
  }
}

interface Side {
  text: string
  said: string
  points: Points
}

/** "Which is more you?": two moments side by side. Both and Neither are answers too. */
export function thisOrThat(p: Base & { question?: string; a: Side; b: Side }): Probe {
  return {
    id: p.id,
    area: p.area,
    askIf: p.askIf,
    format: 'this-or-that',
    question: p.question ?? 'Which is more you?',
    items: [
      {
        key: 'main',
        base: [0.38, 0.38, 0.14, 0.1],
        options: [
          { key: 'a', label: p.a.text, pulls: merge(scaled(p.a.points, 1), scaled(p.b.points, -0.5)), said: p.a.said },
          { key: 'b', label: p.b.text, pulls: merge(scaled(p.b.points, 1), scaled(p.a.points, -0.5)), said: p.b.said },
          { key: 'both', label: 'Both', pulls: merge(scaled(p.a.points, 0.25), scaled(p.b.points, 0.25)) },
          { key: 'neither', label: 'Neither', pulls: merge(scaled(p.a.points, -0.35), scaled(p.b.points, -0.35)) },
        ],
      },
    ],
  }
}

/** "When…?": a marker dragged along a day. Buckets by time, plus a few answers off the line. */
export function dayLine(
  p: Base & {
    question: string
    hint: string
    line: Omit<DayLineSpec, 'buckets'>
    buckets: { key: string; until: number; points?: Points }[]
    extras: { key: string; label: string; points?: Points; said?: string }[]
  },
): Probe {
  const onLine = 0.82 / p.buckets.length
  const offLine = p.extras.length ? 0.18 / p.extras.length : 0
  return {
    id: p.id,
    area: p.area,
    askIf: p.askIf,
    format: 'day-line',
    question: p.question,
    text: p.hint,
    dayLine: { ...p.line, buckets: p.buckets.map(({ key, until }) => ({ key, until })) },
    items: [
      {
        key: 'main',
        base: [...p.buckets.map(() => onLine), ...p.extras.map(() => offLine)],
        options: [
          ...p.buckets.map((b) => ({ key: b.key, label: b.key, pulls: scaled(b.points ?? {}, 1) })),
          ...p.extras.map((x) => ({ key: x.key, label: x.label, pulls: scaled(x.points ?? {}, 1), said: x.said })),
        ],
      },
    ],
  }
}

/** Quick fire: two to four yes-or-no rows on one screen. Points are for a yes. */
export function quickFire(
  p: Base & { question?: string; hint: string; items: { key: string; text: string; points: Points; yes?: string; no?: string }[] },
): Probe {
  return {
    id: p.id,
    area: p.area,
    askIf: p.askIf,
    format: 'quick-fire',
    question: p.question ?? 'Quick fire',
    text: p.hint,
    items: p.items.map((i) => ({
      key: i.key,
      text: i.text,
      base: [0.45, 0.55],
      options: [
        { key: 'yes', label: 'Yes', pulls: scaled(i.points, 0.8), said: i.yes },
        { key: 'no', label: 'No', pulls: scaled(i.points, -0.6), said: i.no },
      ],
    })),
  }
}

/** Which bucket a time falls in. */
export function bucketAt(spec: DayLineSpec, minutes: number): string {
  return (spec.buckets.find((b) => minutes <= b.until) ?? spec.buckets[spec.buckets.length - 1]).key
}

/** "4pm", "9:30am". */
export function clockWords(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  const half = h < 12 ? 'am' : 'pm'
  if (h === 0 && m === 0) return 'midnight'
  if (h === 12 && m === 0) return 'midday'
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${half}`
}
