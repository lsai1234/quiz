/**
 * @jest-environment node
 */
import { getEngine } from '@/lib/db/engine'
import {
  criticalCountSince,
  getGroup,
  listGroups,
  pruneOldEvents,
  recordError,
  setGroupState,
} from '../repo'

/**
 * The error log against a real (in-memory) database — which also proves
 * migrations v14 and v15 apply, since the engine runs them on first connection.
 */

const boom = (message: string, extra: Partial<Parameters<typeof recordError>[0]> = {}) =>
  recordError({
    surface: 'checkout',
    severity: 'error',
    kind: 'server',
    message,
    stack: 'Error: x\n    at pay (/app/src/lib/checkout/finalize.ts:88:11)',
    ...extra,
  })

describe('recording and grouping', () => {
  it('collapses repeats of one fault into a single group with a count', async () => {
    const fp = await boom('Order 111 failed')
    await boom('Order 222 failed')
    await boom('Order 333 failed')
    expect(fp).toMatch(/^[0-9a-f]{12}$/)

    const groups = await listGroups()
    const mine = groups.find((g) => g.fingerprint === fp)
    expect(mine).toBeDefined()
    expect(mine!.count).toBe(3)
    expect(mine!.state).toBe('open')
    // The sample is a real occurrence, so the stack is there to read.
    expect(mine!.sample?.stack).toContain('finalize.ts')
  })

  it('counts distinct sessions, not just occurrences', async () => {
    const fp = await boom('Session-scoped fault', { sessionId: 's1' })
    await boom('Session-scoped fault', { sessionId: 's1' })
    await boom('Session-scoped fault', { sessionId: 's2' })
    const group = (await listGroups()).find((g) => g.fingerprint === fp)
    expect(group!.count).toBe(3)
    expect(group!.sessions).toBe(2)
  })
})

describe('triage', () => {
  it('keeps a resolved group resolved when the fault recurs', async () => {
    // The point of a separate group table: a fix ships, clients keep hitting the
    // old bundle for a day, and "resolved" must not silently undo itself.
    const fp = await boom('Recurring fault')
    await setGroupState(fp!, 'resolved')
    await boom('Recurring fault')

    const detail = await getGroup(fp!)
    expect(detail!.group.state).toBe('resolved')
    expect(detail!.group.count).toBe(2)
  })

  it('excludes muted groups from the critical count that raises the banner', async () => {
    const fp = await recordError({
      surface: 'webhook',
      severity: 'critical',
      kind: 'server',
      message: 'Noisy critical',
    })
    expect(await criticalCountSince(24)).toBeGreaterThan(0)

    const before = await criticalCountSince(24)
    await setGroupState(fp!, 'muted')
    expect(await criticalCountSince(24)).toBe(before - 1)
  })
})

describe('retention', () => {
  it('prunes old occurrences but keeps the triage decision', async () => {
    const fp = await boom('Ancient fault')
    await setGroupState(fp!, 'resolved')

    // Age the occurrence past the retention window.
    const db = await getEngine()
    await db.run('UPDATE error_events SET created_at = ? WHERE fingerprint = ?', [
      new Date(Date.now() - 90 * 86_400_000).toISOString(),
      fp,
    ])

    expect(await pruneOldEvents(30)).toBeGreaterThan(0)
    expect(await getGroup(fp!)).toBeNull()

    // The group row survives, so the fault does not come back marked open.
    const row = await db.get<{ state: string }>(
      'SELECT state FROM error_groups WHERE fingerprint = ?',
      [fp],
    )
    expect(row?.state).toBe('resolved')
  })
})

describe('resilience', () => {
  it('never throws, whatever it is handed', async () => {
    await expect(
      recordError({
        surface: 'shop',
        severity: 'error',
        kind: 'client',
        message: 'x'.repeat(5000),
        stack: 'y'.repeat(20_000),
        // Values the caller should not have sent, arriving anyway.
        context: { nested: { deep: true } as unknown as string, ok: 'kept' },
      }),
    ).resolves.toMatch(/^[0-9a-f]{12}$/)
  })

  it('bounds what it stores', async () => {
    const fp = await recordError({
      surface: 'shop',
      severity: 'error',
      kind: 'client',
      message: 'z'.repeat(5000),
    })
    const detail = await getGroup(fp!)
    expect(detail!.group.message.length).toBeLessThanOrEqual(500)
    // The unserialisable context value is dropped, the usable one kept.
    expect(detail!.recent[0].context).toBeDefined()
  })
})
