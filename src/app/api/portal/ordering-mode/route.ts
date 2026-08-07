import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getOrderingSetting, setOrderingSetting, syncPortalRuntime } from '@/lib/portal/store'
import { getOrderingSource, liveOrderingBlockedReason, type OrderingMode } from '@/lib/supplier/ordering'

const MODES: OrderingMode[] = ['simulate', 'live']

/**
 * The simulate/live switch for sending orders to PowerBody.
 *
 * `mode` is what the founder chose; `effective` is what will actually happen on
 * the next send — they differ when live has been asked for but the catalogue is
 * still on the mock supplier, and `blockedReason` says why.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  return NextResponse.json({
    mode: await getOrderingSetting(),
    effective: getOrderingSource(),
    blockedReason: liveOrderingBlockedReason(),
  })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { mode?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!MODES.includes(body.mode as OrderingMode)) {
    return NextResponse.json({ error: 'mode must be simulate | live' }, { status: 400 })
  }
  await setOrderingSetting(body.mode as OrderingMode)
  return NextResponse.json({
    mode: await getOrderingSetting(),
    effective: getOrderingSource(),
    blockedReason: liveOrderingBlockedReason(),
  })
}
