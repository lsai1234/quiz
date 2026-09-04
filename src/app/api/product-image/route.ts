import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { parseImageRequest, IMAGE_FALLBACK_BACKGROUND, type ImageWidth } from '@/lib/images/product-image'
import { keyBackground, shouldKey, featherMask } from '@/lib/images/key-white'

/**
 * The product image normaliser.
 *
 * One transform, applied once per (source image, width) pair and then held for a
 * year by every cache between here and the phone:
 *
 *   contain inside a square  — nothing is cropped, so a tall bottle keeps its
 *                              cap and a wide tub keeps its ends
 *   flatten onto the shelf   — a transparent PNG stops punching a hole and a
 *                              white-ground JPEG stops glowing on a dark page
 *   WebP at quality 80       — roughly a third of the supplier's JPEG for the
 *                              same rendered result at these sizes
 *
 * See `@/lib/images/product-image` for why the pad is white, why the cache key
 * is the source URL rather than the SKU, and why the fetch boundary is the
 * catalogue rather than a list of hostnames.
 */

export const runtime = 'nodejs'

/** A year. Safe because the URL is content-addressed — see the lib header. */
const IMMUTABLE = 'public, max-age=31536000, s-maxage=31536000, immutable'

/** Long enough for a slow supplier CDN, short enough not to hold a worker. */
const FETCH_TIMEOUT_MS = 8000

/**
 * Refuse a body that is not plausibly a product photo before decoding it.
 * `sharp` will allocate for whatever it is handed, so the size check has to come
 * first — a 200MB "image" is a memory exhaustion, not a bad request.
 */
const MAX_SOURCE_BYTES = 12 * 1024 * 1024

/**
 * A small in-process cache for the warm path.
 *
 * The CDN does the real work; this only saves a re-fetch and a re-encode when
 * the same instance serves the same image twice before the cache in front of it
 * has filled — the first paint of a shelf, in other words, where twenty-odd
 * cards ask for the same handful of widths at once.
 */
const MEMO = new Map<string, Buffer>()
const MEMO_MAX = 64

function memoGet(key: string): Buffer | undefined {
  const hit = MEMO.get(key)
  if (!hit) return undefined
  // Re-insert so the map's insertion order is a recency order.
  MEMO.delete(key)
  MEMO.set(key, hit)
  return hit
}

function memoSet(key: string, value: Buffer): void {
  MEMO.set(key, value)
  if (MEMO.size > MEMO_MAX) {
    const oldest = MEMO.keys().next().value
    if (oldest !== undefined) MEMO.delete(oldest)
  }
}

/**
 * One photo, normalised.
 *
 * The white ground is flood-filled away from the frame edge and the product is
 * returned on transparency, so the card composites it onto its own surface and
 * the product floats. See `@/lib/images/key-white` for why it is a flood fill
 * and not a brightness threshold, and for the three ways it declines.
 *
 * When it declines, the fallback is the old behaviour — contained and padded
 * onto a light tile. A product that keeps its white plate is a worse card; a
 * product with its middle eaten out is a broken one.
 */
async function normalise(source: ArrayBuffer, width: ImageWidth): Promise<{ out: Buffer; keyed: boolean }> {
  const upright = sharp(Buffer.from(source)).rotate()

  /* RGBA, so the mask can be written straight into the fourth channel below. */
  const { data, info } = await upright
    .clone()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const result = keyBackground(data, info.width, info.height, info.channels)

  if (shouldKey(result)) {
    /*
      The mask is written straight into the alpha channel of the raw RGBA we
      already have, rather than handed to sharp's `joinChannel`.

      `joinChannel` appends, and its position in sharp's internal pipeline order
      is not the position it appears in the chain — joined onto an image that
      already had alpha it produced a five-channel image that rendered fully
      transparent, and after `removeAlpha` it silently dropped the mask and
      produced three channels. Writing the bytes is unambiguous and needs no
      knowledge of that ordering.
    */
    const rgba = Buffer.from(data)
    const mask = featherMask(result.alpha, info.width, info.height)
    for (let i = 0; i < mask.length; i++) rgba[i * 4 + 3] = mask[i]

    const out = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
      /* Crop to what is left. Suppliers frame wildly differently — one product
         fills its JPEG, the next floats in the middle of a 2:3 — and trimming to
         the product itself is what makes a shelf of them look like one set of
         photographs rather than a collage. */
      .trim({ threshold: 1 })
      .resize(width, width, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 82, alphaQuality: 90 })
      .toBuffer()
    return { out, keyed: true }
  }

  const out = await upright
    .clone()
    .resize(width, width, { fit: 'contain', background: IMAGE_FALLBACK_BACKGROUND })
    .flatten({ background: IMAGE_FALLBACK_BACKGROUND })
    .webp({ quality: 80 })
    .toBuffer()
  return { out, keyed: false }
}

/**
 * The set of image URLs the catalogue actually contains — the fetch boundary.
 *
 * Re-read on a short TTL rather than per request: a shelf fires twenty of these
 * at once and they must not each resolve the whole catalogue, but a photo added
 * in the Founders Hub should start being normalised within a minute rather than
 * at the next deploy.
 */
const CATALOGUE_TTL_MS = 60_000
let catalogueUrls: Set<string> | null = null
let catalogueAt = 0

async function isCatalogueImage(url: string): Promise<boolean> {
  if (!catalogueUrls || Date.now() - catalogueAt >= CATALOGUE_TTL_MS) {
    try {
      const { products } = await getResolvedCatalogue()
      catalogueUrls = new Set(products.map((p) => p.imageUrl).filter((u): u is string => !!u))
      catalogueAt = Date.now()
    } catch {
      // A catalogue we cannot read is not a reason to widen the boundary. Keep
      // whatever set we last had; an empty one refuses everything, which is the
      // correct failure direction for a route that fetches URLs.
      if (!catalogueUrls) return false
    }
  }
  return catalogueUrls.has(url)
}

export async function GET(request: Request) {
  const req = parseImageRequest(new URL(request.url).searchParams)
  if (!req) {
    return NextResponse.json({ error: 'Unsupported image request' }, { status: 400 })
  }
  if (!(await isCatalogueImage(req.url))) {
    return NextResponse.json({ error: 'Not a catalogue image' }, { status: 400 })
  }

  const key = `${req.url}|${req.width}`
  const memo = memoGet(key)
  if (memo) {
    return new NextResponse(new Uint8Array(memo), {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': IMMUTABLE, 'X-Image-Cache': 'hit' },
    })
  }

  let body: ArrayBuffer
  try {
    const upstream = await fetch(req.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'image/*' },
    })
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Image unavailable' }, { status: 502 })
    }
    const declared = Number(upstream.headers.get('content-length') ?? 0)
    if (declared > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 502 })
    }
    body = await upstream.arrayBuffer()
    if (body.byteLength > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 502 })
    }
  } catch {
    return NextResponse.json({ error: 'Image unavailable' }, { status: 502 })
  }

  let out: Buffer
  let keyed = false
  try {
    ;({ out, keyed } = await normalise(body, req.width))
  } catch {
    // Not an image, or one sharp cannot read. The caller falls back to the
    // designed tile, which is a better outcome than a broken image icon.
    return NextResponse.json({ error: 'Image could not be processed' }, { status: 502 })
  }

  memoSet(key, out)
  return new NextResponse(new Uint8Array(out), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': IMMUTABLE,
      'X-Image-Cache': 'miss',
      /* Which treatment this photo got, so a shelf that looks wrong can be
         diagnosed from the network tab rather than by eye. */
      'X-Image-Keyed': keyed ? '1' : '0',
    },
  })
}
