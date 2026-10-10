import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import {
  getAutoSendPaidSetting,
  getOrderingSetting,
  setAutoSendPaidSetting,
  setOrderingSetting,
  syncPortalRuntime,
} from '@/lib/portal/store'
import {
  autoSendBlockedReason,
  getOrderingSource,
  isAutoSendActive,
  liveOrderingBlockedReason,
  type OrderingMode,
} from '@/lib/supplier/ordering'

const MODES: OrderingMode[] = ['simulate', 'live']

/**
 * The simulate/live switch for sending orders to PowerBody.
 *
 * `mode` is what the founder chose; `effective` is what will actually happen on
 * the next send — they differ when live has been asked for but the catalogue is
 * still on the mock supplier, and `blockedReason` says why.
 */
async function state() {
  return {
    mode: await getOrderingSetting(),
    effective: getOrderingSource(),
    blockedReason: liveOrderingBlockedReason(),
    // Automatic sending rides on the same screen: it only means anything once
    // sends are live, and seeing both together is how that is obvious.
    autoSend: {
      on: await getAutoSendPaidSetting(),
      active: isAutoSendActive(),
      blockedReason: autoSendBlockedReason(),
    },
  }
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  return NextResponse.json(await state())
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { mode?: string; autoSend?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  await syncPortalRuntime()
  if (typeof body.autoSend === 'boolean') {
    await setAutoSendPaidSetting(body.autoSend)
    return NextResponse.json(await state())
  }
  if (!MODES.includes(body.mode as OrderingMode)) {
    return NextResponse.json({ error: 'mode must be simulate | live, or autoSend a boolean' }, { status: 400 })
  }
  await setOrderingSetting(body.mode as OrderingMode)
  return NextResponse.json(await state())
}
