/**
 * Product photography, normalised.
 *
 * Supplier images arrive from PowerBody as whatever the brand supplied: JPEGs
 * and PNGs, 400px and 2000px, white grounds and transparent ones, portrait
 * pouches and square tubs. Rendered straight into a square tile with
 * `object-cover` a tall pouch gets its top and bottom cropped off, and a
 * white-ground JPEG sits on a dark shelf as a glowing rectangle. Neither is a
 * styling problem; both are an ingest problem.
 *
 * So every product photo goes through one transform before it is shown:
 * contained inside a square (nothing cropped), padded onto white, re-encoded to
 * WebP at a width the layout actually uses.
 *
 * ── Why white and not the shelf colour ──────────────────────────────────────
 * Padding onto the dark surface is the obvious move and it is wrong for this
 * catalogue. Supplement photography is shot on white and delivered as JPEG with
 * no alpha, so the photo is a white rectangle whatever we pad around it — a
 * dark pad just puts a white box inside a dark box, and the box moves as the
 * aspect ratio changes. Committing to white makes every tile the same object:
 * a white card with the product centred on it, whether the source was 400×600
 * with no alpha or a square PNG that had some.
 *
 * ── Why the boundary is the catalogue and not a list of hostnames ───────────
 * A route that fetches a client-supplied URL server-side and returns the bytes
 * is an open proxy and an SSRF hole, so something has to gate it. The first
 * version of this gated on a hardcoded list of PowerBody hostnames, and that
 * was wrong twice over: the real feed serves images from a host that was not on
 * it, so nothing was ever normalised; and it failed SILENTLY, falling through
 * to the raw URL, so the only symptom was cropped photos on a phone.
 *
 * The exact boundary is the catalogue itself: the route will fetch a URL if and
 * only if that URL appears verbatim as a product's `imageUrl`. It cannot go
 * stale, it needs no maintenance when a supplier changes CDN, and it is
 * narrower than any hostname list — `powerbody.co.uk/../../etc/passwd` is not
 * in the catalogue either. See `catalogueImageUrls` in the route.
 *
 * ── Why the cache key is the source URL and not the SKU ─────────────────────
 * A SKU is stable across a photo being REPLACED, which is exactly when a cached
 * image must stop being served. Keying on the source URL and the width is
 * stable for as long as the supplier's image is and changes the instant they
 * re-photograph a product — so the URL is content-addressed and can be declared
 * `immutable`, and the CDN, the browser and every warm server instance can hold
 * it for a year with no invalidation path. That is a stronger guarantee than a
 * SKU key with a TTL, not a weaker one.
 */

/**
 * The widths the layout asks for, in CSS pixels before DPR.
 *
 * A closed set, because an open one lets a caller mint unlimited distinct cache
 * entries and turn the CDN into a place to do work. Requests are snapped up to
 * the next size rather than rejected.
 */
export const IMAGE_WIDTHS = [56, 96, 160, 320, 640] as const
export type ImageWidth = (typeof IMAGE_WIDTHS)[number]

/** The ground a contained image is padded onto. See the header for why white. */
export const IMAGE_BACKGROUND = '#ffffff'

/**
 * Could this URL be normalised at all?
 *
 * A cheap shape check the client can make without the catalogue: https, and
 * parseable. It is NOT the security boundary — the route re-checks every URL
 * against the catalogue before fetching anything. This only decides whether it
 * is worth asking.
 */
export function isNormalisableUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/** The smallest offered width that still covers what was asked for. */
export function snapWidth(requested: number): ImageWidth {
  for (const w of IMAGE_WIDTHS) if (requested <= w) return w
  return IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]
}

/**
 * The `src` for a product photo at a given rendered size.
 *
 * Returns the source URL untouched when it is not something we can normalise —
 * an http URL, or a data URI pasted into the Founders Hub — and null when there
 * is no image at all, which is the caller's signal to draw the designed
 * fallback tile.
 *
 * When this does return a pipeline URL the caller must still handle the route
 * declining it: `ProductTile` falls back to the raw source on error. A photo
 * that renders unnormalised is a worse-looking card; a photo that does not
 * render at all is a broken shop.
 */
export function productImageSrc(url: string | null | undefined, width: number): string | null {
  if (!url) return null
  if (!isNormalisableUrl(url)) return url
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
  if (!isNormalisableUrl(url)) return null
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
 * Shape only — never throws, and deliberately does NOT decide whether the URL
 * may be fetched. That decision belongs to the catalogue check in the route,
 * because it is the one that has to be exact.
 */
export function parseImageRequest(params: URLSearchParams): ImageRequest | null {
  const url = params.get('u')
  if (!isNormalisableUrl(url)) return null
  const raw = Number(params.get('w'))
  if (!Number.isFinite(raw) || raw <= 0) return null
  return { url: url!, width: snapWidth(raw) }
}
