import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The product art on the card.
 *
 * ── Why these and not product photography ───────────────────────────────────
 * Every product in the catalogue currently carries `imageUrl: null`. There is no
 * product photography in the system yet, and a card with an empty rectangle
 * where the picture goes is worse than a card with no picture at all — so the
 * image panel is built from the CHRGD renders the hero already uses
 * (`public/hero/`), downscaled and quantised into `art/` at ~200KB for all four.
 *
 * `productArt()` takes the real image first and falls back to these, so the day
 * the catalogue has photography the card starts using it with no change here.
 *
 * ── Why they are read rather than inlined ───────────────────────────────────
 * Same reasoning as the fonts: 200KB of base64 is 270KB of source, and this
 * route runs on the node runtime anyway. Read once per process, cached.
 */

const ART_DIR = join(process.cwd(), 'src/lib/share-card/art')

/**
 * Which render stands in for a slot.
 *
 * Keyed loosely, because slot titles come from the engine and the real
 * catalogue can add more. Anything unmatched gets the bottle, which is the
 * closest thing CHRGD has to a house silhouette.
 */
const BY_SLOT: Array<[RegExp, string]> = [
  [/protein|mass|gainer/, 'bottle.png'],
  [/pre-?workout|energy|performance|creatine/, 'capsule-1.png'],
  [/sleep|recovery|magnesium|calm|stress/, 'capsule-3.png'],
  [/hydration|electrolyte|drink|lqd/, 'bottle.png'],
  [/vitamin|health|immune|omega|multi/, 'lid.png'],
]

const DEFAULT_ART = 'bottle.png'

const cache = new Map<string, string>()

function dataUri(file: string): string {
  const hit = cache.get(file)
  if (hit) return hit
  const uri = `data:image/png;base64,${readFileSync(join(ART_DIR, file)).toString('base64')}`
  cache.set(file, uri)
  return uri
}

/**
 * The image for the card's hero panel.
 *
 * `imageUrl` wins when the catalogue has one — Satori will fetch it — and the
 * house render stands in when it does not.
 */
export function productArt(slot: string, imageUrl?: string | null): string {
  if (imageUrl) return imageUrl
  const match = BY_SLOT.find(([re]) => re.test(slot.toLowerCase()))
  return dataUri(match?.[1] ?? DEFAULT_ART)
}

/** Every bundled render, for the styleguide and for tests. */
export const BUNDLED_ART = ['bottle.png', 'capsule-1.png', 'capsule-3.png', 'lid.png'] as const
