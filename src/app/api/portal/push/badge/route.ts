import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { reviewCount } from '@/lib/push/badge'

export const dynamic = 'force-dynamic'

/** GET /api/portal/push/badge → { reviewCount } — the number on the hub's icon. */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ reviewCount: await reviewCount() })
}
