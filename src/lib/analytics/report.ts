/**
 * The analytics report — everything the hub's Analytics page draws, from the
 * visit rows in `analytics_sessions`.
 *
 * Pure: the caller reads the rows and hands them in, so every number on the
 * page is computed by code a test can call without a database.
 *
 * ── One cohort, read one way ────────────────────────────────────────────────
 * A visit belongs to the period it BEGAN in, and every figure — the totals, the
 * trend, the funnel, the breakdowns — counts visits, never events. So the trend
 * adds up to the total, the funnel's first bar is the landing-page figure, and a
 * breakdown's rows add up to the whole. A page whose numbers disagree with each
 * other is a page nobody trusts, however right each one is.
 *
 * ── "Reached at least" ──────────────────────────────────────────────────────
 * A visit's furthest stage counts at that stage and every stage before it. A
 * visit that started checkout counts as having seen its stack even if that
 * beacon was lost, and the funnel can only ever narrow — the shape a funnel has
 * to have for "where are people falling off?" to have an answer.
 */
import type { SessionRow } from './sessions'

export const TZ = 'Europe/London'

// ─── Ranges and buckets ─────────────────────────────────────────────────────

export const RANGES = ['24h', '7d', '30d', '90d', 'all'] as const
export type RangeKey = (typeof RANGES)[number]
export type Bucket = 'hour' | 'day' | 'week' | 'month'

export function isRangeKey(v: unknown): v is RangeKey {
  return typeof v === 'string' && (RANGES as readonly string[]).includes(v)
}

export interface ResolvedRange {
  key: RangeKey
  /** Inclusive start, ms. Null for "all time" with no data yet. */
  from: number | null
  /** Exclusive end, ms. */
  to: number
  /** The same length of time immediately before, for the comparison. Null for "all time". */
  previous: { from: number; to: number } | null
  bucket: Bucket
}

interface Civil {
  y: number
  m: number
  d: number
  h: number
}

const HOUR = 3_600_000
const DAY = 86_400_000

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  hourCycle: 'h23',
})

/**
 * London's wall clock at `ms`. Cached per UTC hour: the UK's offset is whole
 * hours, so every instant in one UTC hour falls in the same London hour — and
 * a year of visits touches at most 8,760 of them, against a quarter of a
 * million rows that would otherwise each pay for an `Intl` call.
 */
