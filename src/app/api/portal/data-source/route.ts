import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getDataSourceSetting, setDataSourceSetting, syncPortalRuntime } from '@/lib/portal/store'
import { getDataSource, type DataSourceMode } from '@/lib/data-source'
import { getImportedProducts } from '@/lib/portal/store'

const MODES: DataSourceMode[] = ['mock', 'real']

/**
 * Which catalogue the shop serves: the built-in sample one, or the real one we
 * have curated from the PowerBody feed.
 *
 * There are no credentials to check here — `real` reads products already
 * imported and stored — so unlike the supplier and payment toggles this cannot
 * silently fall back, and `mode` and `effective` never disagree. What CAN catch
 * someone out is switching to real with nothing added yet, so the count comes
 * back with it.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  const imported = await getImportedProducts()
  return NextResponse.json({
    mode: await getDataSourceSetting(),
    effective: getDataSource(),
    importedCount: imported.length,
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
  if (!MODES.includes(body.mode as DataSourceMode)) {
    return NextResponse.json({ error: 'mode must be mock | real' }, { status: 400 })
  }
  await setDataSourceSetting(body.mode as DataSourceMode)
  const imported = await getImportedProducts()
  return NextResponse.json({
    mode: await getDataSourceSetting(),
    effective: getDataSource(),
    importedCount: imported.length,
  })
}
