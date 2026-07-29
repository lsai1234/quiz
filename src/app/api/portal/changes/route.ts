import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'
import { listChanges, openChangeCounts } from '@/lib/changes/repo'
import { runChangeDetection } from '@/lib/changes/service'
import { OPEN_STATUSES, type ChangeStatus } from '@/lib/changes/types'

export const dynamic = 'force-dynamic'

/**
 * The product-change queue. Supersedes /api/portal/stock-alerts, which only
 * knew about out-of-stock; this covers discontinuations and price moves too and
 * reports what the system intends to do about each one.
 *
 * GET  — the queue. `?status=` narrows it; open events by default.
 * POST — run detection now. `{ dryRun: true }` computes without writing, which
 *        is how you sanity-check a run before it touches anyone's plan.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = new URL(req.url).searchParams.get('status')
  const events = await listChanges({
    status: status ? ([status] as ChangeStatus[]) : OPEN_STATUSES,
  })
  return NextResponse.json({ count: events.length, counts: await openChangeCounts(), events })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { dryRun?: boolean; forceOosSku?: string; clearForce?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    /* no body — just run */
  }

  await syncPortalRuntime()

  // Demo affordance, mock supplier only: force a SKU out of stock so the whole
  // journey can be exercised on demand rather than waiting for a real outage.
  if (body.forceOosSku || body.clearForce) {
    const mock = await import('@/lib/supplier/powerbody/mock')
    if (body.clearForce) mock.getForcedOutOfStock().forEach((sku) => mock.forceOutOfStock(sku, false))
    if (body.forceOosSku) mock.forceOutOfStock(body.forceOosSku, true)
  }

  const result = await runChangeDetection({ dryRun: body.dryRun })
  const events = body.dryRun ? result.events : await listChanges({ status: OPEN_STATUSES })

  return NextResponse.json({
    ok: true,
    dryRun: result.dryRun,
    baselineOnly: result.baselineOnly,
    scanned: result.scannedSubscriptions,
    outOfStock: result.outOfStockSkus.length,
    discontinued: result.discontinuedSkus.length,
    recovered: result.recoveredSkus.length,
    raised: result.events.length,
    applied: result.applied.length,
    cancelled: result.cancelled.length,
    events,
  })
}
