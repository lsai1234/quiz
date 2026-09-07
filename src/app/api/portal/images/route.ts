import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import {
  putFounderImage,
  deleteFounderImage,
  isFounderImageId,
  founderImageUrl,
} from '@/lib/db/founder-images'
import { UPLOAD_MAX_BYTES, UPLOAD_MIMES, DERIVATIVE_MAX_EDGE } from '@/lib/images/founder-upload'

/**
 * Uploading a photograph from the Founders Hub.
 *
 * ── The client does the image work, and that is not laziness ────────────────
 * The browser validates the file and produces the stored derivative with a
 * canvas; this route stores what it is given. The alternative is `sharp` on the
 * server, which is a native binary that doubles the function bundle — and a
 * canvas resize of a picture the founder chose, previewed on the same screen
 * before it is sent, is the same picture. Same call `share-art` made.
 *
 * What that costs is that a caller bypassing the UI could post anything, so the
 * limits are re-checked here rather than trusted, and the route is behind the
 * portal guard.
 *
 * It returns the URL to store on whatever is being edited, so the caller never
 * has to know how these are addressed.
 */
export const dynamic = 'force-dynamic'

/** Base64 inflates by four thirds, plus room for the data-URI prefix. */
const MAX_BODY = Math.ceil((UPLOAD_MAX_BYTES * 4) / 3) + 1024

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const id = String(body.id ?? '')
  if (!isFounderImageId(id)) {
    return NextResponse.json({ error: 'id must look like "bundle:some-slug"' }, { status: 400 })
  }

  const dataUri = String(body.image ?? '')
  const match = /^data:([a-z/+.-]+);base64,(.+)$/i.exec(dataUri)
  if (!match) return NextResponse.json({ error: 'image must be a base64 data URI' }, { status: 400 })

  const [, mime, data] = match
  if (!UPLOAD_MIMES.includes(mime)) {
    return NextResponse.json({ error: `${mime} is not accepted — use ${UPLOAD_MIMES.join(', ')}` }, { status: 400 })
  }
  if (dataUri.length > MAX_BODY) {
    return NextResponse.json({ error: 'That image is over the size limit.' }, { status: 413 })
  }

  const width = Number(body.width)
  const height = Number(body.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return NextResponse.json({ error: 'width and height are required' }, { status: 400 })
  }
  // The derivative is capped rather than fixed — a bundle photo can be any
  // shape — so this is the one dimension check worth making on arrival.
  if (Math.max(width, height) > DERIVATIVE_MAX_EDGE) {
    return NextResponse.json(
      { error: `expected a derivative no larger than ${DERIVATIVE_MAX_EDGE}px on its long edge, got ${width} × ${height}` },
      { status: 400 },
    )
  }

  const stored = await putFounderImage({ id, mime, data, width, height })
  if (!stored) return NextResponse.json({ error: 'Could not store that image' }, { status: 400 })

  return NextResponse.json({ ok: true, image: stored, url: founderImageUrl(stored) })
}

/** Remove an uploaded image. The record that pointed at it clears its own URL. */
export async function DELETE(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.id || !isFounderImageId(body.id)) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  await deleteFounderImage(body.id)
  return NextResponse.json({ ok: true })
}
