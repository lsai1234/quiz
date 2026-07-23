import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { listExceptions } from '@/lib/stock/repo'
import { runStockCheck } from '@/lib/stock/check'
import { syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/** GET — the open stock-exception queue. */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const exceptions = await listExceptions('open')
  return NextResponse.json({ count: exceptions.length, exceptions })
}

/**
 * POST — run the stock check now.
 * Body: { forceOosSku?: string, clearForce?: boolean } — demo affordance to
 * force (or clear) a supplier SKU out of stock before scanning.
 */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { forceOosSku?: string; clearForce?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    /* no body — just run the check */
  }

  await syncPortalRuntime()
  // The force toggle only applies to the mock supplier (demo/testing).
  if (body.forceOosSku || body.clearForce) {
    const mock = await import('@/lib/supplier/powerbody/mock')
    if (body.clearForce) mock.getForcedOutOfStock().forEach((s) => mock.forceOutOfStock(s, false))
    if (body.forceOosSku) mock.forceOutOfStock(body.forceOosSku, true)
  }

  const result = await runStockCheck()
  const open = await listExceptions('open')
  return NextResponse.json({
    ok: true,
    scanned: result.scannedSubscriptions,
    outOfStock: result.outOfStockSkus.length,
    newExceptions: result.exceptions.length,
    exceptions: open,
  })
}
