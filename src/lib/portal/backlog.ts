/**
 * Improvements backlog — founder-managed requests for the hub, the portal and the
 * quiz. Durable via the key→JSON store (see ./persist.ts — Postgres when
 * `DATABASE_URL` is set, `.data/` JSON files otherwise).
 *
 * A backlog item has an app it belongs to, a priority, a status (the board
 * columns), and an order within its status column for manual ranking. Impact and
 * effort are optional planning fields. Server-only (touches the persisted store).
 *
 * Items live in module memory per instance: hydrated once per process on the fs
 * backend, re-read on a short TTL on the database backend (so edits from other
 * serverless instances show up). Every mutation hydrates first, then persists
 * the whole list (last write wins — fine for a couple of founders).
 */
import { hasDatabase } from '@/lib/db'
import { readJson, writeJson } from './persist'
import type { BacklogItem, BacklogStatus, NewBacklogItem } from './backlog-types'

// Re-export the browser-safe constants/types so server callers can keep
// importing everything from '@/lib/portal/backlog'.
export * from './backlog-types'

const BACKLOG_FILE = 'backlog'

let items: BacklogItem[] = []

const HYDRATE_TTL_MS = 5_000
let hydratedAt = 0

async function hydrate(): Promise<void> {
  const stale = hasDatabase()
    ? Date.now() - hydratedAt > HYDRATE_TTL_MS
    : hydratedAt === 0
  if (!stale) return
  hydratedAt = Date.now()
  items = await readJson<BacklogItem[]>(BACKLOG_FILE, [])
}

async function save(): Promise<void> {
  await writeJson(BACKLOG_FILE, items)
}

function nextOrder(status: BacklogStatus): number {
  const inColumn = items.filter((i) => i.status === status)
  return inColumn.length === 0 ? 0 : Math.max(...inColumn.map((i) => i.order)) + 1
}

export async function listItems(): Promise<BacklogItem[]> {
  await hydrate()
  return [...items].sort((a, b) => a.order - b.order)
}

export async function createItem(input: NewBacklogItem, createdBy: string): Promise<BacklogItem> {
  await hydrate()
  const now = new Date().toISOString()
  const status = input.status ?? 'idea'
  const item: BacklogItem = {
    id: `bl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: input.title.trim(),
    detail: (input.detail ?? '').trim(),
    app: input.app,
    priority: input.priority ?? 'P2',
    status,
    order: nextOrder(status),
    impact: input.impact,
    effort: input.effort,
    createdBy,
    createdAt: now,
    updatedAt: now,
  }
  items.push(item)
  await save()
  return item
}

const EDITABLE = ['title', 'detail', 'app', 'priority', 'status', 'impact', 'effort', 'order'] as const

export async function updateItem(id: string, patch: Partial<BacklogItem>): Promise<BacklogItem | null> {
  await hydrate()
  const item = items.find((i) => i.id === id)
  if (!item) return null
  for (const key of EDITABLE) {
    if (patch[key] !== undefined) (item as unknown as Record<string, unknown>)[key] = patch[key]
  }
  // Moving to a new column drops it to the bottom of that column unless an
  // explicit order was supplied.
  if (patch.status !== undefined && patch.order === undefined) {
    item.order = nextOrder(item.status)
  }
  item.updatedAt = new Date().toISOString()
  await save()
  return item
}

/** Set an explicit ordering of ids (e.g. after a drag-reorder within a column). */
export async function reorder(orderedIds: string[]): Promise<BacklogItem[]> {
  await hydrate()
  orderedIds.forEach((id, idx) => {
    const item = items.find((i) => i.id === id)
    if (item) item.order = idx
  })
  await save()
  return listItems()
}

export async function deleteItem(id: string): Promise<boolean> {
  await hydrate()
  const before = items.length
  items = items.filter((i) => i.id !== id)
  if (items.length === before) return false
  await save()
  return true
}
