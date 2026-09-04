/**
 * The shop's hero banners — the shape of one, and the rules for it.
 *
 * Pure: no database, no DOM. The storage layer (`@/lib/db/shop-banners`) and
 * the Founders Hub screen both import from here so that "what makes a valid
 * banner" is written once.
 *
 * ── Why the copy is not baked into the artwork ──────────────────────────────
 * A generated image with its headline rendered into the pixels is a banner that
 * cannot be edited, cannot be translated, cannot be read by a screen reader and
 * goes blurry on a 3x display. The image is the ART; the headline, the subhead
 * and the link are fields, drawn as live text on top. That also means one piece
 * of artwork can carry three different offers over its life.
 */

/** 16:9. Wide enough to be a banner, short enough not to eat a phone screen. */
export const BANNER_RATIO = 16 / 9

/** Ratio tolerance, so a 1792x1024 generation is not rejected for being 1.75. */
export const RATIO_TOLERANCE = 0.06

/** What the shop renders at 2x on the widest phone, rounded up. */
export const BANNER_TARGET = { width: 1280, height: 720 }

/** Below this the banner is visibly soft on a 3x display. */
export const BANNER_MIN = { width: 1024, height: 576 }

export const BANNER_MAX_BYTES = 6 * 1024 * 1024

export const BANNER_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Headlines longer than this wrap to three lines over the art and stop working. */
export const MAX_HEADLINE = 32
export const MAX_SUBHEAD = 64
export const MAX_ALT = 140

/** How many can be live at once. Past this it is a carousel nobody swipes. */
export const MAX_ACTIVE_BANNERS = 4

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
  position: number
  updatedAt: string
}

export interface ShopBannerInput {
  headline: string
  subhead: string
  href: string
  alt: string
  active: boolean
  position: number
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

/** The reason this file cannot be used, or null. Written for a person. */
export function validateImage(source: SourceImage): string | null {
  if (!(BANNER_MIMES as readonly string[]).includes(source.mime)) {
    return 'Use a JPEG, PNG or WebP.'
  }
  if (source.bytes > BANNER_MAX_BYTES) {
    return `That file is ${(source.bytes / 1024 / 1024).toFixed(1)}MB. The limit is ${BANNER_MAX_BYTES / 1024 / 1024}MB.`
  }
  if (source.width < BANNER_MIN.width || source.height < BANNER_MIN.height) {
    return `That image is ${source.width}x${source.height}. It needs to be at least ${BANNER_MIN.width}x${BANNER_MIN.height} or it will look soft on a phone.`
  }
  const ratio = source.width / source.height
  if (Math.abs(ratio - BANNER_RATIO) > RATIO_TOLERANCE) {
    return `That image is ${ratio.toFixed(2)}:1. Banners need to be about 16:9 — generate at ${BANNER_TARGET.width}x${BANNER_TARGET.height}.`
  }
  return null
}

/** The reason this copy cannot be saved, or null. */
export function validateCopy(input: ShopBannerInput): string | null {
  if (!input.headline.trim()) return 'A banner needs a headline.'
  if (input.headline.length > MAX_HEADLINE) return `Headlines are ${MAX_HEADLINE} characters at most.`
  if (input.subhead.length > MAX_SUBHEAD) return `Subheads are ${MAX_SUBHEAD} characters at most.`
  if (!input.alt.trim()) {
    return 'Describe the picture. It is what a screen reader announces, and what shows if the image fails.'
  }
  if (input.alt.length > MAX_ALT) return `Descriptions are ${MAX_ALT} characters at most.`
  if (!isSafeHref(input.href)) return 'The link has to be a path on this site, like /shop or /quizv2.'
  return null
}

/**
 * The banners the shop should render, in order.
 *
 * Inactive ones are dropped and the rest capped, so a founder who uploads ten
 * gets the first four rather than a shop that scrolls sideways forever.
 */
export function visibleBanners<T extends { active: boolean; position: number }>(all: T[]): T[] {
  return all
    .filter((b) => b.active)
    .sort((a, b) => a.position - b.position)
    .slice(0, MAX_ACTIVE_BANNERS)
}

/**
 * The wash under a banner's headline.
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

/** The image URL for a banner at a given version. Immutable once minted. */
export function bannerImageSrc(id: string, version: string): string {
  return `/api/shop/banner/${encodeURIComponent(id)}?v=${encodeURIComponent(version)}`
}
