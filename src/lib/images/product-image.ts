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
 * So every product photo goes through one transform before it is shown: the
 * white ground is cut away, the result is trimmed to the product, squared, and
 * re-encoded to WebP with alpha at a width the layout actually uses.
 *
 * ── Why the white comes off rather than being padded to match ───────────────
 * Padding the photo onto our own white was the previous answer and it was the
 * wrong one. It leaves a hard white rectangle butted against a near-black card
 * — the highest-contrast edge in the UI, twice per row — so the eye goes to the
 * rectangles instead of the products. And no two suppliers shoot on the same
 * white, so the pad shows a seam.
 *
 * Cut out, the product floats on the card's own surface. See
 * `@/lib/images/key-white` for how the cut is made safe, and
 * `IMAGE_FALLBACK_BACKGROUND` for what happens to the photographs that cannot
 * be cut.
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

/**
 * The ground every product photo ends up on. White, always, and the same white.
 *
 * ── Why the answer is "fill it with white" ──────────────────────────────────
 * The previous version cut the white ground away and composited the product
 * onto the dark card, which is the more ambitious treatment and is what a
 * premium dark storefront does when it controls its own photography. It has one
 * fatal property here: it can DECLINE. A white tub on white cannot be cut, a
 * lifestyle shot has no ground to remove, and a photo the route never got to
 * (a cold CDN, a supplier timeout, a deploy that is behind) is not cut either.
 * Every one of those falls back to something else, and the shelf ends up with
 * two treatments side by side — which is exactly the complaint: they need to
 * all be the same.
 *
 * Filling to white cannot fail. Whatever the source is — cut out or not, 2:3 or
 * 3:2, cleanly shot or not — padding it to a square with white produces an
 * identical panel every time. Consistency across twenty cards beats the better
 * treatment on eighteen of them.
 *
 * The keying is still run, because trimming to the product and re-centring it
 * is what stops one tub filling its frame while the next floats in a corner.
 * It just composites onto white at the end instead of onto transparency, so a
 * keyed photo and an unkeyed one are indistinguishable.
 */
export const IMAGE_PLATE = '#FFFFFF'

/** @deprecated Kept as an alias while call sites migrate. */
export const IMAGE_FALLBACK_BACKGROUND = IMAGE_PLATE

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
