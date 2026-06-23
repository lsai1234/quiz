import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getDataSourceSetting, setDataSourceSetting } from '@/lib/portal/store'
import { getDataSource, hasShopifyCredentials, type DataSourceMode } from '@/lib/data-source'

const MODES: DataSourceMode[] = ['auto', 'mock', 'shopify']

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({
    mode: getDataSourceSetting(),
    effective: getDataSource(),
    hasCredentials: hasShopifyCredentials(),
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
    return NextResponse.json({ error: 'mode must be auto | mock | shopify' }, { status: 400 })
  }
  setDataSourceSetting(body.mode as DataSourceMode)
  return NextResponse.json({ mode: getDataSourceSetting(), effective: getDataSource() })
}
