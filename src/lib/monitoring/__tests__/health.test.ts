/**
 * @jest-environment node
 */
import { getEngine } from '@/lib/db/engine'
import { kvDelete } from '@/lib/db/kv'
import { CRON_HEARTBEAT_KEY, overallStatus, recordCronHeartbeat, runHealthChecks } from '../health'
import type { HealthCheck } from '../health'

/**
 * The health checks exist for failures that never throw. Each test below sets up
 * a database that looks exactly like one of those failures and asserts the check
 * notices — because the whole class of bug here is "everything looks fine".
 */

const find = (checks: HealthCheck[], id: string) => checks.find((c) => c.id === id)!

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
const HOUR = 3_600_000

beforeEach(async () => {
  const db = await getEngine()
  await db.run('DELETE FROM orders')
  await db.run('DELETE FROM notifications')
  await db.run('DELETE FROM error_events')
  await db.run('DELETE FROM error_groups')
  await kvDelete(CRON_HEARTBEAT_KEY)
})

async function seedOrder(id: string, status: string, createdAt: string) {
  const db = await getEngine()
  await db.run(
    `INSERT INTO orders (id, user_id, email, channel, status, data, stripe_session_id,
       stripe_payment_id, supplier_order_id, partner_code, mode, created_at, updated_at)
     VALUES (?, NULL, 'a@b.c', 'shop', ?, '{}', NULL, NULL, NULL, NULL, 'sandbox', ?, ?)`,
    [id, status, createdAt, createdAt],
  )
}

describe('stuck checkouts — the broken-webhook signature', () => {
  it('ignores a checkout someone is still in the middle of', async () => {
    await seedOrder('fresh', 'pending_payment', iso(10 * 60_000))
    expect(find(await runHealthChecks(), 'stuck-checkouts').status).toBe('ok')
  })

  it('warns on one order stranded past the grace period', async () => {
    await seedOrder('stranded', 'pending_payment', iso(6 * HOUR))
    expect(find(await runHealthChecks(), 'stuck-checkouts').status).toBe('warn')
  })

  it('escalates when several strand at once, which is a webhook fault not an abandoned basket', async () => {
    for (const id of ['a', 'b', 'c']) await seedOrder(id, 'pending_payment', iso(6 * HOUR))
    const check = find(await runHealthChecks(), 'stuck-checkouts')
    expect(check.status).toBe('fail')
    expect(check.detail).toMatch(/webhook/i)
  })

  it('does not count orders that completed normally', async () => {
    for (const id of ['p1', 'p2', 'p3']) await seedOrder(id, 'paid', iso(6 * HOUR))
    expect(find(await runHealthChecks(), 'stuck-checkouts').status).toBe('ok')
  })
})

describe('the daily job', () => {
  it('reports a job that has never run', async () => {
    expect(find(await runHealthChecks(), 'cron').status).toBe('warn')
  })

  it('is happy with a recent successful run', async () => {
    await recordCronHeartbeat({ at: iso(2 * HOUR), ok: true })
    expect(find(await runHealthChecks(), 'cron').status).toBe('ok')
  })

  it('fails when the schedule has silently stopped', async () => {
    await recordCronHeartbeat({ at: iso(72 * HOUR), ok: true })
    const check = find(await runHealthChecks(), 'cron')
    expect(check.status).toBe('fail')
    expect(check.detail).toMatch(/subscriptions stop advancing/i)
  })

  it('distinguishes "ran and failed" from "never ran"', async () => {
    await recordCronHeartbeat({ at: iso(2 * HOUR), ok: false })
    const check = find(await runHealthChecks(), 'cron')
    expect(check.status).toBe('fail')
    expect(check.title).toMatch(/failed/i)
  })
})

describe('the outbox', () => {
  async function seedNotification(id: string, status: string, createdAt: string) {
    const db = await getEngine()
    await db.run(
      `INSERT INTO notifications (id, user_id, email, template, dedupe_key, status, attempts,
         data, created_at, updated_at, sent_at)
       VALUES (?, NULL, 'a@b.c', 't', ?, ?, '[]', '{}', ?, ?, NULL)`,
      [id, `dedupe-${id}`, status, createdAt, createdAt],
    )
  }

  it('fails on anything that could not be sent', async () => {
    await seedNotification('n1', 'failed', iso(HOUR))
    expect(find(await runHealthChecks(), 'outbox').status).toBe('fail')
  })

  it('leaves a freshly queued email alone — manual mode queues by design', async () => {
    await seedNotification('n2', 'queued', iso(HOUR))
    expect(find(await runHealthChecks(), 'outbox').status).toBe('ok')
  })

  it('nudges when the queue has gone stale', async () => {
    await seedNotification('n3', 'queued', iso(96 * HOUR))
    expect(find(await runHealthChecks(), 'outbox').status).toBe('warn')
  })
})

describe('the overall verdict', () => {
  it('takes the worst status present', () => {
    const check = (status: HealthCheck['status']): HealthCheck => ({
      id: status,
      title: '',
      status,
      detail: '',
    })
    expect(overallStatus([check('ok'), check('ok')])).toBe('ok')
    expect(overallStatus([check('ok'), check('warn')])).toBe('warn')
    expect(overallStatus([check('warn'), check('fail')])).toBe('fail')
  })
})
