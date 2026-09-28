import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getMetaPixelSettings, normalisePixelId, setMetaPixelSettings } from '@/lib/portal/store'

/**
 * The Meta Pixel connection, from the Founders Hub.
 *
 * GET the current setting; POST `{ pixelId, enabled }` to change it. An id that
 * is not a Pixel id is refused out loud rather than saved as "off" — someone
 * who pasted the wrong thing needs to know the Pixel is not running.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getMetaPixelSettings())
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const raw = typeof body.pixelId === 'string' ? body.pixelId.trim() : ''
  const pixelId = raw ? normalisePixelId(raw) : null
  if (raw && !pixelId) {
    return NextResponse.json(
      { error: 'That does not look like a Pixel ID — it is a long number, found in Meta Events Manager.' },
      { status: 400 },
    )
  }

  await setMetaPixelSettings({ pixelId, enabled: body.enabled === true })
  return NextResponse.json(await getMetaPixelSettings())
}
