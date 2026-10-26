/**
 * @jest-environment node
 */
/**
 * Thirty days means deleted, not hidden — and old stop events lose the
 * health-derived reason they were recorded with.
 */
import { getEngine } from '@/lib/db/engine'
import { kvGet, kvSet } from '@/lib/db/kv'
import { recordEvent } from '@/lib/analytics/repo'
import { sweepConsultData } from '../retention'

const DAY = 24 * 60 * 60 * 1000

async function ageRow(key: string, daysAgo: number) {
  const db = await getEngine()
  await db.run('UPDATE kv SET updated_at = ? WHERE key = ?', [new Date(Date.now() - daysAgo * DAY).toISOString(), key])
}

it('deletes saved consults past thirty days and keeps the rest', async () => {
  await kvSet('consult:c_old000001', { savedAt: 0 })
  await kvSet('consult:c_new000001', { savedAt: 0 })
  await kvSet('consult-ai-log:2020-01-01', { lines: [] })
  await ageRow('consult:c_old000001', 31)
  await ageRow('consult:c_new000001', 29)
  await ageRow('consult-ai-log:2020-01-01', 400)

  const result = await sweepConsultData()
  expect(result.consultsDeleted).toBe(1)
  expect(await kvGet('consult:c_old000001')).toBeUndefined()
  expect(await kvGet('consult:c_new000001')).toBeDefined()
  // Only saved consults: the AI log has its own rolling window.
  expect(await kvGet('consult-ai-log:2020-01-01')).toBeDefined()
})

it('rewrites old stop events that named pregnancy or a kidney or liver condition', async () => {
  await recordEvent({ event: 'consult_stop', props: { reason: 'pregnancy', arm: 'v1' }, sessionId: 's1' })
  await recordEvent({ event: 'consult_stop', props: { reason: 'kidney-liver' }, sessionId: 's2' })
  await recordEvent({ event: 'consult_stop', props: { reason: 'declined' }, sessionId: 's3' })

  expect((await sweepConsultData()).stopReasonsScrubbed).toBe(2)
  const db = await getEngine()
  const rows = await db.all<{ props: string }>("SELECT props FROM analytics_events WHERE event = 'consult_stop'")
  expect(JSON.stringify(rows)).not.toMatch(/pregnan|kidney/)
  expect(rows.map((r) => JSON.parse(r.props))).toEqual(
    expect.arrayContaining([{ reason: 'circuit', arm: 'v1' }, { reason: 'circuit' }, { reason: 'declined' }]),
  )
  expect((await sweepConsultData()).stopReasonsScrubbed).toBe(0)
})
