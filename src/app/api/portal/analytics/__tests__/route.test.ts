/**
 * @jest-environment node
 */
const authed = { value: true }
jest.mock('@/lib/portal/guard', () => ({ isPortalAuthed: async () => authed.value }))

import { GET } from '../route'
import { getEngine } from '@/lib/db/engine'
import { kvDelete } from '@/lib/db/kv'
import { recordSessionEvent, patchFromEvent } from '@/lib/analytics/sessions'
import { recordEvent } from '@/lib/analytics/repo'

/** The hub's Analytics page data: founders only, and every figure drawn from the same visits. */

async function seed(session: string, at: number, device: 'mobile' | 'desktop', events: { event: string; props?: Record<string, string | number> }[]) {
  for (const [i, e] of events.entries()) {
    const iso = new Date(at + i * 1000).toISOString()
    await recordEvent({ event: e.event as never, props: e.props ?? {}, sessionId: session, path: '/', at: iso })
    await recordSessionEvent(
      session,
      patchFromEvent({
        event: e.event, props: e.props ?? {}, path: '/', at: iso,
        ctx: { land: '/' }, device: { device, os: device === 'mobile' ? 'iOS' : 'Windows', browser: 'Safari', bot: false },
      }),
    )
  }
}

beforeEach(async () => {
  authed.value = true
  const db = await getEngine()
  await db.run('DELETE FROM analytics_events')
  await db.run('DELETE FROM analytics_sessions')
  await db.run("DELETE FROM kv WHERE key LIKE 'analytics:%'")
  await kvDelete('analytics:sessions:backfill')
})

const get = (qs: string) => GET(new Request(`http://localhost/api/portal/analytics?${qs}`))

describe('GET /api/portal/analytics', () => {
  it('is founders only', async () => {
    authed.value = false
    expect((await get('range=7d')).status).toBe(401)
  })

  it('reports the visits, the funnel and the question ladder, narrowed by a filter', async () => {
    const now = Date.now() - 60_000
    await seed('a', now, 'mobile', [
      { event: 'page_view' },
      { event: 'quiz_start', props: { arm: 'v1' } },
      { event: 'quiz_step_view', props: { arm: 'v1', stepId: 'goals', index: 0 } },
      { event: 'quiz_step_view', props: { arm: 'v1', stepId: 'safety', index: 1 } },
    ])
    await seed('b', now, 'desktop', [
      { event: 'page_view' },
      { event: 'quiz_start', props: { arm: 'v1' } },
      { event: 'quiz_step_view', props: { arm: 'v1', stepId: 'goals', index: 0 } },
    ])
    await seed('c', now, 'mobile', [{ event: 'page_view' }])

    const all = await (await get('range=7d&fresh=1')).json()
    expect(all.report.totals).toMatchObject({ visits: 3, landing: 3, started: 2 })
    expect(all.importing).toBe(false)
    const ladder = all.ladders.find((l: { arm: string }) => l.arm === 'v1')
    expect(ladder.steps.map((s: { stepId: string; sessions: number; label: string }) => [s.stepId, s.sessions])).toEqual([
      ['goals', 2],
      ['safety', 1],
    ])
    expect(ladder.steps[0].label).toBe("What's the main goal?")

    const phones = await (await get('range=7d&f=device:mobile')).json()
    expect(phones.report.totals).toMatchObject({ visits: 2, started: 1 })
    expect(phones.ladders[0].steps.map((s: { sessions: number }) => s.sessions)).toEqual([1, 1])
  })

  it('falls back to 30 days for a range it does not know, and ignores a bad filter', async () => {
    const body = await (await get('range=forever&f=nonsense:1')).json()
    expect(body.report.range.key).toBe('30d')
    expect(body.report.filters).toEqual([])
  })
})
