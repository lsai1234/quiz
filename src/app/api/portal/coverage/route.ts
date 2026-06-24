import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { catalogueCoverage } from '@/lib/portal/coverage'

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { products, source } = await getResolvedCatalogue()
  return NextResponse.json({ source, coverage: catalogueCoverage(products) })
}
