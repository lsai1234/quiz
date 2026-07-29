import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'
import { listChanges } from '@/lib/changes/repo'
import { bulkResolveByProduct } from '@/lib/changes/service'
import { OPEN_STATUSES } from '@/lib/changes/types'
import { toResolution } from '@/lib/changes/parse'

export const dynamic = 'force-dynamic'

/**
 * Resolving one dead product across every member holding it.
 *
 * GET  ?productId= — who's affected and what each of them would get, so the
 *                    founder sees the whole blast radius before committing.
 * POST             — do it. Every member still goes through their own policy and
 *                    their own billing maths; bulk saves the founder forty
 *                    clicks, it doesn't treat people as a batch.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const productId = new URL(req.url).searchParams.get('productId')
  if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 })

  const events = (await listChanges({ status: OPEN_STATUSES })).filter((e) => e.productId === productId)
  return NextResponse.json({
    productId,
    count: events.length,
    // A member who chose "remove" never gets a group swap applied to them —
    // surfaced here so the founder isn't surprised by the outcome.
    removeOnlyCount: events.filter((e) => e.policy === 'remove').length,
    events,
  })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { productId?: string; action?: string; replacementProductId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 })

  const resolution = toResolution(body)
  if (!resolution) {
    return NextResponse.json(
      { error: 'action must be substitute (with replacementProductId), remove, hold or dismiss' },
      { status: 400 },
    )
  }

  await syncPortalRuntime()
  const result = await bulkResolveByProduct(body.productId, resolution)
  return NextResponse.json({
    ok: true,
    resolved: result.resolved.length,
    skipped: result.skipped,
    events: result.resolved,
  })
}
