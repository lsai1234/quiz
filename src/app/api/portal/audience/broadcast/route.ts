import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { sendBroadcast } from '@/lib/audience/broadcast'
import type { LeadSource } from '@/lib/audience/types'

export const dynamic = 'force-dynamic'
/** A campaign is one send per recipient, so give a real list room to finish. */
export const maxDuration = 300

/**
 * POST — send a campaign to the marketing audience.
 *
 * `dryRun` counts the recipients and sends nothing, which is what the hub's
 * "check first" button uses. Permission is re-checked per recipient inside
 * `sendBroadcast` at the moment of sending, not here.
 */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    heading?: unknown
    body?: unknown
    ctaLabel?: unknown
    ctaUrl?: unknown
    source?: unknown
    dryRun?: unknown
    limit?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const heading = typeof body.heading === 'string' ? body.heading.trim() : ''
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (heading.length < 3 || text.length < 10) {
    return NextResponse.json(
      { error: 'A campaign needs a subject line and something to say.' },
      { status: 400 },
    )
  }

  const ctaLabel = typeof body.ctaLabel === 'string' ? body.ctaLabel.trim() : ''
  const ctaUrl = typeof body.ctaUrl === 'string' ? body.ctaUrl.trim() : ''

  const result = await sendBroadcast({
    heading,
    // A blank line starts a new paragraph, which is how anyone writing in a
    // textarea already expects it to work.
    paragraphs: text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    cta: ctaLabel && ctaUrl ? { label: ctaLabel, url: ctaUrl } : null,
    audience: { source: (body.source as LeadSource) || undefined },
    dryRun: body.dryRun === true,
    limit: typeof body.limit === 'number' ? body.limit : undefined,
  })

  return NextResponse.json(result)
}
