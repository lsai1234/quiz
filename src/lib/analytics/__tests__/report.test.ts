import type { SessionRow } from '../sessions'
import {
  buildReport,
  bucketKey,
  furthestStage,
  listBuckets,
  parseFilter,
  resolveRange,
  type ResolvedRange,
} from '../report'

/**
 * The Analytics page's numbers.
 *
 * Most of what is pinned here is that the page agrees with itself: the trend
 * adds up to the total, the funnel only narrows, a breakdown's rows add up to
 * its base. A page whose figures disagree is a page nobody can act on.
 */

const NOW = Date.parse('2026-10-05T15:30:00Z') // 16:30 in London (BST)

let n = 0
function row(over: Partial<SessionRow> = {}): SessionRow {
  n++
  return {
    session_id: `s${n}`,
    first_seen: '2026-10-05T09:00:00.000Z',
    last_seen: '2026-10-05T09:00:00.000Z',
    events: 1,
    internal: 0,
    landing_path: '/',
    source: 'Direct',
    channel: 'Direct',
    campaign: null,
    device: 'mobile',
    os: 'iOS',
    browser: 'Safari',
    country: 'GB',
    arm: 'v1',
    door: null,
    landing_at: '2026-10-05T09:00:00.000Z',
    shop_at: null,
    quiz_start_at: null,
    quiz_done_at: null,
    results_at: null,
    basket_at: null,
    checkout_at: null,
    purchase_at: null,
    purchase_pence: null,
    subscribed: null,
    quiz_ms: null,
    abandon_ms: null,
    last_step: null,
    steps_seen: null,
    age_bracket: null,
    gender: null,
    track: null,
    primary_goal: null,
    ...over,
  }
}

const at = '2026-10-05T09:05:00.000Z'
const started = (over: Partial<SessionRow> = {}) => row({ quiz_start_at: at, door: 'quiz', events: 5, last_seen: '2026-10-05T09:04:00.000Z', ...over })
const finished = (over: Partial<SessionRow> = {}) => started({ quiz_done_at: at, quiz_ms: 150_000, ...over })
const bought = (over: Partial<SessionRow> = {}) =>
  finished({ results_at: at, checkout_at: at, purchase_at: at, purchase_pence: 4000, ...over })

const RANGE: ResolvedRange = resolveRange('7d', NOW, null)

describe('resolveRange', () => {
  it('makes "last 7 days" today and the six London days before it', () => {
    const r = resolveRange('7d', NOW, null)
    // Midnight on 29 Sep in London is 23:00 UTC on the 28th (BST).
    expect(new Date(r.from!).toISOString()).toBe('2026-09-28T23:00:00.000Z')
    expect(r.bucket).toBe('day')
    // Compared with the same stretch of clock a week earlier — not with a
    // whole day against today's half-finished one.
    expect(new Date(r.previous!.from).toISOString()).toBe('2026-09-21T23:00:00.000Z')
    expect(r.previous!.to - r.previous!.from).toBe(r.to - r.from!)
  })

  it('makes 24 hourly buckets for the last 24 hours', () => {
    const r = resolveRange('24h', NOW, null)
    expect(listBuckets(r.from!, r.to, r.bucket)).toHaveLength(24)
  })

  it('sizes "all time" buckets by how long there has been data', () => {
    expect(resolveRange('all', NOW, NOW - 3 * 86_400_000).bucket).toBe('day')
    expect(resolveRange('all', NOW, NOW - 200 * 86_400_000).bucket).toBe('week')
    expect(resolveRange('all', NOW, NOW - 600 * 86_400_000).bucket).toBe('month')
    expect(resolveRange('all', NOW, null).from).toBeNull()
  })
})

