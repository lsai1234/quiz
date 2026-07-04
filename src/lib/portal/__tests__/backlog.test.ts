import { listItems, createItem, updateItem, reorder, deleteItem } from '../backlog'

/**
 * The backlog store is process-global (and may hydrate pre-existing items from
 * disk), so these tests measure deltas and clean up the items they create.
 */
describe('improvements backlog', () => {
  const created: string[] = []

  afterEach(async () => {
    for (const id of created.splice(0)) await deleteItem(id)
  })

  it('creates an item with defaults and stamps the author', async () => {
    const item = await createItem({ title: '  Faster checkout  ', app: 'hub' }, 'Ada')
    created.push(item.id)
    expect(item.title).toBe('Faster checkout') // trimmed
    expect(item.app).toBe('hub')
    expect(item.priority).toBe('P2') // default
    expect(item.status).toBe('idea') // default
    expect(item.createdBy).toBe('Ada')
    expect((await listItems()).some((i) => i.id === item.id)).toBe(true)
  })

  it('updates editable fields and drops to the bottom of a new column on status change', async () => {
    const a = await createItem({ title: 'A', app: 'portal' }, 'Ada')
    const b = await createItem({ title: 'B', app: 'portal', status: 'next' }, 'Ada')
    created.push(a.id, b.id)

    const updated = await updateItem(a.id, { priority: 'P0', status: 'next' })
    expect(updated!.priority).toBe('P0')
    expect(updated!.status).toBe('next')
    // Moving into 'next' should rank it after the existing 'next' item.
    expect(updated!.order).toBeGreaterThan(b.order)
  })

  it('ignores non-editable fields on update', async () => {
    const item = await createItem({ title: 'C', app: 'quiz' }, 'Ada')
    created.push(item.id)
    const updated = await updateItem(item.id, { id: 'hacked', createdBy: 'someone-else' } as never)
    expect(updated!.id).toBe(item.id)
    expect(updated!.createdBy).toBe('Ada')
  })

  it('reorders by an explicit id list', async () => {
    const a = await createItem({ title: 'R-A', app: 'hub', status: 'done' }, 'Ada')
    const b = await createItem({ title: 'R-B', app: 'hub', status: 'done' }, 'Ada')
    created.push(a.id, b.id)
    await reorder([b.id, a.id])
    const all = await listItems()
    expect(all.find((i) => i.id === b.id)!.order).toBeLessThan(all.find((i) => i.id === a.id)!.order)
  })

  it('deletes items and reports unknown ids', async () => {
    const item = await createItem({ title: 'D', app: 'hub' }, 'Ada')
    expect(await deleteItem(item.id)).toBe(true)
    expect((await listItems()).some((i) => i.id === item.id)).toBe(false)
    expect(await deleteItem('does-not-exist')).toBe(false)
  })

  it('returns null when updating a missing item', async () => {
    expect(await updateItem('nope', { title: 'x' })).toBeNull()
  })
})
