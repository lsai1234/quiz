import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getMedia, readRange } from '@/lib/media/store'

/**
 * GET /api/media/<id>  (with Range, so a video can be scrubbed and Safari plays it)
 *
 * Exercise demos and the trainer's own videos are for any visitor. A form
 * check or a video note is private: the member it belongs to, and the
 * founders. A founder opening a member's form check is logged as an access to
 * their record. `?still=1` answers with the poster frame instead.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_SLICE = 4 * 1024 * 1024

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id
  const m = await getMedia(id)
  if (!m || m.state !== 'ready') return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const privateKind = m.kind === 'form-check' || m.kind === 'note'
  let founder = false
  if (privateKind) {
    founder = await isPortalAuthed()
    const user = founder ? null : await getHubUser()
    if (!founder && (!user || user.id !== m.owner)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const cache = privateKind ? 'private, no-store' : 'public, max-age=86400'

  const url = new URL(req.url)
  if (url.searchParams.get('still') === '1') {
    if (!m.still) return NextResponse.json({ error: 'No still' }, { status: 404 })
    const bytes = Buffer.from(m.still.split(',')[1] ?? '', 'base64')
    return new NextResponse(new Uint8Array(bytes), { headers: { 'content-type': 'image/jpeg', 'cache-control': cache } })
  }

  if (founder && m.kind === 'form-check' && m.owner && !req.headers.get('range')?.match(/^bytes=[1-9]/)) {
    try {
      const [{ logMemberAccess }, { getFounder }] = await Promise.all([import('@/lib/portal/access-log'), import('@/lib/portal/guard')])
      const f = await getFounder()
      await logMemberAccess({ founderEmail: f?.email ?? 'founder', userId: m.owner, kind: 'member-form-check', path: `/api/media/${m.id}` })
    } catch {
      /* The log is a record, not a gate. */
    }
  }

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '')
  let start = 0
  let end = m.size - 1
  if (range) {
    if (range[1]) start = Number(range[1])
    if (range[2]) end = Math.min(m.size - 1, Number(range[2]))
    if (!range[1] && range[2]) {
      start = Math.max(0, m.size - Number(range[2]))
      end = m.size - 1
    }
  }
  end = Math.min(end, start + MAX_SLICE - 1)
  if (start > end || start >= m.size) return new NextResponse(null, { status: 416, headers: { 'content-range': `bytes */${m.size}` } })
  const bytes = await readRange(m, start, end)
  return new NextResponse(new Uint8Array(bytes), {
    status: range || end < m.size - 1 ? 206 : 200,
    headers: {
      'content-type': m.mime,
      'content-length': String(bytes.length),
      'accept-ranges': 'bytes',
      ...(range || end < m.size - 1 ? { 'content-range': `bytes ${start}-${end}/${m.size}` } : {}),
      'cache-control': cache,
    },
  })
}
