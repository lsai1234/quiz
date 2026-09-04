/**
 * The shop's hero artwork — the shape of one, and the rules for it.
 *
 * Pure: no database, no DOM. The storage layer (`@/lib/db/shop-banners`) and
 * the Founders Hub screen both import from here so that "what makes a valid
 * banner" is written once.
 *
 * WHERE a picture goes, what shape it has to be and how much copy it carries
 * all belong to `@/lib/shop/placements`. This file is the rules that are the
 * same wherever it goes: the formats, the weight, the link, the scrim.
 *
 * ── Why the copy is not baked into the artwork ──────────────────────────────
 * A generated image with its headline rendered into the pixels is a banner that
 * cannot be edited, cannot be translated, cannot be read by a screen reader and
 * goes blurry on a 3x display. The image is the ART; the headline, the subhead
 * and the link are fields, drawn as live text on top. That also means one piece
 * of artwork can carry three different offers over its life.
 */

import { type Placement, ratioLabel, targetLabel } from './placements'

/**
 * Ratio tolerance, as a fraction of the target ratio rather than an absolute.
 *
 * A fixed +/-0.06 is generous on a 16:9 (3%) and nearly nothing on a 4:5 (7.5%
 * of a much smaller number), which rejected perfectly good portrait art. As a
 * fraction it means the same thing at every shape: about 6% out is fine, which
 * accepts the 1792x1024 that several models emit for "wide".
 */
export const RATIO_TOLERANCE = 0.06

export const BANNER_MAX_BYTES = 6 * 1024 * 1024

export const BANNER_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Alt text is the same job at every size, so this one is not per-placement. */
export const MAX_ALT = 140

export interface ShopBannerMeta {
  id: string
  width: number
  height: number
  bytes: number
  mime: string
  /** Content hash. Goes in the image URL, so replacing art busts its cache. */
  version: string
  headline: string
  subhead: string
  /** Where tapping it goes. Same-origin path only — see `isSafeHref`. */
  href: string
  /** What the picture shows, for anyone who cannot see it. */
  alt: string
  active: boolean
  /** Which fixed position in the shop this fills. See `placements.ts`. */
  slot: string
  updatedAt: string
}

export interface ShopBannerInput {
  slot: string
  headline: string
  subhead: string
  href: string
  alt: string
  active: boolean
}

/**
 * Only same-origin paths.
 *
 * A banner is uploaded through an authenticated screen, but "the founder typed
 * it" is not a reason to render an arbitrary destination: a mistyped or pasted
 * off-site URL on the shop's most prominent surface is an open redirect with a
 * picture on it. A path also survives the domain changing.
 */
export function isSafeHref(href: string): boolean {
  if (!href.startsWith('/')) return false
  // `//evil.com` is protocol-relative and leaves the origin.
  if (href.startsWith('//')) return false
  // No whitespace or control characters, which is how a javascript: URL or a
  // header injection is usually smuggled past a naive prefix check.
  return !/[\s\u0000-\u001f\u007f]/.test(href)
}

export interface SourceImage {
  width: number
  height: number
  bytes: number
  mime: string
}

/**
 * The reason this file cannot be used HERE, or null. Written for a person.
 *
 * Checked against the placement, not against one global shape: the whole point
 * of named positions is that a masthead and a twin tile are different pictures,
 * and a 16:9 dropped into a 4:5 slot would be cropped to a letterbox of itself.
 */
export function validateImage(source: SourceImage, place: Placement): string | null {
  if (!(BANNER_MIMES as readonly string[]).includes(source.mime)) {
    return 'Use a JPEG, PNG or WebP.'
  }
  if (source.bytes > BANNER_MAX_BYTES) {
    return `That file is ${(source.bytes / 1024 / 1024).toFixed(1)}MB. The limit is ${BANNER_MAX_BYTES / 1024 / 1024}MB.`
  }
  if (source.width < place.min.width || source.height < place.min.height) {
    return `That image is ${source.width}x${source.height}. ${place.label} needs at least ${place.min.width}x${place.min.height}, or it will look soft on a phone.`
  }
  const ratio = source.width / source.height
  if (Math.abs(ratio - place.ratio) > place.ratio * RATIO_TOLERANCE) {
    return `That image is ${ratio.toFixed(2)}:1. ${place.label} is ${ratioLabel(place)} — generate at ${targetLabel(place)}.`
  }
  return null
}

/** The reason this copy cannot be saved, or null. */
export function validateCopy(input: ShopBannerInput, place: Placement): string | null {
  if (!input.headline.trim()) return `${place.label} needs a headline.`
  if (input.headline.length > place.maxHeadline) {
    return `${place.label} headlines are ${place.maxHeadline} characters at most — it is drawn over the picture.`
  }
  if (input.subhead.length > place.maxSubhead) {
    return `${place.label} subheads are ${place.maxSubhead} characters at most.`
  }
  if (!input.alt.trim()) {
    return 'Describe the picture. It is what a screen reader announces, and what shows if the image fails.'
  }
  if (input.alt.length > MAX_ALT) return `Descriptions are ${MAX_ALT} characters at most.`
  if (!isSafeHref(input.href)) return 'The link has to be a path on this site, like /shop or /quizv2.'
  return null
}

/**
 * The artwork the shop should render, by placement.
 *
 * Inactive rows are dropped, and if two rows somehow claim one placement the
 * most recently updated wins rather than both rendering. There is no cap and no
 * ordering to apply any more — the layout decides where each one goes, so
 * "four at most" and "position 3" stopped meaning anything.
 */
export function bySlot<T extends { active: boolean; slot: string; updatedAt: string }>(
  all: T[],
): Record<string, T> {
  const out: Record<string, T> = {}
  for (const b of all) {
    if (!b.active) continue
    const held = out[b.slot]
    if (!held || held.updatedAt < b.updatedAt) out[b.slot] = b
  }
  return out
}

/**
 * The wash under a banner's headline, for the wide placements.
 *
 * Not decoration. Generated artwork is bright and unpredictable, and white text
 * over an unknown image is the single most common way a banner ends up
 * unreadable. A left-to-right gradient keeps the text side legible whatever
 * arrives and leaves the art side untouched.
 *
 * Exported so the Founders Hub preview draws the SAME wash the shop does — a
 * preview that flatters the artwork is worse than no preview.
 */
export const SHOP_SCRIM =
  'linear-gradient(90deg, color-mix(in srgb, var(--bg) 88%, transparent) 0%, color-mix(in srgb, var(--bg) 62%, transparent) 38%, transparent 72%)'

/**
 * The wash on a portrait tile, where the label sits along the bottom.
 *
 * The same job as `SHOP_SCRIM` turned through ninety degrees. A left-to-right
 * gradient on a 4:5 tile washes out the middle of the picture and still leaves
 * the bottom edge — where the words actually are — unprotected, so a tile needs
 * its own. It is heavier at the foot than the masthead's is at the left,
 * because a short label has no second line to fall back on if it is unreadable.
 */
export const TILE_SCRIM =
  'linear-gradient(0deg, color-mix(in srgb, var(--bg) 92%, transparent) 0%, color-mix(in srgb, var(--bg) 58%, transparent) 34%, transparent 62%)'

/** The image URL for a banner at a given version. Immutable once minted. */
export function bannerImageSrc(id: string, version: string): string {
  return `/api/shop/banner/${encodeURIComponent(id)}?v=${encodeURIComponent(version)}`
}