describe('buckets', () => {
  it('lists every day in the range, empty ones included', () => {
    expect(listBuckets(RANGE.from!, RANGE.to, 'day').map((b) => b.key)).toEqual([
      '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
    ])
  })

  it('files a late-evening visit under the London day, not the UTC one', () => {
    // 23:30 UTC on 4 Oct is 00:30 on 5 Oct in London.
    expect(bucketKey(Date.parse('2026-10-04T23:30:00Z'), 'day')).toBe('2026-10-05')
    // In winter London is on UTC.
    expect(bucketKey(Date.parse('2026-12-04T23:30:00Z'), 'day')).toBe('2026-12-04')
  })

  it('survives the clocks going back', () => {
    // 25 Oct 2026 is a 25-hour day in London.
    const from = Date.parse('2026-10-23T23:00:00Z')
    const to = Date.parse('2026-10-27T12:00:00Z')
    expect(listBuckets(from, to, 'day').map((b) => b.key)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
  })

  it('starts weeks on a Monday', () => {
    expect(bucketKey(Date.parse('2026-10-04T12:00:00Z'), 'week')).toBe('2026-09-28')
    expect(bucketKey(Date.parse('2026-10-05T12:00:00Z'), 'week')).toBe('2026-10-05')
  })
})

describe('the funnel', () => {
  it('counts a visit at its furthest stage and every stage before it', () => {
    expect(furthestStage(row())).toBe(0)
    expect(furthestStage(bought())).toBe(5)
    // A lost "saw their stack" beacon does not make the funnel widen again.
    expect(furthestStage(started({ checkout_at: at }))).toBe(4)
  })

  it('leaves shop-only visits out of the quiz funnel, but not out of the visits', () => {
    const report = buildReport({
      rows: [row({ landing_at: null, landing_path: '/shop', shop_at: at, purchase_at: at, purchase_pence: 2500 }), bought()],
      previousRows: null,
      range: RANGE,
    })
    expect(report.totals.visits).toBe(2)
    expect(report.totals.purchased).toBe(1)
    expect(report.totals.allPurchases).toBe(2)
    expect(report.totals.revenuePence).toBe(4000)
    expect(report.funnel[0].sessions).toBe(1)
  })

  it('only ever narrows, and says how many it lost at each step', () => {
    const rows = [row(), row(), row(), started(), started(), finished(), bought()]
    const f = buildReport({ rows, previousRows: null, range: RANGE }).funnel
    expect(f.map((s) => s.sessions)).toEqual([7, 4, 2, 1, 1, 1])
    expect(f.map((s) => s.dropped)).toEqual([0, 3, 2, 1, 0, 0])
    expect(f[1].fromPrevious).toBeCloseTo(4 / 7)
    for (let i = 1; i < f.length; i++) expect(f[i].sessions).toBeLessThanOrEqual(f[i - 1].sessions)
  })

  it('counts a quiz start with no landing beacon as having landed', () => {
    // History from before page views were recorded.
    const f = buildReport({ rows: [started({ landing_at: null })], previousRows: null, range: RANGE }).funnel
    expect(f[0].sessions).toBe(1)
  })
})

describe('the report', () => {
  const rows = [
    row({ first_seen: '2026-10-01T10:00:00.000Z' }),
    started({ first_seen: '2026-10-01T11:00:00.000Z', device: 'desktop', os: 'Windows', browser: 'Chrome', abandon_ms: 40_000, last_step: 'personal' }),
    finished({ first_seen: '2026-10-03T10:00:00.000Z', age_bracket: '25-34', gender: 'female', quiz_ms: 95_000 }),
    bought({ first_seen: '2026-10-05T10:00:00.000Z', age_bracket: '25-34', gender: 'male', browser: 'Instagram app', source: 'Instagram', channel: 'Social' }),
    row({ first_seen: '2026-10-05T11:00:00.000Z', internal: 1 }),
  ]
  const report = buildReport({ rows, previousRows: [row(), started()], range: RANGE, labelForStep: (id) => `Q:${id}` })

  it('leaves the founders’ own visits out unless asked, and says how many there were', () => {
    expect(report.totals.visits).toBe(4)
    expect(report.internalVisits).toBe(1)
    expect(buildReport({ rows, previousRows: null, range: RANGE, includeInternal: true }).totals.visits).toBe(5)
  })

  it('has a trend that adds up to the totals', () => {
    const sum = (k: 'visits' | 'started' | 'finished' | 'purchased') => report.series.reduce((s, p) => s + p[k], 0)
    expect(report.series).toHaveLength(7)
    expect(sum('visits')).toBe(report.totals.visits)
    expect(sum('started')).toBe(report.totals.started)
    expect(sum('finished')).toBe(report.totals.finished)
    expect(sum('purchased')).toBe(report.totals.purchased)
    expect(report.series.find((p) => p.key === '2026-10-01')!.visits).toBe(2)
  })

  it('compares with the period before', () => {
    expect(report.previous).toMatchObject({ visits: 2, started: 1 })
  })

  it('times the quiz from finishers, and the leavers separately', () => {
    expect(report.timing.finishers).toBe(2)
    expect(report.timing.medianSeconds).toBe((95 + 150) / 2)
    expect(report.timing.histogram.find((b) => b.label === '1–2 min')!.count).toBe(1)
    expect(report.timing.histogram.find((b) => b.label === '2–3 min')!.count).toBe(1)
    expect(report.timing.leavers).toBe(1)
    expect(report.timing.medianLeaveSeconds).toBe(40)
    expect(report.totals.medianQuizSeconds).toBe(122.5)
  })

  it('says where the leavers stopped, by the question’s name', () => {
    expect(report.leftAt).toEqual({ total: 1, steps: [{ stepId: 'personal', label: 'Q:personal', sessions: 1, share: 1 }] })
  })

  it('breaks visits down by device, with rates per segment and rows that add up', () => {
    const device = report.segments.find((s) => s.key === 'device')!
    expect(device.rows.map((r) => [r.label, r.visits, r.started])).toEqual([
      ['Phone', 3, 2],
      ['Computer', 1, 1],
    ])
    expect(device.rows.reduce((s, r) => s + r.visits, 0)).toBe(report.totals.visits)
    expect(device.rows[0].conversion).toBeCloseTo(1 / 2)
  })

  it('breaks quiz answers down among the people who gave them', () => {
    const age = report.segments.find((s) => s.key === 'age_bracket')!
    expect(age.base).toBe('starters')
    expect(age.rows).toHaveLength(1)
    expect(age.rows[0]).toMatchObject({ label: '25-34', visits: 2, finished: 2, purchased: 1 })
    // The starter who left before the "about you" screen.
    expect(age.unknown).toBe(1)
  })

  it('shows every hour of the day, a quiet one included', () => {
    const hour = report.segments.find((s) => s.key === 'hour')!
    expect(hour.rows).toHaveLength(24)
    // 10:00 UTC is 11:00 in London in October.
    expect(hour.rows.find((r) => r.label === '11:00')!.visits).toBe(3)
  })

  it('folds a long tail into "Everything else"', () => {
    const many = Array.from({ length: 15 }, (_, i) => row({ source: `site${i}.com` }))
    const source = buildReport({ rows: many, previousRows: null, range: RANGE }).segments.find((s) => s.key === 'source')!
    expect(source.rows).toHaveLength(11)
    expect(source.rows[10]).toMatchObject({ label: 'Everything else', visits: 5 })
  })

  it('narrows every figure to a segment', () => {
    const phones = buildReport({ rows, previousRows: null, range: RANGE, filters: [{ dim: 'device', value: 'mobile' }] })
    expect(phones.totals.visits).toBe(3)
    expect(phones.filters[0]).toMatchObject({ label: 'Phone', dimLabel: 'Device' })
    const unrecorded = buildReport({ rows: [row({ device: null }), row()], previousRows: null, range: RANGE, filters: [{ dim: 'device', value: null }] })
    expect(unrecorded.totals.visits).toBe(1)
  })
})

describe('parseFilter', () => {
  it('reads dimension:value, with an empty value meaning "not recorded"', () => {
    expect(parseFilter('device:mobile')).toEqual({ dim: 'device', value: 'mobile' })
    expect(parseFilter('country:')).toEqual({ dim: 'country', value: null })
    expect(parseFilter('nonsense:1')).toBeNull()
    expect(parseFilter('device')).toBeNull()
    expect(parseFilter('source:__other__')).toBeNull()
  })
})
