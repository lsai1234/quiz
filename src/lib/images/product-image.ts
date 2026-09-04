/**
 * Product photography, normalised.
 *
 * Supplier images arrive from PowerBody as whatever the brand supplied: JPEGs
 * and PNGs, 400px and 2000px, white grounds and transparent ones, portrait
 * bottles and square tubs. Rendered straight into a square tile with
 * `object-cover` — which is what the shop did — a tall bottle gets its cap and
 * its base cropped off, and a white-ground JPEG sits on the dark shelf as a
 * glowing rectangle. Neither is a styling problem; both are an ingest problem.
 *
 * So every product photo goes through one transform before it is ever shown:
 * contained inside a square (nothing is cropped), flattened onto the shelf's own
 * surface colour (no white box, no transparent hole), re-encoded to WebP at a
 * width the layout actually uses.
 *
 * ── Why the cache key is the source URL and not the SKU ──────────────────────
 * A SKU is the obvious key and it is the wrong one: it is stable across a photo
 * being REPLACED, which is exactly when a cached image must stop being served.
 * Keying on the source URL and the width is stable for as long as the supplier's
 * image is, and changes the instant they re-photograph a product — so the URL is
 * content-addressed and can be declared `immutable`, and the CDN, the browser
 * and every warm server instance can all hold it for a year without any of them
 * needing an invalidation path. That is a stronger guarantee than a SKU key with
 * a TTL, not a weaker one.
 *
 * ── Why an allowlist ─────────────────────────────────────────────────────────
 * A route that fetches an arbitrary URL server-side and returns the bytes is an
 * open proxy and an SSRF hole — it will happily read a cloud metadata endpoint
 * or an internal service for whoever asks. `isAllowedImageHost` is the gate, and
 * it is a suffix match on real hostnames, never a substring match on the string
 * (`powerbody.co.uk.evil.com` contains the supplier's domain).
 */

/**
 * Hosts whose images this app will fetch and re-encode.
 *
 * Matched on the parsed hostname, either exactly or as a subdomain. Add a
 * supplier here when their feed starts carrying image URLs; nothing else about
 * the pipeline changes.
 */
export const ALLOWED_IMAGE_HOSTS = [
  'powerbody.co.uk',
  'powerbody.eu',
  'www.powerbody.co.uk',
] as const

/**
 * The widths the layout asks for, in CSS pixels before DPR.
 *
 * A closed set, because an open one lets a caller mint unlimited distinct cache
 * entries and turn the CDN into a place to do work. Requests are snapped up to
 * the next size rather than rejected.
 */
export const IMAGE_WIDTHS = [56, 96, 160, 320, 640] as const
export type ImageWidth = (typeof IMAGE_WIDTHS)[number]

/** The ground a contained image is flattened onto — the shelf's own surface. */
export const IMAGE_BACKGROUND = '#18181b'

/** True when this URL is one we are willing to fetch server-side. */
export function isAllowedImageHost(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase()
  return ALLOWED_IMAGE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

/** The smallest offered width that still covers what was asked for. */
export function snapWidth(requested: number): ImageWidth {
  for (const w of IMAGE_WIDTHS) if (requested <= w) return w
  return IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]
}

/**
 * The `src` for a product photo at a given rendered size.
 *
 * Returns the source URL untouched when it is not a host we normalise — a
 * hand-entered image in the Founders Hub still shows — and null when there is no
 * image at all, which is the caller's signal to draw the designed fallback tile.
 */
export function productImageSrc(url: string | null | undefined, width: number): string | null {
  if (!url) return null
  if (!isAllowedImageHost(url)) return url
  return `/api/product-image?u=${encodeURIComponent(url)}&w=${snapWidth(width)}`
}

/**
 * `srcSet` for the same photo at 1x and 2x.
 *
 * Phones are the whole traffic mix here and nearly all of them are 2x or 3x, so
 * a tile that only ever loads its CSS width renders soft. Capped at the largest
 * offered width rather than multiplying past it.
 */
export function productImageSrcSet(url: string | null | undefined, width: number): string | null {
  if (!url || !isAllowedImageHost(url)) return null
  const one = productImageSrc(url, width)
  const two = productImageSrc(url, Math.min(width * 2, IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]))
  if (!one || !two || one === two) return null
  return `${one} 1x, ${two} 2x`
}

export interface ImageRequest {
  url: string
  width: ImageWidth
}

/**
 * Read a request into something the route can act on, or null.
 *
 * Never throws and never trusts: a missing parameter, a width that is not a
 * number, a host we do not serve and a non-https URL all reduce to null, which
 * the route answers with a 400 rather than a fetch.
 */
export function parseImageRequest(params: URLSearchParams): ImageRequest | null {
  const url = params.get('u')
  if (!url || !isAllowedImageHost(url)) return null
  const raw = Number(params.get('w'))
  if (!Number.isFinite(raw) || raw <= 0) return null
  return { url, width: snapWidth(raw) }
}
