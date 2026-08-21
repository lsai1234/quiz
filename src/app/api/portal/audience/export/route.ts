import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { buildAudienceCsv, exportFilename } from '@/lib/audience/export'
import type { LeadSource } from '@/lib/audience/types'

export const dynamic = 'force-dynamic'

/**
 * GET — the audience as a CSV.
 *
 * Marketable addresses only unless `?all=1`, because this file's job is to be
 * pasted into a sending tool and the only safe default for that is "everybody
 * we are allowed to email". Every row carries its own unsubscribe link, which
 * is what lets a campaign sent from Gmail or Mailchimp be lawful and what keeps
 * the resulting opt-outs coming back here — see `lib/audience/export.ts`.
 *
 * Every export is logged with who asked, when, and how many rows left the
 * building. A list leaving the system is the event most worth being able to
 * reconstruct later.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const { csv, rows, excluded } = await buildAudienceCsv({
    source: (params.get('source') as LeadSource) || undefined,
    track: params.get('track') || undefined,
    search: params.get('q') || undefined,
    includeSuppressed: params.get('all') === '1',
  })

  console.info(
    `[audience] export: ${rows} rows${excluded > 0 ? `, ${excluded} withheld as not marketable` : ''}, at ${new Date().toISOString()}`,
  )

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename()}"`,
      'Cache-Control': 'no-store',
    },
  })
}
