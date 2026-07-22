import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getSupplierSetting, setSupplierSetting, syncPortalRuntime } from '@/lib/portal/store'
import { getSupplierSource, hasPowerBodyCredentials, type SupplierMode } from '@/lib/supplier'

const MODES: SupplierMode[] = ['auto', 'mock', 'powerbody']

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  return NextResponse.json({
    mode: await getSupplierSetting(),
    effective: getSupplierSource(),
    hasCredentials: hasPowerBodyCredentials(),
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
  if (!MODES.includes(body.mode as SupplierMode)) {
    return NextResponse.json({ error: 'mode must be auto | mock | powerbody' }, { status: 400 })
  }
  await setSupplierSetting(body.mode as SupplierMode)
  return NextResponse.json({ mode: await getSupplierSetting(), effective: getSupplierSource() })
}
