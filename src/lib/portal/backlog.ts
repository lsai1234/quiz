/**
 * Improvements backlog — founder-managed requests for the hub, the portal and the
 * quiz. Durable across restarts via the JSON-file store (see ./persist.ts).
 *
 * A backlog item has an app it belongs to, a priority, a status (the board
 * columns), and an order within its status column for manual ranking. Impact and
 * effort are optional planning fields. Server-only (touches the fs-backed store).
 */
import { readJson, writeJson } from './persist'

export const BACKLOG_APPS = ['hub', 'portal', 'quiz'] as const
export type BacklogApp = (typeof BACKLOG_APPS)[number]

export const BACKLOG_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const
export type BacklogPriority = (typeof BACKLOG_PRIORITIES)[number]

export const BACKLOG_STATUSES = ['idea', 'next', 'in-progress', 'done'] as const
export type BacklogStatus = (typeof BACKLOG_STATUSES)[number]

export const BACKLOG_SIZES = ['S', 'M', 'L'] as const
export type BacklogSize = (typeof BACKLOG_SIZES)[number]

export interface BacklogItem {
  id: string
  title: string
  detail: string
  app: BacklogApp
  priority: BacklogPriority
  status: BacklogStatus
  /** Rank within the item's status column (lower = higher up). */
  order: number
  impact?: BacklogSize
  effort?: BacklogSize
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface NewBacklogItem {
  title: string
  detail?: string
  app: BacklogApp
  priority?: BacklogPriority
  status?: BacklogStatus
  impact?: BacklogSize
  effort?: BacklogSize
}

const BACKLOG_FILE = 'backlog'

let items: BacklogItem[] = readJson<BacklogItem[]>(BACKLOG_FILE, [])

function save(): void {
  writeJson(BACKLOG_FILE, items)
}

function nextOrder(status: BacklogStatus): number {
  const inColumn = items.filter((i) => i.status === status)
  return inColumn.length === 0 ? 0 : Math.max(...inColumn.map((i) => i.order)) + 1
}

export function listItems(): BacklogItem[] {
  return [...items].sort((a, b) => a.order - b.order)
}

export function createItem(input: NewBacklogItem, createdBy: string): BacklogItem {
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
  save()
  return item
}

const EDITABLE = ['title', 'detail', 'app', 'priority', 'status', 'impact', 'effort', 'order'] as const

export function updateItem(id: string, patch: Partial<BacklogItem>): BacklogItem | null {
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
  save()
  return item
}

/** Set an explicit ordering of ids (e.g. after a drag-reorder within a column). */
export function reorder(orderedIds: string[]): BacklogItem[] {
  orderedIds.forEach((id, idx) => {
    const item = items.find((i) => i.id === id)
    if (item) item.order = idx
  })
  save()
  return listItems()
}

export function deleteItem(id: string): boolean {
  const before = items.length
  items = items.filter((i) => i.id !== id)
  if (items.length === before) return false
  save()
  return true
}
