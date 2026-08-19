/**
 * @jest-environment node
 */
import { quizFunnel } from '../funnel-cache'
import { recordEvent } from '../repo'
import { getEngine } from '@/lib/db/engine'
import { kvSet } from '@/lib/db/kv'

/**
 * The funnel, computed at most every few minutes.
 *
 * The dashboard used to build it from every event in the window on every view —
 * a read capped at 20,000 rows, each carrying a JSON column, on the hub's front
 * page. What is pinned here is that the cache is a cache: the same answer
 * without the read, a way to force the read, and a stamp saying which it was.
 */
async function countReads<T>(fn: () => Promise<T>): Promise<number> {
  const db = await getEngine()
  const all = db.all.bind(db)
  let reads = 0
  Object.assign(db, { all: (...a: Parameters<typeof all>) => { reads += 1; return all(...a) } })
  try {
    await fn()
    return reads
  } finally {
    Object.assign(db, { all })
  }
}

beforeEach(async () => {
  const db = await getEngine()
  await db.run('DELETE FROM analytics_events')
  await db.run('DELETE FROM kv')
})

it('counts the sessions, and says when it counted them', async () => {
  await recordEvent({ event: 'quiz_start', sessionId: 's1' })
  await recordEvent({ event: 'quiz_start', sessionId: 's2' })
  await recordEvent({ event: 'quiz_complete', sessionId: 's1' })

  const { funnel, asOf } = await quizFunnel(30)
  expect(funnel.started).toBe(2)
  expect(funnel.completed).toBe(1)
  expect(Date.now() - Date.parse(asOf)).toBeLessThan(5_000)
})

it('does not read the events again while the count still stands', async () => {
  await recordEvent({ event: 'quiz_start', sessionId: 's1' })
  const first = await quizFunnel(30)

  await recordEvent({ event: 'quiz_start', sessionId: 's2' })
  const reads = await countReads(() => quizFunnel(30))

  expect(reads).toBe(0)
  const again = await quizFunnel(30)
  expect(again.funnel.started).toBe(1)
  expect(again.asOf).toBe(first.asOf)
})

it('recounts on demand, for somebody who has just run the quiz to see it move', async () => {
  await recordEvent({ event: 'quiz_start', sessionId: 's1' })
  await quizFunnel(30)
  await recordEvent({ event: 'quiz_start', sessionId: 's2' })

  const fresh = await quizFunnel(30, { fresh: true })
  expect(fresh.funnel.started).toBe(2)
  // And the recount is what stands from then on.
  expect((await quizFunnel(30)).funnel.started).toBe(2)
})

it('recomputes rather than serving a stale count', async () => {
  await recordEvent({ event: 'quiz_start', sessionId: 's1' })
  await kvSet('analytics:funnel:30', {
    asOf: new Date(Date.now() - 60 * 60_000).toISOString(),
    funnel: { started: 999 },
  })
  expect((await quizFunnel(30)).funnel.started).toBe(1)
})

it('keeps windows apart, so a 7-day view is not answered with a 30-day count', async () => {
  await recordEvent({ event: 'quiz_start', sessionId: 's1', at: new Date(Date.now() - 20 * 86_400_000).toISOString() })
  expect((await quizFunnel(30)).funnel.started).toBe(1)
  expect((await quizFunnel(7)).funnel.started).toBe(0)
})
