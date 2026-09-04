import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { listBanners, putBanner, deleteBanner } from '@/lib/db/shop-banners'
import {
  validateImage,
  validateCopy,
  BANNER_MAX_BYTES,
  BANNER_MIMES,
  BANNER_TARGET,
  BANNER_MIN,
  MAX_ACTIVE_BANNERS,
  MAX_HEADLINE,
  MAX_SUBHEAD,
  MAX_ALT,
} from '@/lib/shop/banners'

/**
 * The shop's hero banners, managed from the Founders Hub.
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
 */
export const dynamic = 'force-dynamic'

/** Base64 inflates by four thirds, plus room for the JSON around it. */
const MAX_BODY = Math.ceil((BANNER_MAX_BYTES * 4) / 3) + 4096

const LIMITS = {
  maxBytes: BANNER_MAX_BYTES,
  mimes: BANNER_MIMES,
  target: BANNER_TARGET,
  min: BANNER_MIN,
  maxActive: MAX_ACTIVE_BANNERS,
  maxHeadline: MAX_HEADLINE,
  maxSubhead: MAX_SUBHEAD,
  maxAlt: MAX_ALT,
}

async function guard(): Promise<NextResponse | null> {
  if (!(await isPortalAuthed())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export async function GET() {
  const denied = await guard()
  if (denied) return denied
  return NextResponse.json({ banners: await listBanners(), limits: LIMITS })
}

interface Body {
  id?: string | null
  headline?: string
  subhead?: string
  href?: string
  alt?: string
  active?: boolean
  position?: number
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

  const copy = {
    headline: (body.headline ?? '').trim(),
    subhead: (body.subhead ?? '').trim(),
    href: (body.href ?? '').trim(),
    alt: (body.alt ?? '').trim(),
    active: body.active !== false,
    position: Number.isFinite(body.position) ? Number(body.position) : 0,
  }

  const copyError = validateCopy(copy)
  if (copyError) return NextResponse.json({ error: copyError }, { status: 400 })

  if (body.data) {
    const bytes = Buffer.byteLength(body.data, 'base64')
    const imageError = validateImage({
      width: Number(body.width) || 0,
      height: Number(body.height) || 0,
      bytes,
      mime: body.mime ?? '',
    })
    if (imageError) return NextResponse.json({ error: imageError }, { status: 400 })
  } else if (!body.id) {
    return NextResponse.json({ error: 'A new banner needs artwork.' }, { status: 400 })
  }

  try {
    const saved = await putBanner(body.id ?? null, {
      ...copy,
      data: body.data ?? undefined,
      mime: body.mime,
      width: body.width,
      height: body.height,
    })
    return NextResponse.json({ banner: saved })
  } catch {
    return NextResponse.json({ error: 'Could not save that banner.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const denied = await guard()
  if (denied) return denied

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Which banner?' }, { status: 400 })

  await deleteBanner(id)
  return NextResponse.json({ ok: true })
}
