/**
 * Backlog constants + types — browser-safe (no fs / server-only imports).
 *
 * The store logic lives in ./backlog.ts (which is server-only because it touches
 * the fs-backed persistence). Client components (the board page) import the
 * shared shapes/constants from here so they don't pull `fs` into the browser
 * bundle.
 */

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
