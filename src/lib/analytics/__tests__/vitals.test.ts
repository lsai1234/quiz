import { areaOf, percentile, rate, vitalsReport } from '../vitals'
import type { StoredEvent } from '../repo'

/** Speed on real devices (plan Phase 7.1): the hub's figures, from the stored events. */
let n = 0
const ev = (event: string, props: Record<string, unknown>, path = '/quizv2'): StoredEvent =>
  ({ id: `e${n++}`, sessionId: `s${n}`, event, props, path, at: '2026-10-28T00:00:00Z' }) as unknown as StoredEvent

describe('vitalsReport', () => {
  it('takes the p75 of each metric by device, with the share rated good', () => {
    const lcp = [1200, 1800, 2200, 3000].map((value) => ev('web_vital', { metric: 'LCP', value, device: 'mobile' }))
    const r = vitalsReport([...lcp, ev('web_vital', { metric: 'INP', value: 90, device: 'desktop' })])
    const phone = r.rows.find((x) => x.device === 'mobile')!
    expect(phone.vitals.LCP).toEqual({ samples: 4, p75: 2200, good: 0.75, rating: 'good' })
    expect(phone.vitals.INP.samples).toBe(0)
    expect(r.rows.find((x) => x.device === 'desktop')!.vitals.INP.p75).toBe(90)
    expect(r.rows.map((x) => x.device)).toEqual(['mobile', 'desktop'])
  })

  it('summarises long frames per page: median count, p75 worst and blocking', () => {
    const r = vitalsReport([1, 4, 9].map((count, i) => ev('long_frames', { count, worstMs: 60 + i * 50, blockingMs: i * 20, device: 'mobile' })))
    expect(r.rows[0].frames).toEqual({ pages: 3, perPage: 4, p75WorstMs: 160, p75BlockingMs: 40 })
  })

  it('reads each part of the site on its own, and ignores what it can’t read', () => {
    const events = [
      ev('web_vital', { metric: 'CLS', value: 0.3, device: 'tablet' }, '/shop'),
      ev('web_vital', { metric: 'CLS', value: 0.01, device: 'tablet' }, '/quizv2'),
      ev('web_vital', { metric: 'FID', value: 10, device: 'tablet' }),
      ev('web_vital', { metric: 'LCP', value: -1, device: 'tablet' }),
      ev('web_vital', { metric: 'LCP', value: 900 }),
    ]
    expect(vitalsReport(events, 'shop').rows[0].vitals.CLS).toMatchObject({ p75: 0.3, rating: 'poor' })
    expect(vitalsReport(events, 'consult').rows.find((r) => r.device === 'tablet')!.vitals.CLS.p75).toBe(0.01)
    expect(vitalsReport(events, 'consult').rows.find((r) => r.device === 'unknown')!.vitals.LCP.p75).toBe(900)
    expect(vitalsReport(events, 'quiz').rows).toEqual([])
  })
})

describe('the pieces', () => {
  it('rates against web.dev’s thresholds', () => {
    expect([rate('LCP', 2500), rate('LCP', 2501), rate('LCP', 4001)]).toEqual(['good', 'needs-improvement', 'poor'])
    expect([rate('INP', 200), rate('INP', 500), rate('CLS', 0.26)]).toEqual(['good', 'needs-improvement', 'poor'])
  })

  it('names the part of the site from the path', () => {
    expect(['/quizv2', '/consult', '/', '/shop/x', '/product/y', '/myhub', null].map(areaOf)).toEqual(['consult', 'consult', 'quiz', 'shop', 'shop', 'other', 'other'])
  })

  it('takes a nearest-rank percentile', () => {
    expect(percentile([], 75)).toBeNull()
    expect(percentile([5], 75)).toBe(5)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8], 75)).toBe(6)
  })
})
