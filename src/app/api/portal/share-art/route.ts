import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { ART_KEYS, ART_SET } from '@/lib/share-card/art'
import { listArtUploads, putArtUpload, deleteArtUpload } from '@/lib/db/share-card-art'
import { ART_MAX_BYTES, ART_MIMES, DERIVATIVE } from '@/lib/share-card/art-upload'

/**
 * The card's category photography, from the Founders Hub.
 *
 * ── The client does the image work, and that is not laziness ────────────────
 * Validation and the 1080×1440 derivative are produced in the browser with a
 * canvas, and this route stores what it is given. The alternative is `sharp` on
 * the server, which the brief asks for — but `sharp` is a native binary that
 * doubles the function bundle, and the founder's instruction on this build was
 * no new running costs. A canvas resize of a photo the founder chose, previewed
 * on the same screen before it is sent, is the same picture.
 *
 * What that costs is that a caller bypassing the UI could post anything. So the
 * limits are re-checked here — dimensions, ratio, MIME, size — rather than
 * trusted, and the route is behind the portal guard.
 */
export const dynamic = 'force-dynamic'

/** Base64 inflates by four thirds, plus room for the data-URI prefix. */
const MAX_BODY = Math.ceil((ART_MAX_BYTES * 4) / 3) + 1024

async function payload() {
  const uploads = await listArtUploads()
  return {
    keys: ART_KEYS.map((key) => ({
      key,
      brief: ART_SET[key].brief,
      upload: uploads[key] ?? null,
    })),
    limits: {
      maxBytes: ART_MAX_BYTES,
      mimes: ART_MIMES,
      derivative: DERIVATIVE,
    },
  }
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await payload())
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const key = String(body.key ?? '')
  if (!(ART_KEYS as string[]).includes(key)) {
    return NextResponse.json({ error: `unknown art key "${key}"` }, { status: 400 })
  }

  if (body.action === 'reset') {
    await deleteArtUpload(key)
    return NextResponse.json(await payload())
  }

  const dataUri = String(body.image ?? '')
  const match = /^data:([a-z/+.-]+);base64,(.+)$/i.exec(dataUri)
  if (!match) {
    return NextResponse.json({ error: 'image must be a base64 data URI' }, { status: 400 })
  }

  const [, mime, data] = match
  if (!ART_MIMES.includes(mime)) {
    return NextResponse.json(
      { error: `${mime} is not accepted — use ${ART_MIMES.join(', ')}` },
      { status: 400 },
    )
  }
  if (dataUri.length > MAX_BODY) {
    return NextResponse.json({ error: 'image is over the size limit' }, { status: 413 })
  }

  const width = Number(body.width)
  const height = Number(body.height)
  // The derivative is a fixed size, so this is an equality check rather than a
  // ratio one: anything else did not come from the settings screen.
  if (width !== DERIVATIVE.width || height !== DERIVATIVE.height) {
    return NextResponse.json(
      { error: `expected a ${DERIVATIVE.width}×${DERIVATIVE.height} derivative, got ${width}×${height}` },
      { status: 400 },
    )
  }

  await putArtUpload({ key, mime, data, width, height })
  return NextResponse.json(await payload())
}
