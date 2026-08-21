import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { audienceCounts, listAudience } from '@/lib/audience'
import type { LeadSource } from '@/lib/audience/types'

export const dynamic = 'force-dynamic'

/** GET — the marketing audience, newest first, with the headline counts. */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const source = params.get('source')
  const track = params.get('track')
  const search = params.get('q')
  const marketableOnly = params.get('marketable') === '1'

  const [counts, members] = await Promise.all([
    audienceCounts(),
    listAudience({
      source: (source as LeadSource) || undefined,
      track: track || undefined,
      search: search || undefined,
      marketableOnly,
      // A page, not the table. The export is the thing that takes everything.
      limit: 500,
    }),
  ])

  return NextResponse.json({ ...counts, members })
}
