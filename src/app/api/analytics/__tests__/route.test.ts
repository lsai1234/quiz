/**
 * @jest-environment node
 */
const authed = { value: false }
jest.mock('@/lib/portal/guard', () => ({ isPortalAuthed: async () => authed.value }))

import { POST } from '../route'
import { getEngine } from '@/lib/db/engine'
import { listSessions } from '@/lib/analytics/sessions'
import { listEventsSince } from '@/lib/analytics/repo'
import { SHARE_EVENTS } from '@/lib/analytics/events'

/**
 * The beacon sink. What it lets in, what it adds, and what it refuses.
 */

const IPHONE_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.29.84'
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

function beacon(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return POST(
    new Request('http://localhost/api/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': IPHONE_INSTAGRAM, ...headers },
      body: JSON.stringify({ session: 'sid-1', path: '/', ts: Date.now(), ...body }),
    }),
  )
}

async function events() {
  const db = await getEngine()
  return db.all<{ event: string; created_at: string; session_id: string }>('SELECT event, created_at, session_id FROM analytics_events')
}

beforeEach(async () => {
  authed.value = false
  const db = await getEngine()
  await db.run('DELETE FROM analytics_events')
  await db.run('DELETE FROM analytics_sessions')
  jest.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('POST /api/analytics: no health data in the table or the logs', () => {
  it('records a circuit stop by its gate, whatever an older client sends', async () => {
    const log = jest.spyOn(console, 'log')
    for (const reason of ['pregnancy', 'kidney-liver', 'circuit', 'declined', 'not-a-gate']) {
      await beacon({ event: 'consult_stop', props: { reason } })
    }
    const db = await getEngine()
    const rows = await db.all<{ props: string }>("SELECT props FROM analytics_events WHERE event = 'consult_stop'")
    const reasons = rows.map((r) => JSON.parse(r.props).reason).sort()
    expect(reasons).toEqual(['circuit', 'circuit', 'circuit', 'declined', 'unknown'])
    expect(JSON.stringify(rows)).not.toMatch(/pregnan|kidney|liver/)
    // And nothing about any event reaches the console.
    expect(log).not.toHaveBeenCalled()
  })

  it('lets the hub’s funnels leave a founder’s own runs out', async () => {
    authed.value = true
    await beacon({ event: 'consult_start', session: 'founder', props: { route: 'deep' } })
    authed.value = false
    await beacon({ event: 'consult_start', session: 'customer', props: { route: 'deep' } })
    const since = new Date(Date.now() - 60_000).toISOString()
    expect((await listEventsSince(since)).map((e) => e.sessionId).sort()).toEqual(['customer', 'founder'])
    expect((await listEventsSince(since, undefined, { excludeInternal: true })).map((e) => e.sessionId)).toEqual(['customer'])
  })
})

describe('POST /api/analytics', () => {
  it('keeps the share funnel, which it used to drop on the floor', async () => {
    for (const event of SHARE_EVENTS) await beacon({ event })
    expect((await events()).map((e) => e.event).sort()).toEqual([...SHARE_EVENTS].sort())
  })

  it('refuses events it does not know', async () => {
    expect((await beacon({ event: 'definitely_not_an_event' })).status).toBe(204)
    expect(await events()).toEqual([])
  })

  it('folds the event into its visit, with the device, the country and the source', async () => {
    await beacon(
      { event: 'page_view', ctx: { land: '/', utm_source: 'instagram', utm_medium: 'paid', utm_campaign: 'launch' } },
      { 'x-vercel-ip-country': 'gb' },
    )
    await beacon({ event: 'quiz_start', path: '/', props: { arm: 'v1' } })
    const [visit] = await listSessions(null, new Date(Date.now() + 60_000).toISOString())
    expect(visit).toMatchObject({
      session_id: 'sid-1',
      events: 2,
      device: 'mobile',
      os: 'iOS',
      browser: 'Instagram app',
      country: 'GB',
      source: 'Instagram',
      channel: 'Paid',
      campaign: 'launch',
      internal: 0,
    })
    expect(visit.landing_at).not.toBeNull()
    expect(visit.quiz_start_at).not.toBeNull()
  })

  it('records nothing at all from a crawler', async () => {
    await beacon({ event: 'page_view' }, { 'user-agent': GOOGLEBOT })
    expect(await events()).toEqual([])
    expect(await listSessions(null, new Date(Date.now() + 60_000).toISOString())).toEqual([])
  })

  it('marks a visit from a browser signed in to the hub as internal', async () => {
    authed.value = true
    await beacon({ event: 'page_view' })
    const [visit] = await listSessions(null, new Date(Date.now() + 60_000).toISOString())
    expect(visit.internal).toBe(1)
  })

  it('does not trust a client clock that is hours out', async () => {
    const before = Date.now()
    await beacon({ event: 'page_view', ts: before - 5 * 3_600_000 })
    const [e] = await events()
    expect(Date.parse(e.created_at)).toBeGreaterThanOrEqual(before - 1000)
  })
})
