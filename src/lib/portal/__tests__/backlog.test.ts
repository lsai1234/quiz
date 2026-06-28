import { listItems, createItem, updateItem, reorder, deleteItem } from '../backlog'

/**
 * The backlog store is process-global (and may hydrate pre-existing items from
 * disk), so these tests measure deltas and clean up the items they create.
 */
describe('improvements backlog', () => {
  const created: string[] = []

  afterEach(() => {
    for (const id of created.splice(0)) deleteItem(id)
  })

  it('creates an item with defaults and stamps the author', () => {
    const item = createItem({ title: '  Faster checkout  ', app: 'hub' }, 'Ada')
    created.push(item.id)
    expect(item.title).toBe('Faster checkout') // trimmed
    expect(item.app).toBe('hub')
    expect(item.priority).toBe('P2') // default
    expect(item.status).toBe('idea') // default
    expect(item.createdBy).toBe('Ada')
    expect(listItems().some((i) => i.id === item.id)).toBe(true)
  })

  it('updates editable fields and drops to the bottom of a new column on status change', () => {
    const a = createItem({ title: 'A', app: 'portal' }, 'Ada')
    const b = createItem({ title: 'B', app: 'portal', status: 'next' }, 'Ada')
    created.push(a.id, b.id)

    const updated = updateItem(a.id, { priority: 'P0', status: 'next' })
    expect(updated!.priority).toBe('P0')
    expect(updated!.status).toBe('next')
    // Moving into 'next' should rank it after the existing 'next' item.
    expect(updated!.order).toBeGreaterThan(b.order)
  })

  it('ignores non-editable fields on update', () => {
    const item = createItem({ title: 'C', app: 'quiz' }, 'Ada')
    created.push(item.id)
    const updated = updateItem(item.id, { id: 'hacked', createdBy: 'someone-else' } as never)
    expect(updated!.id).toBe(item.id)
    expect(updated!.createdBy).toBe('Ada')
  })

  it('reorders by an explicit id list', () => {
    const a = createItem({ title: 'R-A', app: 'hub', status: 'done' }, 'Ada')
    const b = createItem({ title: 'R-B', app: 'hub', status: 'done' }, 'Ada')
    created.push(a.id, b.id)
    reorder([b.id, a.id])
    const all = listItems()
    expect(all.find((i) => i.id === b.id)!.order).toBeLessThan(all.find((i) => i.id === a.id)!.order)
  })

  it('deletes items and reports unknown ids', () => {
    const item = createItem({ title: 'D', app: 'hub' }, 'Ada')
    expect(deleteItem(item.id)).toBe(true)
    expect(listItems().some((i) => i.id === item.id)).toBe(false)
    expect(deleteItem('does-not-exist')).toBe(false)
  })

  it('returns null when updating a missing item', () => {
    expect(updateItem('nope', { title: 'x' })).toBeNull()
  })
})