const civilCache = new Map<number, Civil>()
function civil(ms: number): Civil {
  const hourKey = Math.floor(ms / HOUR)
  const hit = civilCache.get(hourKey)
  if (hit) return hit
  const parts: Record<string, number> = {}
  for (const p of PARTS.formatToParts(new Date(hourKey * HOUR))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  const out = { y: parts.year, m: parts.month, d: parts.day, h: parts.hour }
  if (civilCache.size > 20_000) civilCache.clear()
  civilCache.set(hourKey, out)
  return out
}

/** The instant London's clock reads y-m-d h:00. */
function fromCivil(y: number, m: number, d: number, h = 0): number {
  const guess = Date.UTC(y, m - 1, d, h)
  const seen = civil(guess)
  const offset = Date.UTC(seen.y, seen.m - 1, seen.d, seen.h) - guess
  return guess - offset
}

/** London midnight at the start of the day `ms` falls in, moved `days` days. */
function londonDayStart(ms: number, days = 0): number {
  const c = civil(ms)
  const shifted = new Date(Date.UTC(c.y, c.m - 1, c.d + days))
  return fromCivil(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

export function resolveRange(key: RangeKey, now: number, earliest: number | null): ResolvedRange {
  if (key === '24h') {
    const from = Math.floor(now / HOUR) * HOUR - 23 * HOUR
    return { key, from, to: now, previous: { from: from - DAY, to: now - DAY }, bucket: 'hour' }
  }
  if (key === 'all') {
    if (earliest === null) return { key, from: null, to: now, previous: null, bucket: 'day' }
    const from = londonDayStart(earliest)
    const span = now - from
    const bucket: Bucket = span <= 2 * DAY ? 'hour' : span <= 92 * DAY ? 'day' : span <= 400 * DAY ? 'week' : 'month'
    return { key, from: bucket === 'hour' ? Math.floor(earliest / HOUR) * HOUR : from, to: now, previous: null, bucket }
  }
  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90
  // Whole London days, today included: "last 7 days" is today and the six
  // before it. The comparison is the same stretch of clock a period earlier —
  // as far into its last day as today is into this one — so a half-finished
  // today is never weighed against a whole day.
  const from = londonDayStart(now, -(days - 1))
  const prevFrom = londonDayStart(from, -days)
  return { key, from, to: now, previous: { from: prevFrom, to: prevFrom + (now - from) }, bucket: days === 90 ? 'week' : 'day' }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const pad = (n: number) => String(n).padStart(2, '0')

/** Monday = 0. Day-number arithmetic: 1 Jan 1970 was a Thursday. */
function weekdayOf(y: number, m: number, d: number): number {
  return (Math.floor(Date.UTC(y, m - 1, d) / DAY) + 3) % 7
}

export function bucketKey(ms: number, bucket: Bucket): string {
  const c = civil(ms)
  switch (bucket) {
    case 'hour':
      return `${c.y}-${pad(c.m)}-${pad(c.d)}T${pad(c.h)}`
    case 'day':
      return `${c.y}-${pad(c.m)}-${pad(c.d)}`
    case 'week': {
      const monday = new Date(Date.UTC(c.y, c.m - 1, c.d - weekdayOf(c.y, c.m, c.d)))
      return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`
    }
    case 'month':
      return `${c.y}-${pad(c.m)}`
  }
}

export interface BucketSpan {
  key: string
  /** Short, for an axis. */
  label: string
  /** Long, for a tooltip. */
  title: string
}

/** Every bucket from `from` to `to`, empty ones included — a day nobody came is a zero, not a gap. */
export function listBuckets(from: number, to: number, bucket: Bucket): BucketSpan[] {
  const out: BucketSpan[] = []
  const seen = new Set<string>()
  const push = (ms: number) => {
    const key = bucketKey(ms, bucket)
    if (seen.has(key)) return
    seen.add(key)
    const c = civil(ms)
    if (bucket === 'hour') {
      out.push({ key, label: `${pad(c.h)}:00`, title: `${WEEKDAYS[weekdayOf(c.y, c.m, c.d)]} ${c.d} ${MONTHS[c.m - 1]}, ${pad(c.h)}:00` })
    } else if (bucket === 'day') {
      out.push({ key, label: `${c.d} ${MONTHS[c.m - 1]}`, title: `${WEEKDAYS[weekdayOf(c.y, c.m, c.d)]} ${c.d} ${MONTHS[c.m - 1]} ${c.y}` })
    } else if (bucket === 'week') {
      const [y, m, d] = key.split('-').map(Number)
      out.push({ key, label: `${d} ${MONTHS[m - 1]}`, title: `Week of ${d} ${MONTHS[m - 1]} ${y}` })
    } else {
      out.push({ key, label: `${MONTHS[c.m - 1]} ${String(c.y).slice(2)}`, title: `${MONTHS[c.m - 1]} ${c.y}` })
    }
  }
  if (bucket === 'hour') {
    for (let t = Math.floor(from / HOUR) * HOUR; t < to; t += HOUR) push(t)
  } else {
    // Step through London's calendar a day at a time, taking each day at
    // midday, which no clock change can push into the neighbouring date. Weeks
    // and months fall out of the de-duplication.
    const start = civil(from)
    const end = civil(Math.max(from, to - 1))
    const last = Date.UTC(end.y, end.m - 1, end.d)
    for (let t = Date.UTC(start.y, start.m - 1, start.d); t <= last; t += DAY) {
      const d = new Date(t)
      push(fromCivil(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 12))
    }
  }
  return out
}

// ─── The funnel ─────────────────────────────────────────────────────────────

export const STAGES = [
  { key: 'landing', label: 'Opened the landing page' },
  { key: 'started', label: 'Started the quiz' },
  { key: 'finished', label: 'Finished the quiz' },
  { key: 'results', label: 'Saw their stack' },
  { key: 'checkout', label: 'Started checkout' },
  { key: 'purchased', label: 'Bought' },
] as const

export type StageKey = (typeof STAGES)[number]['key']

/**
 * How far a visit got through the front door: -1 if it never came through it
 * (a shop-only visit, say), else an index into `STAGES`.
 *
 * Everything past the landing page needs a quiz (or consult) start. A shop
 * visitor who bought a tub of protein is a sale, but not a quiz conversion,
 * and counting them as one is how the old dashboard over-reported.
 */
export function furthestStage(r: SessionRow): number {
  if (!r.quiz_start_at) return r.landing_at ? 0 : -1
  if (r.purchase_at) return 5
  if (r.checkout_at) return 4
  if (r.results_at) return 3
  if (r.quiz_done_at) return 2
  return 1
}

export interface FunnelStage {
  key: StageKey
  label: string
  sessions: number
  /** Share of the first stage (0–1). */
  ofTop: number
  /** Share of the stage before that made it here (0–1). */
  fromPrevious: number
  /** Lost between the stage before and this one. */
  dropped: number
}

const rate = (a: number, b: number) => (b > 0 ? a / b : 0)

function funnelOf(rows: SessionRow[]): FunnelStage[] {
  const reached = STAGES.map(() => 0)
  for (const r of rows) {
    const f = furthestStage(r)
    for (let i = 0; i <= f; i++) reached[i]++
  }
  return STAGES.map((s, i) => ({
    key: s.key,
    label: s.label,
    sessions: reached[i],
    ofTop: rate(reached[i], reached[0]),
    fromPrevious: i === 0 ? 1 : rate(reached[i], reached[i - 1]),
    dropped: i === 0 ? 0 : reached[i - 1] - reached[i],
  }))
}

// ─── Totals ─────────────────────────────────────────────────────────────────

export interface Totals {
  /** Every visit, wherever it landed. */
  visits: number
  landing: number
  started: number
  finished: number
  results: number
  checkout: number
  purchased: number
  /** Money from quiz-driven purchases, pence. */
  revenuePence: number
  /** Every purchase, the shop's own included — context for `purchased`. */
  allPurchases: number
  shopVisits: number
  /** started ÷ landing. */
  startRate: number
  /** finished ÷ started. */
  finishRate: number
  /** purchased ÷ started. */
  conversion: number
  /** Median time to finish the quiz, seconds. */
  medianQuizSeconds: number | null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** A finished quiz's time, seconds — finishers only, and a run of zero is a broken clock, not a fast reader. */
const quizSeconds = (r: SessionRow) => (r.quiz_ms && r.quiz_ms > 0 && furthestStage(r) >= 2 ? r.quiz_ms / 1000 : null)

export function totalsOf(rows: SessionRow[]): Totals {
  const f = funnelOf(rows)
  const at = (k: StageKey) => f.find((s) => s.key === k)!.sessions
  let revenuePence = 0
  let allPurchases = 0
  let shopVisits = 0
  const times: number[] = []
  for (const r of rows) {
    if (r.purchase_at) {
      allPurchases++
      if (r.quiz_start_at) revenuePence += r.purchase_pence ?? 0
    }
    if (r.shop_at) shopVisits++
    const s = quizSeconds(r)
    if (s !== null) times.push(s)
  }
  return {
    visits: rows.length,
    landing: at('landing'),
    started: at('started'),
    finished: at('finished'),
    results: at('results'),
    checkout: at('checkout'),
    purchased: at('purchased'),
    revenuePence,
    allPurchases,
    shopVisits,
    startRate: rate(at('started'), at('landing')),
    finishRate: rate(at('finished'), at('started')),
    conversion: rate(at('purchased'), at('started')),
    medianQuizSeconds: median(times),
  }
}

// ─── Trend ──────────────────────────────────────────────────────────────────

export interface SeriesPoint extends BucketSpan {
  visits: number
  landing: number
  started: number
  finished: number
  purchased: number
}

function seriesOf(rows: SessionRow[], range: ResolvedRange): SeriesPoint[] {
  if (range.from === null) return []
  const buckets = listBuckets(range.from, range.to, range.bucket)
  const byKey = new Map<string, SeriesPoint>(
    buckets.map((b) => [b.key, { ...b, visits: 0, landing: 0, started: 0, finished: 0, purchased: 0 }]),
  )
  for (const r of rows) {
    const point = byKey.get(bucketKey(Date.parse(r.first_seen), range.bucket))
    if (!point) continue
    point.visits++
    const f = furthestStage(r)
    if (f >= 0) point.landing++
    if (f >= 1) point.started++
    if (f >= 2) point.finished++
    if (f >= 5) point.purchased++
  }
  return [...byKey.values()]
}

// ─── Time on the quiz ───────────────────────────────────────────────────────

export interface Timing {
  finishers: number
  medianSeconds: number | null
  p25Seconds: number | null
  p75Seconds: number | null
  histogram: { label: string; count: number }[]
  /** Started and left without finishing, with a leave time recorded. */
  leavers: number
  /** How long the leavers stayed before going, median seconds. */
  medianLeaveSeconds: number | null
  /** First beacon to last, for visits that did more than one thing. */
  medianVisitSeconds: number | null
}

const HISTOGRAM: { label: string; under: number }[] = [
  { label: 'Under 1 min', under: 60 },
  { label: '1–2 min', under: 120 },
  { label: '2–3 min', under: 180 },
  { label: '3–5 min', under: 300 },
  { label: '5–10 min', under: 600 },
  { label: '10 min +', under: Infinity },
]

function timingOf(rows: SessionRow[]): Timing {
  const times: number[] = []
  const leaves: number[] = []
  const visits: number[] = []
  for (const r of rows) {
    const s = quizSeconds(r)
    if (s !== null) times.push(s)
    if (furthestStage(r) === 1 && r.abandon_ms && r.abandon_ms > 0) leaves.push(r.abandon_ms / 1000)
    if (r.events > 1) {
      const span = (Date.parse(r.last_seen) - Date.parse(r.first_seen)) / 1000
      if (span > 0) visits.push(span)
    }
  }
  const sorted = [...times].sort((a, b) => a - b)
  return {
    finishers: times.length,
    medianSeconds: median(times),
    p25Seconds: quantile(sorted, 0.25),
    p75Seconds: quantile(sorted, 0.75),
    histogram: HISTOGRAM.map((b, i) => ({
      label: b.label,
      count: times.filter((t) => t < b.under && (i === 0 || t >= HISTOGRAM[i - 1].under)).length,
    })),
    leavers: leaves.length,
    medianLeaveSeconds: median(leaves),
    medianVisitSeconds: median(visits),
  }
}

// ─── Where the leavers stopped ──────────────────────────────────────────────

export interface LeftAt {
  stepId: string
  label: string
  sessions: number
  /** Share of everyone who started and did not finish (0–1). */
  share: number
}

function leftAtOf(rows: SessionRow[], labelFor: (id: string) => string): { total: number; steps: LeftAt[] } {
  const counts = new Map<string, number>()
  let total = 0
  for (const r of rows) {
    if (furthestStage(r) !== 1) continue
    total++
    const id = r.last_step ?? '(before the first question)'
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return {
    total,
    steps: [...counts.entries()]
      .map(([stepId, sessions]) => ({ stepId, label: labelFor(stepId), sessions, share: rate(sessions, total) }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 12),
  }
}

// ─── Segments ───────────────────────────────────────────────────────────────

export const DIMENSIONS = {
  device: { label: 'Device', base: 'visits' },
  os: { label: 'Operating system', base: 'visits' },
  browser: { label: 'Browser', base: 'visits' },
  channel: { label: 'Channel', base: 'visits' },
  source: { label: 'Source', base: 'visits' },
  campaign: { label: 'Campaign or partner code', base: 'visits' },
  country: { label: 'Country', base: 'visits' },
  landing_path: { label: 'First page', base: 'visits' },
  age_bracket: { label: 'Age', base: 'starters' },
  gender: { label: 'Sex', base: 'starters' },
  track: { label: 'Track', base: 'starters' },
  primary_goal: { label: 'Main goal', base: 'finishers' },
  arm: { label: 'Quiz version', base: 'starters' },
  door: { label: 'Front door', base: 'starters' },
  weekday: { label: 'Day of the week', base: 'visits' },
  hour: { label: 'Time of day', base: 'visits' },
} as const

export type DimensionKey = keyof typeof DIMENSIONS
export type SegmentBase = (typeof DIMENSIONS)[DimensionKey]['base']

export function isDimensionKey(v: unknown): v is DimensionKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(DIMENSIONS, v)
}

/** A segment's value for one visit. Null is "not recorded". */
export function valueOf(r: SessionRow, dim: DimensionKey): string | null {
  if (dim === 'weekday' || dim === 'hour') {
    const c = civil(Date.parse(r.first_seen))
    return dim === 'hour' ? String(c.h) : String(weekdayOf(c.y, c.m, c.d))
  }
  // The arm is the quiz's experiment; a consult run was in neither arm. A
  // quiz run with no arm predates the experiment, which makes it the original.
  if (dim === 'arm') return r.door === 'consult' || !r.quiz_start_at ? null : r.arm ?? 'v1'
  // A visit whose source was recorded and carried no campaign has "none", which
  // is an answer; only a visit from before recording has no answer at all.
  if (dim === 'campaign') return r.campaign ?? (r.source !== null ? NONE : null)
  // Every shared card has its own link; together they are one way in.
  if (dim === 'landing_path' && r.landing_path?.startsWith('/s/')) return '/s/*'
  return r[dim] ?? null
}

/** Values whose order means something, drawn in that order rather than by size. */
const FIXED_ORDER: Partial<Record<DimensionKey, string[]>> = {
  device: ['mobile', 'tablet', 'desktop'],
  age_bracket: ['16-24', '25-34', '35-44', '45+', 'unspecified'],
  weekday: ['0', '1', '2', '3', '4', '5', '6'],
  hour: Array.from({ length: 24 }, (_, h) => String(h)),
}

const LABELS: Partial<Record<DimensionKey, Record<string, string>>> = {
  device: { mobile: 'Phone', tablet: 'Tablet', desktop: 'Computer' },
  age_bracket: { unspecified: 'Skipped' },
  gender: { male: 'Male', female: 'Female', nonbinary: 'Non-binary', 'not-specified': 'Prefer not to say', unspecified: 'Skipped' },
  track: { performance: 'Performance', wellbeing: 'Wellbeing' },
  arm: { v1: 'Original quiz', v2: 'Adaptive quiz' },
  door: { quiz: 'Quiz', consult: 'Amp Consult' },
  landing_path: { '/': 'Home page (the quiz)', '/s/*': 'A shared stack card', '/shop': 'Shop' },
  weekday: Object.fromEntries(WEEKDAYS.map((d, i) => [String(i), d])),
  hour: Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h), `${pad(h)}:00`])),
}

let regionNames: Intl.DisplayNames | null = null
function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(['en-GB'], { type: 'region' })
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}

const humanise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, ' ')

export function labelOf(dim: DimensionKey, value: string | null): string {
  if (value === null) return 'Not recorded'
  if (value === OTHER) return 'Everything else'
  if (value === NONE) return 'No campaign or code'
  const fixed = LABELS[dim]?.[value]
  if (fixed) return fixed
  if (dim === 'country') return countryName(value)
  if (dim === 'primary_goal') return humanise(value)
  return value
}

export const OTHER = '__other__'
/** "Recorded, and there was none" — as opposed to null, "not recorded". */
export const NONE = '__none__'
/** How many rows a breakdown shows before folding the rest into "Everything else". */
const TOP = 10

export interface SegmentRow {
  /** Null is "not recorded"; `OTHER` is the folded tail. */
  value: string | null
  label: string
  visits: number
  started: number
  finished: number
  purchased: number
  revenuePence: number
  /** Share of the breakdown's base (0–1). */
  share: number
  /** started ÷ visits. */
  startRate: number
  /** finished ÷ started. */
  finishRate: number
  /** purchased ÷ started. */
  conversion: number
}

export interface Segment {
  key: DimensionKey
  label: string
  /** Who the breakdown is of: every visit, everyone who started, or everyone who finished. */
  base: SegmentBase
  /** How many of the base this breakdown covers. */
  total: number
  /** Base visits with no value — before it was recorded, or before they answered. Left out of `rows` for quiz answers. */
  unknown: number
  rows: SegmentRow[]
}

function segmentOf(rows: SessionRow[], dim: DimensionKey): Segment {
  const { label, base } = DIMENSIONS[dim]
  const inBase = rows.filter((r) => {
    const f = furthestStage(r)
    return base === 'visits' ? true : base === 'starters' ? f >= 1 : f >= 2
  })

  const groups = new Map<string | null, SegmentRow>()
  let unknown = 0
  for (const r of inBase) {
    const value = valueOf(r, dim)
    if (value === null) {
      unknown++
      // A quiz answer nobody has given is not a segment; a device we did not
      // record yet is, because it is part of the traffic the page is counting.
      if (base !== 'visits') continue
    }
    let row = groups.get(value)
    if (!row) {
      row = { value, label: labelOf(dim, value), visits: 0, started: 0, finished: 0, purchased: 0, revenuePence: 0, share: 0, startRate: 0, finishRate: 0, conversion: 0 }
      groups.set(value, row)
    }
    const f = furthestStage(r)
    row.visits++
    if (f >= 1) row.started++
    if (f >= 2) row.finished++
    if (f >= 5) {
      row.purchased++
      row.revenuePence += r.purchase_pence ?? 0
    }
  }

  const order = FIXED_ORDER[dim]
  let list = [...groups.values()]
  if (order) {
    // Every position shows, a zero included: a gap at 3am is the answer.
    const byValue = new Map(list.map((r) => [r.value, r]))
    list = [
      ...order
        .filter((v) => byValue.has(v) || dim === 'hour' || dim === 'weekday')
        .map((v) => byValue.get(v) ?? { value: v, label: labelOf(dim, v), visits: 0, started: 0, finished: 0, purchased: 0, revenuePence: 0, share: 0, startRate: 0, finishRate: 0, conversion: 0 }),
      ...list.filter((r) => r.value === null || !order.includes(r.value)).sort((a, b) => b.visits - a.visits),
    ]
  } else {
    list.sort((a, b) => b.visits - a.visits || a.label.localeCompare(b.label))
    if (list.length > TOP + 1) {
      const tail = list.slice(TOP)
      const other: SegmentRow = {
        value: OTHER, label: labelOf(dim, OTHER), share: 0, startRate: 0, finishRate: 0, conversion: 0,
        visits: tail.reduce((s, r) => s + r.visits, 0),
        started: tail.reduce((s, r) => s + r.started, 0),
        finished: tail.reduce((s, r) => s + r.finished, 0),
        purchased: tail.reduce((s, r) => s + r.purchased, 0),
        revenuePence: tail.reduce((s, r) => s + r.revenuePence, 0),
      }
      list = [...list.slice(0, TOP), other]
    }
  }

  const total = list.reduce((s, r) => s + r.visits, 0)
  for (const r of list) {
    r.share = rate(r.visits, total)
    r.startRate = rate(r.started, r.visits)
    r.finishRate = rate(r.finished, r.started)
    r.conversion = rate(r.purchased, r.started)
  }

  return { key: dim, label, base, total, unknown, rows: list }
}

// ─── Filters ────────────────────────────────────────────────────────────────

/** "Only visits where this dimension had this value." Null value = not recorded. */
export interface SegmentFilter {
  dim: DimensionKey
  value: string | null
}

/** The URL form, `device:mobile`; an empty value is "not recorded". */
export function parseFilter(raw: string): SegmentFilter | null {
  const i = raw.indexOf(':')
  if (i <= 0) return null
  const dim = raw.slice(0, i)
  if (!isDimensionKey(dim)) return null
  const value = raw.slice(i + 1)
  if (value === OTHER) return null
  return { dim, value: value === '' ? null : value.slice(0, 120) }
}

export function formatFilter(f: SegmentFilter): string {
  return `${f.dim}:${f.value ?? ''}`
}

export function matchesFilters(r: SessionRow, filters: SegmentFilter[]): boolean {
  return filters.every((f) => valueOf(r, f.dim) === f.value)
}

/** Whether a visit is in the report: the founders' own left out unless asked for, then the filters. */
export function keepRow(r: SessionRow, filters: SegmentFilter[], includeInternal: boolean): boolean {
  return (includeInternal || !r.internal) && matchesFilters(r, filters)
}

// ─── The report ─────────────────────────────────────────────────────────────

export interface Report {
  range: { key: RangeKey; from: string | null; to: string; bucket: Bucket; previousFrom: string | null; previousTo: string | null }
  filters: (SegmentFilter & { label: string; dimLabel: string })[]
  totals: Totals
  previous: Totals | null
  series: SeriesPoint[]
  funnel: FunnelStage[]
  timing: Timing
  leftAt: { total: number; steps: LeftAt[] }
  segments: Segment[]
  /** Visits from a browser signed in to the hub, in this window — counted or not. */
  internalVisits: number
  includeInternal: boolean
  /** The first visit on record with a device: before it, device, source and country read "Not recorded". */
  contextSince: string | null
  /** Visits in this report from before then — the ones those breakdowns cannot place. */
  unrecordedVisits: number
  /** True when the read reached its cap — the figures are then the most recent visits only. */
  capped: boolean
}

export function buildReport(input: {
  rows: SessionRow[]
  previousRows: SessionRow[] | null
  range: ResolvedRange
  filters?: SegmentFilter[]
  includeInternal?: boolean
  labelForStep?: (id: string) => string
  capped?: boolean
  /** When device and source recording began, across all visits — not just this window's. */
  contextSince?: string | null
}): Report {
  const filters = input.filters ?? []
  const includeInternal = input.includeInternal ?? false
  const keep = (r: SessionRow) => keepRow(r, filters, includeInternal)

  const rows = input.rows.filter(keep)
  const previousRows = input.previousRows?.filter(keep) ?? null

  const { range } = input
  return {
    range: {
      key: range.key,
      from: range.from === null ? null : new Date(range.from).toISOString(),
      to: new Date(range.to).toISOString(),
      bucket: range.bucket,
      previousFrom: range.previous ? new Date(range.previous.from).toISOString() : null,
      previousTo: range.previous ? new Date(range.previous.to).toISOString() : null,
    },
    filters: filters.map((f) => ({ ...f, label: labelOf(f.dim, f.value), dimLabel: DIMENSIONS[f.dim].label })),
    totals: totalsOf(rows),
    previous: previousRows ? totalsOf(previousRows) : null,
    series: seriesOf(rows, range),
    funnel: funnelOf(rows),
    timing: timingOf(rows),
    leftAt: leftAtOf(rows, input.labelForStep ?? ((id) => id)),
    segments: (Object.keys(DIMENSIONS) as DimensionKey[]).map((d) => segmentOf(rows, d)),
    internalVisits: input.rows.filter((r) => r.internal).length,
    includeInternal,
    contextSince: input.contextSince ?? null,
    unrecordedVisits: rows.filter((r) => r.device === null).length,
    capped: input.capped ?? false,
  }
}
