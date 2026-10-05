/**
 * @jest-environment node
 */
import { getEngine } from '@/lib/db/engine'
import { kvDelete } from '@/lib/db/kv'
import type { EventProps } from '../events'
import { recordEvent } from '../repo'
import {
  applyPatch,
  backfillSessions,
  listSessions,
  patchFromEvent,
  recordSessionEvent,
  type SessionRow,
} from '../sessions'

/**
 * One row per visit, folded from its events as they arrive.
 *
 * The pin that matters most is the first one: the SQL upsert and the in-memory
 * fold the backfill uses are generated from one merge table, and they must
 * agree whatever order the beacons land in — beacons do not queue politely,
 * and a visit whose row depends on arrival order is a visit counted wrong.
 */

const T = (min: number) => new Date(Date.UTC(2026, 9, 1, 12, min)).toISOString()

const JOURNEY: { event: string; props: EventProps; path: string; at: string }[] = [
  { event: 'page_view', props: { arm: 'v1' }, path: '/', at: T(0) },
  { event: 'quiz_start', props: { arm: 'v1' }, path: '/', at: T(1) },
  { event: 'quiz_step_view', props: { arm: 'v2', stepId: 'goals', index: 0 }, path: '/', at: T(1) },
  { event: 'quiz_step_view', props: { arm: 'v2', stepId: 'personal', index: 2, track: 'performance' }, path: '/', at: T(2) },
  { event: 'quiz_profile', props: { arm: 'v2', ageBracket: '25-34', gender: 'female' }, path: '/', at: T(2) },
  { event: 'quiz_complete', props: { arm: 'v2', msTotal: 154_000, primaryGoal: 'muscle' }, path: '/', at: T(4) },
  { event: 'stack_reveal_view', props: { arm: 'v2' }, path: '/', at: T(5) },
  { event: 'checkout_start', props: { arm: 'v2', source: 'quiz' }, path: '/', at: T(7) },
  { event: 'purchase', props: { arm: 'v2', value: 39.99, journey_variant: 'quiz_subscription' }, path: '/order/confirmation', at: T(9) },
]

const CTX = { land: '/', utm_source: 'instagram', utm_medium: 'paid' }
const DEVICE = { device: 'mobile' as const, os: 'iOS', browser: 'Instagram app', bot: false }

function patches(list = JOURNEY) {
  return list.map((e) => patchFromEvent({ ...e, ctx: CTX, device: DEVICE, country: 'gb' }))
}

async function reset() {
  const db = await getEngine()
  await db.run('DELETE FROM analytics_sessions')
  await db.run('DELETE FROM analytics_events')
  await kvDelete('analytics:sessions:backfill')
}

beforeEach(reset)

describe('patchFromEvent + applyPatch', () => {
  it('folds a whole journey into one row', () => {
    const row = patches().reduce<SessionRow | undefined>((r, p) => applyPatch(r, 's1', p), undefined)!
    expect(row).toMatchObject({
      session_id: 's1',
      first_seen: T(0),
      last_seen: T(9),
      events: 9,
      internal: 0,
      landing_path: '/',
      source: 'Instagram',
      channel: 'Paid',
      device: 'mobile',
      os: 'iOS',
      browser: 'Instagram app',
      country: 'GB',
      arm: 'v2',
      door: 'quiz',
      landing_at: T(0),
      quiz_start_at: T(1),
      quiz_done_at: T(4),
      results_at: T(5),
      checkout_at: T(7),
      purchase_at: T(9),
      purchase_pence: 3999,
      subscribed: 1,
      quiz_ms: 154_000,
      last_step: 'personal',
      steps_seen: 3,
      age_bracket: '25-34',
      gender: 'female',
      track: 'performance',
      primary_goal: 'muscle',
    })
  })

  it('does not let an old client with no context fix the source as "Direct"', () => {
    const p = patchFromEvent({ event: 'page_view', props: {}, path: '/', at: T(0), ctx: {}, device: DEVICE })
    expect('source' in p).toBe(false)
  })

  it('a page view of anything but the home page is not a landing-page view', () => {
    expect(patchFromEvent({ event: 'page_view', props: {}, path: '/shop', at: T(0) }).landing_at).toBeUndefined()
  })
})

