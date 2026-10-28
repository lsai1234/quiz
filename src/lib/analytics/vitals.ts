/**
 * Speed on real devices (Amp Consult and offer plan, Phase 7.1): the Core Web
 * Vitals visitors' browsers measured, and the long animation frames behind
 * janky motion, summarised by device type for the hub.
 *
 *   web_vital    one per metric per page load: LCP, INP or CLS, with the
 *                browser's own rating. Sent by `rum.ts`.
 *   long_frames  one per page load, when it's hidden: how many frames took
 *                over 50ms, the worst, and their blocking time in all. Only
 *                from browsers that report long animation frames (Chromium).
 *
 * The server adds the device bucket (phone, tablet, computer) from the user
 * agent, as it does for every visit; founder sessions are left out by the
 * caller. Nothing here identifies anyone: a metric, a number and a bucket.
 *
 * p75 is the figure Google's thresholds are written against, and what the
 * panel shows. Pure: the caller reads the events and hands them in.
 */
import type { StoredEvent } from './repo'

export const VITALS = ['LCP', 'INP', 'CLS'] as const
export type Vital = (typeof VITALS)[number]

/** Good up to the first, poor from the second (web.dev's thresholds). */
export const THRESHOLDS: Record<Vital, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
}

export const VITAL_LABEL: Record<Vital, string> = {
  LCP: 'Largest paint',
  INP: 'Response to a tap',
  CLS: 'Layout shift',
}

export type Device = 'mobile' | 'tablet' | 'desktop' | 'unknown'
export const DEVICES: Device[] = ['mobile', 'tablet', 'desktop', 'unknown']
export const DEVICE_LABEL: Record<Device, string> = { mobile: 'Phone', tablet: 'Tablet', desktop: 'Computer', unknown: 'Not recorded' }

export type Area = 'all' | 'consult' | 'quiz' | 'shop' | 'other'
export const AREAS: Area[] = ['all', 'consult', 'quiz', 'shop', 'other']
export const AREA_LABEL: Record<Area, string> = { all: 'Everywhere', consult: 'Consult', quiz: 'Quiz', shop: 'Shop', other: 'Other' }

/** Which part of the site a page is. */
export function areaOf(path: string | null): Exclude<Area, 'all'> {
  if (!path) return 'other'
  if (path.startsWith('/quizv2') || path.startsWith('/consult')) return 'consult'
  if (path === '/' || path.startsWith('/quiz')) return 'quiz'
  if (path.startsWith('/shop') || path.startsWith('/product') || path.startsWith('/bundles')) return 'shop'
  return 'other'
}

export type Rating = 'good' | 'needs-improvement' | 'poor'

export function rate(metric: Vital, value: number): Rating {
  const [good, poor] = THRESHOLDS[metric]
  return value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor'
}

/** The value at a percentile, nearest-rank. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]
}

export interface VitalCell {
  samples: number
  p75: number | null
  /** Share of samples rated good, 0–1. */
  good: number
  rating: Rating | null
}

export interface FramesCell {
  pages: number
  /** Median long frames per page. */
  perPage: number | null
  p75WorstMs: number | null
  p75BlockingMs: number | null
}

export interface VitalsReport {
  rows: { device: Device; vitals: Record<Vital, VitalCell>; frames: FramesCell }[]
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const deviceOf = (v: unknown): Device => (v === 'mobile' || v === 'tablet' || v === 'desktop' ? v : 'unknown')

export function vitalsReport(events: readonly StoredEvent[], area: Area = 'all'): VitalsReport {
  const values = new Map<string, number[]>()
  const frames = new Map<Device, { count: number[]; worst: number[]; blocking: number[] }>()
  for (const e of events) {
    if (area !== 'all' && areaOf(e.path) !== area) continue
    const device = deviceOf(e.props.device)
    if (e.event === 'web_vital') {
      const metric = e.props.metric as Vital
      const value = num(e.props.value)
      if (!VITALS.includes(metric) || value === null) continue
      const k = `${device}|${metric}`
      values.set(k, [...(values.get(k) ?? []), value])
    } else if (e.event === 'long_frames') {
      const f = frames.get(device) ?? { count: [], worst: [], blocking: [] }
      const count = num(e.props.count)
      if (count === null) continue
      f.count.push(count)
      f.worst.push(num(e.props.worstMs) ?? 0)
      f.blocking.push(num(e.props.blockingMs) ?? 0)
      frames.set(device, f)
    }
  }
  const rows = DEVICES.map((device) => {
    const vitals = Object.fromEntries(
      VITALS.map((metric) => {
        const v = values.get(`${device}|${metric}`) ?? []
        const p75 = percentile(v, 75)
        return [metric, { samples: v.length, p75, good: v.length ? v.filter((x) => rate(metric, x) === 'good').length / v.length : 0, rating: p75 === null ? null : rate(metric, p75) }]
      }),
    ) as Record<Vital, VitalCell>
    const f = frames.get(device)
    return {
      device,
      vitals,
      frames: { pages: f?.count.length ?? 0, perPage: f ? percentile(f.count, 50) : null, p75WorstMs: f ? percentile(f.worst, 75) : null, p75BlockingMs: f ? percentile(f.blocking, 75) : null },
    }
  }).filter((r) => r.frames.pages > 0 || VITALS.some((m) => r.vitals[m].samples > 0))
  return { rows }
}
