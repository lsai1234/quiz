/**
 * Improvements backlog — founder-managed requests for the hub, the portal and the
 * quiz. Durable in the app database (see ./persist.ts); each operation reads the
 * latest list and writes the result back, so serverless instances stay
 * consistent.
 *
 * A backlog item has an app it belongs to, a priority, a status (the board
 * columns), and an order within its status column for manual ranking. Impact and
 * effort are optional planning fields. Server-only (touches the database).
 */
import { readJson, writeJson } from './persist'
import type { BacklogItem, BacklogStatus, NewBacklogItem } from './backlog-types'

// Re-export the browser-safe constants/types so server callers can keep
// importing everything from '@/lib/portal/backlog'.
export * from './backlog-types'

const BACKLOG_FILE = 'backlog'

async function load(): Promise<BacklogItem[]> {
  return readJson<BacklogItem[]>(BACKLOG_FILE, [])
}

function nextOrder(items: BacklogItem[], status: BacklogStatus): number {
  const inColumn = items.filter((i) => i.status === status)
  return inColumn.length === 0 ? 0 : Math.max(...inColumn.map((i) => i.order)) + 1
}

export async function listItems(): Promise<BacklogItem[]> {
  return (await load()).sort((a, b) => a.order - b.order)
}

export async function createItem(input: NewBacklogItem, createdBy: string): Promise<BacklogItem> {
  const items = await load()
  const now = new Date().toISOString()
  const status = input.status ?? 'idea'
  const item: BacklogItem = {
    id: `bl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: input.title.trim(),
    detail: (input.detail ?? '').trim(),
    app: input.app,
    priority: input.priority ?? 'P2',
    status,
    order: nextOrder(items, status),
    impact: input.impact,
    effort: input.effort,
    createdBy,
    createdAt: now,
    updatedAt: now,
  }
  items.push(item)
  await writeJson(BACKLOG_FILE, items)
  return item
}

const EDITABLE = ['title', 'detail', 'app', 'priority', 'status', 'impact', 'effort', 'order'] as const

export async function updateItem(id: string, patch: Partial<BacklogItem>): Promise<BacklogItem | null> {
  const items = await load()
  const item = items.find((i) => i.id === id)
  if (!item) return null
  for (const key of EDITABLE) {
    if (patch[key] !== undefined) (item as unknown as Record<string, unknown>)[key] = patch[key]
  }
  // Moving to a new column drops it to the bottom of that column unless an
  // explicit order was supplied.
  if (patch.status !== undefined && patch.order === undefined) {
    item.order = nextOrder(
      items.filter((i) => i.id !== id),
      item.status,
    )
  }
  item.updatedAt = new Date().toISOString()
  await writeJson(BACKLOG_FILE, items)
  return item
}

/** Set an explicit ordering of ids (e.g. after a drag-reorder within a column). */
export async function reorder(orderedIds: string[]): Promise<BacklogItem[]> {
  const items = await load()
  orderedIds.forEach((id, idx) => {
    const item = items.find((i) => i.id === id)
    if (item) item.order = idx
  })
  await writeJson(BACKLOG_FILE, items)
  return items.sort((a, b) => a.order - b.order)
}

export async function deleteItem(id: string): Promise<boolean> {
  const items = await load()
  const remaining = items.filter((i) => i.id !== id)
  if (remaining.length === items.length) return false
  await writeJson(BACKLOG_FILE, remaining)
  return true
}