describe('the upsert', () => {
  it('agrees with the in-memory fold, whatever order the beacons arrive in', async () => {
    const expected = patches().reduce<SessionRow | undefined>((r, p) => applyPatch(r, 's1', p), undefined)!
    // Reversed, then interleaved: the purchase lands before the page view.
    const shuffled = [...patches()].reverse()
    for (const p of [...shuffled.filter((_, i) => i % 2), ...shuffled.filter((_, i) => !(i % 2))]) {
      await recordSessionEvent('s1', p)
    }
    const [row] = await listSessions(null, T(60))
    // Order-sensitive by design: the "latest" columns take what arrived last.
    const { last_step, quiz_ms, ...stable } = expected
    expect(row).toMatchObject(stable)
    expect(row.first_seen).toBe(T(0))
    expect(row.landing_at).toBe(T(0))
    expect(row.events).toBe(9)
    expect([last_step, 'goals']).toContain(row.last_step)
    expect(quiz_ms).toBe(154_000)
  })

  it('keeps a visit internal once any of it came from a signed-in founder', async () => {
    await recordSessionEvent('s2', patchFromEvent({ event: 'page_view', props: {}, path: '/', at: T(0), internal: true }))
    await recordSessionEvent('s2', patchFromEvent({ event: 'quiz_start', props: {}, path: '/', at: T(1), internal: false }))
    const [row] = await listSessions(null, T(60))
    expect(row.internal).toBe(1)
  })

  it('lists visits by when they began, within the window', async () => {
    await recordSessionEvent('early', patchFromEvent({ event: 'page_view', props: {}, path: '/', at: T(0) }))
    await recordSessionEvent('late', patchFromEvent({ event: 'page_view', props: {}, path: '/', at: T(30) }))
    expect((await listSessions(T(10), T(60))).map((r) => r.session_id)).toEqual(['late'])
    expect((await listSessions(null, T(60))).map((r) => r.session_id)).toEqual(['late', 'early'])
  })
})

describe('backfillSessions', () => {
  async function recordHistory(session: string, list = JOURNEY) {
    for (const e of list) await recordEvent({ event: e.event as never, props: e.props, sessionId: session, path: e.path, at: e.at })
  }

  it('rebuilds visits from events recorded before visits were', async () => {
    await recordHistory('old1')
    await recordHistory('old2', JOURNEY.slice(0, 3))
    expect(await backfillSessions()).toEqual({ done: true, folded: 12 })

    const rows = await listSessions(null, T(60))
    const old1 = rows.find((r) => r.session_id === 'old1')!
    expect(old1).toMatchObject({ events: 9, purchase_pence: 3999, quiz_done_at: T(4), age_bracket: '25-34' })
    // History never recorded the device or the source, and it is not guessed.
    expect(old1.device).toBeNull()
    expect(old1.source).toBeNull()
    expect(rows.find((r) => r.session_id === 'old2')!.events).toBe(3)
  })

  it('never counts an event the live path already folded', async () => {
    await recordHistory('old', JOURNEY.slice(0, 2))
    // A live visit after the deploy: its events are in both tables.
    const live = JOURNEY.slice(0, 3).map((e) => ({ ...e, at: T(40 + JOURNEY.indexOf(e)) }))
    for (const e of live) {
      await recordEvent({ event: e.event as never, props: e.props, sessionId: 'live', path: e.path, at: e.at })
      await recordSessionEvent('live', patchFromEvent(e))
    }
    await backfillSessions()
    const rows = await listSessions(null, T(120))
    expect(rows.find((r) => r.session_id === 'live')!.events).toBe(3)
    expect(rows.find((r) => r.session_id === 'old')!.events).toBe(2)
  })

  it('resumes where it stopped, and a visit split across pages still adds up', async () => {
    await recordHistory('a')
    await recordHistory('b')
    let runs = 0
    let result = { done: false, folded: 0 }
    while (!result.done && runs < 20) {
      result = await backfillSessions({ pageSize: 4, budgetMs: 0 })
      runs++
    }
    expect(result.done).toBe(true)
    expect(runs).toBeGreaterThan(2)
    const rows = await listSessions(null, T(60))
    expect(rows.map((r) => r.events)).toEqual([9, 9])
    expect(rows.every((r) => r.purchase_pence === 3999)).toBe(true)
  })

  it('does nothing while another run holds the lease, so two runs cannot double a visit', async () => {
    await recordHistory('a')
    const [first, second] = await Promise.all([backfillSessions(), backfillSessions()])
    expect([first.folded, second.folded].sort()).toEqual([0, 9])
    const [row] = await listSessions(null, T(60))
    expect(row.events).toBe(9)
    // And once finished it stays finished.
    expect(await backfillSessions()).toEqual({ done: true, folded: 0 })
  })
})
