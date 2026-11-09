import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { beginUpload, finishUpload, mediaUrl, MediaError, putChunk, type MediaKind } from '@/lib/media/store'

/**
 * POST /api/portal/media  (founders only)
 *   { action: 'begin', kind, mime, size, title?, still? } → { id }
 *   { action: 'chunk', id, n, data }                       → { ok }
 *   { action: 'finish', id }                               → { id, url }
 *
 * Exercise demos, the trainer's welcome and intro, and video notes, a chunk
 * at a time (`lib/media/store`). What it's attached to is set afterwards.
 */
export const dynamic = 'force-dynamic'

const KINDS: MediaKind[] = ['exercise', 'trainer', 'note']
const MESSAGES: Record<MediaError['code'], string> = {
  type: 'That isn’t a video we can play. Use an MP4 or a MOV.',
  size: 'That video is too big.',
  missing: 'That upload has gone. Start it again.',
  chunk: 'Part of the video didn’t arrive. Start it again.',
  incomplete: 'The video didn’t finish uploading. Start it again.',
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  try {
    if (body.action === 'begin') {
      const kind = KINDS.includes(body.kind as MediaKind) ? (body.kind as MediaKind) : null
      if (!kind) return NextResponse.json({ error: 'What is this video for?' }, { status: 400 })
      const m = await beginUpload({ kind, mime: String(body.mime ?? ''), size: Number(body.size), owner: null, title: typeof body.title === 'string' ? body.title : null, still: typeof body.still === 'string' ? body.still : null })
      return NextResponse.json({ id: m.id })
    }
    if (body.action === 'chunk') {
      await putChunk(String(body.id), Number(body.n), String(body.data ?? ''))
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'finish') {
      const m = await finishUpload(String(body.id))
      return NextResponse.json({ id: m.id, url: mediaUrl(m.id) })
    }
  } catch (err) {
    if (err instanceof MediaError) return NextResponse.json({ error: MESSAGES[err.code], code: err.code }, { status: 400 })
    throw err
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
