import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { listBanners, putBanner, clearSlot } from '@/lib/db/shop-banners'
import {
  validateImage,
  validateCopy,
  BANNER_MAX_BYTES,
  BANNER_MIMES,
  MAX_ALT,
} from '@/lib/shop/banners'
import { placement, placementsInOrder } from '@/lib/shop/placements'

/**
 * The shop's hero artwork, managed from the Founders Hub.
 *
 * ── Everything is re-validated here ─────────────────────────────────────────
 * The screen checks the file's shape and size in the browser before it sends
 * anything, because telling somebody their image is the wrong ratio after a
 * 4MB upload is a poor way to treat them. That check is a courtesy, not a
 * control: a caller bypassing the UI can post whatever it likes, so the same
 * rules run again on this side and this side is the one that decides.
 *
 * The link in particular is checked with `validateCopy` rather than trusted —
 * a banner is the most prominent thing on the storefront, and an off-site URL
 * there is an open redirect with a picture on it.
 *
 * ── The placement decides the rules ─────────────────────────────────────────
 * Shape, minimum size and how long the copy may be all come from the placement
 * the artwork is being saved into, so a 16:9 masthead cannot be dropped into a
 * 4:5 tile. An unknown slot is refused outright rather than stored and ignored:
 * a row nothing renders is indistinguishable, from the Hub, from one that is
 * simply not working.
 */
export const dynamic = 'force-dynamic'

/** Base64 inflates by four thirds, plus room for the JSON around it. */
const MAX_BODY = Math.ceil((BANNER_MAX_BYTES * 4) / 3) + 4096

async function guard(): Promise<NextResponse | null> {
  if (!(await isPortalAuthed())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export async function GET() {
  const denied = await guard()
  if (denied) return denied
  return NextResponse.json({
    banners: await listBanners(),
    // The Hub renders a card per placement, so it needs the registry rather
    // than a set of scalar limits. Sent from here so the screen cannot hold a
    // stale copy of what the server will actually accept.
    placements: placementsInOrder(),
    limits: { maxBytes: BANNER_MAX_BYTES, mimes: BANNER_MIMES, maxAlt: MAX_ALT },
  })
}

interface Body {
  slot?: string
  headline?: string
  subhead?: string
  href?: string
  alt?: string
  active?: boolean
  /** Base64, no data-URI prefix. Omitted when only the copy is changing. */
  data?: string | null
  mime?: string
  width?: number
  height?: number
}

export async function POST(request: Request) {
  const denied = await guard()
  if (denied) return denied

  const raw = await request.text()
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: 'That image is too large.' }, { status: 413 })
  }

  let body: Body
  try {
    body = JSON.parse(raw) as Body
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 })
  }

  const place = placement((body.slot ?? '').trim())
  if (!place) {
    return NextResponse.json({ error: 'That is not a place in the shop.' }, { status: 400 })
  }

  const copy = {
    slot: place.id,
    headline: (body.headline ?? '').trim(),
    subhead: (body.subhead ?? '').trim(),
    href: (body.href ?? '').trim(),
    alt: (body.alt ?? '').trim(),
    active: body.active !== false,
  }

  const copyError = validateCopy(copy, place)
  if (copyError) return NextResponse.json({ error: copyError }, { status: 400 })

  if (body.data) {
    const bytes = Buffer.byteLength(body.data, 'base64')
    const imageError = validateImage(
      {
        width: Number(body.width) || 0,
        height: Number(body.height) || 0,
        bytes,
        mime: body.mime ?? '',
      },
      place,
    )
    if (imageError) return NextResponse.json({ error: imageError }, { status: 400 })
  }

  try {
    const saved = await putBanner({
      ...copy,
      data: body.data ?? undefined,
      mime: body.mime,
      width: body.width,
      height: body.height,
    })
    return NextResponse.json({ banner: saved })
  } catch {
    // The one expected failure is saving copy into an empty placement, which
    // `putBanner` refuses because there is nothing to draw it over.
    return NextResponse.json(
      { error: `Choose the artwork for ${place.label} first.` },
      { status: 400 },
    )
  }
}

export async function DELETE(request: Request) {
  const denied = await guard()
  if (denied) return denied

  const slot = new URL(request.url).searchParams.get('slot')
  if (!slot || !placement(slot)) {
    return NextResponse.json({ error: 'Which placement?' }, { status: 400 })
  }

  await clearSlot(slot)
  return NextResponse.json({ ok: true })
}
