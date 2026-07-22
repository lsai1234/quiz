import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getPaymentSetting, setPaymentSetting, syncPortalRuntime } from '@/lib/portal/store'
import { getPaymentSource, hasStripeCredentials, type PaymentMode } from '@/lib/payments'

const MODES: PaymentMode[] = ['auto', 'mock', 'stripe']

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  return NextResponse.json({
    mode: await getPaymentSetting(),
    effective: getPaymentSource(),
    hasCredentials: hasStripeCredentials(),
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
  if (!MODES.includes(body.mode as PaymentMode)) {
    return NextResponse.json({ error: 'mode must be auto | mock | stripe' }, { status: 400 })
  }
  await setPaymentSetting(body.mode as PaymentMode)
  return NextResponse.json({ mode: await getPaymentSetting(), effective: getPaymentSource() })
}
