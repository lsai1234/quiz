import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'
import { getChange } from '@/lib/changes/repo'
import { flushChangeNotifications, resolveChangeEvent } from '@/lib/changes/service'
import { toResolution } from '@/lib/changes/parse'

export const dynamic = 'force-dynamic'

/**
 * POST /api/portal/changes/[id] — a founder resolving one event.
 *
 * Body: { action: 'substitute' | 'remove' | 'hold' | 'dismiss', replacementProductId? }
 *
 * One call does the lot: updates the member's plan, writes the billing change,
 * queues their email and sends it. Four separate buttons for those steps would
 * be four chances to do three of them.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  let body: { action?: string; replacementProductId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const resolution = toResolution(body)
  if (!resolution) {
    return NextResponse.json(
      { error: 'action must be substitute (with replacementProductId), remove, hold or dismiss' },
      { status: 400 },
    )
  }

  await syncPortalRuntime()
  const resolved = await resolveChangeEvent(id, resolution)
  if (!resolved) return NextResponse.json({ error: 'Change not found' }, { status: 404 })

  const { sent, failed } = await flushChangeNotifications()
  return NextResponse.json({ ok: true, event: resolved, notified: sent, notifyFailed: failed })
}

/** GET — one event, for the detail view. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const event = await getChange(id)
  if (!event) return NextResponse.json({ error: 'Change not found' }, { status: 404 })
  return NextResponse.json({ event })
}
