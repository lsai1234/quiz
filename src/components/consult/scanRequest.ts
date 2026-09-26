import type { ShelfItem } from '@/lib/consult/types'
import type { TrackerApp, TrackerRead } from '@/lib/consult/ai/scan'

/**
 * The browser side of the scan route (U1, U2). Anything but a clean answer —
 * no key, a timeout, a bad image — comes back as `null`, and the sheet says
 * "answer on screen as normal".
 */

async function post<T>(body: Record<string, unknown>, pick: (json: Record<string, unknown>) => T | undefined): Promise<T | null> {
  try {
    const res = await fetch('/api/consult/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...(typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? { signal: AbortSignal.timeout(15_000) } : {}),
    })
    if (!res.ok) return null
    return pick(await res.json()) ?? null
  } catch {
    return null
  }
}

export const scanShelf = (image: string) =>
  post<ShelfItem[]>({ kind: 'shelf', image }, (j) => (Array.isArray(j.items) ? (j.items as ShelfItem[]) : undefined))

export const scanTracker = (app: TrackerApp, image: string) =>
  post<TrackerRead>({ kind: 'tracker', app, image }, (j) => (j.read && typeof j.read === 'object' ? (j.read as TrackerRead) : undefined))
