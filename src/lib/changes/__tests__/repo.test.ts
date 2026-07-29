/**
 * Change-event persistence against in-memory SQLite (migration v4).
 */
import { createUser } from '@/lib/db/users'
import {
  getChange,
  listChanges,
  listDueForAutoApply,
  listOpenChanges,
  openChangeCounts,
  saveChange,
  updateChange,
} from '@/lib/changes/repo'
import { createChangeEvent } from '@/lib/changes/event'
import type { ChangeEvent, ChangeKind } from '@/lib/changes/types'
import { line, subscriptionWith } from './fixtures'

const NOW = new Date('2026-07-29T09:00:00.000Z')

async function seed(userId: string, over: Partial<ChangeEvent> = {}): Promise<ChangeEvent> {
  const sub = subscriptionWith([line({ id: over.lineId ?? 'l1' }), line({ id: 'keep', productId: 'p2' })])
  const event: ChangeEvent = {
    ...createChangeEvent({
      kind: (over.kind as ChangeKind) ?? 'out-of-stock',
      userId,
      subscription: sub,
      line: sub.lines[0],
      now: NOW,
    }),
    ...over,
  }
  await saveChange(event)
  return event
}

describe('change-event repository', () => {
  it('round-trips an event', async () => {
    const user = await createUser({ email: 'repo-1@example.com' })
    const event = await seed(user.id)

    const read = await getChange(event.id)
    expect(read).toMatchObject({
      id: event.id,
      kind: 'out-of-stock',
      userId: user.id,
      intendedAction: { resolution: { type: 'remove' } },
    })
  })

  it('upserts on the stable id instead of duplicating', async () => {
    const user = await createUser({ email: 'repo-2@example.com' })
    const first = await seed(user.id)
    await seed(user.id, { status: 'applied' })

    expect(await listChanges({ userId: user.id })).toHaveLength(1)
    expect((await getChange(first.id))?.status).toBe('applied')
  })

  it('filters by status, kind and member', async () => {
    const a = await createUser({ email: 'repo-3a@example.com' })
    const b = await createUser({ email: 'repo-3b@example.com' })
    await seed(a.id, { kind: 'out-of-stock' })
    await seed(a.id, { kind: 'price-increase', lineId: 'l2' })
    await seed(b.id, { kind: 'discontinued', status: 'applied' })

    expect(await listChanges({ userId: a.id })).toHaveLength(2)
    expect(await listChanges({ kind: 'price-increase', userId: a.id })).toHaveLength(1)
    expect(await listChanges({ kind: ['out-of-stock', 'price-increase'], userId: a.id })).toHaveLength(2)
    expect(await listChanges({ status: 'applied', userId: b.id })).toHaveLength(1)
    expect(await listChanges({ status: 'applied', userId: a.id })).toHaveLength(0)
  })

  it('lists only what is still in flight', async () => {
    // The queue is global by nature, so assert on this member's slice of it
    // rather than on a shared in-memory database's total.
    const user = await createUser({ email: 'repo-4@example.com' })
    await seed(user.id, { kind: 'out-of-stock', status: 'applied' })
    await seed(user.id, { kind: 'discontinued', lineId: 'l2', status: 'requires-action' })
    await seed(user.id, { kind: 'price-increase', lineId: 'l3', status: 'cancelled' })

    const mine = (await listOpenChanges()).filter((e) => e.userId === user.id)
    expect(mine.map((e) => e.kind)).toEqual(['discontinued'])
  })

  it('counts open events per kind for the nav badge', async () => {
    const user = await createUser({ email: 'repo-4b@example.com' })
    const before = await openChangeCounts()
    await seed(user.id, { kind: 'discontinued', status: 'requires-action' })
    await seed(user.id, { kind: 'out-of-stock', lineId: 'l2', status: 'cancelled' })

    const after = await openChangeCounts()
    expect((after.discontinued ?? 0) - (before.discontinued ?? 0)).toBe(1)
    expect((after['out-of-stock'] ?? 0) - (before['out-of-stock'] ?? 0)).toBe(0)
  })

  it('finds events whose review window has elapsed, oldest first', async () => {
    const user = await createUser({ email: 'repo-5@example.com' })
    await seed(user.id, { lineId: 'due-late', status: 'requires-action', autoApplyAt: '2026-07-29T08:00:00.000Z' })
    await seed(user.id, { lineId: 'due-early', status: 'requires-action', autoApplyAt: '2026-07-29T07:00:00.000Z' })
    await seed(user.id, { lineId: 'not-yet', status: 'requires-action', autoApplyAt: '2026-07-30T09:00:00.000Z' })
    await seed(user.id, { lineId: 'done', status: 'applied', autoApplyAt: '2026-07-29T07:00:00.000Z' })

    const due = (await listDueForAutoApply(NOW.toISOString())).filter((e) => e.userId === user.id)
    expect(due.map((e) => e.lineId)).toEqual(['due-early', 'due-late'])
  })

  it('updates in place and stamps updatedAt', async () => {
    const user = await createUser({ email: 'repo-6@example.com' })
    const event = await seed(user.id)

    const updated = await updateChange(event.id, (e) => {
      e.status = 'applied'
      e.resolution = { type: 'remove' }
      e.resolutionSource = 'founder'
    })

    expect(updated).toMatchObject({ status: 'applied', resolutionSource: 'founder' })
    expect(updated!.updatedAt).not.toBe(event.updatedAt)
    expect((await getChange(event.id))?.status).toBe('applied')
  })

  it('returns null for an event that isn’t there', async () => {
    expect(await getChange('chg_nope')).toBeNull()
    expect(await updateChange('chg_nope', () => {})).toBeNull()
  })
})
